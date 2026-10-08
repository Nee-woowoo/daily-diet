import { GOAL_LABELS, MEAL_SLOTS, formatAmount } from './labels';
import {
  bodyTagOf,
  householdPortions,
  householdPortionsLabel,
  portionFactor,
  portionLabel,
} from './members';
import { getRecipe, scaleAmount } from './recipes';
import type { Macros } from './nutrition';
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
 * must never take part in pantry matching or the 采购清单 (see the note on `Recipe.staple`).
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
  /** 稳定的 React key：`${slot}-${组成部分下标}`。一餐可以有多行（多个组成部分各自的主食）。 */
  key: string;
  slot: MealSlot;
  /**
   * 这一行对**每人份标准份**贡献的宏量。`fromDish` 行是零 —— 早餐的主食本来就是菜里的主料，它的
   * 能量与宏量都已经在菜里了（见 `draftFor`）。
   */
  contribPerServing: Macros;
  /** 同上，但按全家份数与该成员的目标系数换算过。 */
  contribHousehold: Macros;
}

export interface StaplePlan {
  /** 早餐 → 午餐 → 晚餐。一餐最多一行**另配**的主食（同名去重），`fromDish` 行可以有多行。 */
  lines: StapleLine[];
  /**
   * Per-**标准份** macros of the staples the plan adds *on top of* the dishes — only the lines where
   * `fromDish` is false. A breakfast's staple is an ingredient of its recipe, so it is already inside
   * `Recipe.calories`; counting it here would double-count breakfast every day.
   *
   * 标准份（基础量、不带任何系数）是有意的：一家人的目标不同时，「每人」系数根本不存在，所以这一行只
   * 报标准份，全家的数字交给 `addedMacrosHousehold`。
   */
  addedMacrosPerServing: Macros;
  /** The same staples for the whole household, at each member's own 份数 and goal factor. */
  addedMacrosHousehold: Macros;
}

/** 每次都新建一个对象：绝不把一个全零的模块级常量交出去 —— 它一旦被写回就会污染整个会话。 */
function zeroMacros(): Macros {
  return { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
}

function sumMacros(a: Macros, b: Macros): Macros {
  return {
    kcal: a.kcal + b.kcal,
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat,
    fiber: a.fiber + b.fiber,
  };
}

/**
 * Rough macros per 100 g of the staple *as the recipe uses it*: cooked for 白米饭/杂粮饭/糙米饭/
 * 小米粥, dry for 小米/挂面/全麦吐司/即食燕麦片. Estimates for orientation only — the UI rounds and
 * says 约. A name missing here falls back to a generic cooked grain.
 *
 * `kcal` 与上一版的 `KCAL_PER_100G` 逐字相同（那是已经显示给用户看过的数），三个新数字是同一份
 * 食物的成分表，两者大致自洽（`4×碳水 + 4×蛋白质 + 9×脂肪` 与千卡同量级）。
 */
const STAPLE_PER_100G: Partial<Record<string, Macros>> = {
  白米饭: { kcal: 116, protein: 2.6, carbs: 25.9, fat: 0.3, fiber: 0.3 },
  杂粮饭: { kcal: 110, protein: 3.5, carbs: 24, fat: 0.8, fiber: 2.5 },
  糙米饭: { kcal: 112, protein: 2.6, carbs: 23, fat: 0.9, fiber: 1.8 },
  小米粥: { kcal: 46, protein: 1.4, carbs: 9.7, fat: 0.4, fiber: 0.2 },
  小米: { kcal: 361, protein: 9, carbs: 75, fat: 3.1, fiber: 1.6 },
  挂面: { kcal: 350, protein: 10, carbs: 74, fat: 0.8, fiber: 1.5 },
  全麦吐司: { kcal: 250, protein: 9, carbs: 43, fat: 3.4, fiber: 6 },
  即食燕麦片: { kcal: 380, protein: 13, carbs: 66, fat: 7, fiber: 10 },
};
const DEFAULT_STAPLE_PER_100G: Macros = { kcal: 120, protein: 2.6, carbs: 26, fat: 0.5, fiber: 0.5 };

/** Staples counted in 片 rather than weighed; a unit missing here contributes nothing. */
const PIECE_GRAMS: Partial<Record<string, number>> = { 全麦吐司: 35 };

export function stapleMacros(name: string, amount: number, unit: IngredientUnit): Macros {
  const grams = unit === 'g' || unit === 'ml' ? amount : amount * (PIECE_GRAMS[name] ?? 0);
  const per100 = STAPLE_PER_100G[name] ?? DEFAULT_STAPLE_PER_100G;
  const factor = grams / 100;
  return {
    kcal: per100.kcal * factor,
    protein: per100.protein * factor,
    carbs: per100.carbs * factor,
    fat: per100.fat * factor,
    fiber: per100.fiber * factor,
  };
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
  /** Macros of one 标准份 (the recipe's own base amount). */
  macrosStandard: Macros;
  /** Macros of the household total, i.e. of `suggestion.amount`. */
  macrosHousehold: Macros;
}

/**
 * 家里有胰岛素抵抗的成员时，另配的白米饭换成糙米饭。
 *
 * **全家一起换，不是给某个人单独换**：一锅饭是分不出来的，「妈妈那份换成糙米」没法下锅。所以判据
 * 是「有谁勾了胰岛素抵抗」，结果是桌上唯一的那碗饭。
 *
 * 只换名字，克数不动（两者的 base amount 都是 150 g），**但热量会跟着变**：糙米 112 千卡/100 克
 * 对白米 116，每 100 克差 4 千卡，且随人份数线性放大（2.5 人份的 375 克就差 15 千卡）。所以主食卡
 * 上的合计是会变的 ——那是真的差，不是取整误差，别去追平它。要算的话只有一个口径：克数 × 每 100 克。
 *
 * 够不着的两处，写在计划里说清楚了：早餐的主食是本菜的主料（`fromDish`，如小米南瓜粥的小米），
 * 不经过这张表；杂粮饭和糙米饭本来就是低 GI，不需要换。
 */
const GI_STAPLE_SWAP: Record<string, string> = { 白米饭: '糙米饭' };

function stapleNameFor(name: string, profile: Profile): string {
  const needsLowGi = profile.members.some((member) =>
    member.special.includes('insulinResistance'),
  );
  return needsLowGi ? (GI_STAPLE_SWAP[name] ?? name) : name;
}

function draftFor(recipe: Recipe, profile: Profile): StapleDraft | undefined {
  const staple = stapleOf(recipe);
  if (!staple) return undefined;

  const fromDish = recipe.staple === undefined;
  const household = scaleAmount(staple.amount, staple.unit, stapleFactorSum(profile, fromDish));
  // 绝不写回 `staple`：它是 `recipes.ts` 里的模块级常量（`WHITE_RICE`），改了会顺着引用漏到整个
  // 会话后面的每一次渲染里。这里只做一个新的 suggestion 对象。
  const name = stapleNameFor(staple.name, profile);

  return {
    suggestion: {
      name,
      amount: household,
      unit: staple.unit,
      fromDish,
    },
    macrosStandard: stapleMacros(name, staple.amount, staple.unit),
    macrosHousehold: stapleMacros(name, household, staple.unit),
  };
}

/** The suggestion for one recipe, for a meal card or any other single-dish view. */
export function stapleSuggestion(recipe: Recipe, profile: Profile): StapleSuggestion | undefined {
  return draftFor(recipe, profile)?.suggestion;
}

export function buildStaplePlan(plan: DayPlan | null, profile: Profile): StaplePlan {
  if (!plan) {
    return { lines: [], addedMacrosPerServing: zeroMacros(), addedMacrosHousehold: zeroMacros() };
  }

  const lines: StapleLine[] = [];
  let addedMacrosPerServing = zeroMacros();
  let addedMacrosHousehold = zeroMacros();

  for (const slot of MEAL_SLOTS) {
    // 一餐只留一碗「另配」的主食：两个组成部分各写一碗饭是数据错误，不该在卡片上变成两碗、在热量上
    // 变成两倍。`ai.normalizeMenu` 已经在校验层挡了一道，这里是第二道，够得着所有调用方。
    const seen = new Set<string>();
    plan.meals[slot].forEach((id, index) => {
      // Mirrors the 今日 tab: an id the current recipe set no longer knows is simply skipped.
      const recipe = getRecipe(id);
      if (!recipe) return;

      const draft = draftFor(recipe, profile);
      if (!draft) return;

      const { suggestion } = draft;
      if (!suggestion.fromDish) {
        if (seen.has(suggestion.name)) return;
        seen.add(suggestion.name);
      }

      lines.push({
        key: `${slot}-${index}`,
        slot,
        ...suggestion,
        contribPerServing: suggestion.fromDish ? zeroMacros() : draft.macrosStandard,
        contribHousehold: suggestion.fromDish ? zeroMacros() : draft.macrosHousehold,
      });
      if (!suggestion.fromDish) {
        addedMacrosPerServing = sumMacros(addedMacrosPerServing, draft.macrosStandard);
        addedMacrosHousehold = sumMacros(addedMacrosHousehold, draft.macrosHousehold);
      }
    });
  }

  return { lines, addedMacrosPerServing, addedMacrosHousehold };
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
