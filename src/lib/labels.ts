import type { TagTone } from '@/constants/theme';

import type {
  Goal,
  IngredientCategory,
  MealRole,
  MealSlot,
  Preference,
  SpiceLevel,
} from './types';

export const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner'];

export const MEAL_SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
};

/** 角色的闭集与顺序（`ai.SCHEMA_SPEC` 照它写，`readDish` 照它校验）。 */
export const MEAL_ROLES: MealRole[] = ['drink', 'protein', 'staple', 'veg', 'soup', 'fruit'];

const MEAL_ROLE_BASE: Record<MealRole, string> = {
  drink: '饮品',
  protein: '蛋白质',
  staple: '主食',
  veg: '蔬菜',
  soup: '汤',
  fruit: '水果',
};

/**
 * 同一个角色在两个餐次里读作不同的话：早餐的 `protein` 是一枚水煮蛋，读作「蛋白质」；午餐晚餐的
 * `protein` 是三道里的一道肉菜，读作「荤菜」。`veg` 同理（果蔬 / 素菜）。所以标签要**按餐次取**，
 * 枚举本身不分餐次 —— 分两套枚举会让 prompt 与校验各写一遍。
 */
const SLOT_ROLE_OVERRIDES: Partial<Record<MealSlot, Partial<Record<MealRole, string>>>> = {
  breakfast: { veg: '果蔬' },
  lunch: { protein: '荤菜', veg: '素菜' },
  dinner: { protein: '荤菜', veg: '素菜' },
};

export function mealRoleLabel(role: MealRole, slot: MealSlot): string {
  return SLOT_ROLE_OVERRIDES[slot]?.[role] ?? MEAL_ROLE_BASE[role];
}

export const GOAL_LABELS: Record<Goal, string> = {
  fatLoss: '减脂',
  muscleGain: '增肌',
  balanced: '均衡',
};

export const GOAL_DESCRIPTIONS: Record<Goal, string> = {
  fatLoss: '优先低油低卡，控制总热量',
  muscleGain: '优先高蛋白，热量给足',
  balanced: '荤素搭配，营养均衡',
};

export const GOAL_TONES: Record<Goal, TagTone> = {
  fatLoss: 'fatLoss',
  muscleGain: 'muscleGain',
  balanced: 'balanced',
};

export const PREFERENCE_LABELS: Record<Preference, string> = {
  light: '清淡',
  spicy: '辣',
  vegetarian: '素食',
  lowSugar: '低糖',
};

export const PREFERENCE_TONES: Record<Preference, TagTone> = {
  light: 'light',
  spicy: 'spicy',
  vegetarian: 'vegetarian',
  lowSugar: 'lowSugar',
};

/**
 * 分类的中文名。键是**存储值**（五个老键一个都没改，见 `types.IngredientCategory`），改的只是显示。
 * prompt 的取值表（`ai.categoryTable`）与这里共用同一张表 —— 模型看到的词和用户看到的词因此永远一致。
 */
export const CATEGORY_LABELS: Record<IngredientCategory, string> = {
  meat: '肉禽水产',
  veg: '蔬菜',
  egg: '蛋奶',
  fruit: '水果',
  staple: '主食米面',
  seasoning: '调味酱料',
  drygoods: '干货坚果',
  drink: '饮品',
  other: '其他',
};

/** 展示顺序：食库分组、采购清单分组、添加食材的分类 Chip 都用它。 */
export const CATEGORY_ORDER: IngredientCategory[] = [
  'meat',
  'veg',
  'egg',
  'fruit',
  'staple',
  'seasoning',
  'drygoods',
  'drink',
  'other',
];

export const OIL_LEVEL_LABELS = {
  low: '少油',
  medium: '中油',
  high: '油偏多',
} as const;

export const SPICE_LABELS: Record<SpiceLevel, string> = {
  none: '不辣',
  mild: '微辣',
  hot: '重辣',
};

/** Combines a name with its amount for a single row, e.g. `生抽 · 1 勺`. */
export function formatAmount(amount: number, unit: string): string {
  const rounded = Math.round(amount * 10) / 10;
  const value = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${value} ${unit}`;
}
