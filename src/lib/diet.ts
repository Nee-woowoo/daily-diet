import type { AdviceKey, Preference, Recipe } from './types';

/**
 * What a dish *is*, diet-wise: the thresholds the planner and the member advice both need.
 *
 * These used to be inlined in `planner.ts`; they live here so a rule is written once and cannot
 * drift between 「推荐时降权」 and 「说明里怎么讲」. Deliberately does NOT import `planner` —
 * `planner` imports this module.
 */

/** Above this amount of cooking oil a dish stops counting as 清淡. */
export const OIL_LIMIT_ML = 18;
/** Sugar or honey at or above this amount makes a dish non-低糖. */
export const SWEET_LIMIT_G = 5;
export const SWEETENER = /糖|蜂蜜/;

/**
 * Keys for which 重辣 is a hard exclusion.
 *
 * Only 幼儿 — a member carrying `balanced` (which everyone does, see `adviceKeysFor`) must NOT
 * exclude spicy dishes, or every household would lose 麻婆豆腐 and 宫保鸡丁 and 「没选辣时辣菜只是
 * 降权、仍可能出现」 would stop being true.
 */
export const SPICY_HARD_EXCLUDE_KEYS: AdviceKey[] = ['toddler'];
export const SPICY_EXCLUSION_REASON = '重辣';

/** The recipe-side spellings, exactly as `recipes.ts` writes them — 「虾」/「豆腐」 would never match. */
const CALCIUM_RICH_NAMES = ['鲜虾', '嫩豆腐', '牛奶', '西兰花', '干香菇'];

/**
 * The `!optional` guard matters: 小米南瓜粥's 冰糖 is optional, so the dish stays 低糖.
 */
export function isHighSugar(recipe: Recipe): boolean {
  return recipe.seasonings.some(
    (item) => !item.optional && SWEETENER.test(item.name) && item.amount >= SWEET_LIMIT_G,
  );
}

/**
 * `name === '食用油'` is deliberate rather than 「anything oily」: 香煎鸡胸's 橄榄油 8 毫升 is a light
 * drizzle on a low-oil dish and must not count as 高油.
 */
export function isHighOil(recipe: Recipe): boolean {
  if (recipe.oilLevel === 'high') return true;
  return recipe.seasonings.some(
    (item) => !item.optional && item.name === '食用油' && item.amount >= OIL_LIMIT_ML,
  );
}

export function isProteinRich(recipe: Recipe): boolean {
  return recipe.protein >= 30;
}

export function isCalciumRich(recipe: Recipe): boolean {
  return recipe.ingredients.some((ingredient) => CALCIUM_RICH_NAMES.includes(ingredient.name));
}

/** 全家口味偏好被这道菜本身顶撞（清淡 vs 高油、低糖 vs 高糖）。素食走过滤，不在这里。 */
export function contradictsPreferences(recipe: Recipe, preferences: Preference[]): boolean {
  if (preferences.includes('light') && isHighOil(recipe)) return true;
  if (preferences.includes('lowSugar') && isHighSugar(recipe)) return true;
  return false;
}
