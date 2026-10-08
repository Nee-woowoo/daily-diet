export type MealSlot = 'breakfast' | 'lunch' | 'dinner';

export type Goal = 'fatLoss' | 'muscleGain' | 'balanced';

export type Preference = 'light' | 'spicy' | 'vegetarian' | 'lowSugar';

export type IngredientCategory = 'meat' | 'veg' | 'egg' | 'staple' | 'seasoning';

export type IngredientUnit = 'g' | 'ml' | '个' | '片' | '根' | '瓣' | '段' | '勺';

export interface Ingredient {
  name: string;
  /** Amount for a single serving; multiplied by `Profile.servings` when displayed. */
  amount: number;
  unit: IngredientUnit;
  category: IngredientCategory;
  /** Optional main ingredients are still matched against the fridge; the UI marks them 可选. */
  optional?: boolean;
}

/**
 * A 主食 served alongside a dish, written as data instead of as the free text in `pairing`, so the
 * 今日 tab can scale it by servings and by 身体目标.
 *
 * Deliberately NOT an `Ingredient`: staples must never enter `Recipe.ingredients`, because those
 * drive fridge matching and the 采购清单 (`planner.matchRecipe`, `shopping.buildShoppingList`).
 */
export interface StapleServing {
  name: string;
  /** Amount for a single serving, exactly like `Ingredient.amount`. */
  amount: number;
  unit: IngredientUnit;
}

export interface Recipe {
  id: string;
  name: string;
  slots: MealSlot[];
  /** Total time in minutes, prep included. */
  minutes: number;
  /** Per-serving kilocalories. */
  calories: number;
  /** Per-serving protein in grams; drives the 增肌 weighting. */
  protein: number;
  oilLevel: 'low' | 'medium' | 'high';
  goals: Goal[];
  preferences: Preference[];
  /** Main ingredients only — these drive fridge matching. */
  ingredients: Ingredient[];
  seasonings: Ingredient[];
  steps: string[];
  /**
   * Free text served alongside. `pairing` stays the human-readable original, but when `staple` is
   * set its staple half is superseded by that structured data on the 今日 card — the two are never
   * shown together, since only one of them can be scaled to the household.
   */
  pairing?: string;
  /**
   * The 主食 to serve with this dish. 午/晚餐 must set it (their `pairing` string is only a staple).
   * 早餐 leaves it undefined on purpose: its staple is one of `ingredients` with
   * `category: 'staple'`, which also means that staple's energy is already inside `calories`.
   * Never consumed by the planner or the shopping list.
   */
  staple?: StapleServing;
  tip?: string;
}

export interface FridgeItem {
  id: string;
  name: string;
  /** Free-form amount such as `500 克` or `2 个`. Not used for matching in v1. */
  amount: string;
  category: IngredientCategory;
  addedAt: number;
}

export interface Profile {
  servings: number;
  goal: Goal;
  preferences: Preference[];
  /** `0` means the user has not saved the form yet. */
  savedAt: number;
}

export interface DayPlan {
  /** Local calendar day as `YYYY-MM-DD`. */
  date: string;
  meals: Record<MealSlot, string>;
  generatedAt: number;
}
