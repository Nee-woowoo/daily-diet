export type MealSlot = 'breakfast' | 'lunch' | 'dinner';

export type Goal = 'fatLoss' | 'muscleGain' | 'balanced';

export type Preference = 'light' | 'spicy' | 'vegetarian' | 'lowSugar';

/**
 * 食材分类。前五个键字符串是**老值**，一个都不能改：`diet` 的四个分级函数、`planner.hasMeat`、
 * `staples.stapleOf`、`diet.repairLabels` 全部按键字符串判等（详见各自的注释），改了键就是改安全
 * 判定。后四个是「食库」扩类时新增的 —— 它们在那些判等里自然落到「非肉、非主食」分支，与 `veg`
 * 同类，所以新分类不需要动任何一条规则。存储里现存的每个值仍然合法，只需要防御性归一化。
 */
export type IngredientCategory =
  | 'meat'
  | 'veg'
  | 'egg'
  | 'fruit'
  | 'staple'
  | 'seasoning'
  | 'drygoods'
  | 'drink'
  | 'other';

export type IngredientUnit = 'g' | 'ml' | '个' | '片' | '根' | '瓣' | '段' | '勺';

/** 辣度。`'hot'` 在「家里有幼儿」时是硬性排除，见 `diet.SPICY_HARD_EXCLUDE_KEYS`。 */
export type SpiceLevel = 'none' | 'mild' | 'hot';

/**
 * 一餐里这个组成部分扮演的角色。早餐从「饮品/蛋白质/主食/果蔬」里挑，午晚从「荤/素/主食/汤」里挑 ——
 * 同一个 `'protein'` 在两边读作「蛋白质」和「荤菜」，所以标签是**按餐次取**的
 * （`labels.mealRoleLabel`），枚举本身不分餐次。
 *
 * 只有 AI 生成的菜谱会填它：本地那 16 道菜一餐一道，卡片上不需要角色那行字。
 */
export type MealRole = 'drink' | 'protein' | 'staple' | 'veg' | 'soup' | 'fruit';

/** 体重方向就是 `Goal` —— 一位成员只能有一个，所以直接复用，标签和配色都现成。 */
export type BodyTag = Goal;

/**
 * 生理性别。膳食参考摄入量（DRIs）的能量、蛋白质、铁等值**按性别分列**，所以成员身上必须记得住
 * 这一个。不填时为 `undefined`，由 `guidelines` 按男女两档的中值处理并写明口径 —— 不默默当成
 * 某一性别。
 */
export type Sex = 'male' | 'female';

/** 成员的特殊状态，可多选。这些是**偏好**类的照顾（菜单按它加权），不是禁忌。 */
export type SpecialTag = 'pregnancy' | 'growingChild' | 'seniorLight';

/**
 * 慢性代谢疾病，可多选。与 `SpecialTag` 不同，这些是**禁忌**：命中就整道排除（见
 * `diet` 的四个分级函数与 `advice.DISEASE_RULES`）。
 */
export type MetabolicTag = 'gout' | 'insulinResistance' | 'hypertension' | 'hyperlipidemia' | 'ckd';

/**
 * 成员身上能挂的全部标签。两类共用一个存储字段 `Member.special`：拆成两个字段就要在
 * `adviceKeysFor` / `memberSummaryLabel` / `readSpecial` 三处各拼一次，漏一处疾病就静默不生效。
 */
export type MemberTag = BodyTag | SpecialTag | MetabolicTag;

/**
 * 菜谱给「某类人」写说明时用的键：成员标签，外加由年龄派生、用户选不到的 `'toddler'`
 * （<6 岁，见 `members.adviceKeysFor`）。
 */
export type AdviceKey = MemberTag | 'toddler';

export interface Member {
  id: string;
  /** 称呼：爸爸 / 妈妈 / 宝宝。 */
  name: string;
  /**
   * 0 表示「未知」——从旧版单人设置迁移来的成员没有年龄可继承，宁可留空让用户核对，也不编造。
   * 引擎按成人一份处理（见 `members.portionFactor`）。
   */
  age: number;
  /** 体重方向，单选。 */
  goal: Goal;
  /** 特殊状态与慢性代谢疾病，多选。字段名保留 `special` 是为了不改存储键、不做数据迁移。 */
  special: MemberTag[];
  /**
   * 生理性别。参考摄入量按性别分列（男 18–29 岁轻身体活动 2150 千卡 vs 女 1700），不填就只能按
   * 两档中值估，卡片上会写明「性别未填」。
   */
  sex?: Sex;
  /**
   * 孕周 1–40。只在特殊状态里勾了「孕期」时填。`undefined` = 没填，由 `nutrition` 按**孕中期**兜底
   * 并在界面上写明（与 `age: 0` 同一个思路：不编造一个精确值塞进存储）。
   */
  pregnancyWeek?: number;
  /**
   * 体检指标异常，自由文本（如「尿酸偏高、轻度脂肪肝」）。**只发给 AI 当上下文**，不参与本地硬排除 —
   * 自由文本没法可靠地映射成 `MetabolicTag`，猜错了要么漏排要么多排，所以它只影响 prompt。
   */
  medical?: string;
}

export interface Ingredient {
  name: string;
  /** Amount for a single serving; multiplied by the household's total 份数 (`members.householdPortions`). */
  amount: number;
  unit: IngredientUnit;
  category: IngredientCategory;
  /** Optional main ingredients are still matched against the pantry; the UI marks them 可选. */
  optional?: boolean;
}

/**
 * A 主食 served alongside a dish, written as data instead of as the free text in `pairing`, so the
 * 今日 tab can scale it to the household's 份数, each member's 身体目标 (`staples.stapleFactorSum`).
 *
 * Deliberately NOT an `Ingredient`: staples must never enter `Recipe.ingredients`, because those
 * drive pantry matching and the 采购清单 (`planner.matchRecipe`, `shopping.buildShoppingList`).
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
  /**
   * 每人份的碳水/脂肪/膳食纤维克数，**估算值**，与 `calories`/`protein` 同一个位置、同一套口径：
   * 16 道内置菜是人手填的，AI 那份由模型给、本地只核对区间。
   *
   * 三者都是可选的：老缓存里的 AI 菜谱没有它们，读不到就不显示那一项（`nutrition` 也照此处理），
   * 不要拿缺数据当 0。本地菜单的营养小计靠它们，所以 16 道菜一个都不能漏。
   */
  carbs?: number;
  fat?: number;
  fiber?: number;
  oilLevel: 'low' | 'medium' | 'high';
  /** 这一餐里它是什么角色（饮品/蛋白质/主食/果蔬/荤/素/汤）。只有 AI 生成的菜谱有。 */
  role?: MealRole;
  goals: Goal[];
  preferences: Preference[];
  /** Main ingredients only — these drive pantry matching. */
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
  /**
   * 辣度。`'hot'` 会在「家里有幼儿（<6 岁）」时整道排除（规则在 `diet.SPICY_HARD_EXCLUDE_KEYS`，
   * 不写进 `exclusions`，免得数据漂）。
   */
  spice: SpiceLevel;
  /**
   * 对某类成员的硬性禁忌 + 原因，例如 `{ pregnancy: '生食' }`。只写真的不能吃的（生食/酒精），
   * 不写口味偏好 —— 口味走全家 `Profile.preferences`，那只是降权。
   *
   * 代谢疾病的禁忌**不要**写在这里：那四个等级是从配料和调料算出来的（`diet` 的 `purineLevel`
   * 等），手写一份会和配方打架。
   */
  exclusions?: Partial<Record<AdviceKey, string>>;
  /** 今日页「兼顾说明」里的一句话；`{name}` 会替换成成员的称呼。 */
  care?: Partial<Record<AdviceKey, string>>;
  /**
   * AI 自己写的那句「兼顾说明」，**只增不减**：它与上面那张按标签查表的 `care` 并列显示，不替换任何
   * 模板文案 —— 模板里带着每位成员各自的疾病照顾（如高血压的「少喝汤汁」），用一句话覆盖掉它是净损失。
   * 只有 AI 生成的菜谱有。
   */
  aiCare?: string;
  /** 详情页「注意事项」里的一句话，写法同上。 */
  cautions?: Partial<Record<AdviceKey, string>>;
  tip?: string;
}

/** 家里现有的食材。名字从「冰箱」改来 —— 米面粮油、水果干货都不在冰箱里。 */
export interface PantryItem {
  id: string;
  name: string;
  /** Free-form amount such as `500 克` or `2 个`. Not used for matching in v1. */
  amount: string;
  category: IngredientCategory;
  addedAt: number;
}

/**
 * The household. 家里人数不再是手填的数字 —— 它就是 `members.length`，食量则按每位成员的
 * 份数相加（见 `members.householdPortions`）。
 */
export interface Profile {
  members: Member[];
  /** 全家口径的口味偏好：素食会排除荤菜，没选辣时辣菜降权。 */
  preferences: Preference[];
  /** `0` means the user has not saved the form yet. */
  savedAt: number;
}

export interface DayPlan {
  /** Local calendar day as `YYYY-MM-DD`. */
  date: string;
  /**
   * 每个 slot 是这一餐的**若干个组成部分**的菜谱 id（一荤 + 一素 + 主食/汤，AI 给 2–4 个）。
   *
   * 数组形状是统一的，本地路径只放一个（见 `planner.generatePlan`）：两条路径共用同一套消费方
   * （今日页、购物清单、主食计划），多一个「有时是字符串有时是数组」的分支就多一处永远测不到的路径。
   */
  meals: Record<MealSlot, string[]>;
  generatedAt: number;
  /**
   * 这份菜单是谁排的。**只用于展示**（角标与免责小字）—— 不要拿它判断「AI 菜谱还在不在」，
   * 那是 `getRecipe` 能不能解析出 id 的事（见 `recipes.setCustomRecipes`）。缺省 = `'local'`。
   */
  source?: 'local' | 'ai';
  /**
   * AI 写给用户的 0–2 句说明（每条 ≤40 字），例如「你家的油莎豆我先按打豆浆用了」。存在 plan 里
   * 而不是单独的键，是为了让它和菜单同生共死：重新生成就整份换掉，不会留下上一份菜单的叮嘱。
   *
   * 本地菜单永远没有它。水合时当**不可信数据**读（数组、逐条字符串、截断），见 `storage`。
   */
  notes?: string[];
}
