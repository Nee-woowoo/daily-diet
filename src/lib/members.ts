import type { TagTone } from '@/constants/theme';

import { GOAL_LABELS, PREFERENCE_LABELS, formatAmount } from './labels';
import type { AdviceKey, Goal, Member, Preference, Profile, SpecialTag } from './types';

/**
 * The household: who is at the table, how much each of them eats, and how the rest of the app talks
 * about them.
 *
 * Pure on purpose (no React, no storage, no `planner`): `migrateProfile` lives here rather than in
 * `storage.tsx` exactly so the throwaway node harness can exercise it against a raw v1 fixture.
 */

export const SPECIAL_TAGS: SpecialTag[] = ['pregnancy', 'growingChild', 'seniorLight'];

export const SPECIAL_TAG_LABELS: Record<SpecialTag, string> = {
  pregnancy: '孕期',
  growingChild: '发育期儿童',
  seniorLight: '长辈清淡',
};

export const SPECIAL_TAG_TONES: Record<SpecialTag, TagTone> = {
  pregnancy: 'pregnancy',
  growingChild: 'child',
  seniorLight: 'light',
};

export const SPECIAL_TAG_HINTS: Record<SpecialTag, string> = {
  pregnancy: '忌生食、酒精和高汞鱼，菜单会自动排除这类菜',
  growingChild: '正在长身体，优先蛋白质和钙',
  seniorLight: '口味清淡、少油少盐',
};

const GOALS: Goal[] = ['fatLoss', 'muscleGain', 'balanced'];
/** 全家口味偏好的规范顺序，取自 `labels.ts` 里那份表，免得两处各写一遍。 */
const PREFERENCES = Object.keys(PREFERENCE_LABELS) as Preference[];

/** 幼儿是**安全**阈值（<6 岁），不是食量档位：重辣菜对有幼儿的家庭直接排除。 */
const TODDLER_MAX_AGE = 6;
/** 食量档位的分界：<13 岁按儿童半份，≥60 岁按长辈 0.8 份。 */
const CHILD_MAX_AGE = 13;
const SENIOR_MIN_AGE = 60;

/** 迁移用：旧版单人设置变成的这一个成员。年龄留空，等用户核对。 */
export const DEFAULT_MEMBER: Member = {
  id: 'me',
  name: '我',
  age: 0,
  goal: 'balanced',
  special: [],
};

export function createMemberId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export type MemberTier = 'child' | 'adult' | 'senior';

/**
 * `age === 0` means 「未填」(see `Member.age`) and is treated as an adult: it must not fall into the
 * child tier just because `0 < 13`.
 */
export function memberTier(member: Member): MemberTier {
  if (member.age >= SENIOR_MIN_AGE) return 'senior';
  if (member.age > 0 && member.age < CHILD_MAX_AGE) return 'child';
  return 'adult';
}

/** How much of a single serving this member eats. */
export function portionFactor(member: Member): number {
  switch (memberTier(member)) {
    case 'child':
      return 0.5;
    case 'senior':
      return 0.8;
    case 'adult':
      return 1;
  }
}

export function portionLabel(member: Member): string {
  if (member.age === 0) return '年龄待填，按 1 份算';
  return `${FORMAT_NUMBER[portionFactor(member)]} 份`;
}

export function memberCount(profile: Profile): number {
  return profile.members.length;
}

export function householdPortions(profile: Profile): number {
  // 一位成员都没有时按一位成人算，这样纯函数永远有值可用（界面上会提示去添加成员）。
  if (profile.members.length === 0) return 1;
  return profile.members.reduce((sum, member) => sum + portionFactor(member), 0);
}

/** 「3 人（2 成人 + 1 儿童）」；档位与 `portionFactor` 共用 `memberTier`，不会和克数打架。 */
export function householdLabel(profile: Profile): string {
  if (profile.members.length === 0) return '还没添加成员';
  const tiers = profile.members.map(memberTier);
  const parts: string[] = [];
  const child = tiers.filter((tier) => tier === 'child').length;
  const senior = tiers.filter((tier) => tier === 'senior').length;
  const adult = tiers.length - child - senior;
  if (adult > 0) parts.push(`${adult} 成人`);
  if (child > 0) parts.push(`${child} 儿童`);
  if (senior > 0) parts.push(`${senior} 长辈`);
  return `${tiers.length} 人（${parts.join(' + ')}）`;
}

/** 「共 2.5 人份」。份数是浮点相加的结果，必须经由 `formatAmount` 收口，否则会渲染出 2.4000000000000004。 */
export function householdPortionsLabel(profile: Profile): string {
  return `共 ${formatAmount(householdPortions(profile), '人份')}`;
}

export function bodyTagOf(member: Member): Goal {
  // Stored data is clamped by `migrateProfile`, but a goal that somehow went missing must not
  // reach `STAPLE_GOAL_FACTORS[goal]` as `undefined` — that would put 「NaN g」 on screen.
  return GOALS.includes(member.goal) ? member.goal : 'balanced';
}

export function isToddler(member: Member): boolean {
  return member.age > 0 && member.age < TODDLER_MAX_AGE;
}

/** 「38 岁 · 减脂 · 孕期」；年龄没填时写「年龄待填」。 */
export function memberSummaryLabel(member: Member): string {
  const parts = [
    member.age > 0 ? `${member.age} 岁` : '年龄待填',
    GOAL_LABELS[bodyTagOf(member)],
    ...SPECIAL_TAGS.filter((tag) => member.special.includes(tag)).map(
      (tag) => SPECIAL_TAG_LABELS[tag],
    ),
  ];
  return parts.join(' · ');
}

/**
 * 该成员参与规则的身份键，按优先级排列：孕期 > 幼儿 > 发育期儿童 > 减脂 > 增肌 > 长辈清淡 > 均衡。
 * 排除规则检查**所有**键（安全从严），文案只取第一个有内容的键（不啰嗦）。永不为空 ——
 * 体重方向兜在最后。
 */
export function adviceKeysFor(member: Member): AdviceKey[] {
  const goal = bodyTagOf(member);
  const keys: AdviceKey[] = [];
  if (member.special.includes('pregnancy')) keys.push('pregnancy');
  if (isToddler(member)) keys.push('toddler');
  if (member.special.includes('growingChild')) keys.push('growingChild');
  if (goal === 'fatLoss') keys.push('fatLoss');
  if (goal === 'muscleGain') keys.push('muscleGain');
  if (member.special.includes('seniorLight')) keys.push('seniorLight');
  if (goal === 'balanced') keys.push('balanced');
  return keys;
}

/**
 * 迁移痕迹：旧版单人设置变成的那位「我」还没填过年龄。
 *
 * 判据刻意不是 `savedAt > 0`（用户自己保存过表单也是那个状态），也不是「有成员年龄为 0」
 * （用户可能故意不填新成员的年龄）—— 只有迁移生成的成员才叫「我」且年龄为 0。
 */
export function needsMigrationCheck(profile: Profile): boolean {
  return profile.members.some(
    (member) => member.name === DEFAULT_MEMBER.name && member.age === DEFAULT_MEMBER.age,
  );
}

const FORMAT_NUMBER: Record<number, string> = { 0.5: '0.5', 0.8: '0.8', 1: '1' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readGoal(value: unknown): Goal {
  return GOALS.includes(value as Goal) ? (value as Goal) : 'balanced';
}

function readPreferences(value: unknown): Preference[] {
  if (!Array.isArray(value)) return [];
  // Also drops duplicates and unknown strings, and keeps the canonical order.
  return PREFERENCES.filter((preference) => value.includes(preference));
}

function readAge(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(120, Math.max(0, Math.trunc(value)));
}

function readSpecial(value: unknown): SpecialTag[] {
  if (!Array.isArray(value)) return [];
  return SPECIAL_TAGS.filter((tag) => value.includes(tag));
}

function readMember(value: unknown): Member | null {
  if (!isRecord(value)) return null;
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  // A member without a 称呼 is unusable: the UI has nothing to show and the 兼顾说明 has no subject.
  if (name.length === 0) return null;
  return {
    id: typeof value.id === 'string' && value.id.length > 0 ? value.id : createMemberId(),
    name,
    age: readAge(value.age),
    goal: readGoal(value.goal),
    special: readSpecial(value.special),
  };
}

function readMembers(value: unknown): Member[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const members: Member[] = [];
  for (const raw of value) {
    const member = readMember(raw);
    if (!member) continue;
    // Duplicate ids would collide as React keys, so a repeated one gets a fresh id.
    if (seen.has(member.id)) member.id = createMemberId();
    seen.add(member.id);
    members.push(member);
  }
  return members;
}

/**
 * Reads whatever is under `daily-meals/profile/v1` into today's shape.
 *
 * - The current shape (`members` array) is only normalized: unknown tags dropped, the body goal
 *   forced to exactly one, ages clamped, unusable members removed.
 * - The v1 single-person shape becomes ONE member. `preferences` and `savedAt` carry over untouched.
 *   `servings` has nowhere to go (家里人数现在只由成员数决定) — the member is left with `age: 0` so the
 *   UI asks the user to check, since that is the only honest replacement for the lost headcount.
 * - Anything else falls back to a default household.
 */
export function migrateProfile(raw: unknown): Profile {
  if (!isRecord(raw)) return DEFAULT_PROFILE;

  if (Array.isArray(raw.members)) {
    const members = readMembers(raw.members);
    return {
      members: members.length > 0 ? members : [DEFAULT_MEMBER],
      preferences: readPreferences(raw.preferences),
      savedAt: typeof raw.savedAt === 'number' ? raw.savedAt : 0,
    };
  }

  const looksSinglePerson = typeof raw.servings === 'number' || typeof raw.goal === 'string';
  if (looksSinglePerson) {
    return {
      members: [{ id: createMemberId(), name: '我', age: 0, goal: readGoal(raw.goal), special: [] }],
      preferences: readPreferences(raw.preferences),
      savedAt: typeof raw.savedAt === 'number' ? raw.savedAt : 0,
    };
  }

  return DEFAULT_PROFILE;
}

export const DEFAULT_PROFILE: Profile = {
  members: [DEFAULT_MEMBER],
  preferences: [],
  savedAt: 0,
};
