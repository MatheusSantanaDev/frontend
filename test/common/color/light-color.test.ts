/**
 * `lightColorFromAttributes` is what turns a light's recorded attributes into
 * the color used to paint activity rows and history graph segments. Each
 * format a light may report is covered here: without these the mapping could
 * silently fall back to the generic amber/grey state colors again — which is
 * what these tests are protecting against.
 */
import { describe, expect, it } from "vitest";
import { lightColorFromAttributes } from "../../../src/common/color/light-color";

describe("lightColorFromAttributes", () => {
  it("returns rgb_color as hex", () => {
    expect(lightColorFromAttributes({ rgb_color: [255, 0, 128] })).toBe(
      "#ff0080"
    );
  });

  it("converts hs_color, whose saturation is 0-100, to hex", () => {
    expect(lightColorFromAttributes({ hs_color: [0, 100] })).toBe("#ff0000");
    expect(lightColorFromAttributes({ hs_color: [120, 100] })).toBe("#00ff00");
    expect(lightColorFromAttributes({ hs_color: [240, 100] })).toBe("#0000ff");
    // Desaturated: every channel ends up at the same value.
    expect(lightColorFromAttributes({ hs_color: [0, 0] })).toBe("#ffffff");
  });

  it("converts color temperature to hex", () => {
    expect(lightColorFromAttributes({ color_temp_kelvin: 6600 })).toBe(
      "#ffffff"
    );
    expect(lightColorFromAttributes({ color_temp_kelvin: 2700 })).toBe(
      "#ffa757"
    );
    // Legacy mired attribute.
    expect(lightColorFromAttributes({ color_temp: 153 })).toBe("#fffffb");
  });

  it("prefers rgb over hs and color temperature", () => {
    expect(
      lightColorFromAttributes({
        rgb_color: [1, 2, 3],
        hs_color: [0, 100],
        color_temp_kelvin: 2700,
      })
    ).toBe("#010203");
  });

  it("returns undefined when there is no usable color", () => {
    expect(lightColorFromAttributes(undefined)).toBeUndefined();
    expect(lightColorFromAttributes({})).toBeUndefined();
    // Wrong arity or non-numeric values are not colors.
    expect(lightColorFromAttributes({ rgb_color: [255, 0] })).toBeUndefined();
    expect(lightColorFromAttributes({ hs_color: [0] })).toBeUndefined();
    expect(lightColorFromAttributes({ color_temp: 0 })).toBeUndefined();
    expect(
      lightColorFromAttributes({ color_temp_kelvin: Number.NaN })
    ).toBeUndefined();
  });
});
