// Generates the MapLibre styles for the vector base map.
//
// Only the styles. Glyphs and tiles are served by core's proxy, which is what
// lets them be requested with an application User-Agent and without a referrer.
// The sprite sheet ships with the frontend (see map-sprites.js). The styles
// stay here because they come from @versatiles/style and core has no node
// toolchain to regenerate them with.
//
// Only the default pair is written out. A card on another palette, or on a
// recolored style, builds it in the browser from the same builder - which is
// why the preparation is shared with the frontend and why the asset URLs are
// written alongside the styles. Node loads that TypeScript module as it is.

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { osm } from "@versatiles/style";
import fs from "fs-extra";
import gulp from "gulp";
import paths from "../paths.cjs";
import { finalizeMapStyle } from "../../src/common/map/map-style-transforms.ts";
import {
  missingSprites,
  SHEET_FILES,
  SPRITE_SHEET,
  spritesDir,
} from "./map-sprites.js";

const PROXY_PATH = "/api/map_tiles";

const outputDir = path.resolve(paths.build_dir, "map");

// Core serves /static with a month of max-age, so a re-vendored sheet would
// otherwise keep being read from cache next to a style that expects the new one.
const sheetHash = async () => {
  const contents = await Promise.all(
    SHEET_FILES.map((file) => readFile(path.join(spritesDir, file)))
  );
  const hash = createHash("sha256");
  contents.forEach((content) => hash.update(content));
  return hash.digest("hex").slice(0, 8);
};

const styleUrls = (spriteVersion) => ({
  // Keeps the generated URLs origin relative.
  base: "",
  glyphsPattern: `${PROXY_PATH}/fonts/{fontstack}/{range}.pbf`,
  sprite: [
    {
      id: SPRITE_SHEET,
      url: `/static/map/sprites/${SPRITE_SHEET}?v=${spriteVersion}`,
    },
  ],
});

const checkSprites = (name, style, sheet) => {
  const missing = missingSprites(style, sheet);
  if (missing.length) {
    throw new Error(
      `Style "${name}" references icons missing from the bundled ${SPRITE_SHEET} ` +
        `sprite sheet: ${missing.join(", ")}. Run \`yarn gulp update-map-sprites\` ` +
        `and commit the result.`
    );
  }
  return style;
};

// The styles a card can pick, each as a light and a dark palette. Kept in sync
// with MAP_STYLES in src/common/map/map-styles.ts.
const STYLES = ["colorful", "natural", "muted", "gray", "toner"];
const PALETTES = STYLES.flatMap((style) => [style, `${style}-dark`]);

// Only the default pair is written out; the rest are built in the browser.
const SHIPPED = [
  ["light", "colorful"],
  ["dark", "colorful-dark"],
];

const generateStyles = async () => {
  const sheet = await fs.readJson(
    path.join(spritesDir, `${SPRITE_SHEET}.json`)
  );
  const urls = styleUrls(await sheetHash());
  // Every palette is built, so a bump that gives one of them an icon the
  // bundled sheet lacks fails here rather than in a browser.
  const styles = new Map(
    PALETTES.map((theme) => [
      theme,
      finalizeMapStyle(theme, checkSprites(theme, osm({ theme, urls }), sheet)),
    ])
  );
  return { urls, styles };
};

const buildMapAssets = async () => {
  await fs.emptyDir(outputDir);
  const { urls, styles } = await generateStyles();
  await Promise.all([
    // Read by src/common/map/build-map-style.ts, which cannot know the hash
    // of the sprite sheet this build vendored.
    writeFile(path.join(outputDir, "urls.json"), JSON.stringify(urls)),
    ...SHIPPED.map(([name, theme]) =>
      writeFile(
        path.join(outputDir, `${name}.json`),
        JSON.stringify(styles.get(theme))
      )
    ),
  ]);
};

// Shared so it does not have to be wired into every pipeline separately.
let pending;
export const ensureMapAssets = () => {
  pending ??= buildMapAssets();
  return pending;
};

gulp.task("build-map-assets", ensureMapAssets);

// Runs in the required lint job so a @versatiles/style bump that needs new
// icons cannot merge before the sheet is re-vendored on that branch.
gulp.task("check-map-sprites", generateStyles);

export const mapAssetsDir = outputDir;
