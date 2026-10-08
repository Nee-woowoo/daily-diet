import { GOAL_LABELS, MEAL_SLOTS, formatAmount } from './labels';
import { getRecipe, scaleAmount } from './recipes';
import type {
  DayPlan,
  Goal,
  IngredientUnit,
  MealSlot,
  Profile,
  Recipe,
  StapleServing,
} from './types';

/**
 * The 主食 suggestion for today's menu, derived from the plan the 今日 tab is rendering.
 *
 * Pure on purpose: no storage, no React, and no import of `planner.ts` — a suggested bowl of rice
 * must never take part in fridge matching or the 采购清单 (see the note on `Recipe.staple`).
 */

/** Base amount × servings, then this — only for the staples the plan adds on top (另配). */
export const STAPLE_GOAL_FACTORS: Record<Goal, number> = {
  fatLoss: 0.75,
  balanced: 1,
  muscleGain: 1.3,
};

/** 「减脂 -25%」「均衡 标准量」「增肌 +30%」, derived from the factors so the copy cannot drift. */
export function stapleGoalLabel(goal: Goal): string {
  const factor = STAPLE_GOAL_FACTORS[goal];
  if (factor === 1) return `${GOAL_LABELS[goal]} 标准量`;
  const percent = Math.round((factor - 1) * 100);
  return `${GOAL_LABELS[goal]} ${percent > 0 ? '+' : ''}${percent}%`;
}

/** One 主食 for one recipe, already scaled to `profile.servings` people. */
export interface StapleSuggestion {
  name: string;
  /** Household total: base × servings, times the goal factor when the staple is 另配. */
  amount: number;
  unit: IngredientUnit;
  /** True when the staple is one of the dish's own ingredients, i.e. `recipe.staple` was undefined. */
  fromDish: boolean;
}

export interface StapleLine extends StapleSuggestion {
  slot: MealSlot;
}

export interface StaplePlan {
  /** 早餐 → 午餐 → 晚餐, at most one entry per meal. */
  lines: StapleLine[];
  /**
   * Per-person energy of the staples the plan adds *on top of* the dishes — only the lines where
   * `fromDish` is false. A breakfast's staple is an ingredient of its recipe, so its energy is
   * already inside `Recipe.calories`; counting it here would double-count breakfast every day.
   */
  addedKcalPerServing: number;
}

/**
 * Rough energy per 100 g of the staple *as the recipe uses it*: cooked for 白米饭/杂粮饭/糙米饭/
 * 小米粥, dry for 小米/挂面/全麦吐司/即食燕麦片. Estimates for orientation only — the UI rounds to
 * the nearest 10 and says 约. A name missing here falls back to a generic cooked grain.
 */
const KCAL_PER_100G: Partial<Record<string, number>> = {
  白米饭: 116,
  杂粮饭: 110,
  糙米饭: 112,
  小米粥: 46,
  小米: 361,
  挂面: 350,
  全麦吐司: 250,
  即食燕麦片: 380,
};
const DEFAULT_KCAL_PER_100G = 120;

/** Staples counted in 片 rather than weighed; a unit missing here contributes 0 kcal. */
const PIECE_GRAMS: Partial<Record<string, number>> = { 全麦吐司: 35 };

function stapleKcal(name: string, amount: number, unit: IngredientUnit): number {
  const grams = unit === 'g' || unit === 'ml' ? amount : amount * (PIECE_GRAMS[name] ?? 0);
  return (grams * (KCAL_PER_100G[name] ?? DEFAULT_KCAL_PER_100G)) / 100;
}

function stapleFactor(goal: Goal, fromDish: boolean): number {
  // A staple that is part of the dish is never goal-adjusted: the 食材清单 on the recipe page shows
  // the same amount through plain `scaleAmount`, and the dish itself was already picked to fit the
  // goal by the planner. The factor belongs to the staple the plan adds alongside.
  return fromDish ? 1 : STAPLE_GOAL_FACTORS[goal];
}

export function stapleOf(recipe: Recipe): StapleServing | undefined {
  // Explicit data wins: 青椒土豆丝's 土豆 is a starchy main ingredient, its 主食 is the 小米粥.
  return recipe.staple ?? recipe.ingredients.find((item) => item.category === 'staple');
}

interface StapleDraft {
  suggestion: StapleSuggestion;
  /** Per-person energy of this staple, before any rounding. */
  kcalPerServing: number;
}

function draftFor(recipe: Recipe, profile: Profile): StapleDraft | undefined {
  const staple = stapleOf(recipe);
  if (!staple) return undefined;

  const fromDish = recipe.staple === undefined;
  const perServing = staple.amount * stapleFactor(profile.goal, fromDish);

  return {
    suggestion: {
      name: staple.name,
      amount: scaleAmount(perServing, staple.unit, profile.servings),
      unit: staple.unit,
      fromDish,
    },
    kcalPerServing: stapleKcal(staple.name, perServing, staple.unit),
  };
}

/** The suggestion for one recipe, for a meal card or any other single-dish view. */
export function stapleSuggestion(recipe: Recipe, profile: Profile): StapleSuggestion | undefined {
  return draftFor(recipe, profile)?.suggestion;
}

export function buildStaplePlan(plan: DayPlan | null, profile: Profile): StaplePlan {
  if (!plan) return { lines: [], addedKcalPerServing: 0 };

  const lines: StapleLine[] = [];
  let addedKcalPerServing = 0;

  for (const slot of MEAL_SLOTS) {
    const recipe = getRecipe(plan.meals[slot]);
    // Mirrors the 今日 tab: an id the current recipe set no longer knows is simply skipped.
    if (!recipe) continue;

    const draft = draftFor(recipe, profile);
    if (!draft) continue;

    lines.push({ slot, ...draft.suggestion });
    if (!draft.suggestion.fromDish) addedKcalPerServing += draft.kcalPerServing;
  }

  return { lines, addedKcalPerServing };
}

/** The densities above are good to a few dozen calories, so the UI only shows the nearest 10. */
export function roundKcal(value: number): number {
  return Math.round(value / 10) * 10;
}

/** Meal-card line, e.g. `主食（另配）：白米饭 225 g（2 人份，减脂 -25%）`. */
export function stapleLineLabel(suggestion: StapleSuggestion, profile: Profile): string {
  const prefix = suggestion.fromDish ? '主食（本菜已含）' : '主食（另配）';
  // 均衡 has nothing to disclose: 标准量 is what the recipe data already says.
  const goalNote = STAPLE_GOAL_FACTORS[profile.goal] === 1 ? '' : `，${stapleGoalLabel(profile.goal)}`;
  return `${prefix}：${suggestion.name} ${formatAmount(suggestion.amount, suggestion.unit)}（${profile.servings} 人份${goalNote}）`;
}

/** Summary-card row value, e.g. `300 g`. */
export function stapleAmountLabel(suggestion: StapleSuggestion): string {
  return formatAmount(suggestion.amount, suggestion.unit);
}
