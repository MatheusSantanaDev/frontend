import {
  mdiDotsVertical,
  mdiMusicNote,
  mdiVolumeHigh,
  mdiVolumeOff,
} from "@mdi/js";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import { applyThemesOnElement } from "../../../common/dom/apply_themes_on_element";
import { fireEvent } from "../../../common/dom/fire_event";
import { supportsFeature } from "../../../common/entity/supports-feature";
import "../../../components/ha-card";
import "../../../components/ha-control-slider";
import "../../../components/ha-icon-button";
import "../../../components/ha-slider";
import type { HaSlider } from "../../../components/ha-slider";
import "../../../components/ha-state-icon";
import "../../../components/ha-svg-icon";
import { UNAVAILABLE, UNKNOWN } from "../../../data/entity/entity";
import type { MediaPlayerEntity } from "../../../data/media-player";
import {
  cleanupMediaTitle,
  computeMediaControls,
  computeMediaDescription,
  getCurrentProgress,
  handleMediaControlClick,
  MediaPlayerEntityFeature,
} from "../../../data/media-player";
import type { HomeAssistant } from "../../../types";
import { toggleMediaPlayerMute } from "../card-features/common/media-player-mute-button";
import { findEntities } from "../common/find-entities";
import { hasConfigOrEntityChanged } from "../common/has-changed";
import "../components/hui-marquee";
import { createEntityNotFoundWarning } from "../components/hui-warning";
import type { LovelaceCard, LovelaceCardEditor } from "../types";
import type { SpotifyCardConfig } from "./types";

const formatTime = (position: number): string => {
  const seconds = Math.max(Math.floor(position), 0);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
};

@customElement("hui-spotify-card")
export class HuiSpotifyCard extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("../editor/config-elements/hui-spotify-card-editor");
    return document.createElement("hui-spotify-card-editor");
  }

  public static getStubConfig(
    hass: HomeAssistant,
    entities: string[],
    entitiesFallback: string[]
  ): SpotifyCardConfig {
    const foundEntities = findEntities(hass, 1, entities, entitiesFallback, [
      "media_player",
    ]);

    return { type: "spotify", entity: foundEntities[0] || "" };
  }

  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _config?: SpotifyCardConfig;

  @state() private _progressSeconds = 0;

  @state() private _marqueeActive = false;

  @query("ha-slider") private _progressBar?: HaSlider;

  private _progressInterval?: number;

  public getCardSize(): number {
    return 4;
  }

  public setConfig(config: SpotifyCardConfig): void {
    if (!config.entity || config.entity.split(".")[0] !== "media_player") {
      throw new Error("Specify an entity from within the media_player domain");
    }

    this._config = config;
  }

  public connectedCallback(): void {
    super.connectedCallback();

    if (!this.hass || !this._config) {
      return;
    }

    const stateObj = this._stateObj;

    if (!stateObj) {
      return;
    }

    if (
      !this._progressInterval &&
      this._showProgressBar &&
      stateObj.state === "playing"
    ) {
      this._progressInterval = window.setInterval(
        () => this._updateProgress(),
        1000
      );
    }
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._stopProgressInterval();
  }

  protected shouldUpdate(changedProps: PropertyValues<this>): boolean {
    return (
      hasConfigOrEntityChanged(this, changedProps) ||
      changedProps.size > 1 ||
      !changedProps.has("hass")
    );
  }

  protected updated(changedProps: PropertyValues) {
    if (
      !this._config ||
      !this.hass ||
      !this._stateObj ||
      (!changedProps.has("_config") && !changedProps.has("hass"))
    ) {
      return;
    }

    const stateObj = this._stateObj;

    const oldHass = changedProps.get("hass") as HomeAssistant | undefined;
    const oldConfig = changedProps.get("_config") as
      SpotifyCardConfig | undefined;

    if (
      !oldHass ||
      !oldConfig ||
      oldHass.themes !== this.hass.themes ||
      oldConfig.theme !== this._config.theme
    ) {
      applyThemesOnElement(this, this.hass.themes, this._config.theme);
    }

    this._updateProgress();

    if (
      !this._progressInterval &&
      this._showProgressBar &&
      stateObj.state === "playing"
    ) {
      this._progressInterval = window.setInterval(
        () => this._updateProgress(),
        1000
      );
    } else if (
      this._progressInterval &&
      (!this._showProgressBar || stateObj.state !== "playing")
    ) {
      this._stopProgressInterval();
    }
  }

  protected render() {
    if (!this.hass || !this._config) {
      return nothing;
    }

    const stateObj = this._stateObj;

    if (!stateObj) {
      return html`
        <hui-warning .hass=${this.hass}>
          ${createEntityNotFoundWarning(this.hass, this._config.entity)}
        </hui-warning>
      `;
    }

    const isUnavailable =
      stateObj.state === UNAVAILABLE || stateObj.state === UNKNOWN;
    const controls = computeMediaControls(stateObj, false);
    const mediaTitle = cleanupMediaTitle(stateObj.attributes.media_title);
    const mediaDescription = computeMediaDescription(stateObj);
    const showProgress = !isUnavailable && this._showProgressBar;
    const duration = stateObj.attributes.media_duration;
    const title =
      stateObj.state === UNAVAILABLE || stateObj.state === UNKNOWN
        ? this.hass.formatEntityState(stateObj)
        : mediaTitle ||
          this.hass.localize("ui.card.media_player.nothing_playing");
    const subtitle = mediaTitle ? mediaDescription : "";
    const image = this._image;
    const supportsVolume = supportsFeature(
      stateObj,
      MediaPlayerEntityFeature.VOLUME_SET
    );
    const supportsMute = supportsFeature(
      stateObj,
      MediaPlayerEntityFeature.VOLUME_MUTE
    );
    const isMuted = stateObj.attributes.is_volume_muted === true;
    const volume = Math.round((stateObj.attributes.volume_level ?? 0) * 100);

    return html`
      <ha-card>
        <div class="content ${classMap({ unavailable: isUnavailable })}">
          <div class="top-info">
            <div class="icon-name">
              <ha-state-icon .stateObj=${stateObj}></ha-state-icon>
              <div>
                ${this.hass.formatEntityName(
                  this.hass.states[this._config.entity],
                  this._config.name
                )}
              </div>
            </div>
            <ha-icon-button
              .path=${mdiDotsVertical}
              .label=${this.hass.localize(
                "ui.panel.lovelace.cards.show_more_info"
              )}
              class="more-info"
              @click=${this._handleMoreInfo}
            ></ha-icon-button>
          </div>
          <div class="track">
            <div class="art">
              ${
                image
                  ? html`
                      <div
                        class="art-image"
                        style=${styleMap({
                          "background-image": `url(${this.hass.hassUrl(image)})`,
                        })}
                      ></div>
                    `
                  : html`<ha-svg-icon .path=${mdiMusicNote}></ha-svg-icon>`
              }
            </div>
            <div class="info">
              <hui-marquee
                .text=${title}
                .active=${this._marqueeActive}
                @mouseover=${this._marqueeMouseOver}
                @mouseleave=${this._marqueeMouseLeave}
              ></hui-marquee>
              ${
                subtitle
                  ? html`<div class="subtitle">${subtitle}</div>`
                  : nothing
              }
            </div>
          </div>
          ${
            showProgress
              ? html`
                  <div class="progress">
                    <span class="time"
                      >${formatTime(this._progressSeconds)}</span
                    >
                    <ha-slider
                      style=${styleMap({
                        cursor: supportsFeature(
                          stateObj,
                          MediaPlayerEntityFeature.SEEK
                        )
                          ? "pointer"
                          : "initial",
                      })}
                      @click=${this._handleSeek}
                    ></ha-slider>
                    <span class="time"
                      >${duration ? formatTime(duration) : ""}</span
                    >
                  </div>
                `
              : ""
          }
          ${
            controls
              ? html`
                  <div class="controls">
                    <div class="buttons">
                      ${controls.map(
                        (control) => html`
                          <ha-icon-button
                            .label=${this.hass.localize(
                              `ui.card.media_player.${control.action}`
                            )}
                            .path=${control.icon}
                            action=${control.action}
                            @click=${this._handleClick}
                          ></ha-icon-button>
                        `
                      )}
                    </div>
                    ${
                      supportsVolume
                        ? html`
                            <div class="volume">
                              ${
                                supportsMute
                                  ? html`
                                      <ha-icon-button
                                        .path=${isMuted ? mdiVolumeOff : mdiVolumeHigh}
                                        .label=${this.hass.localize(
                                          `ui.card.media_player.${
                                            isMuted
                                              ? "media_volume_unmute"
                                              : "media_volume_mute"
                                          }`
                                        )}
                                        .disabled=${isUnavailable}
                                        @click=${this._toggleMute}
                                      ></ha-icon-button>
                                    `
                                  : nothing
                              }
                              <ha-control-slider
                                .value=${volume}
                                min="0"
                                max="100"
                                unit="%"
                                .disabled=${isUnavailable}
                                .locale=${this.hass.locale}
                                @value-changed=${this._handleVolumeChanged}
                              ></ha-control-slider>
                            </div>
                          `
                        : nothing
                    }
                  </div>
                `
              : ""
          }
        </div>
      </ha-card>
    `;
  }

  private get _stateObj(): MediaPlayerEntity | undefined {
    return this.hass!.states[this._config!.entity] as MediaPlayerEntity;
  }

  private get _image() {
    const stateObj = this._stateObj;

    if (!stateObj) {
      return undefined;
    }

    return (
      stateObj.attributes.entity_picture_local ||
      stateObj.attributes.entity_picture
    );
  }

  private get _showProgressBar(): boolean {
    const stateObj = this._stateObj;

    if (!stateObj) {
      return false;
    }

    return (
      (stateObj.state === "playing" || stateObj.state === "paused") &&
      "media_duration" in stateObj.attributes &&
      "media_position" in stateObj.attributes
    );
  }

  private _stopProgressInterval(): void {
    if (this._progressInterval) {
      clearInterval(this._progressInterval);
      this._progressInterval = undefined;
    }
  }

  private _updateProgress(): void {
    const stateObj = this._stateObj;

    if (!stateObj?.attributes.media_duration) {
      return;
    }

    this._progressSeconds = getCurrentProgress(stateObj);

    if (this._progressBar) {
      this._progressBar.value =
        (this._progressSeconds / stateObj.attributes.media_duration) * 100;
    }
  }

  private _handleMoreInfo(): void {
    fireEvent(this, "hass-more-info", {
      entityId: this._config!.entity,
    });
  }

  private _handleClick(e: MouseEvent): void {
    handleMediaControlClick(
      this.hass!,
      this._stateObj!,
      (e.currentTarget as HTMLElement).getAttribute("action")!
    );
  }

  private _handleSeek(): void {
    const stateObj = this._stateObj!;

    if (!supportsFeature(stateObj, MediaPlayerEntityFeature.SEEK)) {
      return;
    }

    const percentValue = this._progressBar?.value ?? 0;
    const percent = percentValue ? percentValue / 100 : 0;

    const position = stateObj.attributes.media_duration! * percent;

    this.hass!.callService("media_player", "media_seek", {
      entity_id: this._config!.entity,
      seek_position: position,
    });
  }

  private _handleVolumeChanged(ev: CustomEvent): void {
    ev.stopPropagation();

    this.hass!.callService("media_player", "volume_set", {
      entity_id: this._config!.entity,
      volume_level: ev.detail.value / 100,
    });
  }

  private _toggleMute = (ev: Event): void => {
    toggleMediaPlayerMute(ev, this.hass!.callService, this._stateObj!, this);
  };

  private _marqueeMouseOver(): void {
    if (!this._marqueeActive) {
      this._marqueeActive = true;
    }
  }

  private _marqueeMouseLeave(): void {
    if (this._marqueeActive) {
      this._marqueeActive = false;
    }
  }

  static styles = css`
    ha-card {
      overflow: hidden;
      height: 100%;
    }

    .content {
      box-sizing: border-box;
      height: 100%;
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-3);
      padding: var(--ha-space-4);
    }

    .top-info {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--ha-space-2);
    }

    .icon-name {
      display: flex;
      align-items: center;
      min-width: 0;
      color: var(--primary-text-color);
    }

    .icon-name ha-state-icon {
      padding-inline-end: var(--ha-space-2);
    }

    .icon-name div {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .more-info {
      flex: none;
    }

    .track {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      min-width: 0;
    }

    .art {
      position: relative;
      flex: none;
      width: 80px;
      height: 80px;
      border-radius: var(--ha-border-radius-md);
      background-color: var(--secondary-background-color);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }

    .art-image {
      position: absolute;
      inset: 0;
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
    }

    .art ha-svg-icon {
      --mdc-icon-size: 32px;
      color: var(--secondary-text-color);
    }

    .info {
      flex: 1;
      min-width: 0;
    }

    hui-marquee {
      font-size: 1.2em;
      margin: 0 0 var(--ha-space-1);
    }

    .subtitle {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-xs);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .progress {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
    }

    .time {
      flex: none;
      min-width: 2.75em;
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-xs);
      font-variant-numeric: tabular-nums;
    }

    .time:last-child {
      text-align: end;
    }

    ha-slider {
      flex: 1;
      min-width: 0;
      --ha-slider-track-color: var(
        --secondary-text-color,
        rgba(128, 128, 128, 0.5)
      );
    }

    ha-slider::part(thumb) {
      display: none;
    }

    .controls {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--ha-space-2);
    }

    .buttons {
      display: flex;
      align-items: center;
    }

    .controls ha-icon-button {
      --ha-icon-button-size: 44px;
      --mdc-icon-size: 30px;
    }

    .controls ha-icon-button[action="media_play"],
    .controls ha-icon-button[action="media_play_pause"],
    .controls ha-icon-button[action="media_pause"],
    .controls ha-icon-button[action="media_stop"] {
      --ha-icon-button-size: 56px;
      --mdc-icon-size: 40px;
    }

    .volume {
      flex: 1 1 100px;
      min-width: 80px;
      max-width: 160px;
      display: flex;
      align-items: center;
      gap: var(--ha-space-1);
    }

    .volume ha-control-slider {
      flex: 1;
      min-width: 0;
    }

    .unavailable .art {
      opacity: 0.5;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-spotify-card": HuiSpotifyCard;
  }
}
