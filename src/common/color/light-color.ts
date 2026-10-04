import { hs2rgb, rgb2hex } from "./convert-color";
import { mired2kelvin, temperature2rgb } from "./convert-light-color";

// Attributes a light reports its color through. Kept in sync with
// LIGHT_COLOR_ATTRIBUTES in the backend logbook component so activity rows and
// history graphs can be painted with the color the light had at that moment.
export interface LightColorAttributes {
  rgb_color?: unknown;
  hs_color?: unknown;
  color_temp?: unknown;
  color_temp_kelvin?: unknown;
}

const isNumberArray = (value: unknown): value is number[] => {
  if (!Array.isArray(value)) {
    return false;
  }
  const items: unknown[] = value;
  return items.every(
    (item) => typeof item === "number" && Number.isFinite(item)
  );
};

const positiveNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;

/**
 * Resolve the color a light had from its state attributes, as a hex string.
 *
 * Returns `undefined` when the attributes carry no usable color — the light
 * was off, is unavailable, or only reports CIE xy colors — so callers can fall
 * back to the generic state color.
 */
export const lightColorFromAttributes = (
  attributes: LightColorAttributes | undefined
): string | undefined => {
  const rgb = attributes?.rgb_color;
  if (isNumberArray(rgb) && rgb.length === 3) {
    return rgb2hex([rgb[0], rgb[1], rgb[2]]);
  }

  const hs = attributes?.hs_color;
  if (isNumberArray(hs) && hs.length === 2) {
    // `hs_color` reports saturation 0-100; `hs2rgb` expects 0-1.
    return rgb2hex(hs2rgb([hs[0], hs[1] / 100]));
  }

  const mired = positiveNumber(attributes?.color_temp);
  const kelvin =
    positiveNumber(attributes?.color_temp_kelvin) ??
    (mired ? mired2kelvin(mired) : undefined);
  return kelvin ? rgb2hex(temperature2rgb(kelvin)) : undefined;
};
