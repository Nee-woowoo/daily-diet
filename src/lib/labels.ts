import type { TagTone } from '@/constants/theme';

import type { Goal, IngredientCategory, MealSlot, Preference } from './types';

export const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner'];

export const MEAL_SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
};

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

export const CATEGORY_LABELS: Record<IngredientCategory, string> = {
  meat: '肉',
  veg: '菜',
  egg: '蛋/奶',
  staple: '主食',
  seasoning: '调味',
};

export const CATEGORY_ORDER: IngredientCategory[] = ['meat', 'veg', 'egg', 'staple', 'seasoning'];

export const OIL_LEVEL_LABELS = {
  low: '少油',
  medium: '中油',
  high: '油偏多',
} as const;

/** Combines a name with its amount for a single row, e.g. `生抽 · 1 勺`. */
export function formatAmount(amount: number, unit: string): string {
  const rounded = Math.round(amount * 10) / 10;
  const value = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${value} ${unit}`;
}
