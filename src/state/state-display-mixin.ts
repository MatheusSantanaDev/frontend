import type { PropertyValues } from "lit";
import { computeFormatFunctions } from "../common/translations/entity-state";
import type { Constructor, HomeAssistant } from "../types";
import type { HassBaseEl } from "./hass-base-mixin";

export default <T extends Constructor<HassBaseEl>>(superClass: T) => {
  class StateDisplayMixin extends superClass {
    protected hassConnected() {
      super.hassConnected();
      this._updateFormatFunctions();
    }

    protected willUpdate(changedProps: PropertyValues<this>) {
      super.willUpdate(changedProps);

      if (!changedProps.has("hass")) {
        return;
      }
      const oldHass = changedProps.get("hass") as HomeAssistant | undefined;

      if (
        this.hass &&
        (!oldHass ||
          this.hass.localize !== oldHass.localize ||
          this.hass.locale !== oldHass.locale ||
          this.hass.config !== oldHass.config ||
          this.hass.entities !== oldHass.entities ||
          this.hass.devices !== oldHass.devices ||
          this.hass.areas !== oldHass.areas ||
          this.hass.floors !== oldHass.floors)
      ) {
        this._updateFormatFunctions();
      }
    }

    private _updateFormatFunctions = async () => {
      if (!this.hass?.config) {
        return;
      }

      const { localize, locale, config, entities, devices, areas, floors } =
        this.hass;
      const formatFunctions = await computeFormatFunctions(
        localize,
        locale,
        config,
        entities,
        devices,
        areas,
        floors
      );
      // Translations or registries can change while the functions are being
      // computed: applying the result then would bind the format functions to
      // a stale localize, silently dropping keys the current one has (e.g.
      // state.default.unavailable rendering as an empty logbook row). The
      // change that invalidated this run already started a fresh one.
      const h = this.hass;
      if (
        !h ||
        h.localize !== localize ||
        h.locale !== locale ||
        h.config !== config ||
        h.entities !== entities ||
        h.devices !== devices ||
        h.areas !== areas ||
        h.floors !== floors
      ) {
        return;
      }
      this._updateHass(formatFunctions);
    };
  }
  return StateDisplayMixin;
};
