import { MEAL_SLOTS } from './labels';
import {
  CLINICAL_ADJUST,
  DEFAULT_PREGNANCY_STAGE,
  FAT_ENERGY_SHARE,
  FIBER_G,
  GOAL_ADJUST,
  IR_CARB_SHARE_CAP,
  KCAL_PER_G,
  PREGNANCY,
  PREGNANCY_NUTRIENTS,
  PREGNANCY_STAGE_LABELS,
  SOURCES,
  energyBandFor,
  pagodaFor,
  pregnancyStage,
  proteinBandFor,
  sourceLabel,
  todoSuffix,
} from './guidelines';
import type { FoodGroupKey, PregnancyStage } from './guidelines';
import {
  DEFAULT_MEMBER,
  bodyTagOf,
  householdPortions,
  isPregnant,
  memberSummaryLabel,
  pregnancyWeekOf,
} from './members';
import { getRecipe } from './recipes';
import { buildStaplePlan } from './staples';
import type {
  DayPlan,
  MealSlot,
  Member,
  MetabolicTag,
  Profile,
  Recipe,
  Sex,
} from './types';

/**
 * 全天营养目标，以及「今天这份菜单提供了多少」。
 *
 * 纯模块：没有 React、没有存储。它也是**唯一**一处把「年龄 / 性别 / 体重方向 / 特殊状态」翻译成数字
 * 的地方 —— 今日页顶部的目标卡、发给模型的 prompt、harness 的断言都从这里取值，三处不可能各算一套。
 *
 * 数字本身不在这里，在 `guidelines`：那里每个数都挂着出处（哪一版指南、哪一张 DRIs 表），核实不到的
 * 挂着 `todo`。本文件只负责**查表 + 相加 + 拼依据**，一个凭空的数字都不许写。
 *
 * 口径仍不是医嘱：本 app 没有身高、体重，活动量固定按轻身体活动。所以卡片上写「依据《中国居民膳食
 * 指南（2022）》，仅供参考」，不写成「你应该吃多少」。
 */

/** 五项营养：`kcal` 是能量，其余是克数。 */
export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

/** 一位成员的全天目标，外加**每一项数字的依据** —— 卡片直接把这几串拼上去，不再二次加工。 */
export interface MemberTarget extends Macros {
  name: string;
  /** 「38 岁 · 女 · 孕期（20 周）」，卡片那一行的标题。 */
  summary: string;
  /** 热量那行的依据，如「依据 DRIs 2023 能量 · 减脂 −400 千卡」。 */
  kcalBasis: string;
  proteinBasis: string;
  /** 碳水有额外口径时那句话（目前只有胰岛素抵抗的上限）；没有就是 `''`。 */
  carbBasis: string;
  /** 需要单独说一句的：性别没填、孕周没填、孕期重点、慢性肾病限蛋白…… */
  notes: string[];
}

/**
 * 全家一天的食物类别目标，按宝塔层合并（每位成员的宝塔值相加）。
 *
 * `max === null` 有两种意思，渲染时必须分开处理：**不超过型**（盐、添加糖，`min === 0`，读作
 * 「≤X」）与**上限没核实**（某位成员的宝塔在这一层没有具体克数，此时 `todo` 非空，读作「≥Y」）。
 */
export interface FoodGroupTarget {
  key: FoodGroupKey;
  label: string;
  min: number;
  max: number | null;
  unit: 'g' | 'ml';
  note?: string;
  /** 宝塔出处；成员跨了不同宝塔时写「按各成员年龄段分别取宝塔」。 */
  basis: string;
  /** 有成员这一层的克数没核实时非空，卡片上显示成「（待核实）」。 */
  todo?: string;
}

export interface NutritionTarget extends Macros {
  /** 逐位成员各自那一份，供界面逐行解释「这些数是怎么来的」，也供 prompt 报给模型。 */
  members: MemberTarget[];
  /**
   * 全家一天的食物类别目标。**不是**每人份也不是「今天这份菜单」的实测值 —— 一张合桌的菜单没法按
   * 人头分摊蔬菜，所以它只做目标（卡片展示 + prompt 里要求兼顾结构）。
   */
  foodGroups: FoodGroupTarget[];
  /** 上面那几行合起来的出处，见 `foodGroupBasis`。 */
  foodGroupsBasis: string;
}

/**
 * 食物类别那几行的出处去重后合成一句：家里只有成年人时就是一个宝塔的名字，跨了年龄段
 * （既有小孩又有长辈）才是「按各成员年龄段分别取宝塔（…）」。
 *
 * 放在库里、而不是界面和 prompt 各自拼一次，是因为这句话是对上面那些数字**出处**的断言 ——
 * 送出去的目标和屏幕上显示的目标必须挂同一个出处，否则改了一处就会有一处「依据」和它对不上
 * （prompt 那段原先写死「平衡膳食宝塔」，家里有长辈时就会把老年人宝塔的数字说成成人宝塔的）。
 */
export function foodGroupBasis(targets: FoodGroupTarget[]): string {
  return [...new Set(targets.map((group) => group.basis))].join('；');
}

/**
 * 食物类别那一行读出来的量：`300–500g` / `≤5g` / `≥200g` / `待核实`。
 *
 * 三种形状分开是因为 `max === null` 有两种意思（见 `FoodGroupTarget`）：`min === 0` 是「不超过」型，
 * 写成 ≤ 是对的；`min > 0` 是「上限没核实」，写成 ≥ 才是诚实的说法（写「300g 以上」不等于官方说
 * 300–500）。一个数都没有的那种（`min === 0 && max === null`，如长辈宝塔的谷类）就直说待核实。
 *
 * 「（待核实）」后缀在这里带出去 —— 卡片和 prompt 都从这一个函数取值，两处不可能一个带一个不带。
 */
export function foodGroupAmount(target: FoodGroupTarget): string {
  const { min, max, unit } = target;
  if (max === null) {
    return min > 0 ? `≥${min}${unit}${todoSuffix(target.todo)}` : '待核实';
  }
  const amount = min === 0 ? `≤${max}${unit}` : min === max ? `${min}${unit}` : `${min}–${max}${unit}`;
  return `${amount}${todoSuffix(target.todo)}`;
}

/**
 * 性别没填时取男女两档的**中值**，并让调用方在依据里写明 —— 不默默当成某一性别（见 `Sex`）。
 */
function sexValue(
  values: Record<Sex, number>,
  member: Member,
): { value: number; mid: boolean } {
  if (member.sex) return { value: values[member.sex], mid: false };
  return { value: Math.round((values.male + values.female) / 2), mid: true };
}

/** 依据串的统一拼法：`依据 <出处> · <口径> · <口径>`，空的那几段自动去掉。 */
function basisOf(parts: string[]): string {
  return parts.filter((part) => part.length > 0).join(' · ');
}

/**
 * 一位成员的全天目标。
 *
 * 顺序是有讲究的：先查 DRIs 的 EER/RNI（分年龄、分性别），再叠加体重方向与孕期的**增量**，最后做
 * 胰岛素抵抗的碳水上限。每一步都在 `basis`/`notes` 里留下痕迹，卡片上不会出现来路不明的数字。
 */
function memberTarget(member: Member): MemberTarget {
  const notes: string[] = [];
  const band = energyBandFor(member.age);
  const proteinBand = proteinBandFor(member.age);
  const energy = sexValue(band.values, member);
  const protein = sexValue(proteinBand.values, member);
  const goal = GOAL_ADJUST[bodyTagOf(member)];

  if (member.age === 0) notes.push('年龄没填，按成人最低档（18–29 岁）算');
  if (energy.mid) {
    notes.push(`性别没填，按男女两档中值估（男 ${band.values.male} / 女 ${band.values.female} 千卡）`);
  }

  let kcal = energy.value + goal.kcal;
  let proteinG = protein.value * goal.proteinFactor;

  // 孕期：增量加在**同年龄同性别**的基础值上，不是另起一套总量。
  let pregnancyKcalNote = '';
  let pregnancyProteinNote = '';
  if (isPregnant(member)) {
    const week = pregnancyWeekOf(member);
    const stage: PregnancyStage = week === undefined ? DEFAULT_PREGNANCY_STAGE : pregnancyStage(week);
    const extra = PREGNANCY[stage];
    kcal += extra.kcal;
    proteinG += extra.protein;
    const stageLabel = PREGNANCY_STAGE_LABELS[stage];
    if (extra.kcal > 0) pregnancyKcalNote = `${stageLabel} +${extra.kcal} 千卡`;
    if (extra.protein > 0) pregnancyProteinNote = `${stageLabel} +${extra.protein}g`;
    if (week === undefined) notes.push(`孕周没填，按${stageLabel}算`);
    // 这一句刻意**不**走 `sourceLabel`：`PREGNANCY` 的 todo 说的是「官方表只印总值、增量是相减所得」，
    // 那是口径说明而不是「数字没核完」，写成「（待核实）」会让用户以为 +250 这个数有问题。
    notes.push(
      extra.kcal > 0 || extra.protein > 0
        ? `${stageLabel}增量按 ${SOURCES[extra.source].short}（官方表只印各档总值，增量是与非孕女性相减所得）`
        : `${stageLabel}不需要额外增加能量和蛋白质`,
    );
    notes.push(
      `孕期重点：${PREGNANCY_NUTRIENTS.map((item) => `${item.label} ${item.amount}`).join('、')}`,
    );
  }

  // 代谢疾病对数量的调整（整道菜的排除在 `diet` 里，两处不要互相抄）。
  let fatShare = FAT_ENERGY_SHARE;
  for (const tag of Object.keys(CLINICAL_ADJUST) as MetabolicTag[]) {
    if (!member.special.includes(tag)) continue;
    const adjust = CLINICAL_ADJUST[tag]!;
    if (adjust.fatShare !== undefined) fatShare = adjust.fatShare;
    if (adjust.proteinFactor !== 1) {
      proteinG *= adjust.proteinFactor;
      notes.push(`${adjust.note} —— 蛋白质已按 ${adjust.proteinFactor} 倍下调`);
    } else {
      notes.push(adjust.note);
    }
  }

  const kcalTotal = Math.round(kcal);
  // 脂肪先定（供能比），蛋白质用 DRIs 的绝对克数，碳水吃剩下的能量。
  let fatG = Math.round((kcalTotal * fatShare) / KCAL_PER_G.fat);
  let carbBasis = '';
  let carbsG = Math.round(
    (kcalTotal - proteinG * KCAL_PER_G.protein - fatG * KCAL_PER_G.fat) / KCAL_PER_G.carbs,
  );

  const carbShare = (carbsG * KCAL_PER_G.carbs) / kcalTotal;
  if (member.special.includes('insulinResistance') && carbShare > IR_CARB_SHARE_CAP) {
    // 超了就压到上限，省下来的能量**全部给蛋白质**，不给脂肪 —— 把碳水换成脂肪对胰岛素抵抗没有好处。
    carbsG = Math.round((kcalTotal * IR_CARB_SHARE_CAP) / KCAL_PER_G.carbs);
    proteinG = Math.round(
      (kcalTotal - carbsG * KCAL_PER_G.carbs - fatG * KCAL_PER_G.fat) / KCAL_PER_G.protein,
    );
    const percent = Math.round(IR_CARB_SHARE_CAP * 100);
    carbBasis = `碳水上限 ${percent}%（本应用口径）`;
    notes.push(`碳水按 ${percent}% 的上限控制，省下的能量给了蛋白质（本应用口径）`);
  }

  return {
    name: member.name,
    summary: memberSummaryLabel(member),
    kcal: kcalTotal,
    protein: Math.round(proteinG),
    carbs: carbsG,
    fat: fatG,
    fiber: FIBER_G,
    kcalBasis: basisOf([`依据 ${sourceLabel(band.source, band.todo)}`, goal.kcalNote, pregnancyKcalNote]),
    proteinBasis: basisOf([
      `依据 ${sourceLabel(proteinBand.source, proteinBand.todo)}`,
      goal.proteinNote,
      pregnancyProteinNote,
    ]),
    carbBasis,
    notes,
  };
}

/**
 * 全家一天的食物类别目标 = 逐位成员按各自宝塔取值再相加。
 *
 * 「深色蔬菜占一半」「每周水产 2 次」这类只进 `note`，不参与核算 —— 本应用没有菜谱的类别实测值
 * （食材分类里 `egg` 一个类目同时装蛋和奶），算不了，所以本轮只做目标展示与提示词（用户明确的选择）。
 */
function foodGroupsFor(members: Member[]): FoodGroupTarget[] {
  const merged = new Map<FoodGroupKey, FoodGroupTarget & { sources: Set<string> }>();

  for (const member of members) {
    const { groups } = pagodaFor(member.age);
    for (const group of groups) {
      let target = merged.get(group.key);
      if (!target) {
        target = {
          key: group.key,
          label: group.label,
          min: 0,
          max: group.max === null ? null : 0,
          unit: group.unit,
          note: group.note,
          basis: '',
          sources: new Set<string>(),
        };
        merged.set(group.key, target);
      }
      target.sources.add(SOURCES[group.source].short);
      if (group.todo) target.todo ??= group.todo;
      // 这一位成员的这一层没有具体克数（如老年人宝塔的谷类）：**不参与相加** —— 加 0 不改结果，
      // 却会让「全家合计」看起来像算过了。`todo` 已经记下，卡片上显示「（待核实）」。
      if (group.min === 0 && group.max === null) continue;
      target.min += group.min;
      if (group.max !== null && target.max !== null) target.max += group.max;
    }
  }

  return (
    [...merged.values()]
      .map(({ sources, ...target }) => ({
        ...target,
        // 一位成员的宝塔只有一张；跨了年龄段（比如一家有老人和小孩）就如实说是分别取的。
        basis:
          sources.size === 1
            ? [...sources][0]
            : `按各成员年龄段分别取宝塔（${[...sources].join('、')}）`,
      }))
      // 整层既没有数值也没有可说的（一位成员都没有的兜底路径会走到这里）：不留空行。
      .filter((target) => !(target.min === 0 && target.max === null && !target.todo))
  );
}

/**
 * 全家的全天营养目标 = 逐位成员相加。没有成员时按一位均衡成人算，与 `householdPortions` 同一约定。
 *
 * 注意两处口径差，它们会造成「实际高于目标」的观感，都是真的信号而不是 bug：
 * - 每位成员的目标带着**自己的**体重方向增减，而菜单里的菜只按 `portionFactor` 线性放大（只有另配
 *   主食带目标系数，见 `staples`）。
 * - 食物类别目标是**全家一天**的量，而卡片上的达成率来自「今天这份菜单」，两者不是一回事。
 */
export function nutritionTarget(profile: Profile): NutritionTarget {
  const members = profile.members.length > 0 ? profile.members : [DEFAULT_MEMBER];
  const perMember = members.map((member) => memberTarget(member));
  const sum = (pick: (target: MemberTarget) => number) =>
    perMember.reduce((total, target) => total + pick(target), 0);
  const foodGroups = foodGroupsFor(members);
  return {
    kcal: sum((target) => target.kcal),
    protein: sum((target) => target.protein),
    carbs: sum((target) => target.carbs),
    fat: sum((target) => target.fat),
    fiber: sum((target) => target.fiber),
    members: perMember,
    foodGroups,
    foodGroupsBasis: foodGroupBasis(foodGroups),
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
