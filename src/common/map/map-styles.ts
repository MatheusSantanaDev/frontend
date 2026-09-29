// The vector cartographies the map can draw. @versatiles/style ships each as a
// pair of palettes, light and dark, so the style a card picks is the pair and
// the theme mode picks the half.
//
// The default pair is generated at build time by build-scripts/gulp/map-assets.js;
// the others, and any style a card recolors, are built in the browser from the
// same builder. Either way the tiles, glyphs and sprites are the ones core's
// proxy and the frontend already serve; nothing here can point the map
// somewhere else.

/** Style ids, in the order the card editor offers them */
export const MAP_STYLES = [
  "colorful",
  "natural",
  "muted",
  "gray",
  "toner",
] as const;

export type MapStyle = (typeof MAP_STYLES)[number];

/** Drawn when a card names no style */
export const DEFAULT_MAP_STYLE: MapStyle = "colorful";

/** A style's light or dark half, as @versatiles/style names its palettes */
export type MapPalette = MapStyle | `${MapStyle}-dark`;

/**
 * Color adjustments applied to the whole style, straight from
 * @versatiles/style's `recolor`. The tiles.versatiles.org styler writes these.
 */
export interface MapStyleRecolor {
  /** Swap light for dark, keeping the hues */
  invert_brightness?: boolean;
  /** Hue rotation in degrees */
  rotate_hue?: number;
  /** -1 is grayscale, 0 unchanged, 1 twice as saturated */
  saturate?: number;
  gamma?: number;
  contrast?: number;
  brightness?: number;
  tint?: { color?: string; amount?: number };
  blend?: { color?: string; amount?: number };
}

/** A style with adjustments, rather than one of the styles as it comes */
export interface CustomMapStyleConfig {
  /** Cartography the adjustments start from; omit for the default */
  base?: MapStyle;
  /** Per-feature colors, keyed as @versatiles/style names them (water, land, natureWood, ...) */
  colors?: Record<string, string>;
  recolor?: MapStyleRecolor;
  /** Label options: language, and sizes per kind of label */
  text?: Record<string, unknown>;
  /** Icon scale and spacing */
  icon?: Record<string, unknown>;
  /** Which feature groups are drawn, and from which zoom */
  layers?: boolean | number | Record<string, unknown>;
}

export type MapStyleConfig = MapStyle | CustomMapStyleConfig;

/** A style ready to be loaded: the palette to draw, plus adjustments if any */
export interface ResolvedMapStyle {
  palette: MapPalette;
  /** Options for @versatiles/style; absent means the palette as it comes */
  options?: Record<string, unknown>;
}

const isStyle = (value: unknown): value is MapStyle =>
  (MAP_STYLES as readonly unknown[]).includes(value);

export const isCustomMapStyle = (
  style: MapStyleConfig | undefined
): style is CustomMapStyleConfig => typeof style === "object" && style !== null;

export const paletteFor = (style: MapStyle, darkMode: boolean): MapPalette =>
  darkMode ? `${style}-dark` : style;

// Everything a card may adjust. An allowlist rather than a passthrough: the
// builder also takes the tile, glyph and sprite URLs, the projection and the
// elevation features, and those stay ours.
const BUILDER_OPTIONS = ["colors", "recolor", "text", "icon", "layers"];

const camelCase = (key: string) =>
  key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());

// The builder names its options in camelCase and Home Assistant configs are
// written in snake_case; both spellings are accepted so an options object
// copied from the versatiles styler can be pasted as it is. Deep, because the
// builder nests them (text.places.cities, layers.roads.streets, ...).
const camelCaseKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(camelCaseKeys);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        camelCase(key),
        camelCaseKeys(entry),
      ])
    );
  }
  return value;
};

const builderOptions = (style: CustomMapStyleConfig) => {
  const config = style as Record<string, unknown>;
  const options: Record<string, unknown> = {};
  for (const name of BUILDER_OPTIONS) {
    const value = config[name] ?? config[camelCase(name)];
    if (value !== undefined) {
      options[camelCase(name)] = camelCaseKeys(value);
    }
  }
  return options;
};

/**
 * The palette to draw, and what to adjust about it. A style that does not exist
 * would leave the map blank, so a value typed by hand falls back to the default.
 */
export const resolveMapStyle = (
  style: MapStyleConfig | undefined,
  darkMode: boolean
): ResolvedMapStyle => {
  if (isCustomMapStyle(style)) {
    const options = builderOptions(style);
    const palette = paletteFor(
      isStyle(style.base) ? style.base : DEFAULT_MAP_STYLE,
      darkMode
    );
    // Nothing to adjust: the palette as it comes will do.
    return Object.keys(options).length ? { palette, options } : { palette };
  }

  return {
    palette: paletteFor(isStyle(style) ? style : DEFAULT_MAP_STYLE, darkMode),
  };
};
