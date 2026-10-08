import { SPICY_EXCLUSION_REASON, SPICY_HARD_EXCLUDE_KEYS, isHighOil, isProteinRich } from './diet';
import { GOAL_LABELS } from './labels';
import { SPECIAL_TAG_LABELS, adviceKeysFor } from './members';
import { RECIPES } from './recipes';
import type { AdviceKey, Member, Profile, Recipe } from './types';

/**
 * Saying *why*: which dishes a household cannot eat, and how to describe a dish to the members
 * who can.
 *
 * Two kinds of text per member:
 * - hand-written on the recipe (`care` / `cautions`, keyed by member tag),
 * - otherwise a template derived from the dish's own numbers — never a claim the data cannot back,
 *   which is why `cautions` has no blanket fallback (an invented warning is worse than none).
 *
 * `{name}` in either kind is replaced with the member's 称呼, so one line can read 「高蛋白，爸爸长身体」.
 */

export const ADVICE_KEY_LABELS: Record<AdviceKey, string> = {
  ...GOAL_LABELS,
  ...SPECIAL_TAG_LABELS,
  toddler: '幼儿',
};

/** 超过这个人数就不再逐个点名，免得「兼顾说明」撑满整屏。 */
const CARE_LIMIT = 3;

/** 硬性排除的原因，只看安全；口味偏好永远只降权，不在这里。 */
function exclusionReason(recipe: Recipe, key: AdviceKey): string | undefined {
  if (recipe.spice === 'hot' && SPICY_HARD_EXCLUDE_KEYS.includes(key)) {
    return SPICY_EXCLUSION_REASON;
  }
  return recipe.exclusions?.[key];
}

export function isExcluded(recipe: Recipe, profile: Profile): boolean {
  return profile.members.some((member) =>
    adviceKeysFor(member).some((key) => exclusionReason(recipe, key) !== undefined),
  );
}

/** 去重的短原因，如 `['重辣']` —— 给「我的」页和详情页的徽标用。 */
export function exclusionLabels(recipe: Recipe, profile: Profile): string[] {
  const labels: string[] = [];
  for (const member of profile.members) {
    for (const key of adviceKeysFor(member)) {
      const reason = exclusionReason(recipe, key);
      if (reason && !labels.includes(reason)) labels.push(reason);
    }
  }
  return labels;
}

/** 带称呼的原因，如 `['宝宝不吃重辣']` —— 给今日页那句「已排除 …」用。 */
export function exclusionReasons(recipe: Recipe, profile: Profile): string[] {
  const reasons: string[] = [];
  for (const member of profile.members) {
    for (const key of adviceKeysFor(member)) {
      const reason = exclusionReason(recipe, key);
      if (!reason) continue;
      const text =
        reason === SPICY_EXCLUSION_REASON ? `${member.name}不吃${reason}` : `${member.name}忌${reason}`;
      if (!reasons.includes(text)) reasons.push(text);
    }
  }
  return reasons;
}

/** 这一家吃不到的菜，按 `RECIPES` 的顺序。整页算一次，别放进每张卡片的渲染里。 */
export function excludedRecipes(profile: Profile): { recipe: Recipe; reasons: string[] }[] {
  return RECIPES.filter((recipe) => isExcluded(recipe, profile)).map((recipe) => ({
    recipe,
    reasons: exclusionReasons(recipe, profile),
  }));
}

/**
 * 手写优先：先在键位列表里找第一个手写过的键；都没有，再按优先级找第一个能推导出模板的键。
 * 两趟是有意的 —— 否则「孕期有模板、减脂手写过」会让那条更好的手写文案被模板盖掉。
 */
function pickAdvice(
  keys: AdviceKey[],
  handwritten: Partial<Record<AdviceKey, string>> | undefined,
  template: (key: AdviceKey) => string | undefined,
): { key: AdviceKey; text: string } | undefined {
  for (const key of keys) {
    const text = handwritten?.[key];
    if (text) return { key, text };
  }
  for (const key of keys) {
    const text = template(key);
    if (text) return { key, text };
  }
  return undefined;
}

function fillName(text: string, name: string): string {
  return text.split('{name}').join(name);
}

function careTemplate(recipe: Recipe, key: AdviceKey): string {
  switch (key) {
    case 'pregnancy':
      return '{name}可以吃，这道菜没有孕期禁忌的食材';
    case 'toddler':
      return recipe.spice === 'none'
        ? '不辣，{name}可以跟着一起吃'
        : '微辣，{name}那份少放辣椒';
    case 'growingChild':
      return isProteinRich(recipe)
        ? `蛋白质 ${recipe.protein} 克，{name}长身体`
        : '有菜有主食，{name}盛半份刚好';
    case 'fatLoss':
      return recipe.oilLevel === 'low'
        ? '少油做法，{name}减脂能吃'
        : '热量不高，{name}主食少盛一点';
    case 'muscleGain':
      return isProteinRich(recipe)
        ? `蛋白质 ${recipe.protein} 克，{name}增肌够用`
        : '蛋白质一般，{name}另外补个蛋或奶';
    case 'seniorLight':
      return isHighOil(recipe) ? '油稍多，{name}少蘸汤汁' : '清淡好入口，{name}吃着合适';
    case 'balanced':
      return '荤素搭配，{name}吃着正好';
  }
}

/**
 * 只能靠菜谱本身推出来的提醒；推不出来就返回 `undefined`（宁可不写，也不编）。
 * 有幼儿的家庭里重辣菜已被排除，所以 `'mild'` 是幼儿唯一会碰到的辣度。
 */
function cautionTemplate(recipe: Recipe, key: AdviceKey): string | undefined {
  if (key === 'toddler' && recipe.spice === 'mild') {
    return '辣椒可以不放，{name}那份先盛出来再拌辣';
  }
  if (key === 'seniorLight' && isHighOil(recipe)) {
    return '油和盐偏多，{name}少喝汤汁';
  }
  return undefined;
}

/**
 * 今日页的「兼顾说明」：每位成员一句，用「；」连起来。成员一个都没有时返回空串（界面据空串不渲染）。
 */
export function careLine(recipe: Recipe, profile: Profile): string {
  if (profile.members.length === 0) return '';
  const segments = profile.members
    .slice(0, CARE_LIMIT)
    .map((member) => careSegment(recipe, member));
  const rest = profile.members.length - segments.length;
  if (rest > 0) segments.push(`还有 ${rest} 位家人`);
  return segments.join('；');
}

function careSegment(recipe: Recipe, member: Member): string {
  const picked = pickAdvice(adviceKeysFor(member), recipe.care, (key) => careTemplate(recipe, key));
  // `adviceKeysFor` 永不为空且 `careTemplate` 对每个键都有话可说，所以 `??` 只是全函数兜底。
  const text = picked?.text ?? careTemplate(recipe, 'balanced');
  return fillName(text, member.name);
}

export interface Caution {
  /** 成员的称呼。 */
  name: string;
  /** 是因为哪个身份提醒的，如「孕期」。 */
  tag: string;
  text: string;
}

/** 详情页的「注意事项」：只列真的写了或真的能推出来的提醒，可能为空。 */
export function cautions(recipe: Recipe, profile: Profile): Caution[] {
  const out: Caution[] = [];
  for (const member of profile.members) {
    const picked = pickAdvice(adviceKeysFor(member), recipe.cautions, (key) =>
      cautionTemplate(recipe, key),
    );
    if (!picked) continue;
    out.push({
      name: member.name,
      tag: ADVICE_KEY_LABELS[picked.key],
      text: fillName(picked.text, member.name),
    });
  }
  return out;
}
