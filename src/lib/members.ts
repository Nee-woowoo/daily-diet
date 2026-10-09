import { GOAL_LABELS, PREFERENCE_LABELS, formatAmount } from './labels';
import type {
  AdviceKey,
  Goal,
  Member,
  MemberTag,
  MetabolicTag,
  Preference,
  Profile,
  Sex,
  SpecialTag,
} from './types';

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

export const SPECIAL_TAG_HINTS: Record<SpecialTag, string> = {
  pregnancy: '忌生食、酒精和高汞鱼，菜单会自动排除这类菜',
  growingChild: '正在长身体，优先蛋白质和钙',
  seniorLight: '口味清淡、少油少盐',
};

/** 性别的规范顺序（表单里的排列顺序），与 `labels.ts` 那些表同一个思路：只写一处。 */
export const SEXES: Sex[] = ['male', 'female'];

/**
 * 性别的中文名。**不**并进 `MEMBER_TAG_LABELS` —— `sex` 不是 `MemberTag`，它不参与任何标签规则，
 * 只参与参考摄入量取值（男 18–29 岁轻身体活动 2150 千卡 vs 女 1700）。
 */
export const SEX_LABELS: Record<Sex, string> = { male: '男', female: '女' };

/**
 * 孕周的可填范围。40 周之后不叫孕期，1 周之前不存在 —— 超出范围的值当「没填」丢掉，而不是夹到边界：
 * 把 45 夹成 40 等于替用户编了一个「孕晚期」，而丢掉只会退回孕中期兜底，那是界面上写明的口径。
 */
export const PREGNANCY_WEEK_MIN = 1;
export const PREGNANCY_WEEK_MAX = 40;

/** 勾了「孕期」。`pregnancyWeek` 只在它为真时有意义（见 `pregnancyWeekOf`）。 */
export function isPregnant(member: Member): boolean {
  return member.special.includes('pregnancy');
}

/** 孕周；没勾孕期或没填时是 `undefined`，调用方按孕中期兜底并写明。 */
export function pregnancyWeekOf(member: Member): number | undefined {
  return isPregnant(member) ? member.pregnancyWeek : undefined;
}

/**
 * 慢性代谢疾病，可多选。勾上就按 `diet` 的四维分级做硬性排除，与孕期同一套机制。
 *
 * 顺序就是界面与文案的优先级顺序（`adviceKeysFor`），从「最该被说出来」往下排。
 */
export const METABOLIC_TAGS: MetabolicTag[] = [
  'gout',
  'insulinResistance',
  'hypertension',
  'hyperlipidemia',
  'ckd',
];

/**
 * Chip 上的短名。括号里的解释（如「糖尿病前期」）放在 `METABOLIC_TAG_HINTS` 里，因为长标签在
 * Chip 里会折行。
 */
export const METABOLIC_TAG_LABELS: Record<MetabolicTag, string> = {
  gout: '痛风',
  insulinResistance: '胰岛素抵抗',
  hypertension: '高血压',
  hyperlipidemia: '高血脂',
  ckd: '慢性肾病',
};

export const METABOLIC_TAG_HINTS: Record<MetabolicTag, string> = {
  gout: '高尿酸，忌高嘌呤：海鲜、老火汤和内脏类会被排除',
  insulinResistance: '含糖尿病前期，忌高升糖：精制主食和含糖菜会被排除',
  hypertension: '忌高钠：重盐和发酵酱料的菜会被排除',
  hyperlipidemia: '忌高饱和脂肪：带皮禽肉、肥肉和老火汤会被排除',
  ckd: '慢性肾病按限钠处理（与高血压同口径）；蛋白、钾、磷的限量因人而异，请遵医嘱',
};

/** 表单和摘要里的完整标签顺序：特殊状态在前，代谢疾病在后。 */
export const STATUS_TAGS: MemberTag[] = [...SPECIAL_TAGS, ...METABOLIC_TAGS];

/**
 * 标签的中文名，一张表管到底。`Record<MemberTag, string>` 是硬约束：`types.ts` 里加一个新标签，
 * 这里会立刻报缺键 —— 这正是想要的（上一版就吃过「标签加了、文案没跟上」的亏）。
 */
export const MEMBER_TAG_LABELS: Record<MemberTag, string> = {
  ...GOAL_LABELS,
  ...SPECIAL_TAG_LABELS,
  ...METABOLIC_TAG_LABELS,
};

/**
 * 这位成员身上挂着的标签的名字，按 `STATUS_TAGS` 的规范顺序。
 *
 * 孕周并进「孕期」这一个标签里（「孕期（20 周）」），而不是另起一段 —— 摘要里 2–4 个标签已经很长，
 * 单开一节会让「孕 20 周」看起来像第四个标签。填了才有括号。
 */
function tagLabelsOf(member: Member): string[] {
  return STATUS_TAGS.filter((tag) => member.special.includes(tag)).map((tag) => {
    if (tag === 'pregnancy') {
      const week = pregnancyWeekOf(member);
      return week === undefined
        ? SPECIAL_TAG_LABELS.pregnancy
        : `${SPECIAL_TAG_LABELS.pregnancy}（${week} 周）`;
    }
    return MEMBER_TAG_LABELS[tag];
  });
}

/**
 * 代谢疾病标签下方那行小字。写在 `members.ts` 而不是各页面里，两处（录入页与详情页）共用一份。
 */
export const DISEASE_DISCLAIMER = '饮食建议仅供参考，具体遵医嘱';

/** 这位成员有没有勾任何代谢疾病 —— 详情页据此决定要不要显示免责提示。 */
export function hasMetabolicTag(member: Member): boolean {
  return METABOLIC_TAGS.some((tag) => member.special.includes(tag));
}

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
    ...tagLabelsOf(member),
  ];
  return parts.join(' · ');
}

/**
 * 该成员参与规则的身份键，按优先级排列：
 * 孕期 > 幼儿 > 痛风 > 胰岛素抵抗 > 高血压 > 高血脂 > 慢性肾病 > 发育期儿童 > 减脂 > 增肌 > 长辈清淡 > 均衡。
 *
 * 排除规则检查**所有**键（安全从严），文案只取第一个有内容的键（不啰嗦）。永不为空 ——
 * 体重方向兜在最后。
 *
 * 疾病排在 `growingChild` 之前，是因为「卡片上那一行」只放得下一句（`pickAdvice` 取第一个有内容的
 * 键）：一位发育期的痛风孩子，该先看到的是「嘌呤低」而不是「蛋白质够不够」。
 */
export function adviceKeysFor(member: Member): AdviceKey[] {
  const goal = bodyTagOf(member);
  const keys: AdviceKey[] = [];
  if (member.special.includes('pregnancy')) keys.push('pregnancy');
  if (isToddler(member)) keys.push('toddler');
  for (const tag of METABOLIC_TAGS) {
    if (member.special.includes(tag)) keys.push(tag);
  }
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

/**
 * 性别不填就**不填**（`undefined`），没有「默认值」可言 —— 见 `Sex`。旧数据里没有这个字段，
 * 和 `medical` 一样是可选新增，读出来就是 `undefined`。
 */
function readSex(value: unknown): Sex | undefined {
  return SEXES.includes(value as Sex) ? (value as Sex) : undefined;
}

/** 超出 1–40 或非整数一律丢掉（当没填），理由见 `PREGNANCY_WEEK_MIN`。 */
function readPregnancyWeek(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const week = Math.trunc(value);
  if (week < PREGNANCY_WEEK_MIN || week > PREGNANCY_WEEK_MAX) return undefined;
  return week;
}

function readSpecial(value: unknown): MemberTag[] {
  if (!Array.isArray(value)) return [];
  // Normalizing against `STATUS_TAGS` (not just the special states) is what lets disease tags survive
  // a round-trip through storage.
  return STATUS_TAGS.filter((tag) => value.includes(tag));
}

/** 体检异常文本的上限。再长也没有信息量，只会挤掉 prompt 里别的上下文。 */
const MEDICAL_MAX_LENGTH = 200;

/**
 * 体检指标异常是自由文本，**只进 prompt**（见 `Member.medical`）。归一放在这里、而不是发请求前，
 * 是为了让「存下来的」和「发出去的」永远是同一个值 —— 否则界面上看到的和模型读到的可以不一样。
 *
 * 换行/制表/控制字符压成一个空格、反引号直接删掉：这段文本会原样插进 prompt，多一行就可能被读成
 * 新的一条指令，反引号则可能是代码块围栏。**不**试图在这里做任何语义过滤（比如认出「尿酸」就加个
 * 痛风标签）—— 猜错了要么漏排要么多排，那是 `special` 该干的事，用户自己勾。
 */
function readMedical(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value
    .replace(/\p{Cc}/gu, ' ')
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > 0 ? cleaned.slice(0, MEDICAL_MAX_LENGTH) : undefined;
}

function readMember(value: unknown): Member | null {
  if (!isRecord(value)) return null;
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  // A member without a 称呼 is unusable: the UI has nothing to show and the 兼顾说明 has no subject.
  if (name.length === 0) return null;
  const special = readSpecial(value.special);
  return {
    id: typeof value.id === 'string' && value.id.length > 0 ? value.id : createMemberId(),
    name,
    age: readAge(value.age),
    goal: readGoal(value.goal),
    special,
    sex: readSex(value.sex),
    // 勾了孕期才留孕周：没勾的一律丢掉，免得取消勾选后那个数字还躺在存储里，下次勾回来又冒出来。
    pregnancyWeek: special.includes('pregnancy') ? readPregnancyWeek(value.pregnancyWeek) : undefined,
    medical: readMedical(value.medical),
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
