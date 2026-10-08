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
  /** What to serve alongside, shown on the meal card. */
  pairing?: string;
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
