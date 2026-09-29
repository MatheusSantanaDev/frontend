import { describe, expect, it } from "vitest";
import { resolveMapStyle } from "../../../src/common/map/map-styles";

describe("resolveMapStyle", () => {
  // Every style ships a light and a dark palette, so the theme mode picks the
  // half whatever style a card names.
  it("picks the palette from the theme mode", () => {
    expect(resolveMapStyle(undefined, false)).toEqual({ palette: "colorful" });
    expect(resolveMapStyle(undefined, true)).toEqual({
      palette: "colorful-dark",
    });
    expect(resolveMapStyle("toner", false)).toEqual({ palette: "toner" });
    expect(resolveMapStyle("toner", true)).toEqual({ palette: "toner-dark" });
  });

  // A style that does not exist has no palette to build, which would leave the
  // map blank rather than merely wrong.
  it("falls back to the default for a style that does not exist", () => {
    expect(resolveMapStyle("eclipse" as never, false)).toEqual({
      palette: "colorful",
    });
    expect(resolveMapStyle({ base: "eclipse" as never }, true)).toEqual({
      palette: "colorful-dark",
    });
  });

  it("builds nothing for a custom style that adjusts nothing", () => {
    expect(resolveMapStyle({ base: "gray" }, false)).toEqual({
      palette: "gray",
    });
  });

  it("keeps adjustments on the default style without a base", () => {
    const light = resolveMapStyle({ recolor: { saturate: -1 } }, false);
    const dark = resolveMapStyle({ recolor: { saturate: -1 } }, true);

    expect(light.palette).toBe("colorful");
    expect(dark.palette).toBe("colorful-dark");
    expect(light.options).toEqual({ recolor: { saturate: -1 } });
  });

  // The builder names its options in camelCase, Home Assistant configs are
  // snake_case, and an options object copied out of the versatiles styler is
  // already camelCase. Both have to arrive as the builder spells them, at every
  // level: v6 nests them several deep.
  it("accepts snake_case and camelCase option names, nested", () => {
    const snake = resolveMapStyle(
      {
        base: "muted",
        recolor: { invert_brightness: true, rotate_hue: 90 },
        colors: { nature_wood: "#0a0", water: "#00f" },
        text: { language_strict: true, places: { cities: { size: 1.2 } } },
      },
      false
    );
    const camel = resolveMapStyle(
      {
        base: "muted",
        recolor: { invertBrightness: true, rotateHue: 90 },
        colors: { natureWood: "#0a0", water: "#00f" },
        text: { languageStrict: true, places: { cities: { size: 1.2 } } },
      } as never,
      false
    );

    expect(snake.options).toEqual({
      recolor: { invertBrightness: true, rotateHue: 90 },
      colors: { natureWood: "#0a0", water: "#00f" },
      text: { languageStrict: true, places: { cities: { size: 1.2 } } },
    });
    expect(camel.options).toEqual(snake.options);
  });

  // The builder also takes the tile, glyph and sprite URLs, the projection and
  // the elevation features. Those stay ours: a card that could set them would
  // send every viewer's address to whatever host it named.
  it("drops options a card does not get to set", () => {
    const resolved = resolveMapStyle(
      {
        base: "gray",
        urls: { base: "https://example.com" },
        projection: "mercator",
        features: { terrain: true },
        theme: "toner-dark",
        recolor: { saturate: -1 },
      } as never,
      false
    );

    expect(resolved.options).toEqual({ recolor: { saturate: -1 } });
    expect(resolved.palette).toBe("gray");
  });
});
