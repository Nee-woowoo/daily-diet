import { GOAL_LABELS, MEAL_SLOTS, formatAmount } from './labels';
import {
  bodyTagOf,
  householdPortions,
  householdPortionsLabel,
  portionFactor,
  portionLabel,
} from './members';
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

/** The multiplier on a recipe's base amount, applied per member — only to the 另配 staples. */
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

/** One 主食 for one recipe, already scaled to the whole household. */
export interface StapleSuggestion {
  name: string;
  /**
   * Household total: base × Σ(每位成员的份数 × 各自的目标系数). Rounded once, at the end — see
   * `stapleFactorSum`.
   */
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
   * Per-**标准份** energy of the staples the plan adds *on top of* the dishes — only the lines where
   * `fromDish` is false. A breakfast's staple is an ingredient of its recipe, so its energy is
   * already inside `Recipe.calories`; counting it here would double-count breakfast every day.
   *
   * 标准份（基础量、不带任何系数）是有意的：一家人的目标不同时，「每人」系数根本不存在，所以这一行只
   * 报标准份，全家的数字交给 `addedKcalHousehold`。
   */
  addedKcalPerServing: number;
  /** The same staples for the whole household, at each member's own 份数 and goal factor. */
  addedKcalHousehold: number;
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

/**
 * The multiplier `scaleAmount` is called with: Σ over the household of 份数 × 目标系数.
 *
 * A staple that is part of the dish is never goal-adjusted — the 食材清单 on the recipe page shows
 * the same amount through plain `scaleAmount`, and the dish itself was already picked to fit the
 * members by the planner. The factor belongs to the staple the plan adds alongside.
 *
 * 关键：这是**一个**乘数，不是「每人各算一份再相加」。逐人换算会把每一次 `scaleAmount` 的取整都
 * 落在总和里（两位减脂成人：150 × 0.75 取整两次 = 113 + 113 = 226，而正确值是 225）。
 */
function stapleFactorSum(profile: Profile, fromDish: boolean): number {
  if (profile.members.length === 0) return householdPortions(profile);
  return profile.members.reduce((sum, member) => {
    const factor = fromDish ? 1 : STAPLE_GOAL_FACTORS[bodyTagOf(member)];
    return sum + portionFactor(member) * factor;
  }, 0);
}

export function stapleOf(recipe: Recipe): StapleServing | undefined {
  // Explicit data wins: 青椒土豆丝's 土豆 is a starchy main ingredient, its 主食 is the 小米粥.
  return recipe.staple ?? recipe.ingredients.find((item) => item.category === 'staple');
}

interface StapleDraft {
  suggestion: StapleSuggestion;
  /** Energy of one 标准份 (the recipe's own base amount). */
  kcalStandard: number;
  /** Energy of the household total, i.e. of `suggestion.amount`. */
  kcalHousehold: number;
}

function draftFor(recipe: Recipe, profile: Profile): StapleDraft | undefined {
  const staple = stapleOf(recipe);
  if (!staple) return undefined;

  const fromDish = recipe.staple === undefined;
  const household = scaleAmount(staple.amount, staple.unit, stapleFactorSum(profile, fromDish));

  return {
    suggestion: {
      name: staple.name,
      amount: household,
      unit: staple.unit,
      fromDish,
    },
    kcalStandard: stapleKcal(staple.name, staple.amount, staple.unit),
    kcalHousehold: stapleKcal(staple.name, household, staple.unit),
  };
}

/** The suggestion for one recipe, for a meal card or any other single-dish view. */
export function stapleSuggestion(recipe: Recipe, profile: Profile): StapleSuggestion | undefined {
  return draftFor(recipe, profile)?.suggestion;
}

export function buildStaplePlan(plan: DayPlan | null, profile: Profile): StaplePlan {
  if (!plan) return { lines: [], addedKcalPerServing: 0, addedKcalHousehold: 0 };

  const lines: StapleLine[] = [];
  let addedKcalPerServing = 0;
  let addedKcalHousehold = 0;

  for (const slot of MEAL_SLOTS) {
    const recipe = getRecipe(plan.meals[slot]);
    // Mirrors the 今日 tab: an id the current recipe set no longer knows is simply skipped.
    if (!recipe) continue;

    const draft = draftFor(recipe, profile);
    if (!draft) continue;

    lines.push({ slot, ...draft.suggestion });
    if (!draft.suggestion.fromDish) {
      addedKcalPerServing += draft.kcalStandard;
      addedKcalHousehold += draft.kcalHousehold;
    }
  }

  return { lines, addedKcalPerServing, addedKcalHousehold };
}

/** The densities above are good to a few dozen calories, so the UI only shows the nearest 10. */
export function roundKcal(value: number): number {
  return Math.round(value / 10) * 10;
}

/** Meal-card line, e.g. `主食（另配）：白米饭 375 g（共 2.5 人份，减脂 -25% + 增肌 +30%）`. */
export function stapleLineLabel(suggestion: StapleSuggestion, profile: Profile): string {
  const prefix = suggestion.fromDish ? '主食（本菜已含）' : '主食（另配）';
  const goalNote = stapleGoalNote(profile, suggestion.fromDish);
  return `${prefix}：${suggestion.name} ${formatAmount(suggestion.amount, suggestion.unit)}（${householdPortionsLabel(profile)}${goalNote}）`;
}

/**
 * 「，减脂 -25% + 增肌 +30%」。均衡 has nothing to disclose — 标准量 is what the recipe data already
 * says — and a staple that is part of the dish is never goal-adjusted at all.
 */
function stapleGoalNote(profile: Profile, fromDish: boolean): string {
  if (fromDish) return '';
  const notes: string[] = [];
  for (const member of profile.members) {
    const goal = bodyTagOf(member);
    if (STAPLE_GOAL_FACTORS[goal] === 1) continue;
    const note = stapleGoalLabel(goal);
    if (!notes.includes(note)) notes.push(note);
  }
  return notes.length > 0 ? `，${notes.join(' + ')}` : '';
}

/** Summary-card row value, e.g. `300 g`. */
export function stapleAmountLabel(suggestion: StapleSuggestion): string {
  return formatAmount(suggestion.amount, suggestion.unit);
}

/**
 * 主食卡上的「每人份量」一行，例如
 * `爸爸 1 份（减脂 -25%）· 妈妈 1 份 · 宝宝 0.5 份（均衡 标准量）`…… 均衡不标注，那是标准量。
 */
export function memberPortionLine(profile: Profile): string {
  return profile.members
    .map((member) => {
      const goal = bodyTagOf(member);
      const note = STAPLE_GOAL_FACTORS[goal] === 1 ? '' : `（${stapleGoalLabel(goal)}）`;
      return `${member.name} ${portionLabel(member)}${note}`;
    })
    .join(' · ');
}
