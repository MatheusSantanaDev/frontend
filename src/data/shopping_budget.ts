import type { HomeAssistant } from "../types";

export type ShoppingBudgetMarketType = "abc" | "assai" | "bahamas" | "manual";

export interface ShoppingBudgetProduct {
  id: string;
  name: string;
  brand: string;
  package: string;
  grams: number | null;
  unit: string;
  aliases: string[];
  display_name?: string;
}

export interface ShoppingBudgetProductSuggestion extends ShoppingBudgetProduct {
  score: number;
}

export interface ShoppingBudgetPrice {
  price: number | null;
  source: "manual" | "abc" | "ocr" | string;
  updated_at?: string | null;
  note?: string | null;
  estimated?: boolean;
  stale?: boolean;
  frozen?: boolean;
  snapshot_at?: string | null;
  market_id?: string;
  offer_name?: string | null;
  valid_to?: string | null;
  url?: string | null;
  usable?: boolean;
}

export interface ShoppingBudgetOcrSuggestion {
  name: string;
  price: number;
  package?: string | null;
  confidence: number;
  score: number;
  page?: number;
  bbox?: number[];
}

export interface ShoppingBudgetAbcSuggestion {
  price: number;
  product_name?: string;
  brand?: string;
  package?: string;
  confidence?: number;
  store_name?: string;
  url?: string;
}

export interface ShoppingBudgetPurchased {
  at?: string | null;
  quantity?: number | null;
  prices: Record<string, ShoppingBudgetPrice>;
}

export interface ShoppingBudgetItem {
  uid: string;
  summary: string;
  status: "needs_action" | "completed";
  completed: boolean;
  quantity: number;
  product: ShoppingBudgetProduct | null;
  brand: string;
  grams: number | null;
  package: string;
  link_source: "auto" | "manual" | null;
  manual_link: boolean;
  suggestions: ShoppingBudgetProductSuggestion[];
  prices: Record<string, ShoppingBudgetPrice>;
  ocr_suggestions: Record<string, ShoppingBudgetOcrSuggestion[]>;
  abc_suggestions: Record<string, ShoppingBudgetAbcSuggestion>;
  missing_markets: string[];
  best_market: string | null;
  best_price: number | null;
  google_urls: Record<string, string>;
  purchased: ShoppingBudgetPurchased | null;
}

export interface ShoppingBudgetMarket {
  id: string;
  name: string;
  type: ShoppingBudgetMarketType;
  url?: string | null;
  flyer_url?: string | null;
  store?: Record<string, unknown> | null;
  total: number;
  purchased: number;
  remaining: number;
  estimated_total: number;
  items_total: number;
  priced_items: number;
  estimated_items: number;
  ocr_items: number;
  frozen_items: number;
  coverage: number;
  average: number;
  missing: string[];
  missing_count: number;
  last_refresh?: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
  errors: string[];
}

export interface ShoppingBudgetOverall {
  total: number;
  purchased: number;
  remaining: number;
  coverage: number;
  items_total: number;
  markets_with_prices: number;
  best_market: ShoppingBudgetMarket | null;
}

export interface ShoppingBudgetMeta {
  todo_entity: string;
  ocr_enabled: boolean;
  ocr_available: boolean;
  ocr_packages: Record<string, boolean>;
  ocr_language: string;
  default_market?: string | null;
  default_market_name?: string | null;
  needs_refresh: boolean;
  refreshing: boolean;
  last_refresh?: string | null;
  abc_store?: Record<string, unknown> | null;
  catalog_size: number;
  errors: string[];
  market_errors: Record<string, string[]>;
  price_ttl_hours: number;
  flyer_ttl_hours: number;
  markets_total: number;
}

export interface ShoppingBudget {
  entity_id: string;
  updated_at: string;
  markets: ShoppingBudgetMarket[];
  items: ShoppingBudgetItem[];
  overall: ShoppingBudgetOverall;
  meta: ShoppingBudgetMeta;
}

export interface ShoppingBudgetCatalogSearch {
  products: ShoppingBudgetProductSuggestion[];
}

export const fetchShoppingBudget = (
  hass: HomeAssistant,
  entityId: string
): Promise<ShoppingBudget> =>
  hass.callWS<ShoppingBudget>({
    type: "shopping_budget/budget",
    entity_id: entityId,
  });

export const searchShoppingCatalog = (
  hass: HomeAssistant,
  query: string,
  limit = 10
): Promise<ShoppingBudgetCatalogSearch> =>
  hass.callWS<ShoppingBudgetCatalogSearch>({
    type: "shopping_budget/catalog/search",
    query,
    limit,
  });

export const setShoppingPrice = (
  hass: HomeAssistant,
  uid: string,
  market: string,
  price: number,
  source: "manual" | "ocr" = "manual",
  note = ""
): Promise<unknown> =>
  hass.callService("shopping_budget", "set_price", {
    uid,
    market,
    price,
    source,
    note,
  });

export const clearShoppingPrice = (
  hass: HomeAssistant,
  uid: string,
  market: string
): Promise<unknown> =>
  hass.callService("shopping_budget", "clear_price", {
    uid,
    market,
  });

export const linkShoppingItem = (
  hass: HomeAssistant,
  uid: string,
  productId?: string,
  details?: {
    name?: string;
    brand?: string;
    package?: string;
    grams?: number;
    unit?: string;
    quantity?: number;
  }
): Promise<unknown> =>
  hass.callService("shopping_budget", "link_item", {
    uid,
    product_id: productId,
    ...details,
  });

export const addShoppingItem = (
  hass: HomeAssistant,
  entityId: string,
  options: {
    productId?: string;
    summary?: string;
    quantity?: number;
  }
): Promise<unknown> =>
  hass.callService("shopping_budget", "add_item", {
    entity_id: entityId,
    product_id: options.productId,
    summary: options.summary,
    quantity: options.quantity ?? 1,
  });

export const setShoppingQuantity = (
  hass: HomeAssistant,
  uid: string,
  quantity: number
): Promise<unknown> =>
  hass.callService("shopping_budget", "set_quantity", {
    uid,
    quantity,
  });

export const refreshShoppingPrices = (
  hass: HomeAssistant,
  market?: string,
  force = false
): Promise<unknown> =>
  hass.callService("shopping_budget", "refresh_prices", {
    market,
    force,
  });

export const refreshShoppingFlyers = (
  hass: HomeAssistant,
  market?: string,
  force = false
): Promise<unknown> =>
  hass.callService("shopping_budget", "refresh_flyers", {
    market,
    force,
  });

export const setTodoItemStatus = (
  hass: HomeAssistant,
  entityId: string,
  uid: string,
  completed: boolean
): Promise<unknown> =>
  hass.callService(
    "todo",
    "update_item",
    {
      item: uid,
      status: completed ? "completed" : "needs_action",
    },
    { entity_id: entityId }
  );

export const removeTodoItems = (
  hass: HomeAssistant,
  entityId: string,
  uids: string[]
): Promise<unknown> =>
  hass.callService(
    "todo",
    "remove_item",
    { item: uids },
    { entity_id: entityId }
  );
