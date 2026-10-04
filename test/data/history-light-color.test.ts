/**
 * Lights change color without changing state, and their graph segments are
 * painted with the color they had. These tests protect the two invariants
 * that make that work: a color change splits a segment even though the state
 * stayed "on", and domains that report no color keep their previous, plain
 * timeline shape (no `color` key).
 */
import { describe, expect, it } from "vitest";
import type { EntityHistoryState } from "../../src/data/history";
import { computeHistory } from "../../src/data/history";
import {
  createMockEntityState,
  createMockHass,
  mockLocalize,
} from "../fixtures/hass";

const START = Date.UTC(2024, 0, 1, 0, 0, 0) / 1000;

const timelineOf = (entityId: string, states: EntityHistoryState[]) => {
  const hass = createMockHass({
    [entityId]: createMockEntityState(entityId, "on"),
  });
  const result = computeHistory(
    hass,
    { [entityId]: states },
    [entityId],
    mockLocalize
  );
  expect(result.timeline).toHaveLength(1);
  return result.timeline[0];
};

describe("computeHistory light colors", () => {
  it("splits a segment when only the color changed and paints both", () => {
    const entity = timelineOf("light.lamp", [
      { s: "off", a: {}, lu: START },
      { s: "on", a: { rgb_color: [255, 0, 0] }, lu: START + 60 },
      { s: "on", a: { rgb_color: [0, 0, 255] }, lu: START + 120 },
      { s: "off", a: {}, lu: START + 180 },
    ]);

    expect(entity.data.map((state) => state.state)).toEqual([
      "off",
      "on",
      "on",
      "off",
    ]);
    expect(entity.data.map((state) => state.color)).toEqual([
      undefined,
      "#ff0000",
      "#0000ff",
      undefined,
    ]);
    // A period without a reported color keeps the plain timeline shape.
    expect(entity.data[0]).not.toHaveProperty("color");
  });

  it("reads a light that reports no color as white, like the ZhiJia timeline", () => {
    const entity = timelineOf("light.lamp", [
      { s: "off", a: {}, lu: START },
      { s: "on", a: { brightness: 255 }, lu: START + 60 },
    ]);

    expect(entity.data.map((state) => state.color)).toEqual([
      undefined,
      "#ffffff",
    ]);
  });

  it("keeps repeated states collapsed when the color did not change", () => {
    const entity = timelineOf("light.lamp", [
      { s: "on", a: { rgb_color: [255, 0, 0] }, lu: START },
      { s: "on", a: { rgb_color: [255, 0, 0] }, lu: START + 60 },
      { s: "on", a: { rgb_color: [255, 0, 0] }, lu: START + 120 },
    ]);

    expect(entity.data).toHaveLength(1);
    expect(entity.data[0].color).toBe("#ff0000");
  });

  it("does not add a color to domains that never report one", () => {
    const entity = timelineOf("binary_sensor.motion", [
      { s: "off", a: {}, lu: START },
      { s: "on", a: {}, lu: START + 60 },
    ]);

    expect(entity.data.map((state) => state.state)).toEqual(["off", "on"]);
    expect(entity.data.every((state) => !("color" in state))).toBe(true);
  });
});
