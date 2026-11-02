import {
  mdiAlertCircleOutline,
  mdiCartOutline,
  mdiCheck,
  mdiClose,
  mdiDelete,
  mdiGoogle,
  mdiLinkVariant,
  mdiMagnify,
  mdiOpenInNew,
  mdiPencil,
  mdiPlus,
  mdiRefresh,
  mdiStorefrontOutline,
  mdiSync,
} from "@mdi/js";
import type { HassEvent } from "home-assistant-js-websocket";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { repeat } from "lit/directives/repeat";
import "../../components/ha-alert";
import "../../components/ha-button";
import "../../components/ha-checkbox";
import "../../components/ha-icon-button";
import "../../components/ha-spinner";
import "../../components/ha-svg-icon";
import "../../components/input/ha-input";
import { showConfirmationDialog } from "../../dialogs/generic/show-dialog-box";
import type { HomeAssistant } from "../../types";
import {
  addShoppingItem,
  clearShoppingPrice,
  fetchShoppingBudget,
  linkShoppingItem,
  refreshShoppingFlyers,
  refreshShoppingPrices,
  removeTodoItems,
  searchShoppingCatalog,
  setShoppingPrice,
  setShoppingQuantity,
  setTodoItemStatus,
  type ShoppingBudget,
  type ShoppingBudgetAbcSuggestion,
  type ShoppingBudgetItem,
  type ShoppingBudgetMarket,
  type ShoppingBudgetOcrSuggestion,
  type ShoppingBudgetPrice,
  type ShoppingBudgetProduct,
  type ShoppingBudgetProductSuggestion,
} from "../../data/shopping_budget";
import type { HaInput } from "../../components/input/ha-input";

@customElement("ha-shopping-budget")
export class HaShoppingBudget extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public entityId!: string;

  @state() private _budget?: ShoppingBudget;

  @state() private _loading = false;

  @state() private _error?: string;

  @state() private _refreshing?: "prices" | "flyers";

  @state() private _busy?: string;

  @state() private _priceDrafts: Record<string, string> = {};

  @state() private _editingUid?: string;

  @state() private _editBrand = "";

  @state() private _editGrams = "";

  @state() private _adding = false;

  @state() private _search = "";

  @state() private _searching = false;

  @state() private _searchResults: ShoppingBudgetProductSuggestion[] = [];

  @state() private _addQuantity = "1";

  @state() private _freeSummary = "";

  private _loadToken = 0;

  private _eventUnsub?: () => void;

  private _loadTimer?: number;

  private _searchTimer?: number;

  private _loadedEntityId?: string;

  public connectedCallback(): void {
    super.connectedCallback();
    this._subscribeEvents();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._eventUnsub?.();
    this._eventUnsub = undefined;
    if (this._loadTimer) {
      window.clearTimeout(this._loadTimer);
    }
    if (this._searchTimer) {
      window.clearTimeout(this._searchTimer);
    }
  }

  protected updated(changedProperties: PropertyValues<this>): void {
    super.updated(changedProperties);
    if (
      this.hass &&
      this.entityId &&
      (changedProperties.has("entityId") ||
        (changedProperties.has("hass") &&
          this._loadedEntityId !== this.entityId))
    ) {
      this._loadedEntityId = this.entityId;
      this._subscribeEvents();
      this._load();
    }
  }

  private async _subscribeEvents(): Promise<void> {
    if (!this.hass?.connection) {
      return;
    }
    this._eventUnsub?.();
    const unsubscribe = await this.hass.connection.subscribeEvents<HassEvent>(
      (event) => {
        if (event.data?.entity_id === this.entityId) {
          this._scheduleLoad();
        }
      },
      "shopping_budget_updated"
    );
    if (!this.isConnected) {
      unsubscribe();
      return;
    }
    this._eventUnsub = unsubscribe;
  }

  private _scheduleLoad(): void {
    if (this._loadTimer) {
      window.clearTimeout(this._loadTimer);
    }
    this._loadTimer = window.setTimeout(() => {
      this._loadTimer = undefined;
      this._load();
    }, 150);
  }

  private async _load(showSpinner = false): Promise<void> {
    if (!this.hass || !this.entityId) {
      return;
    }
    const token = ++this._loadToken;
    if (showSpinner || !this._budget) {
      this._loading = true;
    }
    this._error = undefined;
    try {
      const budget = await fetchShoppingBudget(this.hass, this.entityId);
      if (token !== this._loadToken) {
        return;
      }
      this._budget = budget;
    } catch (err) {
      if (token === this._loadToken) {
        this._error = err instanceof Error ? err.message : String(err);
      }
    } finally {
      if (token === this._loadToken) {
        this._loading = false;
      }
    }
  }

  private async _refreshPrices(): Promise<void> {
    if (this._refreshing) {
      return;
    }
    this._refreshing = "prices";
    this._error = undefined;
    try {
      await refreshShoppingPrices(this.hass);
      await this._load(true);
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err);
    } finally {
      this._refreshing = undefined;
    }
  }

  private async _refreshFlyers(): Promise<void> {
    if (this._refreshing) {
      return;
    }
    this._refreshing = "flyers";
    this._error = undefined;
    try {
      await refreshShoppingFlyers(this.hass);
      await this._load(true);
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err);
    } finally {
      this._refreshing = undefined;
    }
  }

  private _currency(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return "—";
    }
    return new Intl.NumberFormat(this.hass.locale?.language || "pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  }

  private _date(value?: string | null): string {
    if (!value) {
      return "";
    }
    const language = this.hass.locale?.language || "pt-BR";
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split("-").map(Number);
      return new Intl.DateTimeFormat(language, { dateStyle: "short" }).format(
        new Date(year, month - 1, day)
      );
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return new Intl.DateTimeFormat(language, {
      dateStyle: "short",
      timeStyle: "short",
    }).format(date);
  }

  private _value(ev: Event): string {
    return String((ev.currentTarget as HaInput).value ?? "");
  }

  private _number(value: string | number | null | undefined): number {
    if (typeof value === "number") {
      return value;
    }
    if (!value) {
      return 0;
    }
    return Number(String(value).replace(",", ".")) || 0;
  }

  private _draftKey(uid: string, marketId: string): string {
    return `${uid}:${marketId}`;
  }

  private _priceDraft(
    item: ShoppingBudgetItem,
    marketId: string,
    price?: ShoppingBudgetPrice
  ): string {
    const key = this._draftKey(item.uid, marketId);
    return (
      this._priceDrafts[key] ??
      (price?.price !== null && price?.price !== undefined
        ? price.price.toFixed(2).replace(".", ",")
        : "")
    );
  }

  private _setPriceDraft(
    item: ShoppingBudgetItem,
    marketId: string,
    value: string
  ): void {
    const key = this._draftKey(item.uid, marketId);
    this._priceDrafts = { ...this._priceDrafts, [key]: value };
  }

  private _removePriceDraft(key: string): void {
    const drafts = { ...this._priceDrafts };
    delete drafts[key];
    this._priceDrafts = drafts;
  }

  private async _savePrice(
    item: ShoppingBudgetItem,
    market: ShoppingBudgetMarket,
    source: "manual" | "ocr" = "manual",
    preset?: number
  ): Promise<void> {
    const key = this._draftKey(item.uid, market.id);
    const value =
      preset ??
      this._number(
        this._priceDrafts[key] ??
          (item.prices[market.id]?.price !== undefined
            ? String(item.prices[market.id].price)
            : "")
      );
    if (!value || value <= 0) {
      this._error = "Informe um preço maior que zero.";
      return;
    }
    this._busy = key;
    this._error = undefined;
    try {
      if (!item.product) {
        await linkShoppingItem(this.hass, item.uid, undefined, {
          name: item.summary,
          brand: item.brand || "",
          package: item.package || "",
          grams: item.grams ?? undefined,
        });
      }
      await setShoppingPrice(
        this.hass,
        item.uid,
        market.id,
        value,
        source,
        source === "ocr" ? "Preço sugerido pelo encarte" : ""
      );
      this._removePriceDraft(key);
      await this._load(true);
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err);
    } finally {
      this._busy = undefined;
    }
  }

  private async _clearPrice(
    item: ShoppingBudgetItem,
    marketId: string
  ): Promise<void> {
    const key = this._draftKey(item.uid, marketId);
    this._busy = key;
    try {
      await clearShoppingPrice(this.hass, item.uid, marketId);
      this._removePriceDraft(key);
      await this._load(true);
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err);
    } finally {
      this._busy = undefined;
    }
  }

  private async _toggleCompleted(item: ShoppingBudgetItem): Promise<void> {
    this._busy = item.uid;
    try {
      await setTodoItemStatus(
        this.hass,
        this.entityId,
        item.uid,
        !item.completed
      );
      await this._load(true);
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err);
    } finally {
      this._busy = undefined;
    }
  }

  private async _changeQuantity(
    item: ShoppingBudgetItem,
    value: string
  ): Promise<void> {
    const quantity = this._number(value);
    if (quantity <= 0) {
      return;
    }
    this._busy = item.uid;
    try {
      await setShoppingQuantity(this.hass, item.uid, quantity);
      await this._load(true);
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err);
    } finally {
      this._busy = undefined;
    }
  }

  private async _deleteItem(item: ShoppingBudgetItem): Promise<void> {
    const confirmed = await showConfirmationDialog(this, {
      title: "Remover item?",
      text: `Remover “${item.summary}” da lista de compras?`,
      confirmText: "Remover",
      dismissText: "Cancelar",
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    this._busy = item.uid;
    try {
      await removeTodoItems(this.hass, this.entityId, [item.uid]);
      await this._load(true);
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err);
    } finally {
      this._busy = undefined;
    }
  }

  private _startEdit(item: ShoppingBudgetItem): void {
    this._editingUid = item.uid;
    this._editBrand = item.product?.brand || item.brand || "";
    this._editGrams =
      item.product?.grams !== null && item.product?.grams !== undefined
        ? String(item.product.grams)
        : item.grams !== null && item.grams !== undefined
          ? String(item.grams)
          : "";
  }

  private async _saveDetails(item: ShoppingBudgetItem): Promise<void> {
    const grams = this._number(this._editGrams);
    this._busy = item.uid;
    try {
      await linkShoppingItem(this.hass, item.uid, undefined, {
        name: item.product?.name || item.summary,
        brand: this._editBrand.trim(),
        package: "",
        grams: grams > 0 ? grams : undefined,
        unit: item.product?.unit || undefined,
      });
      this._editingUid = undefined;
      await this._load(true);
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err);
    } finally {
      this._busy = undefined;
    }
  }

  private async _linkProduct(
    item: ShoppingBudgetItem,
    product: ShoppingBudgetProduct
  ): Promise<void> {
    this._busy = item.uid;
    try {
      await linkShoppingItem(this.hass, item.uid, product.id);
      await this._load(true);
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err);
    } finally {
      this._busy = undefined;
    }
  }

  private async _createAndLink(item: ShoppingBudgetItem): Promise<void> {
    this._busy = item.uid;
    try {
      await linkShoppingItem(this.hass, item.uid, undefined, {
        name: item.summary,
        brand: item.brand || "",
        package: item.package || "",
        grams: item.grams ?? undefined,
      });
      await this._load(true);
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err);
    } finally {
      this._busy = undefined;
    }
  }

  private _searchChanged(ev: Event): void {
    this._search = this._value(ev);
    if (this._searchTimer) {
      window.clearTimeout(this._searchTimer);
    }
    const query = this._search.trim();
    if (query.length < 2) {
      this._searchResults = [];
      this._searching = false;
      return;
    }
    this._searching = true;
    this._searchTimer = window.setTimeout(async () => {
      try {
        const result = await searchShoppingCatalog(this.hass, query, 8);
        this._searchResults = result.products || [];
      } catch (err) {
        this._error = err instanceof Error ? err.message : String(err);
      } finally {
        this._searching = false;
      }
    }, 250);
  }

  private _showAddForm(): void {
    this._adding = !this._adding;
    this._search = "";
    this._searchResults = [];
    this._freeSummary = "";
    this._addQuantity = "1";
  }

  private async _addProduct(
    product: ShoppingBudgetProductSuggestion
  ): Promise<void> {
    this._busy = `add:${product.id}`;
    try {
      await addShoppingItem(this.hass, this.entityId, {
        productId: product.id,
        quantity: Math.max(0.01, this._number(this._addQuantity) || 1),
      });
      this._search = "";
      this._searchResults = [];
      this._addQuantity = "1";
      await this._load(true);
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err);
    } finally {
      this._busy = undefined;
    }
  }

  private async _addFreeItem(): Promise<void> {
    const summary = this._freeSummary.trim();
    if (!summary) {
      this._error = "Digite o nome do item.";
      return;
    }
    this._busy = "add:free";
    try {
      await addShoppingItem(this.hass, this.entityId, {
        summary,
        quantity: Math.max(0.01, this._number(this._addQuantity) || 1),
      });
      this._freeSummary = "";
      this._addQuantity = "1";
      await this._load(true);
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err);
    } finally {
      this._busy = undefined;
    }
  }

  private _itemFromEvent(ev: Event): ShoppingBudgetItem | undefined {
    const uid = (ev.currentTarget as HTMLElement).dataset.uid;
    return this._budget?.items.find((item) => item.uid === uid);
  }

  private _marketFromEvent(ev: Event): ShoppingBudgetMarket | undefined {
    const marketId = (ev.currentTarget as HTMLElement).dataset.market;
    return this._budget?.markets.find((market) => market.id === marketId);
  }

  private _handleSuggestionClick(ev: Event): void {
    const item = this._itemFromEvent(ev);
    const productId = (ev.currentTarget as HTMLElement).dataset.productId;
    const product = item?.suggestions.find(
      (suggestion) => suggestion.id === productId
    );
    if (item && product) {
      this._linkProduct(item, product);
    }
  }

  private _handleCreateLink(ev: Event): void {
    const item = this._itemFromEvent(ev);
    if (item) {
      this._createAndLink(item);
    }
  }

  private _handleBrandInput(ev: Event): void {
    this._editBrand = this._value(ev);
  }

  private _handleGramsInput(ev: Event): void {
    this._editGrams = this._value(ev);
  }

  private _handleSaveDetails(ev: Event): void {
    const item = this._itemFromEvent(ev);
    if (item) {
      this._saveDetails(item);
    }
  }

  private _handleCancelEdit(): void {
    this._editingUid = undefined;
  }

  private _handleOcrClick(ev: Event): void {
    const item = this._itemFromEvent(ev);
    const market = this._marketFromEvent(ev);
    const price = Number((ev.currentTarget as HTMLElement).dataset.price || 0);
    if (item && market && price > 0) {
      this._savePrice(item, market, "ocr", price);
    }
  }

  private _handleAbcClick(ev: Event): void {
    const item = this._itemFromEvent(ev);
    const market = this._marketFromEvent(ev);
    const price = Number((ev.currentTarget as HTMLElement).dataset.price || 0);
    if (item && market && price > 0) {
      this._savePrice(item, market, "manual", price);
    }
  }

  private _handlePriceInput(ev: Event): void {
    const item = this._itemFromEvent(ev);
    const market = this._marketFromEvent(ev);
    if (item && market) {
      this._setPriceDraft(item, market.id, this._value(ev));
    }
  }

  private _handlePriceKeydown(ev: KeyboardEvent): void {
    if (ev.key !== "Enter") {
      return;
    }
    const item = this._itemFromEvent(ev);
    const market = this._marketFromEvent(ev);
    if (item && market) {
      this._savePrice(item, market);
    }
  }

  private _handleSavePrice(ev: Event): void {
    const item = this._itemFromEvent(ev);
    const market = this._marketFromEvent(ev);
    if (item && market) {
      this._savePrice(item, market);
    }
  }

  private _handleClearPrice(ev: Event): void {
    const item = this._itemFromEvent(ev);
    const market = this._marketFromEvent(ev);
    if (item && market) {
      this._clearPrice(item, market.id);
    }
  }

  private _handleToggleCompleted(ev: Event): void {
    const item = this._itemFromEvent(ev);
    if (item) {
      this._toggleCompleted(item);
    }
  }

  private _handleQuantityChange(ev: Event): void {
    const item = this._itemFromEvent(ev);
    if (item) {
      this._changeQuantity(item, this._value(ev));
    }
  }

  private _handleStartEdit(ev: Event): void {
    const item = this._itemFromEvent(ev);
    if (item) {
      this._startEdit(item);
    }
  }

  private _handleDelete(ev: Event): void {
    const item = this._itemFromEvent(ev);
    if (item) {
      this._deleteItem(item);
    }
  }

  private _handleSearchResultClick(ev: Event): void {
    const productId = (ev.currentTarget as HTMLElement).dataset.productId;
    const product = this._searchResults.find(
      (result) => result.id === productId
    );
    if (product) {
      this._addProduct(product);
    }
  }

  private _handleFreeInput(ev: Event): void {
    this._freeSummary = this._value(ev);
  }

  private _handleAddQuantityInput(ev: Event): void {
    this._addQuantity = this._value(ev);
  }

  private _handleRetry(): void {
    this._load(true);
  }

  private _handleErrorClosed(): void {
    this._error = undefined;
  }

  private _sourceLabel(price: ShoppingBudgetPrice): string {
    if (price.source === "manual") {
      return "manual";
    }
    if (price.source === "abc") {
      return "ABC";
    }
    if (price.source === "ocr") {
      return "encarte (OCR)";
    }
    return price.source || "preço";
  }

  private _renderMarketCard(
    market: ShoppingBudgetMarket,
    bestMarketId?: string
  ): TemplateResult {
    const isBest = market.id === bestMarketId;
    return html`
      <div class=${classMap({ "market-card": true, best: isBest })}>
        <div class="market-head">
          <div>
            <div class="market-name">${market.name}</div>
            ${isBest ? html`<span class="best-badge">melhor total</span>` : nothing}
          </div>
          ${
            market.flyer_url
              ? html`<a
                  class="market-link"
                  href=${market.flyer_url}
                  target="_blank"
                  rel="noreferrer"
                  title="Abrir encarte"
                  ><ha-svg-icon .path=${mdiOpenInNew}></ha-svg-icon
                ></a>`
              : nothing
          }
        </div>
        <div class="market-total">${this._currency(market.total)}</div>
        <div class="market-breakdown">
          <div>
            <span class="breakdown-label">Comprados</span>
            <strong>${this._currency(market.purchased)}</strong>
          </div>
          <div>
            <span class="breakdown-label">Restantes</span>
            <strong>${this._currency(market.remaining)}</strong>
          </div>
        </div>
        <div class="market-meta">
          <span
            >${market.priced_items}/${market.items_total} itens com preço</span
          >
          ${market.missing_count ? html`<span class="warn">${market.missing_count} sem preço</span>` : nothing}
        </div>
        <div class="coverage">
          <div class="coverage-bar">
            <span style=${`width:${Math.round(market.coverage * 100)}%`}></span>
          </div>
          <span>${Math.round(market.coverage * 100)}%</span>
        </div>
        ${market.valid_to ? html`<div class="market-valid">Válido até ${this._date(market.valid_to)}</div>` : nothing}
        ${market.errors.length ? html`<div class="market-error">${market.errors[0]}</div>` : nothing}
      </div>
    `;
  }

  private _renderSuggestions(item: ShoppingBudgetItem): TemplateResult {
    const suggestions = (item.suggestions || []).slice(0, 3);
    return html`
      <div class="suggestions">
        <span class="suggestions-label">Vincular:</span>
        ${suggestions.map(
          (suggestion) => html`
            <button
              class="suggestion"
              data-uid=${item.uid}
              data-product-id=${suggestion.id}
              @click=${this._handleSuggestionClick}
              ?disabled=${this._busy === item.uid}
            >
              ${
                suggestion.display_name ||
                `${suggestion.name}${suggestion.brand ? ` ${suggestion.brand}` : ""}`
              }
              <span class="score">${Math.round(suggestion.score * 100)}%</span>
            </button>
          `
        )}
        <button
          class="suggestion create"
          data-uid=${item.uid}
          @click=${this._handleCreateLink}
          ?disabled=${this._busy === item.uid}
        >
          <ha-svg-icon .path=${mdiPlus}></ha-svg-icon>
          Criar produto
        </button>
      </div>
    `;
  }

  private _renderDetailsEditor(item: ShoppingBudgetItem): TemplateResult {
    const unit = item.product?.unit || "g";
    return html`
      <div class="details-editor">
        <ha-input
          label="Marca"
          .value=${this._editBrand}
          @input=${this._handleBrandInput}
        ></ha-input>
        <ha-input
          label=${`Gramatura/volume (${unit})`}
          type="number"
          .value=${this._editGrams}
          @input=${this._handleGramsInput}
        ></ha-input>
        <ha-button
          size="s"
          data-uid=${item.uid}
          @click=${this._handleSaveDetails}
        >
          <ha-svg-icon slot="start" .path=${mdiCheck}></ha-svg-icon>
          Salvar
        </ha-button>
        <ha-button size="s" appearance="plain" @click=${this._handleCancelEdit}>
          Cancelar
        </ha-button>
      </div>
    `;
  }

  private _renderOcrSuggestions(
    item: ShoppingBudgetItem,
    market: ShoppingBudgetMarket
  ): TemplateResult | typeof nothing {
    const suggestions = item.ocr_suggestions?.[market.id] || [];
    if (!suggestions.length) {
      return nothing;
    }
    return html`
      <div class="ocr-suggestions">
        ${suggestions.slice(0, 2).map(
          (suggestion: ShoppingBudgetOcrSuggestion) => html`
            <button
              class="ocr-chip"
              title=${suggestion.name}
              data-uid=${item.uid}
              data-market=${market.id}
              data-price=${suggestion.price}
              @click=${this._handleOcrClick}
              ?disabled=${this._busy === this._draftKey(item.uid, market.id)}
            >
              <ha-svg-icon .path=${mdiStorefrontOutline}></ha-svg-icon>
              ${this._currency(suggestion.price)}
              <span>${Math.round(suggestion.score * 100)}%</span>
            </button>
          `
        )}
      </div>
    `;
  }

  private _renderAbcSuggestion(
    item: ShoppingBudgetItem,
    market: ShoppingBudgetMarket
  ): TemplateResult | typeof nothing {
    const suggestion: ShoppingBudgetAbcSuggestion | undefined =
      item.abc_suggestions?.[market.id];
    if (!suggestion) {
      return nothing;
    }
    return html`
      <div class="ocr-suggestions">
        <button
          class="ocr-chip abc-chip"
          title=${suggestion.product_name || "Sugestão ABC"}
          data-uid=${item.uid}
          data-market=${market.id}
          data-price=${suggestion.price}
          @click=${this._handleAbcClick}
          ?disabled=${this._busy === this._draftKey(item.uid, market.id)}
        >
          <ha-svg-icon .path=${mdiStorefrontOutline}></ha-svg-icon>
          ABC ${this._currency(suggestion.price)}
          ${
            suggestion.confidence
              ? html`<span>${Math.round(suggestion.confidence * 100)}%</span>`
              : nothing
          }
        </button>
      </div>
    `;
  }

  private _renderMarketPrice(
    item: ShoppingBudgetItem,
    market: ShoppingBudgetMarket
  ): TemplateResult {
    const price = item.prices?.[market.id];
    const key = this._draftKey(item.uid, market.id);
    const busy = this._busy === key;
    const draft = this._priceDraft(item, market.id, price);
    const estimated = price?.estimated;
    const frozen = price?.frozen;
    return html`
      <div
        class=${classMap({ "market-price": true, estimated: !!estimated, frozen: !!frozen })}
      >
        <div class="market-price-head">
          <span>${market.name}</span>
          ${price ? html`<span class="price-source">${this._sourceLabel(price)}</span>` : nothing}
        </div>
        ${
          price
            ? html`<div class="price-value">
                ${this._currency(price.price)}
              </div>`
            : html`<div class="price-value empty">Sem preço</div>`
        }
        <div class="price-flags">
          ${estimated ? html`<span class="flag estimated">estimado</span>` : nothing}
          ${frozen ? html`<span class="flag frozen">congelado</span>` : nothing}
          ${price?.stale ? html`<span class="flag stale">desatualizado</span>` : nothing}
          ${price?.note ? html`<span class="price-note">${price.note}</span>` : nothing}
        </div>
        ${this._renderOcrSuggestions(item, market)}
        ${this._renderAbcSuggestion(item, market)}
        <div class="manual-price">
          <ha-input
            type="text"
            inputmode="decimal"
            placeholder="R$"
            .value=${draft}
            ?disabled=${busy}
            data-uid=${item.uid}
            data-market=${market.id}
            @input=${this._handlePriceInput}
            @keydown=${this._handlePriceKeydown}
          ></ha-input>
          <ha-button
            size="s"
            .disabled=${busy}
            data-uid=${item.uid}
            data-market=${market.id}
            @click=${this._handleSavePrice}
          >
            ${busy ? html`<ha-spinner size="tiny"></ha-spinner>` : "Salvar"}
          </ha-button>
          ${
            price
              ? html`<ha-icon-button
                  .label=${"Limpar preço"}
                  .path=${mdiClose}
                  .disabled=${busy}
                  data-uid=${item.uid}
                  data-market=${market.id}
                  @click=${this._handleClearPrice}
                ></ha-icon-button>`
              : nothing
          }
        </div>
        <div class="price-links">
          <a
            href=${item.google_urls?.[market.id] || "#"}
            target="_blank"
            rel="noreferrer"
            class="google-link"
          >
            <ha-svg-icon .path=${mdiGoogle}></ha-svg-icon>
            Google
          </a>
          ${!item.product ? html`<span class="hint">Informe um preço para criar o produto</span>` : nothing}
        </div>
      </div>
    `;
  }

  private _renderItem(item: ShoppingBudgetItem): TemplateResult {
    const key = item.uid;
    const busy = this._busy === key;
    return html`
      <div class=${classMap({ "item-card": true, completed: item.completed })}>
        <div class="item-head">
          <ha-checkbox
            .checked=${item.completed}
            .disabled=${busy}
            data-uid=${item.uid}
            @change=${this._handleToggleCompleted}
          ></ha-checkbox>
          <div class="item-info">
            <div class="item-title">${item.summary}</div>
            <div class="item-sub">
              ${
                item.product
                  ? html`${item.product.name}${item.product.brand ? ` · ${item.product.brand}` : ""}${item.product.package ? ` · ${item.product.package}` : ""}`
                  : html`<span class="warn"
                      >Novo item: escolha um produto ou crie um.</span
                    >`
              }
              ${item.link_source === "auto" ? html`<span class="tag auto">auto</span>` : nothing}
              ${item.completed ? html`<span class="tag done">comprado</span>` : nothing}
            </div>
            ${!item.product ? this._renderSuggestions(item) : nothing}
            ${this._editingUid === item.uid ? this._renderDetailsEditor(item) : nothing}
          </div>
          <div class="item-actions">
            <ha-input
              class="quantity"
              type="number"
              label="Qtd"
              .value=${String(item.quantity)}
              .disabled=${busy}
              data-uid=${item.uid}
              @change=${this._handleQuantityChange}
            ></ha-input>
            <ha-icon-button
              .label=${"Editar marca e gramatura"}
              .path=${mdiPencil}
              .disabled=${busy}
              data-uid=${item.uid}
              @click=${this._handleStartEdit}
            ></ha-icon-button>
            <ha-icon-button
              .label=${"Remover item"}
              .path=${mdiDelete}
              .disabled=${busy}
              data-uid=${item.uid}
              @click=${this._handleDelete}
            ></ha-icon-button>
          </div>
        </div>
        <div class="market-prices">
          ${(this._budget?.markets || []).map((market) =>
            this._renderMarketPrice(item, market)
          )}
        </div>
        ${item.purchased ? html`<div class="purchased-note">Preços congelados na conclusão em ${this._date(item.purchased.at)}.</div>` : nothing}
      </div>
    `;
  }

  private _renderAddForm(): TemplateResult {
    return html`
      <div class="add-section">
        <ha-button appearance="outlined" @click=${this._showAddForm}>
          <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
          Adicionar item
        </ha-button>
        ${
          this._adding
            ? html`
                <div class="add-card">
                  <div class="add-head">
                    <div>
                      <div class="add-title">Adicionar à lista padrão</div>
                      <div class="add-sub">
                        Busque por marca ou produto no catálogo.
                      </div>
                    </div>
                    <ha-icon-button
                      .label=${"Fechar"}
                      .path=${mdiClose}
                      @click=${this._showAddForm}
                    ></ha-icon-button>
                  </div>
                  <div class="catalog-search">
                    <ha-input
                      label="Buscar produto ou marca"
                      placeholder="Ex.: Bombril, palha de aço, arroz Camil"
                      .value=${this._search}
                      @input=${this._searchChanged}
                    >
                      <ha-svg-icon
                        slot="start"
                        .path=${mdiMagnify}
                      ></ha-svg-icon>
                    </ha-input>
                    ${this._searching ? html`<ha-spinner size="tiny"></ha-spinner>` : nothing}
                  </div>
                  ${
                    this._searchResults.length
                      ? html`<div class="search-results">
                          ${this._searchResults.map(
                            (product) => html`
                              <button
                                class="search-result"
                                ?disabled=${this._busy === `add:${product.id}`}
                                data-product-id=${product.id}
                                @click=${this._handleSearchResultClick}
                              >
                                <span>
                                  <strong
                                    >${product.display_name || product.name}</strong
                                  >
                                  <small
                                    >${product.name}${product.brand ? ` · ${product.brand}` : ""}${product.package ? ` · ${product.package}` : ""}</small
                                  >
                                </span>
                                <span class="result-score"
                                  >${Math.round(product.score * 100)}%</span
                                >
                              </button>
                            `
                          )}
                        </div>`
                      : nothing
                  }
                  <div class="add-free">
                    <ha-input
                      label="Ou digite um item livre"
                      placeholder="Ex.: pão de queijo"
                      .value=${this._freeSummary}
                      @input=${this._handleFreeInput}
                    ></ha-input>
                    <ha-input
                      class="add-quantity"
                      type="number"
                      label="Qtd"
                      .value=${this._addQuantity}
                      @input=${this._handleAddQuantityInput}
                    ></ha-input>
                    <ha-button
                      .disabled=${this._busy === "add:free" || !this._freeSummary.trim()}
                      @click=${this._addFreeItem}
                    >
                      Adicionar
                    </ha-button>
                  </div>
                </div>
              `
            : nothing
        }
      </div>
    `;
  }

  protected render(): TemplateResult {
    if (!this._budget && this._loading) {
      return html`<div class="loading"><ha-spinner></ha-spinner></div>`;
    }
    if (!this._budget && this._error) {
      return html`
        <div class="empty-state">
          <ha-alert alert-type="error">${this._error}</ha-alert>
          <ha-button @click=${this._handleRetry}>Tentar novamente</ha-button>
        </div>
      `;
    }
    const budget = this._budget;
    if (!budget) {
      return html`<div class="loading"><ha-spinner></ha-spinner></div>`;
    }
    const bestMarketId = budget.overall?.best_market?.id;
    const refreshing = this._refreshing;
    return html`
      <div class="budget">
        <div class="budget-header">
          <div>
            <div class="budget-title">
              <ha-svg-icon .path=${mdiCartOutline}></ha-svg-icon>
              Orçamento
            </div>
            <div class="budget-sub">
              ${
                budget.overall?.best_market
                  ? html`Melhor total:
                      <strong>${budget.overall.best_market.name}</strong> ·
                      ${this._currency(budget.overall.best_market.total)}`
                  : "Ainda não há preços suficientes para comparar os mercados."
              }
              ${budget.updated_at ? html`<span class="dot">·</span> atualizado ${this._date(budget.updated_at)}` : nothing}
            </div>
          </div>
          <div class="budget-actions">
            <ha-button
              appearance="outlined"
              .disabled=${!!refreshing}
              @click=${this._refreshPrices}
            >
              ${
                refreshing === "prices"
                  ? html`<ha-spinner slot="start" size="tiny"></ha-spinner>`
                  : html`<ha-svg-icon
                      slot="start"
                      .path=${mdiRefresh}
                    ></ha-svg-icon>`
              }
              Preços
            </ha-button>
            <ha-button
              appearance="outlined"
              .disabled=${!!refreshing}
              @click=${this._refreshFlyers}
            >
              ${
                refreshing === "flyers"
                  ? html`<ha-spinner slot="start" size="tiny"></ha-spinner>`
                  : html`<ha-svg-icon
                      slot="start"
                      .path=${mdiSync}
                    ></ha-svg-icon>`
              }
              Encartes
            </ha-button>
          </div>
        </div>

        ${
          this._error
            ? html`<ha-alert
                alert-type="error"
                dismissable
                @closed=${this._handleErrorClosed}
                >${this._error}</ha-alert
              >`
            : nothing
        }
        ${
          !budget.meta.ocr_available
            ? html`<ha-alert alert-type="warning"
                >OCR indisponível no servidor: instale Tesseract e Poppler. Use
                preço manual ou Google.</ha-alert
              >`
            : nothing
        }

        <div class="market-grid">
          ${budget.markets.map((market) =>
            this._renderMarketCard(market, bestMarketId)
          )}
        </div>

        <div class="list-head">
          <div>
            <div class="section-title">Itens da lista</div>
            <div class="section-sub">
              ${budget.items.length} itens · preços congelados ao concluir a
              compra.
            </div>
          </div>
          <div class="legend">
            <span
              ><ha-svg-icon .path=${mdiAlertCircleOutline}></ha-svg-icon>
              estimado</span
            >
            <span
              ><ha-svg-icon .path=${mdiLinkVariant}></ha-svg-icon> vinculado
              automaticamente</span
            >
          </div>
        </div>

        ${this._renderAddForm()}

        <div class="items">
          ${repeat(
            budget.items,
            (item) => item.uid,
            (item) => this._renderItem(item)
          )}
        </div>

        <div class="budget-footer">
          <ha-svg-icon .path=${mdiStorefrontOutline}></ha-svg-icon>
          Preços de encarte podem variar por loja. Confira o encarte e ajuste
          manualmente quando necessário.
        </div>
      </div>
    `;
  }

  static get styles(): CSSResultGroup {
    return [
      css`
        :host {
          display: block;
          color: var(--primary-text-color);
        }
        .loading {
          display: flex;
          justify-content: center;
          padding: 48px 16px;
        }
        .budget {
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 8px 0 32px;
        }
        .budget-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }
        .budget-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 1.5rem;
          font-weight: 600;
        }
        .budget-title ha-svg-icon {
          --mdc-icon-size: 28px;
          color: var(--primary-color);
        }
        .budget-sub {
          margin-top: 4px;
          color: var(--secondary-text-color);
          font-size: 0.9rem;
        }
        .budget-sub strong {
          color: var(--primary-text-color);
        }
        .dot {
          margin: 0 4px;
        }
        .budget-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .market-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
          gap: 12px;
        }
        .market-card {
          border: 1px solid var(--divider-color);
          border-radius: var(--ha-border-radius-l, 12px);
          background: var(--card-background-color);
          padding: 14px;
          box-shadow: var(--ha-box-shadow-s);
        }
        .market-card.best {
          border-color: var(--primary-color);
        }
        .market-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 8px;
        }
        .market-name {
          font-weight: 600;
          font-size: 1.05rem;
        }
        .best-badge {
          display: inline-block;
          margin-top: 4px;
          border-radius: 999px;
          padding: 1px 7px;
          font-size: 0.7rem;
          font-weight: 600;
          color: var(--primary-color);
          background: color-mix(in srgb, var(--primary-color) 12%, transparent);
        }
        .market-link {
          color: var(--secondary-text-color);
          display: inline-flex;
        }
        .market-total {
          margin-top: 10px;
          font-size: 1.7rem;
          font-weight: 700;
          letter-spacing: -0.02em;
        }
        .market-breakdown {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-top: 8px;
        }
        .market-breakdown > div {
          display: flex;
          flex-direction: column;
          background: var(--secondary-background-color);
          border-radius: 8px;
          padding: 7px 9px;
        }
        .breakdown-label {
          color: var(--secondary-text-color);
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        .market-breakdown strong {
          font-size: 0.95rem;
        }
        .market-meta {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 10px;
          color: var(--secondary-text-color);
          font-size: 0.78rem;
        }
        .warn {
          color: var(--warning-color, #d97706);
        }
        .coverage {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 6px;
          font-size: 0.72rem;
          color: var(--secondary-text-color);
        }
        .coverage-bar {
          flex: 1;
          height: 5px;
          border-radius: 999px;
          background: var(--divider-color);
          overflow: hidden;
        }
        .coverage-bar span {
          display: block;
          height: 100%;
          background: var(--primary-color);
        }
        .market-valid {
          margin-top: 6px;
          font-size: 0.72rem;
          color: var(--secondary-text-color);
        }
        .market-error {
          margin-top: 6px;
          color: var(--error-color);
          font-size: 0.75rem;
        }
        .list-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 12px;
          flex-wrap: wrap;
          margin-top: 6px;
        }
        .section-title {
          font-size: 1.1rem;
          font-weight: 600;
        }
        .section-sub {
          color: var(--secondary-text-color);
          font-size: 0.82rem;
        }
        .legend {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          color: var(--secondary-text-color);
          font-size: 0.75rem;
        }
        .legend span {
          display: inline-flex;
          align-items: center;
          gap: 3px;
        }
        .legend ha-svg-icon {
          --mdc-icon-size: 15px;
        }
        .add-section {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .add-card {
          border: 1px solid var(--divider-color);
          border-radius: var(--ha-border-radius-l, 12px);
          background: var(--card-background-color);
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .add-head {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
        }
        .add-title {
          font-weight: 600;
        }
        .add-sub {
          color: var(--secondary-text-color);
          font-size: 0.82rem;
        }
        .catalog-search {
          display: flex;
          align-items: flex-end;
          gap: 8px;
        }
        .catalog-search ha-input {
          flex: 1;
        }
        .search-results {
          display: flex;
          flex-direction: column;
          border: 1px solid var(--divider-color);
          border-radius: 8px;
          overflow: hidden;
        }
        .search-result {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 9px 11px;
          border: 0;
          border-bottom: 1px solid var(--divider-color);
          background: transparent;
          color: inherit;
          text-align: left;
          cursor: pointer;
          font: inherit;
        }
        .search-result:last-child {
          border-bottom: 0;
        }
        .search-result:hover {
          background: var(--secondary-background-color);
        }
        .search-result span:first-child {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        .search-result strong {
          font-weight: 500;
        }
        .search-result small {
          color: var(--secondary-text-color);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .result-score {
          color: var(--secondary-text-color);
          font-size: 0.75rem;
          flex-shrink: 0;
        }
        .add-free {
          display: flex;
          align-items: flex-end;
          gap: 8px;
          flex-wrap: wrap;
          border-top: 1px solid var(--divider-color);
          padding-top: 10px;
        }
        .add-free ha-input:first-child {
          flex: 1;
          min-width: 180px;
        }
        .add-quantity {
          width: 85px;
        }
        .items {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .item-card {
          border: 1px solid var(--divider-color);
          border-radius: var(--ha-border-radius-l, 12px);
          background: var(--card-background-color);
          padding: 12px;
        }
        .item-card.completed {
          opacity: 0.72;
        }
        .item-head {
          display: flex;
          align-items: flex-start;
          gap: 10px;
        }
        .item-head > ha-checkbox {
          margin-top: 1px;
        }
        .item-info {
          flex: 1;
          min-width: 0;
        }
        .item-title {
          font-weight: 600;
          overflow-wrap: anywhere;
        }
        .item-sub {
          color: var(--secondary-text-color);
          font-size: 0.8rem;
          margin-top: 2px;
          overflow-wrap: anywhere;
        }
        .tag {
          display: inline-block;
          margin-left: 5px;
          border-radius: 999px;
          padding: 0 6px;
          font-size: 0.66rem;
          font-weight: 600;
          vertical-align: middle;
          background: var(--secondary-background-color);
          color: var(--secondary-text-color);
        }
        .tag.auto {
          color: var(--primary-color);
        }
        .tag.done {
          color: var(--success-color, #15803d);
        }
        .item-actions {
          display: flex;
          align-items: center;
          gap: 2px;
          flex-shrink: 0;
        }
        .quantity {
          width: 78px;
          --ha-input-padding-top: 0;
          --ha-input-padding-bottom: 0;
        }
        .suggestions {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
          align-items: center;
          margin-top: 7px;
        }
        .suggestions-label {
          font-size: 0.75rem;
          color: var(--secondary-text-color);
        }
        .suggestion {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          border: 1px solid var(--divider-color);
          border-radius: 999px;
          background: transparent;
          color: var(--primary-text-color);
          padding: 3px 8px;
          font: inherit;
          font-size: 0.74rem;
          cursor: pointer;
        }
        .suggestion:hover {
          border-color: var(--primary-color);
        }
        .suggestion .score {
          color: var(--secondary-text-color);
          font-size: 0.66rem;
        }
        .suggestion.create ha-svg-icon {
          --mdc-icon-size: 13px;
        }
        .details-editor {
          display: flex;
          align-items: flex-end;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 8px;
          padding: 8px;
          border-radius: 8px;
          background: var(--secondary-background-color);
        }
        .details-editor ha-input {
          width: 140px;
        }
        .market-prices {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
          gap: 8px;
          margin-top: 10px;
        }
        .market-price {
          border: 1px solid var(--divider-color);
          border-radius: 9px;
          padding: 8px;
          background: var(--secondary-background-color);
          display: flex;
          flex-direction: column;
          gap: 5px;
          min-width: 0;
        }
        .market-price.frozen {
          border-style: dashed;
        }
        .market-price-head {
          display: flex;
          justify-content: space-between;
          gap: 6px;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--secondary-text-color);
        }
        .price-source {
          font-weight: 400;
          text-transform: lowercase;
        }
        .price-value {
          font-size: 1.1rem;
          font-weight: 650;
        }
        .price-value.empty {
          color: var(--secondary-text-color);
          font-weight: 400;
          font-size: 0.9rem;
        }
        .price-flags {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          min-height: 13px;
        }
        .flag {
          border-radius: 999px;
          padding: 0 5px;
          font-size: 0.65rem;
          background: var(--card-background-color);
          color: var(--secondary-text-color);
        }
        .flag.estimated {
          color: var(--warning-color, #b45309);
        }
        .flag.frozen {
          color: var(--primary-color);
        }
        .flag.stale {
          color: var(--error-color);
        }
        .price-note {
          font-size: 0.66rem;
          color: var(--secondary-text-color);
        }
        .ocr-suggestions {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }
        .ocr-chip {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          border: 1px solid
            color-mix(in srgb, var(--primary-color) 40%, transparent);
          border-radius: 999px;
          background: transparent;
          color: var(--primary-color);
          padding: 2px 6px;
          font: inherit;
          font-size: 0.7rem;
          cursor: pointer;
        }
        .ocr-chip ha-svg-icon {
          --mdc-icon-size: 13px;
        }
        .ocr-chip span {
          color: var(--secondary-text-color);
          font-size: 0.62rem;
        }
        .abc-chip {
          color: var(--info-color, #0369a1);
          border-color: color-mix(
            in srgb,
            var(--info-color, #0369a1) 40%,
            transparent
          );
        }
        .manual-price {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .manual-price ha-input {
          flex: 1;
          min-width: 0;
          --ha-input-padding-top: 0;
          --ha-input-padding-bottom: 0;
        }
        .price-links {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .google-link {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          color: var(--secondary-text-color);
          font-size: 0.72rem;
          text-decoration: none;
        }
        .google-link ha-svg-icon {
          --mdc-icon-size: 14px;
        }
        .hint {
          color: var(--secondary-text-color);
          font-size: 0.68rem;
        }
        .purchased-note {
          margin-top: 8px;
          color: var(--secondary-text-color);
          font-size: 0.74rem;
          font-style: italic;
        }
        .budget-footer {
          display: flex;
          align-items: center;
          gap: 6px;
          color: var(--secondary-text-color);
          font-size: 0.75rem;
          padding: 4px 2px 0;
        }
        .budget-footer ha-svg-icon {
          --mdc-icon-size: 15px;
          flex-shrink: 0;
        }
        .empty-state {
          padding: 16px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 10px;
        }
        @media (max-width: 600px) {
          .budget-header {
            align-items: stretch;
          }
          .budget-actions {
            width: 100%;
          }
          .budget-actions ha-button {
            flex: 1;
          }
          .item-head {
            flex-wrap: wrap;
          }
          .item-actions {
            width: 100%;
            justify-content: flex-end;
          }
          .market-prices {
            grid-template-columns: 1fr;
          }
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-shopping-budget": HaShoppingBudget;
  }
}
