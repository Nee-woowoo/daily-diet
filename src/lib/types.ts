export type MealSlot = 'breakfast' | 'lunch' | 'dinner';

export type Goal = 'fatLoss' | 'muscleGain' | 'balanced';

export type Preference = 'light' | 'spicy' | 'vegetarian' | 'lowSugar';

export type IngredientCategory = 'meat' | 'veg' | 'egg' | 'staple' | 'seasoning';

export type IngredientUnit = 'g' | 'ml' | '个' | '片' | '根' | '瓣' | '段' | '勺';

/** 辣度。`'hot'` 在「家里有幼儿」时是硬性排除，见 `diet.SPICY_HARD_EXCLUDE_KEYS`。 */
export type SpiceLevel = 'none' | 'mild' | 'hot';

/** 体重方向就是 `Goal` —— 一位成员只能有一个，所以直接复用，标签和配色都现成。 */
export type BodyTag = Goal;

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
}

export interface Ingredient {
  name: string;
  /** Amount for a single serving; multiplied by the household's total 份数 (`members.householdPortions`). */
  amount: number;
  unit: IngredientUnit;
  category: IngredientCategory;
  /** Optional main ingredients are still matched against the fridge; the UI marks them 可选. */
  optional?: boolean;
}

/**
 * A 主食 served alongside a dish, written as data instead of as the free text in `pairing`, so the
 * 今日 tab can scale it to the household's 份数, each member's 身体目标 (`staples.stapleFactorSum`).
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
  /** 详情页「注意事项」里的一句话，写法同上。 */
  cautions?: Partial<Record<AdviceKey, string>>;
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
  meals: Record<MealSlot, string>;
  generatedAt: number;
}
