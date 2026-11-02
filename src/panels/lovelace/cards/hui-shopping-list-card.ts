import { customElement } from "lit/decorators";
import { HuiTodoListCard } from "./hui-todo-list-card";
import { getTodoLists } from "../../../data/todo";

@customElement("hui-shopping-list-card")
class HuiShoppingListCard extends HuiTodoListCard {
  override checkConfig(): void {
    // skip config check, entity is not required for shopping list card
  }

  override getEntityId(): string | undefined {
    const todoLists = getTodoLists(this.hass!);
    if (todoLists.length) {
      // Prefer the Keep list explicitly marked as the default shopping list
      const defaultList = todoLists.find(
        (list) =>
          this.hass!.entities[list.entity_id]?.hidden !== true &&
          this.hass!.states[list.entity_id]?.attributes
            .default_shopping_list === true
      );
      if (defaultList) {
        return defaultList.entity_id;
      }
      if (todoLists.length > 1) {
        // find first entity provided by "shopping_list"
        for (const list of todoLists) {
          const entityReg = this.hass!.entities[list.entity_id];
          if (entityReg?.platform === "shopping_list") {
            return list.entity_id;
          }
        }
      }
      return todoLists[0].entity_id;
    }
    return undefined;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-shopping-list-card": HuiShoppingListCard;
  }
}
