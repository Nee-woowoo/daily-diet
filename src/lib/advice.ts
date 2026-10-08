import {
  SPICY_EXCLUSION_REASON,
  SPICY_HARD_EXCLUDE_KEYS,
  diseaseRule,
  isHighOil,
  isProteinRich,
  type DietLevel,
} from './diet';
import { MEMBER_TAG_LABELS, adviceKeysFor } from './members';
import { RECIPES } from './recipes';
import type { AdviceKey, Member, MetabolicTag, Profile, Recipe } from './types';

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
 *
 * 慢性代谢疾病走的是同一条路，只是两个出口分工明确：**「兼顾说明」说能怎么吃**（今日页只会出现
 * 没被排除的菜），**「注意事项」说不该吃和要当心什么**（详情页从菜谱库也进得来，会看到被排除的菜）。
 */

/** 用 `MEMBER_TAG_LABELS` 拼而不是各标签表各拼一次：加一个标签，这里自动就有中文名。 */
export const ADVICE_KEY_LABELS: Record<AdviceKey, string> = {
  ...MEMBER_TAG_LABELS,
  toddler: '幼儿',
};

/** 超过这个人数就不再逐个点名，免得「兼顾说明」撑满整屏。 */
const CARE_LIMIT = 3;

/**
 * 每位成员在详情页最多两条提醒。
 *
 * 以前是「每位成员一条」，改成多条是因为疾病提醒会被别的身份吃掉 —— 一位「孕期 + 痛风」的成员，
 * 痛风的提醒不该因为孕期的提醒排在前面就消失。但也不能不封顶：称呼替换之后每句话都不一样（去重
 * 帮不上忙），四口人各带两三个标签能刷出十几行。
 */
const CAUTION_LIMIT_PER_MEMBER = 2;

/** 硬性排除的原因，只看安全；口味偏好永远只降权，不在这里。 */
function exclusionReason(recipe: Recipe, key: AdviceKey): string | undefined {
  if (recipe.spice === 'hot' && SPICY_HARD_EXCLUDE_KEYS.includes(key)) {
    return SPICY_EXCLUSION_REASON;
  }
  // 疾病是**按成员的身份键**判的：这里收到什么键才查什么病，不是无条件地问「这道菜钠高吗」。
  const disease = diseaseRule(recipe, key);
  if (disease?.level === 'high') return disease.reason;
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

/**
 * 高血压与慢性肾病的「兼顾说明」共用一套词：这两个标签在规则上就是同一个口径（都看钠）。
 * 慢性肾病**独有**的那句话在 `CKD_CAUTION` 里，走详情页，不在这里重复三遍。
 */
const SODIUM_CARE: Record<DietLevel, string> = {
  low: '盐分不高，{name}按平常份量吃',
  medium: '盐分中等，{name}少喝汤汁、蘸料少蘸',
  // 高等级到不了今日页（那道菜已被排除），写出来只是为了让这张表是全的。
  high: '盐分偏高，{name}这道别吃',
};

/**
 * 疾病在「兼顾说明」里的一句话，按等级分岔。
 *
 * 措辞上有三条硬规矩：不出现「降/控制/治疗/预防」这类疗效承诺；不写「可以放心吃」这种一票放行
 * 的话；一律限定在「这一道菜」上，不说成对这位成员整体的结论。
 */
const DISEASE_CARE: Record<MetabolicTag, Record<DietLevel, string>> = {
  gout: {
    low: '嘌呤偏低，{name}按平常份量吃就行',
    medium: '嘌呤中等，{name}这道少吃两口，汤别喝',
    high: '嘌呤偏高，{name}这道别吃',
  },
  insulinResistance: {
    low: '这道的升糖负担轻，{name}配着菜慢慢吃',
    medium: '升糖偏快，{name}主食减半，先吃菜再吃饭',
    high: '升糖偏快，{name}这道的主食换粗粮，或者换一道',
  },
  hypertension: SODIUM_CARE,
  ckd: SODIUM_CARE,
  hyperlipidemia: {
    low: '油脂清淡，{name}按平常份量吃',
    medium: '油脂偏多，{name}浅尝即可，别泡汤汁',
    high: '油脂偏多，{name}这道别吃',
  },
};

/**
 * 慢性肾病的恒提醒：不分菜的等级，详情页每道菜都会出现。
 *
 * 钾、磷、蛋白质的限量按分期和化验结果定，本应用没有这些数据 —— 与其按一个笼统的比例算，不如每次
 * 都把这件事交回医嘱，并且明说只有钠这一项是本应用真的看过的。
 */
const CKD_CAUTION = '{name}的肾病饮食要按医生定的钾、磷、蛋白质来安排，这一份只作参考';

/**
 * 疾病在详情页「注意事项」里的一句话。
 *
 * 低等级是 `undefined`（今日页那句正向的话就够了），只有慢性肾病恒有话说；所以每道菜最多只会多出
 * 一条疾病提醒，不会把这张卡撑爆。
 */
const DISEASE_CAUTION: Record<MetabolicTag, Record<DietLevel, string | undefined>> = {
  gout: {
    low: undefined,
    medium: '这份嘌呤中等，{name}急性发作期别吃，汤别喝',
    high: '这份嘌呤偏高，{name}不建议吃',
  },
  insulinResistance: {
    low: undefined,
    medium: '这份升糖偏快，{name}主食换成糙米或杂粮饭',
    high: '这份的升糖负担重，{name}建议换一道',
  },
  hypertension: {
    low: undefined,
    medium: '这份盐分中等，{name}少喝汤汁、蘸料少蘸',
    high: '这份含盐偏高，{name}建议换一道',
  },
  hyperlipidemia: {
    low: undefined,
    medium: '这份油脂偏多，{name}挑瘦的吃，别泡汤汁',
    high: '这份饱和脂肪偏多，{name}不建议吃',
  },
  ckd: { low: CKD_CAUTION, medium: CKD_CAUTION, high: CKD_CAUTION },
};

/**
 * 疾病键的等级。`?? 'low'` 走不到：这五个 case 标签就是疾病键，`DISEASE_RULES` 里都有它们 ——
 * 留着是为了不改 `diseaseRule` 的签名（它对非疾病键必须返回 `undefined`）。
 */
function diseaseLevel(recipe: Recipe, key: MetabolicTag): DietLevel {
  return diseaseRule(recipe, key)?.level ?? 'low';
}

function isDiseaseKey(key: AdviceKey): key is MetabolicTag {
  return (
    key === 'gout' ||
    key === 'insulinResistance' ||
    key === 'hypertension' ||
    key === 'hyperlipidemia' ||
    key === 'ckd'
  );
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
    // 这五个 case 是穷尽 `AdviceKey` 的一部分：`types.ts` 里再加一个标签，这里会立刻报
    // 「函数没有全部返回值」，当成清单用。
    case 'gout':
    case 'insulinResistance':
    case 'hypertension':
    case 'hyperlipidemia':
    case 'ckd':
      return DISEASE_CARE[key][diseaseLevel(recipe, key)];
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
  if (isDiseaseKey(key)) {
    return DISEASE_CAUTION[key][diseaseLevel(recipe, key)];
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

/**
 * 同 `pickAdvice`，但最多取 `limit` 条，手写的那一趟仍然整体优先。
 *
 * 两趟而不是一趟：一位成员可能既有手写的孕期提醒、又有推导出来的痛风提醒，手写的那条不该因为
 * 排在后面就被挤掉。
 */
function pickAdviceList(
  keys: AdviceKey[],
  handwritten: Partial<Record<AdviceKey, string>> | undefined,
  template: (key: AdviceKey) => string | undefined,
  limit: number,
): { key: AdviceKey; text: string }[] {
  const picks: { key: AdviceKey; text: string }[] = [];
  const push = (key: AdviceKey, text: string | undefined) => {
    if (!text || picks.length >= limit) return;
    if (picks.some((pick) => pick.text === text)) return;
    picks.push({ key, text });
  };
  for (const key of keys) push(key, handwritten?.[key]);
  for (const key of keys) push(key, template(key));
  return picks;
}

/**
 * 详情页的「注意事项」：只列真的写了或真的能推出来的提醒，可能为空。
 *
 * 每位成员最多 `CAUTION_LIMIT_PER_MEMBER` 条，按 `adviceKeysFor` 的优先级取（安全 > 疾病 > 偏好），
 * 所以「孕期 + 痛风」的成员两条都拿得到，而勾了五个病的人也不会刷出五行。
 */
export function cautions(recipe: Recipe, profile: Profile): Caution[] {
  const out: Caution[] = [];
  for (const member of profile.members) {
    const picked = pickAdviceList(
      adviceKeysFor(member),
      recipe.cautions,
      (key) => cautionTemplate(recipe, key),
      CAUTION_LIMIT_PER_MEMBER,
    );
    for (const pick of picked) {
      out.push({
        name: member.name,
        tag: ADVICE_KEY_LABELS[pick.key],
        text: fillName(pick.text, member.name),
      });
    }
  }
  return out;
}
