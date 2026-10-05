import { mdiPencil } from "@mdi/js";
import type { CSSResultGroup, PropertyValues } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";
import { computeStateDomain } from "../../common/entity/compute_state_domain";
import { getEntityLocation } from "../../common/entity/get_entity_location";
import type { HaMapEntity } from "../../components/map/ha-map";
import { navigate } from "../../common/navigate";
import "../../components/ha-icon-button";
import "../../components/ha-top-app-bar-fixed";
import "../../components/map/ha-map";
import { haStyle } from "../../resources/styles";
import type { HomeAssistant } from "../../types";

@customElement("ha-panel-map")
class HaPanelMap extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  private _entities: (string | HaMapEntity)[] = [];

  protected render() {
    return html`
      <ha-top-app-bar-fixed .narrow=${this.narrow}>
        <div slot="title">${this.hass.localize("panel.map")}</div>
        ${
          !__DEMO__ && this.hass.user?.is_admin
            ? html`<ha-icon-button
                slot="actionItems"
                .label=${this.hass!.localize("ui.panel.map.edit_zones")}
                .path=${mdiPencil}
                @click=${this._openZonesEditor}
              ></ha-icon-button>`
            : ""
        }
        <ha-map .entities=${this._entities} auto-fit interactive-zones></ha-map>
      </ha-top-app-bar-fixed>
    `;
  }

  private _openZonesEditor() {
    navigate("/config/zone?historyBack=1");
  }

  public willUpdate(changedProps: PropertyValues<this>) {
    super.willUpdate(changedProps);
    if (!changedProps.has("hass")) {
      return;
    }
    const oldHass = changedProps.get("hass") as HomeAssistant | undefined;
    this._getStates(oldHass);
  }

  private _getStates(oldHass?: HomeAssistant) {
    let changed = false;
    const locationEntities: (string | HaMapEntity)[] = [];
    Object.values(this.hass!.states).forEach((entity) => {
      if (entity.state === "home") {
        return;
      }
      if (!getEntityLocation(entity, this.hass!.states)) {
        return;
      }
      // Persons are not shown: devices report their own locations and
      // we render them directly with their device icon.
      if (computeStateDomain(entity) === "person") {
        return;
      }
      if (entity.attributes.source_type !== undefined) {
        locationEntities.push({
          entity_id: entity.entity_id,
          color: "",
          label_mode: "icon",
        });
      } else {
        locationEntities.push(entity.entity_id);
      }
      if (oldHass?.states[entity.entity_id] !== entity) {
        changed = true;
      }
    });

    if (changed) {
      this._entities = locationEntities;
    }
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        ha-map {
          height: calc(100vh - var(--header-height));
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-panel-map": HaPanelMap;
  }
}
