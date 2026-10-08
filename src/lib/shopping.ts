import { MEAL_SLOTS, formatAmount } from './labels';
import { householdPortions } from './members';
import { missingIngredients, normalizeName } from './planner';
import { getRecipe, scaleAmount } from './recipes';
import type { DayPlan, PantryItem, IngredientCategory, IngredientUnit, MealSlot, Profile } from './types';

/**
 * Aggregates what today's three meals are missing into one shopping list.
 *
 * Pure on purpose: no storage, no React. It reads the plan the 今日 tab is showing, so the list can
 * never disagree with the 「缺 N 样」 tags there — both go through the same matching rule in
 * `planner.ts`.
 */
export interface ShoppingLine {
  /** `normalizeName` of the ingredient: the merge key, and the key the bought state is stored under. */
  key: string;
  /** Display name — the spelling used by the first recipe that needs it. */
  name: string;
  category: IngredientCategory;
  /** Household-scale totals, one entry per unit. Every ingredient in the app uses a single unit. */
  amounts: [IngredientUnit, number][];
  /** True only when every meal that needs it treats it as optional. */
  optional: boolean;
  /** Which meals need it, e.g. `早・晚`. */
  usedIn: string;
  /** Filled in by the store, which owns the checked-off state. */
  bought: boolean;
}

const SLOT_SHORT: Record<MealSlot, string> = {
  breakfast: '早',
  lunch: '中',
  dinner: '晚',
};

/** Recipe-side units are `g` / `ml`; the pantry's amount is free text written as 「500 克」. */
const WRITTEN_UNITS: Partial<Record<IngredientUnit, string>> = {
  g: '克',
  ml: '毫升',
};

interface Draft {
  name: string;
  category: IngredientCategory;
  /** Per-serving amounts, summed across meals and scaled once at the end so no rounding compounds. */
  amounts: Map<IngredientUnit, number>;
  optional: boolean;
  slots: MealSlot[];
}

/**
 * Today's missing main ingredients, one line per ingredient, in 早餐 → 午餐 → 晚餐 order.
 * Seasonings are pantry staples and are deliberately not part of the list (see `planner.ts`).
 */
export function buildShoppingList(
  plan: DayPlan | null,
  pantry: PantryItem[],
  profile: Profile,
): ShoppingLine[] {
  if (!plan) return [];

  const drafts = new Map<string, Draft>();

  for (const slot of MEAL_SLOTS) {
    // 一餐可能有 2–3 个组成部分（AI 路径），每个都要进清单：缺口按名字合并，份数口径不变。
    for (const id of plan.meals[slot]) {
      const recipe = getRecipe(id);
      // Mirrors the 今日 tab: an id the current recipe set no longer knows is simply skipped.
      if (!recipe) continue;

      for (const ingredient of missingIngredients(recipe, pantry)) {
        const key = normalizeName(ingredient.name);
        let draft = drafts.get(key);
        if (!draft) {
          draft = { name: ingredient.name, category: ingredient.category, amounts: new Map(), optional: true, slots: [] };
          drafts.set(key, draft);
        }
        draft.amounts.set(ingredient.unit, (draft.amounts.get(ingredient.unit) ?? 0) + ingredient.amount);
        // Required by any single meal makes the whole line required.
        draft.optional = draft.optional && ingredient.optional === true;
        if (!draft.slots.includes(slot)) draft.slots.push(slot);
      }
    }
  }

  return [...drafts].map(([key, draft]) => ({
    key,
    name: draft.name,
    category: draft.category,
    amounts: [...draft.amounts].map(
      ([unit, amount]): [IngredientUnit, number] => [
        unit,
        scaleAmount(amount, unit, householdPortions(profile)),
      ],
    ),
    optional: draft.optional,
    usedIn: draft.slots.map((slot) => SLOT_SHORT[slot]).join('・'),
    bought: false,
  }));
}

function joinAmounts(amounts: [IngredientUnit, number][], written: boolean): string {
  return amounts
    .map(([unit, amount]) => formatAmount(amount, written ? (WRITTEN_UNITS[unit] ?? unit) : unit))
    .join('、');
}

/** Amounts as the recipe pages write them: `250 g`, `1.5 勺`. */
export function shoppingAmountLabel(line: ShoppingLine): string {
  return joinAmounts(line.amounts, false);
}

/** Amounts as the pantry writes them: `250 克`, `2 个`. */
export function pantryAmountLabel(line: ShoppingLine): string {
  return joinAmounts(line.amounts, true);
}
