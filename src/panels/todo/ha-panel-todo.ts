import "@home-assistant/webawesome/dist/components/divider/divider";
import { ResizeController } from "@lit-labs/observers/resize-controller";
import {
  mdiChevronDown,
  mdiCommentProcessingOutline,
  mdiDelete,
  mdiDotsVertical,
  mdiDrag,
  mdiEyeOff,
  mdiInformationOutline,
  mdiPlus,
  mdiSync,
} from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { repeat } from "lit/directives/repeat";
import memoizeOne from "memoize-one";
import { isComponentLoaded } from "../../common/config/is_component_loaded";
import { storage } from "../../common/decorators/storage";
import { fireEvent } from "../../common/dom/fire_event";
import type {
  HASSDomCurrentTargetEvent,
  HASSDomEvent,
} from "../../common/dom/fire_event";
import { computeStateName } from "../../common/entity/compute_state_name";
import { supportsFeature } from "../../common/entity/supports-feature";
import { navigate } from "../../common/navigate";
import { constructUrlCurrentPath } from "../../common/url/construct-url";
import { extractSearchParamsObject } from "../../common/url/search-params";
import {
  createTodoQueryString,
  decodeTodoQueryParams,
} from "../../common/url/todo-query-params";
import "../../components/ha-button";
import "../../components/ha-dropdown";
import type { HaDropdownSelectEvent } from "../../components/ha-dropdown";
import "../../components/ha-dropdown-item";
import type { HaDropdownItem } from "../../components/ha-dropdown-item";
import "../../components/ha-icon-button";
import "../../components/ha-list-item";
import "../../components/ha-sortable";
import "../../components/ha-state-icon";
import "../../components/ha-svg-icon";
import "../../components/ha-tab-group";
import "../../components/ha-tab-group-tab";
import "../../components/ha-two-pane-top-app-bar-fixed";
import { deleteConfigEntry } from "../../data/config_entries";
import {
  getExtendedEntityRegistryEntry,
  updateEntityRegistryEntry,
} from "../../data/entity/entity_registry";
import { fetchIntegrationManifest } from "../../data/integration";
import type { LovelaceCardConfig } from "../../data/lovelace/config/card";
import {
  TodoListEntityFeature,
  getTodoLists,
  type TodoList,
} from "../../data/todo";
import { showConfigFlowDialog } from "../../dialogs/config-flow/show-dialog-config-flow";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../dialogs/generic/show-dialog-box";
import { showVoiceCommandDialog } from "../../dialogs/voice-command-dialog/show-ha-voice-command-dialog";
import { haStyle } from "../../resources/styles";
import type { HomeAssistant } from "../../types";
import "../lovelace/cards/hui-card";
import "./ha-shopping-budget";
import { showTodoItemEditDialog } from "./show-dialog-todo-item-editor";

@customElement("ha-panel-todo")
class PanelTodo extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ type: Boolean, reflect: true }) public mobile = false;

  @state()
  @storage({
    key: "selectedTodoEntity",
    state: true,
  })
  private _entityId?: string;

  @storage({
    key: "todoListOrder",
    state: true,
  })
  private _listOrder?: string[];

  @storage({ key: "todoDefaultShoppingList" })
  private _appliedDefaultShoppingList?: string;

  @state() private _syncing = false;

  @state()
  @storage({
    key: "todoSelectedTab",
    state: true,
  })
  private _selectedTab: "list" | "budget" = "list";

  private _openAddItemFromUrl = false;

  private _showPaneController = new ResizeController(this, {
    callback: (entries) => entries[0]?.contentRect.width > 750,
  });

  private _mql?: MediaQueryList;

  private _conversation = memoizeOne((_components) =>
    isComponentLoaded(this.hass.config, "conversation")
  );

  public connectedCallback() {
    super.connectedCallback();
    this._mql = window.matchMedia(
      "(max-width: 450px), all and (max-height: 500px)"
    );
    this._mql.addListener(this._setIsMobile);
    this.mobile = this._mql.matches;
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._mql?.removeListener(this._setIsMobile!);
    this._mql = undefined;
  }

  private _setIsMobile = (ev: MediaQueryListEvent) => {
    this.mobile = ev.matches;
  };

  protected willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties);

    if (!this.hasUpdated) {
      this.hass.loadFragmentTranslation("lovelace");

      const params = decodeTodoQueryParams(extractSearchParamsObject());
      this._openAddItemFromUrl = params.add_item ?? false;

      if (params.entity_id) {
        this._entityId = params.entity_id;
      } else {
        if (
          this._entityId &&
          (!(this._entityId in this.hass.states) ||
            this.hass.entities[this._entityId]?.hidden)
        ) {
          this._entityId = undefined;
        }
        const lists = this._orderedTodoLists(this.hass, this._listOrder);
        const defaultList = lists.find(
          (list) =>
            this.hass.states[list.entity_id]?.attributes
              .default_shopping_list === true
        );
        if (!this._entityId) {
          this._entityId = defaultList?.entity_id ?? lists[0]?.entity_id;
          if (defaultList) {
            this._appliedDefaultShoppingList = defaultList.entity_id;
          }
        } else if (
          defaultList &&
          this._appliedDefaultShoppingList !== defaultList.entity_id
        ) {
          this._entityId = defaultList.entity_id;
          this._appliedDefaultShoppingList = defaultList.entity_id;
        }
      }
    }

    if (changedProperties.has("_entityId") || !this.hasUpdated) {
      this._setupTodoElement();
    }

    if (!this._openAddItemFromUrl || !this._entityId) {
      return;
    }

    this._openAddItemFromUrl = false;
    navigate(
      constructUrlCurrentPath(
        createTodoQueryString({ entity_id: this._entityId })
      ),
      { replace: true }
    );
    if (
      supportsFeature(
        this.hass.states[this._entityId],
        TodoListEntityFeature.CREATE_TODO_ITEM
      )
    ) {
      this._addItem();
    }
  }

  private _setupTodoElement(): void {
    if (!this._entityId) {
      navigate(constructUrlCurrentPath(""), { replace: true });
      return;
    }
    navigate(
      constructUrlCurrentPath(
        createTodoQueryString({ entity_id: this._entityId })
      ),
      { replace: true }
    );
  }

  private _orderedTodoLists(
    hass: HomeAssistant,
    order: string[] | undefined
  ): TodoList[] {
    const lists = getTodoLists(hass, false);
    if (!Array.isArray(order) || !order.length) {
      return lists;
    }
    const orderIndex = new Map(
      order.map((entityId, index) => [entityId, index])
    );
    return lists
      .map((list, index) => ({
        list,
        index,
        order: orderIndex.get(list.entity_id),
      }))
      .sort((a, b) => {
        const aOrder = a.order ?? Number.MAX_SAFE_INTEGER;
        const bOrder = b.order ?? Number.MAX_SAFE_INTEGER;
        return aOrder - bOrder || a.index - b.index;
      })
      .map(({ list }) => list);
  }

  private _cardConfig = memoizeOne(
    (entityId: string) =>
      ({
        type: "todo-list",
        entity: entityId,
      }) as LovelaceCardConfig
  );

  private _renderListItem(list: TodoList, withHandle = false): TemplateResult {
    const item = html`
      <ha-dropdown-item
        @click=${this._setEntityId}
        value=${list.entity_id}
        .selected=${list.entity_id === this._entityId}
      >
        <ha-state-icon
          .stateObj=${this.hass.states[list.entity_id]}
          slot="icon"
        ></ha-state-icon>
        ${list.name}
      </ha-dropdown-item>
    `;
    if (!withHandle) {
      return item;
    }
    return html`
      <div class="list-row">
        <ha-svg-icon
          class="handle"
          .path=${mdiDrag}
          title=${this.hass.localize("ui.panel.config.areas.picker.reorder")}
        ></ha-svg-icon>
        ${item}
      </div>
    `;
  }

  private _showKeepSyncButton(): boolean {
    return this.hass.services.google_keep_sync?.request_sync !== undefined;
  }

  private async _requestSync(): Promise<void> {
    if (this._syncing) {
      return;
    }
    this._syncing = true;
    try {
      await this.hass.callService("google_keep_sync", "request_sync", {
        force: true,
      });
    } finally {
      this._syncing = false;
    }
  }

  private _handleTabShow(ev: CustomEvent<{ name: string }>): void {
    const tab = ev.detail?.name;
    if (tab === "list" || tab === "budget") {
      this._selectedTab = tab;
    }
  }

  private _listMoved(ev: HASSDomEvent<HASSDomEvents["item-moved"]>): void {
    ev.stopPropagation();
    const { oldIndex, newIndex } = ev.detail;
    const lists = this._orderedTodoLists(this.hass, this._listOrder);
    const next = lists.map((list) => list.entity_id);
    const [moved] = next.splice(oldIndex, 1);
    if (!moved) {
      return;
    }
    next.splice(newIndex, 0, moved);
    this._listOrder = next;
  }

  protected render(): TemplateResult {
    const entityRegistryEntry = this._entityId
      ? this.hass.entities[this._entityId]
      : undefined;
    const entityState = this._entityId
      ? this.hass.states[this._entityId]
      : undefined;
    const showPane = this._showPaneController.value ?? !this.narrow;
    const budgetEnabled =
      isComponentLoaded(this.hass.config, "shopping_budget") &&
      entityState?.attributes.default_shopping_list === true;
    const activeTab = budgetEnabled ? this._selectedTab : "list";
    const todoLists = this._orderedTodoLists(this.hass, this._listOrder);
    const platform = entityRegistryEntry?.platform;
    const isGoogleKeepList =
      platform === "google_keep_sync" ||
      (platform === undefined &&
        this._entityId?.startsWith("todo.google_keep_"));
    const isLocalTodoList = platform === "local_todo";
    const hideOnlyList =
      platform !== undefined && !isGoogleKeepList && !isLocalTodoList;
    const canRemoveList = Boolean(this._entityId);
    const removeLabel = isGoogleKeepList
      ? "ui.panel.todo.remove_list"
      : isLocalTodoList
        ? "ui.panel.todo.delete_list"
        : hideOnlyList
          ? "ui.panel.todo.hide_list"
          : "ui.panel.todo.remove_list";
    const removeIcon = hideOnlyList ? mdiEyeOff : mdiDelete;
    const removeIsDestructive = !hideOnlyList;
    const listItems = repeat(
      todoLists,
      (list) => list.entity_id,
      (list) => this._renderListItem(list)
    );
    const paneListItems = repeat(
      todoLists,
      (list) => list.entity_id,
      (list) => this._renderListItem(list, true)
    );
    return html`
      <ha-two-pane-top-app-bar-fixed
        .pane=${showPane}
        footer
        .narrow=${this.narrow}
      >
        <div slot="title">
          ${
            !showPane
              ? html`<ha-dropdown class="lists">
                  <ha-button slot="trigger">
                    <div>
                      ${
                        this._entityId
                          ? entityState
                            ? computeStateName(entityState)
                            : this._entityId
                          : nothing
                      }
                    </div>
                    <ha-svg-icon
                      slot="end"
                      .path=${mdiChevronDown}
                    ></ha-svg-icon>
                  </ha-button>
                  ${listItems}
                  ${
                    this.hass.user?.is_admin
                      ? html`<wa-divider></wa-divider>
                          <ha-dropdown-item @click=${this._addList}>
                            <ha-svg-icon
                              .path=${mdiPlus}
                              slot="icon"
                            ></ha-svg-icon>
                            ${this.hass.localize("ui.panel.todo.create_list")}
                          </ha-dropdown-item>`
                      : nothing
                  }
                </ha-dropdown>`
              : this.hass.localize("panel.todo")
          }
        </div>
        ${
          budgetEnabled
            ? html`<ha-tab-group
                slot="subRow"
                @wa-tab-show=${this._handleTabShow}
              >
                <ha-tab-group-tab
                  slot="nav"
                  panel="list"
                  .active=${activeTab === "list"}
                >
                  ${
                    this.hass.locale?.language?.startsWith("pt")
                      ? "Lista"
                      : this.hass.localize("ui.panel.todo.tab_list") || "List"
                  }
                </ha-tab-group-tab>
                <ha-tab-group-tab
                  slot="nav"
                  panel="budget"
                  .active=${activeTab === "budget"}
                >
                  ${
                    this.hass.locale?.language?.startsWith("pt")
                      ? "Orçamento"
                      : this.hass.localize("ui.panel.todo.tab_budget") ||
                        "Budget"
                  }
                </ha-tab-group-tab>
              </ha-tab-group>`
            : nothing
        }
        <ha-sortable
          slot="pane"
          handle-selector=".handle"
          @item-moved=${this._listMoved}
        >
          <div class="list-pane">${paneListItems}</div>
        </ha-sortable>
        ${
          showPane && this.hass.user?.is_admin
            ? html`<ha-list-item
                graphic="icon"
                slot="pane-footer"
                @click=${this._addList}
              >
                <ha-svg-icon .path=${mdiPlus} slot="graphic"></ha-svg-icon>
                ${this.hass.localize("ui.panel.todo.create_list")}
              </ha-list-item>`
            : nothing
        }
        ${
          this._showKeepSyncButton()
            ? html`<ha-icon-button
                slot="actionItems"
                .label=${this.hass.localize("ui.common.refresh")}
                .path=${mdiSync}
                .disabled=${this._syncing}
                @click=${this._requestSync}
              ></ha-icon-button>`
            : nothing
        }
        <ha-dropdown
          slot="actionItems"
          @wa-select=${this._handleDropdownSelect}
        >
          <ha-icon-button
            slot="trigger"
            .label=${""}
            .path=${mdiDotsVertical}
          ></ha-icon-button>
          ${
            this._conversation(this.hass.config.components)
              ? html`<ha-dropdown-item
                  value="info"
                  .disabled=${!this._entityId}
                >
                  <ha-svg-icon .path=${mdiInformationOutline} slot="icon">
                  </ha-svg-icon>
                  ${this.hass.localize("ui.panel.todo.information")}
                </ha-dropdown-item>`
              : nothing
          }
          <wa-divider></wa-divider>
          <ha-dropdown-item value="assist">
            <ha-svg-icon .path=${mdiCommentProcessingOutline} slot="icon">
            </ha-svg-icon>
            ${this.hass.localize("ui.panel.todo.assist")}
          </ha-dropdown-item>
          ${
            canRemoveList
              ? html` <wa-divider></wa-divider>
                  <ha-dropdown-item
                    value="delete"
                    variant=${removeIsDestructive ? "danger" : ""}
                    .disabled=${!this._entityId}
                  >
                    <ha-svg-icon
                      .path=${removeIcon}
                      slot="icon"
                      class=${removeIsDestructive ? "warning" : ""}
                    >
                    </ha-svg-icon>
                    ${this.hass.localize(removeLabel)}
                  </ha-dropdown-item>`
              : nothing
          }
        </ha-dropdown>
        <div id="columns" class=${activeTab === "budget" ? "budget" : ""}>
          <div class="column">
            ${
              this._entityId
                ? activeTab === "budget"
                  ? html`
                      <ha-shopping-budget
                        .hass=${this.hass}
                        .entityId=${this._entityId}
                      ></ha-shopping-budget>
                    `
                  : html`
                      <hui-card
                        .hass=${this.hass}
                        .config=${this._cardConfig(this._entityId)}
                      ></hui-card>
                    `
                : nothing
            }
          </div>
        </div>
        ${
          activeTab === "list" &&
          entityState &&
          supportsFeature(entityState, TodoListEntityFeature.CREATE_TODO_ITEM)
            ? html`<ha-button class="fab" size="l" @click=${this._addItem}>
                <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
                ${this.hass.localize("ui.panel.todo.add_item")}
              </ha-button>`
            : nothing
        }
      </ha-two-pane-top-app-bar-fixed>
    `;
  }

  private async _addList(): Promise<void> {
    showConfigFlowDialog(this, {
      startFlowHandler: "local_todo",
      manifest: await fetchIntegrationManifest(this.hass, "local_todo"),
    });
  }

  private _showMoreInfoDialog(): void {
    if (!this._entityId) {
      return;
    }
    fireEvent(this, "hass-more-info", { entityId: this._entityId });
  }

  private _selectNextList(entityId: string): void {
    this._entityId = this._orderedTodoLists(this.hass, this._listOrder).find(
      (list) => list.entity_id !== entityId
    )?.entity_id;
  }

  private async _deleteList(): Promise<void> {
    if (!this._entityId) {
      return;
    }

    const entityId = this._entityId;
    const entityRegistryEntry = await getExtendedEntityRegistryEntry(
      this.hass,
      entityId
    );
    const platform = entityRegistryEntry.platform;
    const isGoogleKeepList = platform === "google_keep_sync";
    const isLocalTodoList = platform === "local_todo";
    const configEntryId = isLocalTodoList
      ? entityRegistryEntry.config_entry_id
      : null;
    const hideOnly = !isGoogleKeepList && !configEntryId;
    const name =
      entityId in this.hass.states
        ? computeStateName(this.hass.states[entityId])
        : entityId;

    const confirmed = await showConfirmationDialog(this, {
      title: this.hass.localize(
        hideOnly
          ? "ui.panel.todo.hide_confirm_title"
          : "ui.panel.todo.delete_confirm_title",
        { name }
      ),
      text: this.hass.localize(
        isGoogleKeepList
          ? "ui.panel.todo.remove_keep_confirm_text"
          : platform === "shopping_list"
            ? "ui.panel.todo.hide_shopping_list_confirm_text"
            : hideOnly
              ? "ui.panel.todo.hide_confirm_text"
              : "ui.panel.todo.delete_confirm_text"
      ),
      confirmText: this.hass.localize(
        isGoogleKeepList || hideOnly ? "ui.common.remove" : "ui.common.delete"
      ),
      dismissText: this.hass!.localize("ui.common.cancel"),
      destructive: !hideOnly,
    });

    if (!confirmed) {
      return;
    }

    try {
      if (isGoogleKeepList) {
        await this.hass.callService("google_keep_sync", "delete_list", {
          entity_id: entityId,
        });
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 500);
        });
        this._selectNextList(entityId);
        return;
      }

      if (configEntryId) {
        const result = await deleteConfigEntry(this.hass, configEntryId);

        this._selectNextList(entityId);

        if (result.require_restart) {
          showAlertDialog(this, {
            text: this.hass.localize("ui.panel.todo.restart_confirm"),
          });
        }
        return;
      }

      await updateEntityRegistryEntry(this.hass, entityId, {
        hidden_by: "user",
      });
      this._selectNextList(entityId);
    } catch (err) {
      showAlertDialog(this, {
        text: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private _showVoiceCommandDialog(): void {
    showVoiceCommandDialog(this, this.hass, { pipeline_id: "last_used" });
  }

  private _addItem() {
    showTodoItemEditDialog(this, { entity: this._entityId! });
  }

  private _handleDropdownSelect(ev: HaDropdownSelectEvent) {
    const action = ev.detail?.item?.value;

    if (!action) {
      return;
    }

    switch (action) {
      case "info":
        this._showMoreInfoDialog();
        break;
      case "assist":
        this._showVoiceCommandDialog();
        break;
      case "delete":
        this._deleteList();
        break;
    }
  }

  private _setEntityId(ev: HASSDomCurrentTargetEvent<HaDropdownItem>) {
    const item = ev.currentTarget;

    this._entityId = item.value;
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        :host {
          display: block;
        }
        ha-sortable {
          display: block;
        }
        .list-pane {
          display: flex;
          flex-direction: column;
          padding: 4px;
        }
        .list-row {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .list-row ha-dropdown-item {
          flex: 1;
          min-width: 0;
        }
        .handle {
          --mdc-icon-size: 18px;
          color: var(--secondary-text-color);
          cursor: grab;
          flex-shrink: 0;
          opacity: 0.6;
        }
        #columns {
          display: flex;
          flex-direction: row;
          justify-content: center;
          margin: 8px;
          padding-bottom: 70px;
        }
        .column {
          flex: 1 0 0;
          max-width: 500px;
          min-width: 0;
        }
        #columns.budget .column {
          max-width: 1100px;
        }
        ha-tab-group {
          width: 100%;
        }
        ha-dropdown {
          display: inline-block;
          max-width: 100%;
        }
        ha-dropdown ha-button {
          --ha-font-size-m: var(--ha-font-size-l);
        }
        ha-dropdown ha-button div {
          text-overflow: ellipsis;
          width: 100%;
          overflow: hidden;
          white-space: nowrap;
          display: block;
        }
        .fab {
          position: fixed;
          right: calc(16px + var(--safe-area-inset-right, 0px));
          bottom: calc(16px + var(--safe-area-inset-bottom, 0px));
          inset-inline-end: calc(16px + var(--safe-area-inset-right, 0px));
          inset-inline-start: initial;
          --ha-button-box-shadow: var(--ha-box-shadow-l);
        }

        ha-dropdown.lists ha-dropdown-item {
          max-width: 80vw;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-panel-todo": PanelTodo;
  }
}
