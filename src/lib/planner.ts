import { RECIPES } from './recipes';
import type { DayPlan, FridgeItem, Goal, Preference, Profile, Recipe } from './types';

/**
 * Fridge names that stand in for an ingredient written differently on the recipe side.
 * Names are compared after `normalizeName`, and substring containment (for names of two
 * or more characters) covers variants that are not worth listing here.
 */
const ALIASES: Record<string, string[]> = {
  番茄: ['西红柿'],
  土豆: ['马铃薯', '洋芋'],
  鸡蛋: ['蛋', '土鸡蛋', '鲜鸡蛋'],
  鸡胸肉: ['鸡胸', '鸡脯肉'],
  鸡腿肉: ['鸡腿', '琵琶腿'],
  鲜虾: ['虾', '大虾', '基围虾', '虾仁'],
  嫩豆腐: ['豆腐', '内酯豆腐', '南豆腐'],
  猪肉末: ['肉末', '猪绞肉', '猪肉馅'],
  挂面: ['面条', '龙须面', '细面'],
  全麦吐司: ['吐司', '面包片', '全麦面包'],
  即食燕麦片: ['燕麦', '燕麦片'],
  小米: ['黄小米'],
  南瓜: ['老南瓜'],
  西兰花: ['绿花菜'],
  油麦菜: ['莜麦菜'],
  生菜: ['球生菜'],
  黄瓜: ['青瓜'],
  青椒: ['柿子椒', '尖椒'],
  干香菇: ['香菇', '冬菇'],
  花生米: ['花生', '生花生'],
  干辣椒: ['辣椒干', '干红椒'],
  小米辣: ['朝天椒', '小辣椒'],
  大葱: ['京葱'],
  小葱: ['葱', '香葱', '葱花'],
  姜: ['生姜', '老姜', '姜片'],
  大蒜: ['蒜', '蒜头', '蒜瓣', '大蒜头'],
  冬瓜: ['白瓜'],
  排骨: ['肋排', '小排'],
  牛奶: ['纯牛奶', '鲜牛奶'],
};

/** Above this amount of cooking oil a dish stops counting as 清淡. */
const OIL_LIMIT_ML = 18;
/** Sugar or honey at or above this amount makes a dish non-低糖. */
const SWEET_LIMIT_G = 5;
const SWEETENER = /糖|蜂蜜/;
/** How many top-ranked dishes 「重新生成」 draws from, so the menu varies but stays sensible. */
const PICK_SPREAD = 3;

const WEIGHTS = {
  /** Share of the main ingredients already in the fridge. */
  readyRatio: 3,
  /** Everything is on hand — the dish can be cooked right now. */
  allReady: 3,
  /** Per missing main ingredient. */
  missing: 0.6,
  goal: 2,
  preference: 0.8,
  /** 清淡 / 低糖 preference contradicted by the recipe itself. */
  conflict: 1.5,
  /** Already on the previous menu. */
  repeat: 4,
  /** Reward for balancing meat against the other main meal of the day. */
  pairingBalance: 1.2,
} as const;

export interface RecipeMatch {
  readyCount: number;
  totalCount: number;
  /** 0–1, share of main ingredients available in the fridge. */
  ratio: number;
  missing: string[];
}

export interface RankedRecipe {
  recipe: Recipe;
  match: RecipeMatch;
  score: number;
}

export function normalizeName(name: string): string {
  return name.replace(/[\s、,，.。()（）]/g, '').toLowerCase();
}

function matchesFridge(ingredientName: string, available: Set<string>): boolean {
  const target = normalizeName(ingredientName);
  if (available.has(target)) return true;

  for (const alias of ALIASES[ingredientName] ?? []) {
    if (available.has(normalizeName(alias))) return true;
  }

  if (target.length >= 2) {
    for (const item of available) {
      if (item.length >= 2 && (item.includes(target) || target.includes(item))) return true;
    }
  }
  return false;
}

/** Splits a recipe's main ingredients into what the fridge covers and what is missing. */
export function matchRecipe(recipe: Recipe, fridge: FridgeItem[]): RecipeMatch {
  const available = new Set(fridge.map((item) => normalizeName(item.name)));
  return matchAgainst(recipe, available);
}

function matchAgainst(recipe: Recipe, available: Set<string>): RecipeMatch {
  const names = recipe.ingredients.map((ingredient) => ingredient.name);
  const missing = names.filter((name) => !matchesFridge(name, available));
  return {
    readyCount: names.length - missing.length,
    totalCount: names.length,
    ratio: names.length === 0 ? 0 : (names.length - missing.length) / names.length,
    missing,
  };
}

export function hasMeat(recipe: Recipe): boolean {
  return recipe.ingredients.some((ingredient) => ingredient.category === 'meat');
}

function isVegetarianFriendly(recipe: Recipe): boolean {
  return !hasMeat(recipe);
}

/** 素食 drops meat and seafood dishes; if that would leave nothing, the filter is relaxed. */
function applyPreferenceFilter(pool: Recipe[], profile: Profile): Recipe[] {
  if (!profile.preferences.includes('vegetarian')) return pool;
  const allowed = pool.filter(isVegetarianFriendly);
  return allowed.length > 0 ? allowed : pool;
}

/** Rough affinity of a dish with the user's body goal, in the range -2…2. */
function goalFit(recipe: Recipe, goal: Goal): number {
  switch (goal) {
    case 'fatLoss': {
      let score = recipe.oilLevel === 'low' ? 1 : recipe.oilLevel === 'medium' ? 0 : -1.5;
      if (recipe.calories <= 250) score += 1;
      else if (recipe.calories >= 450) score -= 1;
      return score;
    }
    case 'muscleGain': {
      let score = recipe.protein >= 30 ? 1.5 : recipe.protein >= 20 ? 0.5 : -0.5;
      if (recipe.calories >= 300) score += 0.5;
      return score;
    }
    case 'balanced':
      return recipe.oilLevel === 'high' ? -1 : 0.5;
  }
}

function preferenceFit(recipe: Recipe, preferences: Preference[]): number {
  // 素食 is handled as a filter, so it is not scored again here.
  return preferences.filter(
    (preference) => preference !== 'vegetarian' && recipe.preferences.includes(preference),
  ).length;
}

function contradictsPreferences(recipe: Recipe, preferences: Preference[]): boolean {
  if (preferences.includes('light')) {
    if (recipe.oilLevel === 'high') return true;
    if (
      recipe.seasonings.some(
        (item) => !item.optional && item.name === '食用油' && item.amount >= OIL_LIMIT_ML,
      )
    ) {
      return true;
    }
  }
  if (preferences.includes('lowSugar')) {
    if (
      recipe.seasonings.some(
        (item) => !item.optional && SWEETENER.test(item.name) && item.amount >= SWEET_LIMIT_G,
      )
    ) {
      return true;
    }
  }
  return false;
}

export interface ScoreOptions {
  /** Dishes from the previous menu, gently pushed down so 重新生成 actually changes things. */
  avoid?: Set<string>;
  bonus?: (recipe: Recipe) => number;
}

export function scoreRecipe(
  recipe: Recipe,
  match: RecipeMatch,
  profile: Profile,
  options: ScoreOptions = {},
): number {
  let score = match.ratio * WEIGHTS.readyRatio;
  if (match.missing.length === 0) score += WEIGHTS.allReady;
  score -= match.missing.length * WEIGHTS.missing;
  score += goalFit(recipe, profile.goal) * WEIGHTS.goal;
  score += preferenceFit(recipe, profile.preferences) * WEIGHTS.preference;
  if (contradictsPreferences(recipe, profile.preferences)) score -= WEIGHTS.conflict;
  if (options.avoid?.has(recipe.id)) score -= WEIGHTS.repeat;
  if (options.bonus) score += options.bonus(recipe);
  return score;
}

/** Ranks a pool of dishes best-first: fridge coverage first, then goal and preferences. */
export function rankRecipes(
  pool: Recipe[],
  fridge: FridgeItem[],
  profile: Profile,
  options: ScoreOptions = {},
): RankedRecipe[] {
  const available = new Set(fridge.map((item) => normalizeName(item.name)));
  return applyPreferenceFilter(pool, profile)
    .map((recipe) => {
      const match = matchAgainst(recipe, available);
      return { recipe, match, score: scoreRecipe(recipe, match, profile, options) };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Picks one dish for a meal: the strongest candidates are ranked, then one is drawn at
 * random from the top few so repeated generation produces variety without picking badly.
 */
function pickMeal(
  pool: Recipe[],
  fridge: FridgeItem[],
  profile: Profile,
  taken: Set<string>,
  options: ScoreOptions = {},
): Recipe | undefined {
  const ranked = rankRecipes(pool, fridge, profile, options).filter(
    (entry) => !taken.has(entry.recipe.id),
  );
  const candidates = ranked.slice(0, PICK_SPREAD);
  if (candidates.length === 0) return undefined;
  return candidates[Math.floor(Math.random() * candidates.length)].recipe;
}

/** Builds a breakfast / lunch / dinner plan for today, preferring what the fridge already holds. */
export function generatePlan(
  profile: Profile,
  fridge: FridgeItem[],
  previous?: DayPlan | null,
): DayPlan {
  const avoid = new Set<string>(previous ? Object.values(previous.meals) : []);
  const taken = new Set<string>();

  const breakfast = pickMeal(
    RECIPES.filter((recipe) => recipe.slots.includes('breakfast')),
    fridge,
    profile,
    taken,
    { avoid },
  );
  if (breakfast) taken.add(breakfast.id);

  const lunch = pickMeal(
    RECIPES.filter((recipe) => recipe.slots.includes('lunch')),
    fridge,
    profile,
    taken,
    { avoid },
  );
  if (lunch) taken.add(lunch.id);

  // Dinner leans the other way from lunch, so the day is not two heavy meat dishes.
  const lunchHasMeat = lunch ? hasMeat(lunch) : false;
  const dinner = pickMeal(
    RECIPES.filter((recipe) => recipe.slots.includes('dinner')),
    fridge,
    profile,
    taken,
    {
      avoid,
      bonus: (recipe) => (hasMeat(recipe) === lunchHasMeat ? -1 : 1) * WEIGHTS.pairingBalance,
    },
  );

  // Each pool has more entries than meals per day, so the fallbacks are only defensive.
  return {
    date: todayKey(),
    meals: {
      breakfast: (breakfast ?? lunch ?? dinner ?? RECIPES[0]).id,
      lunch: (lunch ?? dinner ?? breakfast ?? RECIPES[0]).id,
      dinner: (dinner ?? lunch ?? breakfast ?? RECIPES[0]).id,
    },
    generatedAt: Date.now(),
  };
}

/** Local calendar day as `YYYY-MM-DD`; plans are keyed by this, not by UTC. */
export function todayKey(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function todayLabel(date = new Date()): string {
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日 · ${WEEKDAYS[date.getDay()]}`;
}
