import { MEAL_SLOTS } from './labels';
import { DEFAULT_MEMBER, adviceKeysFor, bodyTagOf, householdPortions, portionFactor } from './members';
import { getRecipe } from './recipes';
import { buildStaplePlan } from './staples';
import type { AdviceKey, DayPlan, Goal, MealSlot, Member, Profile, Recipe } from './types';

/**
 * 全天营养目标的估算，以及「今天这份菜单提供了多少」。
 *
 * 纯模块：没有 React、没有存储。它也是**唯一**一处把「年龄 / 体重方向 / 特殊状态」翻译成数字的地方 ——
 * 今日页顶部的目标卡、发给模型的 prompt、harness 的断言都从这里取值，三处不可能各算一套。
 *
 * 一切都是估算：本 app 没有身高、体重、活动量，只有年龄档与体重方向。所以界面上要写「按年龄与体重
 * 方向估算，仅供参考」，不写成医嘱式的「应该吃多少」。
 */

/** 五项营养：`kcal` 是能量，其余是克数。 */
export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

/** 成人（成人份、均衡、无特殊状态）的一日参考能量。轻身体活动水平成人的估值，不是处方。 */
const BASE_ADULT_KCAL = 2000;

/** 体重方向对总能量的缩放：减脂略降、增肌略升。方向性的估值。 */
const GOAL_KCAL_FACTOR: Record<Goal, number> = {
  fatLoss: 0.85,
  balanced: 1,
  muscleGain: 1.15,
};

/** 孕期能量略增。指南给的是每日 +300 千卡量级，折算成 15%。 */
const PREGNANCY_KCAL_FACTOR = 1.15;

interface Shares {
  protein: number;
  carbs: number;
  fat: number;
}

/**
 * 三大产能营养素的供能比基准，取自宏量营养素可接受范围（蛋白 10–15%、碳水 50–65%、脂肪 20–30%）
 * 的中段。
 *
 * 三者**加起来是 0.98 而不是 1**，这是有意的：份额只是相对权重，落到能量上之前会按比例归一化
 * （见 `sharesFor`），所以这里填区间的中值就行，不必手工凑成整数百分比。
 */
const BASE_SHARES: Shares = { protein: 0.15, carbs: 0.55, fat: 0.28 };

/**
 * 需要加码 / 限制的人把份额往区间的哪一端挪。表里没有的键 = 维持基准。
 *
 * 痛风 / 高血压 / 幼儿 / 长辈清淡 / 均衡 **不在**表里，也没打算加：它们管的是「选什么菜」，不是
 * 「吃多少」。这一条写在计划里是有意的，别当成漏了。
 */
const SHARE_ADJUST: Partial<Record<AdviceKey, Partial<Shares>>> = {
  muscleGain: { protein: 0.2 },
  growingChild: { protein: 0.18 },
  pregnancy: { protein: 0.18 },
  ckd: { protein: 0.12 },
  fatLoss: { carbs: 0.5 },
  insulinResistance: { carbs: 0.5 },
  hyperlipidemia: { fat: 0.22 },
};

/** 每 1000 千卡 14 克膳食纤维：通行的纤维推荐口径，随能量派生，不独立编一个数。 */
const FIBER_PER_1000_KCAL = 14;

/** Atwater 系数，物理常数。 */
const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 };

/**
 * 这位成员的供能比，已归一化到 1。
 *
 * 归一化是必需的：份额表经过 `SHARE_ADJUST` 调整后不一定加起来是 1（如减脂的 0.15 + 0.5 + 0.28），
 * 不归一化的话「碳水 × 4 + 蛋白质 × 4 + 脂肪 × 9」就不等于热量目标，页面上两个数字互相打架。
 */
function sharesFor(member: Member): Shares {
  const shares: Shares = { ...BASE_SHARES };
  for (const key of adviceKeysFor(member)) Object.assign(shares, SHARE_ADJUST[key]);
  const total = shares.protein + shares.carbs + shares.fat;
  return {
    protein: shares.protein / total,
    carbs: shares.carbs / total,
    fat: shares.fat / total,
  };
}

/** 一位成员的全天目标。逐项取整，这样界面上的「逐位相加」与全家合计永远对得上。 */
function memberTarget(member: Member): Macros {
  const kcal =
    BASE_ADULT_KCAL *
    portionFactor(member) *
    GOAL_KCAL_FACTOR[bodyTagOf(member)] *
    (member.special.includes('pregnancy') ? PREGNANCY_KCAL_FACTOR : 1);
  const shares = sharesFor(member);
  return {
    kcal: Math.round(kcal),
    protein: Math.round((kcal * shares.protein) / KCAL_PER_G.protein),
    carbs: Math.round((kcal * shares.carbs) / KCAL_PER_G.carbs),
    fat: Math.round((kcal * shares.fat) / KCAL_PER_G.fat),
    fiber: Math.round((kcal / 1000) * FIBER_PER_1000_KCAL),
  };
}

export interface NutritionTarget extends Macros {
  /** 逐位成员各自那一份，供界面解释「这些数是怎么加出来的」，也供 prompt 报给模型。 */
  members: { name: string; kcal: number; protein: number }[];
}

/**
 * 全家的全天营养目标 = 逐位成员相加。没有成员时按一位均衡成人算，与 `householdPortions` 同一约定。
 *
 * 注意口径：每位成员的目标里带着**自己的**体重方向系数，而菜单里的菜只按 `portionFactor` 线性放大
 * （只有另配主食带目标系数，见 `staples`）。所以减脂家庭的「实际」会系统性高于目标 —— 那是真的
 * 信号（菜单确实偏多），不是 bug，界面上那是「参考」小字的用处。
 */
export function nutritionTarget(profile: Profile): NutritionTarget {
  const members = profile.members.length > 0 ? profile.members : [DEFAULT_MEMBER];
  const perMember = members.map((member) => ({ member, macros: memberTarget(member) }));
  return {
    kcal: perMember.reduce((sum, item) => sum + item.macros.kcal, 0),
    protein: perMember.reduce((sum, item) => sum + item.macros.protein, 0),
    carbs: perMember.reduce((sum, item) => sum + item.macros.carbs, 0),
    fat: perMember.reduce((sum, item) => sum + item.macros.fat, 0),
    fiber: perMember.reduce((sum, item) => sum + item.macros.fiber, 0),
    members: perMember.map(({ member, macros }) => ({
      name: member.name,
      kcal: macros.kcal,
      protein: macros.protein,
    })),
  };
}

/**
 * 一项营养的合计。`carbs`/`fat`/`fiber` 为 `null` 表示「有一道菜没填这一项」（老 AI 缓存、或内置菜
 * 漏填）—— 缺数据不当 0，那一项就不参与对比，界面上不显示它的比例。
 */
export interface NutritionTotals {
  kcal: number;
  protein: number;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
}

export interface DayNutrition {
  /** 每人份合计（含另配主食的标准份）。餐卡顶部那行小计就是它。 */
  perServing: NutritionTotals;
  /** 全家合计：每人份 × 份数 + 主食的全家份。顶部目标卡的「今天这份菜单」用它。 */
  household: NutritionTotals;
  /** 全家份数，界面上的「共 2.5 人份」。 */
  portions: number;
}

/** 逐项累加的中间态：`*Known` 用来记住有没有遇到缺数据的菜。 */
interface Accumulator {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  carbsKnown: boolean;
  fatKnown: boolean;
  fiberKnown: boolean;
}

function zeroAccumulator(): Accumulator {
  return {
    kcal: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
    carbsKnown: true,
    fatKnown: true,
    fiberKnown: true,
  };
}

/** 累加一道菜（或一份主食贡献）的每人份宏量。缺的项不当作 0，而是把该项标成「不确定」。 */
function addRecipe(acc: Accumulator, recipe: Recipe): void {
  acc.kcal += recipe.calories;
  acc.protein += recipe.protein;
  if (recipe.carbs === undefined) acc.carbsKnown = false;
  else acc.carbs += recipe.carbs;
  if (recipe.fat === undefined) acc.fatKnown = false;
  else acc.fat += recipe.fat;
  if (recipe.fiber === undefined) acc.fiberKnown = false;
  else acc.fiber += recipe.fiber;
}

function addMacros(acc: Accumulator, macros: Macros): void {
  acc.kcal += macros.kcal;
  acc.protein += macros.protein;
  acc.carbs += macros.carbs;
  acc.fat += macros.fat;
  acc.fiber += macros.fiber;
}

function finish(acc: Accumulator): NutritionTotals {
  return {
    kcal: acc.kcal,
    protein: acc.protein,
    carbs: acc.carbsKnown ? acc.carbs : null,
    fat: acc.fatKnown ? acc.fat : null,
    fiber: acc.fiberKnown ? acc.fiber : null,
  };
}

/** Σ 一餐里所有组成部分的每人份值（不做全家换算，解析不出的 id 与其它消费方一样静默跳过）。 */
function mealComponents(plan: DayPlan, slot: MealSlot): Accumulator {
  const acc = zeroAccumulator();
  for (const id of plan.meals[slot]) {
    const recipe = getRecipe(id);
    if (recipe) addRecipe(acc, recipe);
  }
  return acc;
}

/**
 * 一餐的每人份小计：Σ 各组成部分 + 该餐另配主食的标准份。
 *
 * 早餐的主食是本菜的主料（`fromDish`），它的能量与宏量都已经在菜里了，`contribPerServing` 是零，
 * 所以这里直接累加不会重复计 —— 这条规则与 `buildStaplePlan` 的累加口径**必须是同一条**。
 */
export function mealTotals(plan: DayPlan, slot: MealSlot, profile: Profile): NutritionTotals {
  const acc = mealComponents(plan, slot);
  for (const line of buildStaplePlan(plan, profile).lines) {
    if (line.slot === slot) addMacros(acc, line.contribPerServing);
  }
  return finish(acc);
}

/** 今天这份菜单提供了多少。`plan` 还没水合出来时返回 `null`。 */
export function dayNutrition(plan: DayPlan | null, profile: Profile): DayNutrition | null {
  if (!plan) return null;

  const portions = householdPortions(profile);
  const staples = buildStaplePlan(plan, profile);

  const perServing = zeroAccumulator();
  for (const slot of MEAL_SLOTS) {
    const meal = mealComponents(plan, slot);
    perServing.kcal += meal.kcal;
    perServing.protein += meal.protein;
    perServing.carbs += meal.carbs;
    perServing.fat += meal.fat;
    perServing.fiber += meal.fiber;
    if (!meal.carbsKnown) perServing.carbsKnown = false;
    if (!meal.fatKnown) perServing.fatKnown = false;
    if (!meal.fiberKnown) perServing.fiberKnown = false;
  }
  addMacros(perServing, staples.addedMacrosPerServing);

  const household: Accumulator = { ...perServing };
  household.kcal = perServing.kcal * portions + staples.addedMacrosHousehold.kcal;
  household.protein = perServing.protein * portions + staples.addedMacrosHousehold.protein;
  household.carbs = perServing.carbs * portions + staples.addedMacrosHousehold.carbs;
  household.fat = perServing.fat * portions + staples.addedMacrosHousehold.fat;
  household.fiber = perServing.fiber * portions + staples.addedMacrosHousehold.fiber;

  return {
    perServing: finish(perServing),
    household: finish(household),
    portions,
  };
}

/**
 * 「今天这份菜单」相对于目标的达成百分比，例如 `{ kcal: 98, protein: 109, carbs: 92 }`。
 *
 * 缺数据的项（`NutritionTotals` 里的 `null`）不出现 —— 不拿缺数据当 0，也不编一个比例出来。
 * 用百分比而不是「接近 / 偏少」，是因为后者需要一个阈值，而阈值只能拍脑袋。
 */
export function achievement(actual: NutritionTotals, target: Macros): Partial<Record<keyof Macros, number>> {
  const result: Partial<Record<keyof Macros, number>> = {};
  for (const key of ['kcal', 'protein', 'carbs', 'fat', 'fiber'] as const) {
    const value = actual[key];
    if (value === null || target[key] <= 0) continue;
    result[key] = Math.round((value / target[key]) * 100);
  }
  return result;
}
