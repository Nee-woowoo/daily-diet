import type { AdviceKey, Ingredient, Preference, Recipe } from './types';

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

/* ------------------------------------------------------------------ *
 * 慢性代谢疾病的四个维度
 *
 * 全部**从配料和调料推导**，不给 `Recipe` 加字段：16 道菜 × 4 维 = 64 个手填格子，必然有错，
 * 而且配方一改就和配料表打架。「豆瓣酱 2 勺」这件事只在 `recipes.ts` 里写一次，钠等级由它算出。
 *
 * 只看菜本身，**不看份数** —— 家里 4 口人会把每样克数乘大，等级不能跟着变，否则「4 人份的
 * 麻婆豆腐」会自己升成高钠。
 *
 * 判肉用 `category`（`Ingredient` 里就写着），不用名字里的「牛」「鸡」：「牛奶」也带个「牛」字。
 * ------------------------------------------------------------------ */

export type DietLevel = 'low' | 'medium' | 'high';

/**
 * 水产：痛风最明确的一类高嘌呤。
 *
 * 这个正则只在 `category === 'meat'` 的**主料**上跑，所以「蚝」不会误伤香菇滑鸡的蚝油 —— 那是调料。
 */
const SEAFOOD = /虾|鱼|蟹|贝|蛤|蚝|鱿|章鱼|海参|海鲜/;
/** 骨头与内脏：久煮才把嘌呤熬进汤里，所以还要看时间。 */
const BONE_OR_ORGAN = /排骨|骨头|骨|内脏|肝|腰|肠/;
/** 久煮的骨汤才算高嘌呤：40 分钟是「汤已经炖出味」的量级。 */
const BONE_BROTH_MINUTES = 40;
/**
 * 中档：肉禽本身，加上嘌呤不低的干香菇和豆制品。
 *
 * 中档**不排除**，只用来写提醒 —— 植物性的嘌呤对痛风发作的影响远小于动物性，文案里因此也不能说
 * 香菇滑鸡「低嘌呤」，只能说不高不低。
 */
const SOYBEAN_PURINE = /豆腐|豆浆|豆皮|腐竹|豆干/;
const MUSHROOM_PURINE = /香菇|木耳|菌/;

/** 酱油类，按「勺」累加：一勺生抽大约 1 克盐，是家常菜里最主要的钠来源。 */
const SOY_SAUCE = /生抽|老抽|酱油|蚝油|豉油/;
/** 腌制品与发酵酱：一勺就足以把一道菜推到高钠，不设阈值。 */
const CURED_OR_FERMENTED = /豆瓣酱|腐乳|榨菜|咸菜|腌|腊|火腿|豆豉|鱼露|虾酱/;
const SOY_SAUCE_HIGH_SPOONS = 3;
const SOY_SAUCE_MEDIUM_SPOONS = 1.5;
const SALT_HIGH_G = 4;
const SALT_MEDIUM_G = 2.5;

/** 粗粮：主料是这些就不算精制淀粉。 */
const WHOLE_GRAIN = /小米|全麦|燕麦|糙米|杂粮|荞麦|藜麦|玉米|紫米|黑米|红米/;
/**
 * 精制糖的高/中分界。与 `SWEET_LIMIT_G`（5 克，管「低糖」偏好）是两个概念，所以另起常量：
 * `isHighSugar` 说的是「这道菜能不能算低糖」，这里说的是「吃下去血糖冲得多高」。
 */
const SUGAR_HIGH_G = 10;
const SUGAR_MEDIUM_G = 5;
/** 水果的糖，量不大也算中等。 */
const FRUIT_SUGAR = /香蕉|蜂蜜/;
/**
 * 一勺按 15 克算。糖只有粉状的是按克写的，蜂蜜是按勺写的 —— 不换算的话「1 勺蜂蜜」会被读成
 * 1 克糖，比宫保鸡丁那 10 克白糖还轻，而实际有 20 克上下。
 */
const SPOON_G = 15;

/** 饱和脂肪高的食材：肥肉、带皮禽肉、排骨、动物油与加工肉。 */
const SAT_FAT_HIGH = /肥肉|五花|鸡腿|鸡翅|鸡皮|鸭|排骨|猪油|黄油|奶油|培根|香肠|腊肠|午餐肉/;
const SAT_FAT_MINCED = /肉末/;
/** 一天一个蛋没问题，一顿三个就值得提一句了。 */
const EGG_MEDIUM_COUNT = 3;

function sumAmount(items: Ingredient[]): number {
  return items.reduce((sum, item) => sum + item.amount, 0);
}

/** 调料里真正会被吃下去的部分：可选的（按口味加）不算，与 `isHighOil` / `isHighSugar` 同一口径。 */
function activeSeasonings(recipe: Recipe): Ingredient[] {
  return recipe.seasonings.filter((item) => !item.optional);
}

/** 嘌呤：高 = 水产，或久煮的骨汤；中 = 肉禽、干香菇、豆制品。 */
export function purineLevel(recipe: Recipe): DietLevel {
  if (recipe.ingredients.some((item) => item.category === 'meat' && SEAFOOD.test(item.name))) {
    return 'high';
  }
  if (recipe.ingredients.some((item) => BONE_OR_ORGAN.test(item.name))) {
    return recipe.minutes >= BONE_BROTH_MINUTES ? 'high' : 'medium';
  }
  const medium = recipe.ingredients.some(
    (item) =>
      item.category === 'meat' || SOYBEAN_PURINE.test(item.name) || MUSHROOM_PURINE.test(item.name),
  );
  return medium ? 'medium' : 'low';
}

/** 非可选糖与蜂蜜的总克数。 */
function sugarGrams(recipe: Recipe): number {
  return activeSeasonings(recipe)
    .filter((item) => SWEETENER.test(item.name))
    .reduce((sum, item) => sum + (item.unit === '勺' ? item.amount * SPOON_G : item.amount), 0);
}

/**
 * 升糖负担：高 = 精制淀粉主料，或 10 克以上的非可选糖；中 = 以主食为主，或 5 克以上。
 *
 * 只看这道菜**自己的**主料与调料，不看另配的那碗饭 —— 白米饭是「一桌人共吃一锅」的主食，由
 * `staples` 按家庭成员换成低 GI 的那一套处理（见 `staples.GI_STAPLE_SWAP`），不然一个胰岛素抵抗
 * 的成员会连番茄炒蛋这种菜都被排除掉。
 *
 * 因此「中」这一档覆盖了 粥 / 即食燕麦 / 全麦吐司 这些虽然算粗粮、但升糖并不慢的形态：它们不会
 * 被排除，也不会拿到低升糖的那点加分。
 */
export function glycemicLevel(recipe: Recipe): DietLevel {
  const refinedStarch = recipe.ingredients.some(
    (item) => item.category === 'staple' && !WHOLE_GRAIN.test(item.name),
  );
  if (refinedStarch || sugarGrams(recipe) >= SUGAR_HIGH_G) return 'high';

  const stapleLed = recipe.ingredients.some((item) => item.category === 'staple');
  const sweet = sugarGrams(recipe) >= SUGAR_MEDIUM_G;
  const fruitSugar = recipe.ingredients.some((item) => FRUIT_SUGAR.test(item.name));
  return stapleLed || sweet || fruitSugar ? 'medium' : 'low';
}

/**
 * 钠：高 = 腌制品/发酵酱，或 3 勺酱油类，或 4 克盐；中 = 1.5 勺酱油类，或 2.5 克盐。
 *
 * 两个高阈值在现有 16 道菜里都不会触发（最多的是香菇滑鸡 2.5 勺酱油、冬瓜排骨汤 3 克盐），所以
 * 高血压和慢性肾病现在排掉的**恰好只有麻婆豆腐**（豆瓣酱 2 勺）。这是「只排明确超标」的取舍，
 * 不是漏算：把阈值降到能抓住香菇滑鸡，会顺带排掉一批只是「有点咸」的家常菜。
 */
export function sodiumLevel(recipe: Recipe): DietLevel {
  const active = activeSeasonings(recipe);
  if (active.some((item) => CURED_OR_FERMENTED.test(item.name))) return 'high';

  const soySpoons = sumAmount(
    active.filter((item) => SOY_SAUCE.test(item.name) && item.unit === '勺'),
  );
  const saltGrams = sumAmount(
    active.filter((item) => (item.name === '盐' || item.name === '食盐') && item.unit === 'g'),
  );
  if (soySpoons >= SOY_SAUCE_HIGH_SPOONS || saltGrams >= SALT_HIGH_G) return 'high';
  if (soySpoons >= SOY_SAUCE_MEDIUM_SPOONS || saltGrams >= SALT_MEDIUM_G) return 'medium';
  return 'low';
}

/** 饱和脂肪：高 = 肥肉/带皮禽肉/排骨/动物油；中 = 肉末、全蛋≥3 个、奶。 */
export function saturatedFatLevel(recipe: Recipe): DietLevel {
  if (recipe.ingredients.some((item) => SAT_FAT_HIGH.test(item.name))) return 'high';

  const minced = recipe.ingredients.some((item) => SAT_FAT_MINCED.test(item.name));
  const eggs = sumAmount(
    recipe.ingredients.filter(
      (item) => item.category === 'egg' && /蛋/.test(item.name) && item.unit === '个',
    ),
  );
  const milk = recipe.ingredients.some((item) => item.category !== 'meat' && /奶/.test(item.name));
  if (minced || eggs >= EGG_MEDIUM_COUNT || milk) return 'medium';
  return 'low';
}

/** 详情页那一行「饮食维度」用的四档名称与顺序。 */
export function dietDimensions(recipe: Recipe): { label: string; level: DietLevel }[] {
  return [
    { label: '嘌呤', level: purineLevel(recipe) },
    { label: '升糖', level: glycemicLevel(recipe) },
    { label: '钠', level: sodiumLevel(recipe) },
    { label: '饱和脂肪', level: saturatedFatLevel(recipe) },
  ];
}

export const DIET_LEVEL_LABELS: Record<DietLevel, string> = {
  low: '低',
  medium: '中',
  high: '高',
};

/**
 * 每个疾病标签对应哪个维度、命中的高等级叫什么原因。
 *
 * `reason` 会拼进「爸爸忌高嘌呤」和菜谱库的徽标里，所以它必须是一个**名词短语**，不能带主语。
 * 慢性肾病与高血压同口径（都看钠）是刻意的：钾、磷、蛋白质的分期差异太大，本应用没有数据支持，
 * 硬排会害人 —— 那部分只能靠详情页那句恒提醒（见 `advice.CKD_CAUTION`）交给医嘱。
 */
const DISEASE_RULES: Partial<Record<AdviceKey, { level: (recipe: Recipe) => DietLevel; reason: string }>> = {
  gout: { level: purineLevel, reason: '高嘌呤' },
  insulinResistance: { level: glycemicLevel, reason: '高升糖' },
  hypertension: { level: sodiumLevel, reason: '高钠' },
  ckd: { level: sodiumLevel, reason: '高钠' },
  hyperlipidemia: { level: saturatedFatLevel, reason: '高饱和脂肪' },
};

/**
 * 这道菜对这位成员（这个身份键）的疾病判定；键不是疾病标签时返回 `undefined`。
 *
 * 调用方必须**按成员的键**来问（`advice.isExcluded` 就是遍历 `adviceKeysFor`），不能无条件地问
 * 「这道菜钠高吗」—— 那会把麻婆豆腐从所有人的菜单里删掉。
 */
export function diseaseRule(
  recipe: Recipe,
  key: AdviceKey,
): { level: DietLevel; reason: string } | undefined {
  const rule = DISEASE_RULES[key];
  if (!rule) return undefined;
  return { level: rule.level(recipe), reason: rule.reason };
}
