import { TZDate } from "@date-fns/tz";
import type { CalendarOptions } from "fullcalendar";
import { Calendar } from "fullcalendar";
import allLocales from "fullcalendar/locales-all";
import dayGridPlugin from "fullcalendar/daygrid";
import interactionPlugin from "fullcalendar/interaction";
import listPlugin from "fullcalendar/list";
import skeletonCss from "fullcalendar/skeleton.css";
import classicTheme from "fullcalendar/themes/classic";
import classicPaletteCss from "fullcalendar/themes/classic/palette.css";
import classicThemeCss from "fullcalendar/themes/classic/theme.css";
import {
  mdiPlus,
  mdiViewAgenda,
  mdiViewDay,
  mdiViewModule,
  mdiViewWeek,
} from "@mdi/js";
import type { CSSResultGroup, PropertyValues } from "lit";
import { LitElement, css, html, nothing, unsafeCSS } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import memoize from "memoize-one";
import { firstWeekdayIndex } from "../../common/datetime/first_weekday";
import { resolveTimeZone } from "../../common/datetime/resolve-time-zone";
import { useAmPm } from "../../common/datetime/use_am_pm";
import { fireEvent } from "../../common/dom/fire_event";
import { supportsFeature } from "../../common/entity/supports-feature";
import type { LocalizeFunc } from "../../common/translations/localize";
import "../../components/ha-button";
import "../../components/ha-button-toggle-group";
import "../../components/ha-icon-button-next";
import "../../components/ha-icon-button-prev";
import type {
  Calendar as CalendarData,
  CalendarEvent,
} from "../../data/calendar";
import { CalendarEntityFeature } from "../../data/calendar";
import { TimeZone } from "../../data/translation";
import { haStyle } from "../../resources/styles";
import type {
  CalendarViewChanged,
  FullCalendarView,
  HomeAssistant,
  ToggleButton,
} from "../../types";
import "../lovelace/components/hui-warning";
import { showCalendarEventDetailDialog } from "./show-dialog-calendar-event-detail";
import { showCalendarEventEditDialog } from "./show-dialog-calendar-event-editor";

declare global {
  interface HTMLElementTagNameMap {
    "ha-full-calendar": HAFullCalendar;
  }
  interface HASSDomEvents {
    "view-changed": CalendarViewChanged;
  }
}

const defaultFullCalendarConfig: CalendarOptions = {
  headerToolbar: false,
  plugins: [classicTheme, dayGridPlugin, listPlugin, interactionPlugin],
  initialView: "dayGridMonth",
  dayMaxEventRows: true,
  height: "parent",
  locales: allLocales,
  viewClass: "calendar-view",
  dayHeaderClass: "day-header",
  dayRowClass: "day-row",
  dayCellClass: ({ isPast }) => (isPast ? "day-past" : ""),
  dayCellTopClass: "day-top",
  dayCellTopInnerClass: ({ isToday }) =>
    isToday ? "day-number today-number" : "day-number",
  dayCellInnerClass: "day-events",
  eventClass: "event",
  rowEventInnerClass: "row-event-inner",
  listItemEventClass: "list-item-event",
  listItemEventTimeClass: "list-item-event-time",
  listItemEventTitleClass: "list-item-event-title",
  popoverClass: "popover",
  views: {
    dayGridMonth: {
      className: "month-view",
    },
    listWeek: {
      type: "list",
      duration: { days: 7 },
      className: "list-view",
      listDayClass: "list-day",
      listDayHeaderClass: "list-day-header",
      listDayHeaderInnerClass: ({ level }) =>
        level ? "list-day-side-text" : "list-day-text",
    },
  },
};

@customElement("ha-full-calendar")
export class HAFullCalendar extends LitElement {
  public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ attribute: "add-fab", type: Boolean }) public addFab = false;

  @property({ attribute: "add-fab-size" }) public addFabSize = "large";

  @property({ attribute: "add-fab-style" }) public addFabStyle = "on_top";

  @property({ attribute: "auto-height", type: Boolean }) public autoHeight =
    false;

  @property({ attribute: false }) public events: CalendarEvent[] = [];

  @property({ attribute: false }) public calendars: CalendarData[] = [];

  @property({ attribute: false }) public views: FullCalendarView[] = [
    "dayGridMonth",
    "dayGridWeek",
    "dayGridDay",
    "listWeek",
  ];

  @property({ attribute: false }) public initialView: FullCalendarView =
    "dayGridMonth";

  @property({ attribute: false }) public eventDisplay = "auto";

  @property({ attribute: false }) public error?: string = undefined;

  private calendar?: Calendar;

  private _midnightRefreshTimeout?: number;

  private _viewButtons?: ToggleButton[];

  @state() private _activeView = this.initialView;

  disconnectedCallback(): void {
    this._clearMidnightRefreshTimeout();
    super.disconnectedCallback();
    this.calendar?.destroy();
    this.calendar = undefined;
  }

  connectedCallback(): void {
    super.connectedCallback();
    if (this.hasUpdated && !this.calendar) {
      this._loadCalendar(this._activeView);
    } else if (this.calendar) {
      this._scheduleMidnightRefresh();
    }
  }

  protected render() {
    const viewToggleButtons = this._viewToggleButtons(
      this.views,
      this.hass.localize
    );

    return html`
      ${
        this.calendar
          ? html`
              ${
                this.error
                  ? html`<hui-warning .hass=${this.hass} severity="warning"
                      >${this.error}</hui-warning
                    >`
                  : ""
              }
              <div class="header">
                ${
                  !this.narrow
                    ? html`
                        <div class="navigation">
                          <ha-button
                            appearance="filled"
                            size="s"
                            class="today"
                            @click=${this._handleToday}
                            >${this.hass.localize(
                              "ui.components.calendar.today"
                            )}</ha-button
                          >
                          <ha-icon-button-prev
                            .label=${this.hass.localize("ui.common.previous")}
                            class="prev"
                            @click=${this._handlePrev}
                          >
                          </ha-icon-button-prev>
                          <ha-icon-button-next
                            .label=${this.hass.localize("ui.common.next")}
                            class="next"
                            @click=${this._handleNext}
                          >
                          </ha-icon-button-next>
                        </div>
                        <h1>${this.calendar.view.title}</h1>
                        <div>
                          <ha-button-toggle-group
                            .buttons=${viewToggleButtons}
                            .active=${this._activeView}
                            size="s"
                            no-wrap
                            @value-changed=${this._handleView}
                          ></ha-button-toggle-group>
                          ${
                            this.addFab &&
                            this._hasMutableCalendars &&
                            this.addFabStyle === "header"
                              ? html`<ha-button
                                  size="s"
                                  class="fab-header"
                                  aria-label=${this.hass.localize(
                                    "ui.components.calendar.event.add"
                                  )}
                                  @click=${this._createEvent}
                                >
                                  <ha-svg-icon
                                    slot=""
                                    .path=${mdiPlus}
                                  ></ha-svg-icon>
                                </ha-button>`
                              : nothing
                          }
                        </div>
                      `
                    : html`
                        <div class="controls">
                          <h1>${this.calendar.view.title}</h1>
                          <div>
                            <ha-icon-button-prev
                              .label=${this.hass.localize("ui.common.previous")}
                              class="prev"
                              @click=${this._handlePrev}
                            >
                            </ha-icon-button-prev>
                            <ha-icon-button-next
                              .label=${this.hass.localize("ui.common.next")}
                              class="next"
                              @click=${this._handleNext}
                            >
                            </ha-icon-button-next>
                          </div>
                        </div>
                        <div class="controls buttons">
                          <ha-button
                            appearance="plain"
                            size="s"
                            class="today"
                            @click=${this._handleToday}
                            >${this.hass.localize(
                              "ui.components.calendar.today"
                            )}</ha-button
                          >
                          <div>
                            <ha-button-toggle-group
                              .buttons=${viewToggleButtons}
                              .active=${this._activeView}
                              size="s"
                              no-wrap
                              @value-changed=${this._handleView}
                            ></ha-button-toggle-group>
                            ${
                              this.addFab &&
                              this._hasMutableCalendars &&
                              this.addFabStyle === "header"
                                ? html`<ha-button
                                    size="s"
                                    class="fab-header"
                                    aria-label=${this.hass.localize(
                                      "ui.components.calendar.event.add"
                                    )}
                                    @click=${this._createEvent}
                                  >
                                    <ha-svg-icon
                                      slot=""
                                      .path=${mdiPlus}
                                    ></ha-svg-icon>
                                  </ha-button>`
                                : nothing
                            }
                          </div>
                        </div>
                      `
                }
              </div>
            `
          : ""
      }

      <div id="calendar"></div>
      ${
        this.addFab &&
        this._hasMutableCalendars &&
        this.addFabStyle !== "header"
          ? html`<ha-button
              size=${this.addFabSize.charAt(0)}
              class=${classMap({ below: this.addFabStyle === "below" })}
              slot="fab"
              @click=${this._createEvent}
            >
              <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
              ${this.hass.localize("ui.components.calendar.event.add")}
            </ha-button>`
          : nothing
      }
    `;
  }

  public willUpdate(changedProps: PropertyValues<this>): void {
    super.willUpdate(changedProps);

    if (!this.calendar) {
      return;
    }

    if (changedProps.has("events")) {
      this.calendar.removeAllEventSources();
      this.calendar.addEventSource(this.events);
    }

    if (changedProps.has("views") && !this.views.includes(this._activeView!)) {
      this._activeView =
        this.initialView && this.views.includes(this.initialView)
          ? this.initialView
          : this.views[0];
      this.calendar!.changeView(this._activeView);
      this._fireViewChanged();
    }

    if (changedProps.has("eventDisplay")) {
      this.calendar!.setOption("eventDisplay", this.eventDisplay);
    }

    if (changedProps.has("autoHeight")) {
      this.calendar.setOption("height", this._height);
    }

    const oldHass = changedProps.get("hass") as HomeAssistant;

    if (oldHass && oldHass.language !== this.hass.language) {
      this.calendar.setOption("locale", this.hass.language);
    }
  }

  protected firstUpdated(): void {
    this._loadCalendar(this.initialView);
    this._activeView = this.initialView;
  }

  private async _loadCalendar(initialView: FullCalendarView) {
    const luxonFormatPlugin =
      this.hass.locale.time_zone === TimeZone.local
        ? undefined
        : (await import("@fullcalendar/format-luxon3")).default;

    const config: CalendarOptions = {
      ...defaultFullCalendarConfig,
      plugins:
        this.hass.locale.time_zone === TimeZone.local
          ? defaultFullCalendarConfig.plugins
          : [...defaultFullCalendarConfig.plugins!, luxonFormatPlugin!],
      locale: this.hass.language,
      timeZone:
        this.hass.locale.time_zone === TimeZone.local
          ? "local"
          : this.hass.config.time_zone,
      firstDay: firstWeekdayIndex(this.hass.locale),
      initialView,
      height: this._height,
      eventDisplay: this.eventDisplay,
      eventTimeFormat: {
        hour: useAmPm(this.hass.locale) ? "numeric" : "2-digit",
        minute: useAmPm(this.hass.locale) ? "numeric" : "2-digit",
        hour12: useAmPm(this.hass.locale),
      },
    };

    config.dateClick = (info) => this._handleDateClick(info);
    config.eventClick = (info) => this._handleEventClick(info);

    this.calendar = new Calendar(
      this.shadowRoot!.getElementById("calendar")!,
      config
    );
    this.calendar!.render();
    this._fireViewChanged();
  }

  private get _height(): CalendarOptions["height"] {
    return this.autoHeight ? "auto" : defaultFullCalendarConfig.height;
  }

  // Return if there are calendars that support creating events
  private get _hasMutableCalendars(): boolean {
    return this.calendars.some((selCal) => {
      const entityStateObj = this.hass.states[selCal.entity_id];
      return (
        entityStateObj &&
        supportsFeature(entityStateObj, CalendarEntityFeature.CREATE_EVENT)
      );
    });
  }

  private _createEvent(_info) {
    // Logic for selectedDate: In week and day view, use the start of the week or the selected day.
    // If we are in month view, we only use the start of the month, if we are not showing the
    // current actual month, as for that one the current day is automatically highlighted and
    // defaulting to a different day in the event creation dialog would be weird.
    showCalendarEventEditDialog(this, {
      selectedDate:
        this._activeView === "dayGridWeek" ||
        this._activeView === "dayGridDay" ||
        (this._activeView === "dayGridMonth" &&
          this.calendar!.view.currentStart.getMonth() !== new Date().getMonth())
          ? this.calendar!.view.currentStart
          : undefined,
      updated: () => {
        this._fireViewChanged();
      },
    });
  }

  private _handleEventClick(info): void {
    const entityStateObj = this.hass.states[info.event.extendedProps.calendar];
    const canEdit =
      entityStateObj &&
      supportsFeature(entityStateObj, CalendarEntityFeature.UPDATE_EVENT);
    const canDelete =
      entityStateObj &&
      supportsFeature(entityStateObj, CalendarEntityFeature.DELETE_EVENT);
    showCalendarEventDetailDialog(this, {
      calendarId: info.event.extendedProps.calendar,
      entry: info.event.extendedProps.eventData,
      color: info.event.backgroundColor,
      updated: () => {
        this._fireViewChanged();
      },
      canEdit: canEdit,
      canDelete: canDelete,
    });
  }

  private _handleDateClick(info): void {
    if (info.view.type !== "dayGridMonth") {
      return;
    }
    this._activeView = "dayGridDay";
    this.calendar!.changeView("dayGridDay");
    this.calendar!.gotoDate(info.dateStr);
    this._fireViewChanged();
  }

  private _handleNext(): void {
    this.calendar!.next();
    this._fireViewChanged();
  }

  private _handlePrev(): void {
    this.calendar!.prev();
    this._fireViewChanged();
  }

  private _handleToday(): void {
    this.calendar!.today();
    this._fireViewChanged();
  }

  private _handleView(ev: CustomEvent): void {
    this._activeView = ev.detail.value;
    this.calendar!.changeView(this._activeView!);
    this._fireViewChanged();
  }

  private _fireViewChanged(): void {
    this._scheduleMidnightRefresh();
    fireEvent(this, "view-changed", {
      start: this.calendar!.view.activeStart,
      end: this.calendar!.view.activeEnd,
      view: this.calendar!.view.type,
    });
  }

  private _scheduleMidnightRefresh(): void {
    this._clearMidnightRefreshTimeout();

    if (!this.calendar) {
      return;
    }

    const wasShowingToday = this._isShowingToday();
    const nextMidnight = new TZDate(new Date(), this._calendarTimeZone());
    nextMidnight.setHours(24, 0, 0, 0);
    const delay = nextMidnight.getTime() - Date.now();

    // Guard against a NaN/negative delay (e.g. Intl longOffset unsupported on
    // Chromium < 95) so the midnight refresh can't fire in a tight loop (#54182).
    if (!Number.isFinite(delay) || delay <= 0) {
      return;
    }

    this._midnightRefreshTimeout = window.setTimeout(() => {
      if (wasShowingToday) {
        this.calendar?.today();
        this._fireViewChanged();
        return;
      }

      this._scheduleMidnightRefresh();
    }, delay);
  }

  private _clearMidnightRefreshTimeout(): void {
    if (this._midnightRefreshTimeout === undefined) {
      return;
    }

    window.clearTimeout(this._midnightRefreshTimeout);
    this._midnightRefreshTimeout = undefined;
  }

  private _isShowingToday(): boolean {
    const calendarDate = this.calendar?.getDate();

    if (!calendarDate) {
      return false;
    }

    return (
      this._formatDateInCalendarTimeZone(calendarDate) ===
      this._formatDateInCalendarTimeZone(new Date())
    );
  }

  private _calendarTimeZone(): string {
    return resolveTimeZone(
      this.hass.locale.time_zone,
      this.hass.config.time_zone
    );
  }

  private _formatDateInCalendarTimeZone(date: Date): string {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: this._calendarTimeZone(),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }

  private _viewToggleButtons = memoize((views, localize: LocalizeFunc) => {
    if (!this._viewButtons) {
      this._viewButtons = [
        {
          label: localize("ui.components.calendar.views.dayGridMonth"),
          value: "dayGridMonth",
          iconPath: mdiViewModule,
        },
        {
          label: localize("ui.components.calendar.views.dayGridWeek"),
          value: "dayGridWeek",
          iconPath: mdiViewWeek,
        },
        {
          label: localize("ui.components.calendar.views.dayGridDay"),
          value: "dayGridDay",
          iconPath: mdiViewDay,
        },
        {
          label: localize("ui.components.calendar.views.listWeek"),
          value: "listWeek",
          iconPath: mdiViewAgenda,
        },
      ];
    }

    return this._viewButtons.filter((button) =>
      views.includes(button.value as FullCalendarView)
    );
  });

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      unsafeCSS(skeletonCss.replace(":root", ":host")),
      unsafeCSS(classicPaletteCss.replace(":root", ":host")),
      unsafeCSS(classicThemeCss),
      css`
        :host {
          display: flex;
          flex-direction: column;
        }

        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 8px;
        }

        :host([narrow]) .header {
          padding-right: 8px;
          padding-left: 8px;
          padding-inline-start: 8px;
          padding-inline-end: 8px;
          flex-direction: column;
          align-items: flex-start;
          justify-content: initial;
        }

        .header {
          padding-right: var(--calendar-header-padding);
          padding-left: var(--calendar-header-padding);
          padding-inline-start: var(--calendar-header-padding);
          padding-inline-end: var(--calendar-header-padding);
        }

        .navigation {
          display: flex;
          align-items: center;
          flex-grow: 0;
        }

        a {
          color: var(--primary-color);
        }

        .controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
        }

        .buttons {
          display: flex;
          flex-wrap: wrap;
        }

        .buttons > * {
          margin-bottom: 5px;
          box-sizing: border-box;
        }

        .today {
          margin-right: 20px;
          margin-inline-end: 20px;
          margin-inline-start: initial;
          direction: var(--direction);
        }

        .prev,
        .next {
          --ha-icon-button-size: 32px;
        }

        ha-button[slot="fab"] {
          position: absolute;
          bottom: var(--ha-space-4);
          right: var(--ha-space-4);
          inset-inline-end: var(--ha-space-4);
          inset-inline-start: initial;
          z-index: 1;
          --ha-button-box-shadow: var(--ha-box-shadow-l);
        }

        ha-button.below[slot="fab"] {
          position: relative;
          margin-inline-start: auto;
          padding-top: var(--ha-space-2);
          left: 0;
          right: 0;
          bottom: 0;
          top: 0;
          --ha-button-box-shadow: none;
        }

        #calendar {
          flex-grow: 1;
          background-color: var(
            --ha-card-background,
            var(--card-background-color, white)
          );
          height: var(--calendar-height);
          --fc-classic-background: var(
            --ha-card-background,
            var(--card-background-color, white)
          );
          --fc-classic-foreground: var(--primary-text-color);
          --fc-classic-muted-foreground: var(--secondary-text-color);
          --fc-classic-border: var(--divider-color);
          --fc-classic-strong-border: var(--divider-color);
          --fc-classic-primary: var(--primary-color);
          --fc-classic-primary-foreground: var(--text-primary-color);
          --fc-classic-muted: var(--secondary-background-color);
          --fc-classic-faint: transparent;
          --fc-classic-today: transparent;
        }

        a {
          color: inherit !important;
        }

        .calendar-view {
          border: 1px solid var(--divider-color);
          border-width: var(--calendar-border-width, 1px);
          border-radius: var(
            --calendar-border-radius,
            var(--mdc-shape-small, 4px)
          );
        }

        .day-header {
          background-color: var(--table-header-background-color);
          color: var(--primary-text-color);
          font-size: var(--ha-font-size-xs);
          font-weight: var(--ha-font-weight-bold);
          text-transform: uppercase;
        }

        .list-item-event:hover {
          background-color: inherit;
        }

        .day-top {
          text-align: center;
          padding-top: 5px;
          justify-content: center;
        }

        .day-row:first-child .day-top {
          padding-top: 0;
        }

        .day-number {
          font-size: var(--ha-font-size-s);
          cursor: pointer;
          padding: 3px !important;
        }

        .today-number {
          height: 26px;
          color: var(--text-primary-color) !important;
          background-color: var(--primary-color);
          border-radius: var(--ha-border-radius-circle);
          display: inline-block;
          text-align: center;
          white-space: nowrap;
          width: max-content;
          min-width: 24px;
        }

        .day-events {
          margin-top: 4px;
        }

        .event {
          border-radius: var(--ha-border-radius-sm);
          line-height: var(--ha-line-height-normal);
          cursor: pointer;
        }

        .row-event-inner {
          padding: 0 1px;
        }

        .day-past .day-events {
          opacity: 0.5;
        }

        .popover {
          background-color: var(--primary-background-color) !important;
        }

        .popover .day-header {
          background-color: var(--secondary-background-color) !important;
        }

        .list-day-header {
          background-color: transparent;
        }

        .list-view,
        .list-day,
        .list-view .list-item-event {
          border: none;
        }

        .list-day-header {
          border-bottom: none;
          border-top: 1px solid var(--divider-color);
        }

        .list-day-text {
          font-size: var(--ha-font-size-l);
          font-weight: var(--ha-font-weight-normal);
        }

        .list-day-side-text {
          font-size: var(--ha-font-size-l);
          font-weight: var(--ha-font-weight-normal);
          color: var(--primary-color);
        }

        .list-view .list-item-event,
        .list-day-text,
        .list-day-side-text {
          padding-top: 12px;
          padding-bottom: 12px;
        }

        :host([narrow]) .month-view .list-item-event-time,
        :host([narrow]) .month-view .list-item-event-title {
          display: none;
        }

        :host([narrow]) .month-view .day-events {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-wrap: wrap;
        }

        #calendar ::-webkit-scrollbar {
          width: 0.4rem;
          height: 0.4rem;
        }

        #calendar ::-webkit-scrollbar-thumb {
          border-radius: var(--ha-border-radius-sm);
          background: var(--scrollbar-thumb-color);
        }

        #calendar * {
          scrollbar-color: var(--scrollbar-thumb-color) transparent;
          scrollbar-width: thin;
        }
      `,
    ];
  }
}
