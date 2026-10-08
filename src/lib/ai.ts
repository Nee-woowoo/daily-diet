import { ADVICE_KEY_LABELS, exclusionReasons, isExcluded } from './advice';
import { OIL_LIMIT_ML, looksRawByName, repairLabels } from './diet';
import { CATEGORY_ORDER, MEAL_SLOTS, MEAL_SLOT_LABELS, PREFERENCE_LABELS } from './labels';
import { adviceKeysFor, householdPortions, isToddler, memberSummaryLabel } from './members';
import { missingIngredients } from './planner';
import type {
  AdviceKey,
  DayPlan,
  FridgeItem,
  Ingredient,
  IngredientCategory,
  IngredientUnit,
  MealSlot,
  Member,
  Profile,
  Recipe,
  SpiceLevel,
  StapleServing,
} from './types';

/**
 * 接 DeepSeek 这条链路里所有**不碰网络**的部分：拼 prompt、容错解析、校验、归一化。
 *
 * 纯函数（`Math.random` 只用来生成 id，便于每次生成的 id 都不同），所以整套能在 node harness 里
 * 逐句断言 —— 网络那一半（`deepseek.ts`）因此薄到只剩 fetch + 状态码映射。不 import React，也不
 * import `theme.ts`（`labels.ts:1` 对它的 import 是 type-only，编译时会整句擦掉）。
 *
 * 与本地生成的关系：**这条链路只产生 `Recipe`**，一旦落进 `DayPlan`，今日页、详情页、购物清单就再也
 * 分不出它和内置 16 道菜的区别（这正是需求 9）。分不出的前提是它能被 `getRecipe` 解析到 —— 见
 * `recipes.setCustomRecipes` 上那条不变式。
 */

const AI_ID_PREFIX = 'ai-';

/** 今日页顶部那行小字。放在这里而不是页面里：详情页也要显示同一句。 */
export const AI_DISCLAIMER = '本菜单由 AI 生成，仅供参考，特殊疾病请遵医嘱';

/**
 * 没配 Key 时按钮下方那行小字。不是错误 —— 本地规则照常工作。
 *
 * 说的是**下一次生成**会走哪条路，而不是「当前这份菜单是怎么来的」：清掉 Key 之后屏幕上那份 AI
 * 菜单仍然开着（缓存照读），写成「当前使用本地规则」会和同一页的 AI 免责小字自相矛盾。
 */
export const NO_KEY_HINT = '重新生成时会用本地规则；配置 AI 密钥可让 AI 设计菜单（我的 · AI 设置）';

/** 这道菜是不是 AI 生成的（角标、免责小字、`aiCare` 都靠它判断）。 */
export function isAiRecipe(recipe: Recipe): boolean {
  return recipe.id.startsWith(AI_ID_PREFIX);
}

/* ------------------------------------------------------------------ *
 * 硬约束：进 prompt 的禁忌，按成员的身份键查
 * ------------------------------------------------------------------ */

/**
 * 每个身份键对模型说的一句硬约束。**`Record<AdviceKey, string>` 是有意的**：`types.ts` 里加一个新
 * 标签，这里立刻报缺键 —— 漏一条就是一条禁忌没告诉模型。
 *
 * 文案写「不得/不用」而不是「少吃」，因为这些句子会被上面那句「违反的菜单会被程序丢弃」罩住，
 * 而下面的本地校验也是按同一个口径判的：`diet.DISEASE_RULES` 只在**高**档才排除。
 */
export const HARD_CONSTRAINTS: Record<AdviceKey, string> = {
  pregnancy: '不得出现生食或半生（刺身、溏心蛋、生腌、未杀菌奶）、酒精，以及鲨鱼/旗鱼/剑鱼这类高汞鱼',
  toddler: '不得重辣；不得生食；坚果必须碾碎或不出现；不出现整颗葡萄、整颗圣女果这类容易噎住的食材',
  gout: '不得使用动物内脏、海鲜（虾、蟹、贝、蛤、蚝、鱿鱼、鱼）、浓肉汤与久煮的骨汤',
  insulinResistance: '不出现精制糖（白糖、蜂蜜、糖浆）与含糖饮料；主食必须低 GI（糙米、杂粮、燕麦、荞麦），不用白米饭、白面',
  hypertension: '不用腌制品、豆瓣酱、腐乳、咸菜、腊味、火腿；每道菜的盐不超过 2 克',
  hyperlipidemia: '不用肥肉、五花肉、带皮禽肉、动物油、黄油与加工肉',
  ckd: '限钠（与高血压同口径）；蛋白质不过量',
  growingChild: '保证优质蛋白与钙',
  seniorLight: '少油少盐、软烂易嚼',
  fatLoss: '每人份不超过 500 千卡，少油',
  muscleGain: '每人份蛋白质不低于 25 克',
  balanced: '荤素搭配，主食不缺',
};

/* ------------------------------------------------------------------ *
 * 失败：网络那一半和解析这一半共用一套 kind，界面只认 message
 * ------------------------------------------------------------------ */

export type AiFailureKind =
  | 'no-key'
  | 'network'
  | 'timeout'
  | 'auth'
  | 'balance'
  | 'rate'
  | 'server'
  | 'http'
  | 'empty'
  | 'truncated'
  | 'parse'
  | 'schema'
  | 'taboo'
  | 'cancelled';

export interface AiFailure {
  kind: AiFailureKind;
  /** 直接显示给用户的一句话。 */
  message: string;
  /** `cancel` 与「没配 Key」不算失败，其余都值得让用户再点一次。 */
  retryable: boolean;
}

/** 只有这两种不是「再试一次就能好」的运维问题，也都不该在界面上显示成错误卡。 */
const NON_RETRYABLE: AiFailureKind[] = ['no-key', 'cancelled'];

const FAILURE_MESSAGES: Record<AiFailureKind, string> = {
  'no-key': '还没配置 AI 密钥，当前用本地规则生成',
  network: '网络连接失败，请检查网络后重试',
  timeout: '生成超时（超过 60 秒），请重试',
  auth: 'API Key 无效或没有权限，请到「我的 · AI 设置」检查',
  balance: 'DeepSeek 账户余额不足，请充值或改用本地规则',
  rate: '请求太频繁，请稍后重试',
  server: 'DeepSeek 服务暂时不可用，请重试',
  http: 'DeepSeek 返回错误，请重试',
  empty: '模型没有返回内容，请重试',
  truncated: '模型输出被截断，请重试',
  parse: '模型返回的格式无法解析，请重试',
  schema: '模型返回的菜单不完整，已丢弃',
  taboo: '模型给的菜与家人禁忌冲突，已丢弃',
  cancelled: '已取消',
};

/** `detail` 会拼在句尾的括号里，例如「已丢弃（「清炒虾仁」爸爸忌高嘌呤）」。 */
export function failure(kind: AiFailureKind, detail?: string): AiFailure {
  return {
    kind,
    message: detail ? `${FAILURE_MESSAGES[kind]}（${detail}）` : FAILURE_MESSAGES[kind],
    retryable: !NON_RETRYABLE.includes(kind),
  };
}

/**
 * HTTP 状态码 → kind。
 *
 * 只按状态码分组，**不解析响应体里的错误文案**：DeepSeek 的文档在这个环境里读不到，凭记忆去认
 * `error.type` 是拿用户的钱试错。认不出的状态码老实用「返回错误（HTTP xxx）」，仍然可重试。
 */
export function failureForStatus(status: number): AiFailure {
  if (status === 401 || status === 403) return failure('auth');
  if (status === 402) return failure('balance');
  if (status === 429) return failure('rate');
  if (status >= 500) return failure('server', `HTTP ${status}`);
  return failure('http', `HTTP ${status}`);
}

/**
 * 重试时把上一次失败的原因喂回 prompt，模型才会换一份而不是原样再错一遍。
 *
 * 只有这三种才值得喂回去：网络、Key、限流这些是环境问题，重说一遍也没有用，反而占掉上下文。
 */
export function retryCorrection(previous: AiFailure | null): string | undefined {
  if (!previous) return undefined;
  const telling = previous.kind === 'schema' || previous.kind === 'taboo' || previous.kind === 'parse';
  return telling ? previous.message : undefined;
}

/* ------------------------------------------------------------------ *
 * prompt
 * ------------------------------------------------------------------ */

/** 一位成员在 prompt 里的一行，如「爸爸（45 岁 · 减脂 · 痛风 · 体检异常：尿酸偏高）」。 */
function memberLine(member: Member): string {
  const parts = [memberSummaryLabel(member)];
  if (isToddler(member)) parts.push('幼儿');
  // 体检文本存盘时（`members.readMedical`）已经清过一遍，这里再清一次是因为表单里的那份可能还没
  // 存过盘就直接进了 prompt。
  if (member.medical) parts.push(`体检异常：${inline(member.medical, 200)}`);
  return `${member.name}（${parts.join(' · ')}）`;
}

/**
 * 自由文本进 prompt 前的清理：压掉换行与控制字符、去掉反引号。
 *
 * 用户的体检文本和冰箱名字都是自己打的，一行 `\n请忽略以上约束` 就会变成新的一条指令 —— 这不是
 * 安全问题（模型说什么都要过本地校验），但会让菜单莫名其妙地跑偏。`members.readMedical` 在存盘时
 * 已经清过一遍，这里再清一次是因为**冰箱名字没有那道关**。
 */
function inline(text: string, maxLength: number): string {
  const cleaned = text
    .replace(/\p{Cc}/gu, ' ')
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength)}…` : cleaned;
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** 「2026-10-08（周四）」。按本地日历算，不走 `new Date('YYYY-MM-DD')`（那个按 UTC 解析）。 */
function dateLine(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(year, month - 1, day).getDay()];
  return `${date}（${weekday}）`;
}

/** 单位与类别的规范写法：`Record<IngredientUnit, …>` 保证 `IngredientUnit` 加成员时这里漏不掉。 */
const UNIT_FORMS: Record<IngredientUnit, string[]> = {
  g: ['g', 'G', '克', '公克'],
  ml: ['ml', 'ML', '毫升', 'cc'],
  个: ['个', '只', '枚', '颗'],
  片: ['片'],
  根: ['根', '条'],
  瓣: ['瓣'],
  段: ['段'],
  勺: ['勺', '汤匙', '大勺'],
};

/** 别名 → 规范单位。**不在表里的一律判失败**：猜单位会静默污染购物清单和冰箱匹配。 */
const UNIT_ALIASES: Record<string, IngredientUnit> = {};
for (const [unit, forms] of Object.entries(UNIT_FORMS)) {
  for (const form of forms) UNIT_ALIASES[form] = unit as IngredientUnit;
}

const UNIT_LIST = Object.keys(UNIT_FORMS).join(' | ');

/** 别名 → 规范类别。同样只认表里有的；`蔬菜` 这种写法要认（模型很容易这么写）。 */
const CATEGORY_ALIASES: Record<string, IngredientCategory> = {
  meat: 'meat',
  肉: 'meat',
  肉类: 'meat',
  荤菜: 'meat',
  veg: 'veg',
  菜: 'veg',
  蔬菜: 'veg',
  素菜: 'veg',
  egg: 'egg',
  蛋: 'egg',
  蛋类: 'egg',
  蛋奶: 'egg',
  staple: 'staple',
  主食: 'staple',
  主食类: 'staple',
  seasoning: 'seasoning',
  调味: 'seasoning',
  调料: 'seasoning',
  调味料: 'seasoning',
};

/** 调味料的名字 ↔ 单位必须配对的组。单位写错会让 `diet` 的钠档与油档读不到它 —— 见 `SCHEMA_SPEC`。 */
const SEASONING_UNIT_RULES: { pattern: RegExp; unit: IngredientUnit; what: string }[] = [
  { pattern: /生抽|老抽|酱油|蚝油|豉油/, unit: '勺', what: '酱油类' },
  { pattern: /^盐$|^食盐$/, unit: 'g', what: '盐' },
  { pattern: /^食用油$|^花生油$|^菜籽油$|^玉米油$/, unit: 'ml', what: '食用油' },
];

const SCHEMA_SPEC = `{
  "meals": [
    {
      "slot": "breakfast",
      "name": "小米南瓜粥",
      "minutes": 25,
      "calories": 320,
      "protein": 9,
      "oilLevel": "low",
      "spice": "none",
      "raw": false,
      "ingredients": [
        { "name": "小米", "amount": 50, "unit": "g", "category": "staple", "optional": false },
        { "name": "南瓜", "amount": 150, "unit": "g", "category": "veg" }
      ],
      "seasonings": [
        { "name": "盐", "amount": 1, "unit": "g" }
      ],
      "staple": null,
      "steps": ["小米洗净，南瓜去皮切块。", "加水大火煮开，转小火 20 分钟。"],
      "care": "低嘌呤，适合爸爸痛风；主食用了小米，妈妈控糖友好",
      "missing": ["南瓜"],
      "tip": "提前泡 20 分钟更软糯"
    }
  ],
  "missingSummary": [
    { "name": "南瓜", "amount": 150, "unit": "g" }
  ]
}`;

function buildSystem(profile: Profile): string {
  const sections: string[] = [];

  sections.push(
    '你是中国家庭的菜谱设计师。',
    '只输出 json：不要解释文字，不要 markdown 代码块，不要前后缀 —— json 之外多一个字符都会被程序判为失败。',
  );

  // 排在最前面的**生成原则**：先是一道真的菜，再谈别的。
  //
  // 这一条放在【硬约束】之前是有意的：约束说的是「不能放什么」，这一段说的是「必须是道真实的菜」。
  // 顺序上先定「这是道什么菜」，再拿禁忌去筛，模型才不会为了绕开禁忌而临时编一道谁也没见过的搭配。
  // 拿不准就换一道，比硬凑一道更划算 —— 硬凑出来的菜在饭桌上没法执行。
  sections.push(
    [
      '【第一优先级：只做真实存在的菜】',
      '- 只生成**真实存在、常见的中式家常菜**：有固定做法、在饭桌上叫得出名字的那种（番茄炒蛋、青椒炒蛋、冬瓜排骨汤、清炒时蔬）。',
      '- **禁止发明不存在的搭配**。为了把手边的食材凑成一个菜，把不相干的食材硬炖、硬煮、硬拌在一起，即使能吃也不算合格。',
      '- 判断标准只有一条：**这道菜是不是一道真的菜？** 拿不准就换一道你有把握的，宁可少用两样冰箱里的食材。',
      '- 硬约束（下一节）当然也不能违反 —— 两者冲突时换菜，不要为了绕开禁忌去编新搭配。',
    ].join('\n'),
  );

  // 只列这个家里真的出现的键。没勾的疾病不进 prompt：说一堆用不上的禁忌会稀释真正要命的那几条。
  const keys: AdviceKey[] = [];
  for (const member of profile.members) {
    for (const key of adviceKeysFor(member)) {
      if (!keys.includes(key)) keys.push(key);
    }
  }
  sections.push(
    [
      '【硬约束】',
      '以下每一条都不可违反。违反的菜单会被程序整份丢弃，然后重新生成：',
      ...keys.map((key) => `- ${ADVICE_KEY_LABELS[key]}：${HARD_CONSTRAINTS[key]}`),
    ].join('\n'),
  );

  sections.push(
    [
      '【三餐结构】',
      '- 早餐、午餐、晚餐各一道，共三道，slot 分别是 breakfast / lunch / dinner，各出现一次。',
      '- 每餐按中国家庭的正常结构搭配：一道菜（一荤或一素）＋主食。午餐和晚餐之间最好一荤一素，不要两餐都是同一类型。',
      '- 午餐和晚餐必须配主食：写进 staple 字段，并且**不要**再把同一样主食写进 ingredients。',
      '- 早餐的主食如果本来就是这道菜的一部分（粥、面、吐司），就写进 ingredients 并把 category 写成 staple，staple 留成 null。',
    ].join('\n'),
  );

  sections.push(
    [
      '【份量口径】',
      '- ingredients 与 seasonings 的 amount、calories、protein、staple.amount **全部是每人份**，不是全家总量；程序会自己按人数乘。',
      '- calories 每人份 200–800 千卡；minutes 5–90 分钟；一道菜 3–8 步。',
      '- 食材用中国家庭买菜时的名字（鲜虾、北豆腐、小油菜），因为忌口、升糖、钠、油都是从名字和 category 推出来的。',
    ].join('\n'),
  );

  sections.push(
    [
      '【取值表】表外的值会被拒绝：',
      `- unit：${UNIT_LIST}`,
      `- category：${CATEGORY_ORDER.join(' | ')}`,
      '- oilLevel：low | medium | high；spice：none | mild | hot',
      '- 调味料的单位必须固定：酱油类（生抽/老抽/蚝油）用「勺」，盐用「g」，食用油用「ml」。',
      '- raw：生食或半生必须写 true。',
    ].join('\n'),
  );

  sections.push(['【输出格式】', SCHEMA_SPEC].join('\n'));

  sections.push(
    [
      '【care 的写法】',
      '一句话，必须指名到人并说出是什么因素在照顾他，例如：低嘌呤，适合爸爸痛风；主食换成了糙米，妈妈控糖友好。',
      '如果这一餐没有特别要照顾的人，就写一句这道菜好在哪。',
    ].join('\n'),
  );

  sections.push(
    [
      '【冰箱的用法：优先考虑，不是必须用完】',
      '- 冰箱里有合适的食材就优先用上，但**「用完」不是目标**。为了清掉库存去硬凑一道菜，属于【第一优先级】禁止的编搭配。',
      '- 食材不够、或者凑在一起做不出合理的菜，就**直接按正常家常菜生成**，把缺的食材写进那一餐的 missing 数组，再汇总到 missingSummary —— 缺货清单本来就是干这个用的，缺几样完全正常。',
      '- 不必每道菜都消耗冰箱库存，也不必一天的菜都围着冰箱转；一顿饭里有一道用上了冰箱里的食材就够了。',
      '- 示例：冰箱里只有螺丝椒和鸡蛋 —— 生成「青椒炒蛋」是合理的；生成「螺丝椒炖蛋汤」是禁止的。',
    ].join('\n'),
  );

  return sections.join('\n\n');
}

function buildUser(profile: Profile, fridge: FridgeItem[], date: string, correction?: string): string {
  const lines: string[] = [];
  lines.push(`今天是 ${dateLine(date)}。一家人共 ${householdPortions(profile)} 人份。`);

  lines.push('');
  lines.push('家庭成员：');
  if (profile.members.length === 0) {
    lines.push('- 还没填成员，按一位成人算。');
  } else {
    for (const member of profile.members) lines.push(`- ${memberLine(member)}`);
  }

  lines.push('');
  const preferences = profile.preferences.map((preference) => PREFERENCE_LABELS[preference]);
  lines.push(
    preferences.length > 0 ? `全家饮食偏好：${preferences.join('、')}` : '全家饮食偏好：没有特别要求',
  );

  lines.push(
    fridge.length > 0
      ? `冰箱现有食材（供参考，不必用完）：${fridge.map((item) => `${item.name} ${item.amount}`).join('、')}`
      : '冰箱里现在没有食材，按正常家常菜生成即可。',
  );

  lines.push('');
  // user 段是模型最后读到的东西，把两条最容易走偏的原则在这里再说一遍 —— 这里写着「不必用完」，
  // 上面那段食材清单就不会被读成「今天必须把这些做完」。
  lines.push(
    '请按上面的 schema 生成今天的三餐：菜名必须是真实存在的常见中式家常菜，冰箱里的食材优先考虑、不必用完，缺的写进 missing。',
  );

  if (correction) {
    lines.push('');
    lines.push(
      `注意：上一次的返回被丢弃了，原因：${correction}。请换一份明显不同的菜单，并严格避开这个问题。`,
    );
  }

  return lines.join('\n');
}

export interface MenuPrompt {
  system: string;
  user: string;
}

/**
 * 拼出发给模型的上下文。确定性：同样的输入（除 `options`）永远得到逐字节相同的 prompt，所以
 * harness 可以对它逐句下断言。
 *
 * 冰箱的「数量」是自由文本（`FridgeItem.amount`），app 从来不用它做匹配，这里也一样 —— 它只是给
 * 模型的一个语境（「番茄 3 个」比「番茄」更像人话）。
 */
export function buildMenuPrompt(
  profile: Profile,
  fridge: FridgeItem[],
  date: string,
  options: { correction?: string } = {},
): MenuPrompt {
  return {
    system: buildSystem(profile),
    user: buildUser(
      profile,
      fridge.map((item) => ({ ...item, name: inline(item.name, 20), amount: inline(item.amount, 20) })),
      date,
      options.correction,
    ),
  };
}

/* ------------------------------------------------------------------ *
 * 容错解析
 * ------------------------------------------------------------------ */

/**
 * 从模型输出里挖出那段 json。
 *
 * 契约上它应该只输出 json，但这个契约没法强制执行：模型经常裹一层 ```json 围栏，或者在前后加一句
 * 「好的，这是您的菜单」。所以做最小限度的容错 —— 剥围栏、再从头找一个**括号配平**的 `{…}`（配平
 * 要认字符串里的括号和转义，否则菜谱里一句「加盐 1.5 g（约 1 小勺）」就会把截取截歪）。
 *
 * 刻意**不**试图修复 json 本身（单引号、尾随逗号、被截断的尾巴）：能修的往往已经被截断，接下去就是
 * 编造一份菜单。修不了就报 `parse` 让用户重试。
 */
export function extractJson(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced ? fenced[1] : text;

  const start = source.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * 校验与归一化
 * ------------------------------------------------------------------ */

/**
 * 校验代码有六层（meal → ingredient → unit → category…），逐层回传错误会把真正的错因淹掉，
 * 所以内部用异常传递、只在最外层接住。对纯函数来说这仍然没有副作用。
 */
class ShapeError extends Error {}

function shapeFail(reason: string): never {
  throw new ShapeError(reason);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return shapeFail(`${path} 不是数字`);
  if (value < min || value > max) return shapeFail(`${path} 超出 ${min}–${max}（${value}）`);
  return value;
}

function readString(value: unknown, path: string, maxLength: number): string {
  if (typeof value !== 'string') return shapeFail(`${path} 不是文本`);
  const text = value.trim();
  if (text.length === 0) return shapeFail(`${path} 是空的`);
  if (text.length > maxLength) return shapeFail(`${path} 太长`);
  return text;
}

function readTextList(value: unknown, path: string, maxCount: number): string[] {
  if (!Array.isArray(value)) return shapeFail(`${path} 不是数组`);
  if (value.length === 0) return shapeFail(`${path} 是空的`);
  if (value.length > maxCount) return shapeFail(`${path} 条目太多（${value.length}）`);
  return value.map((entry, index) => readString(entry, `${path}[${index}]`, 200));
}

function readUnit(value: unknown, path: string): IngredientUnit {
  const unit = typeof value === 'string' ? UNIT_ALIASES[value.trim()] : undefined;
  if (!unit) return shapeFail(`${path} 的单位「${String(value)}」不在允许的列表里`);
  return unit;
}

function readCategory(value: unknown, path: string): IngredientCategory {
  const category = typeof value === 'string' ? CATEGORY_ALIASES[value.trim()] : undefined;
  if (!category) return shapeFail(`${path} 的类别「${String(value)}」不在允许的列表里`);
  return category;
}

function readMealSlot(value: unknown, path: string): MealSlot {
  const slot = MEAL_SLOTS.find((entry) => entry === value);
  if (!slot) return shapeFail(`${path} 的 slot「${String(value)}」不是 breakfast/lunch/dinner`);
  return slot;
}

function readIngredients(value: unknown, path: string, opts: { seasonings: boolean }): Ingredient[] {
  if (!Array.isArray(value)) return shapeFail(`${path} 不是数组`);
  if (!opts.seasonings && value.length === 0) return shapeFail(`${path} 是空的`);
  return value.map((raw, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(raw)) return shapeFail(`${itemPath} 不是对象`);
    const name = readString(raw.name, `${itemPath}.name`, 30);
    const unit = readUnit(raw.unit, itemPath);
    const category = opts.seasonings ? 'seasoning' : readCategory(raw.category, itemPath);
    if (opts.seasonings) {
      for (const rule of SEASONING_UNIT_RULES) {
        if (rule.pattern.test(name) && unit !== rule.unit) {
          return shapeFail(`${itemPath}：${rule.what}「${name}」的单位要写成 ${rule.unit}，不是 ${unit}`);
        }
      }
    }
    const ingredient: Ingredient = {
      name,
      amount: readNumber(raw.amount, `${itemPath}.amount`, 0.1, 2000),
      unit,
      category,
    };
    if (raw.optional === true) ingredient.optional = true;
    return ingredient;
  });
}

interface RawMeal {
  slot: MealSlot;
  name: string;
  minutes: number;
  calories: number;
  protein: number;
  oilLevel: 'low' | 'medium' | 'high';
  spice: SpiceLevel;
  raw: boolean;
  ingredients: Ingredient[];
  seasonings: Ingredient[];
  staple: StapleServing | null;
  steps: string[];
  care?: string;
  missing: string[];
  tip?: string;
}

const OIL_LEVELS = ['low', 'medium', 'high'] as const;
const SPICE_LEVELS: SpiceLevel[] = ['none', 'mild', 'hot'];

function readStaple(value: unknown, path: string): StapleServing | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) return shapeFail(`${path} 不是对象`);
  return {
    name: readString(value.name, `${path}.name`, 30),
    amount: readNumber(value.amount, `${path}.amount`, 0.1, 2000),
    unit: readUnit(value.unit, path),
  };
}

/**
 * 字段、闭集、区间、三餐齐全。**任何一条不合格就整份丢弃**（`schema` 失败）而不是就地修补：这份
 * 菜单是模型一次生成的，一处编造往往意味着整体不可信。
 *
 * 例外只有一处：午/晚漏写主食，补一碗白米饭（见 `toRecipe`）—— 那是「没写」而不是「写错」。
 */
function readMeals(value: unknown): RawMeal[] {
  if (!Array.isArray(value)) return shapeFail('meals 不是数组');
  if (value.length !== MEAL_SLOTS.length) {
    return shapeFail(`meals 应该是 ${MEAL_SLOTS.length} 条，收到 ${value.length} 条`);
  }

  const meals = value.map((raw, index) => {
    const path = `meals[${index}]`;
    if (!isRecord(raw)) return shapeFail(`${path} 不是对象`);

    const oilLevel = OIL_LEVELS.find((level) => level === raw.oilLevel);
    if (!oilLevel) return shapeFail(`${path}.oilLevel 是「${String(raw.oilLevel)}」`);
    const spice = SPICE_LEVELS.find((level) => level === raw.spice);
    if (!spice) return shapeFail(`${path}.spice 是「${String(raw.spice)}」`);

    return {
      slot: readMealSlot(raw.slot, path),
      name: readString(raw.name, `${path}.name`, 30),
      minutes: Math.round(readNumber(raw.minutes, `${path}.minutes`, 1, 240)),
      calories: Math.round(readNumber(raw.calories, `${path}.calories`, 30, 1500)),
      protein: Math.round(readNumber(raw.protein, `${path}.protein`, 0, 100)),
      oilLevel,
      spice,
      raw: raw.raw === true,
      ingredients: readIngredients(raw.ingredients, `${path}.ingredients`, { seasonings: false }),
      seasonings: readIngredients(raw.seasonings, `${path}.seasonings`, { seasonings: true }),
      staple: readStaple(raw.staple, `${path}.staple`),
      steps: readTextList(raw.steps, `${path}.steps`, 20),
      care: typeof raw.care === 'string' && raw.care.trim().length > 0 ? raw.care.trim() : undefined,
      missing: Array.isArray(raw.missing)
        ? raw.missing.filter((entry): entry is string => typeof entry === 'string').slice(0, 30)
        : [],
      tip: typeof raw.tip === 'string' && raw.tip.trim().length > 0 ? raw.tip.trim() : undefined,
    };
  });

  for (const slot of MEAL_SLOTS) {
    if (meals.filter((meal) => meal.slot === slot).length !== 1) {
      return shapeFail(`meals 里 ${MEAL_SLOT_LABELS[slot]}（${slot}）不是恰好一条`);
    }
  }
  return meals;
}

/** id 里那截随机串的字母表：URL 安全（会当路由参数用），也不含容易看混的字符。 */
const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function randomToken(length = 6): string {
  let token = '';
  for (let index = 0; index < length; index += 1) {
    token += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
  }
  return token;
}

/**
 * 菜谱 id：`ai-20261008-lunch-4f9a2c`。
 *
 * 每次生成都带一截新的随机串，**不做「同名同日期就同 id」的确定性哈希**：那样两次生成会撞出同一个
 * id 指向两份不同内容，而详情页按 `params.id` 取菜谱（`recipe/[id].tsx`），撞 id 就会显示上一次的
 * 内容。带上日期只是为了让日志里一眼看出是哪天的。
 */
function aiRecipeId(date: string, slot: MealSlot): string {
  return `${AI_ID_PREFIX}${date.replace(/-/g, '')}-${slot}-${randomToken()}`;
}

/**
 * 把一条校验过的 meal 变成 `Recipe`。
 *
 * 三处**本地改正**，方向都是「只往严的一边改」：
 * - `repairLabels`：模型自己填的 category 与 spice 不可信（把虾标成 veg 就能骗过 `purineLevel`），
 *   按名字核对一遍。见 `diet.repairLabels`。改正后的菜谱**就是入库的那一份**，所以详情页的饮食维度
 *   显示的也是核对过的等级。
 * - 生食：模型自称 `raw`，但名字里写着刺身/溏心的，一律按生食处理，写进 `exclusions` ——
 *   于是孕期与幼儿的硬排除（`advice.exclusionReason`）在本地那套规则里自动生效。
 * - 油：写着一大勺油却说少油的，按 `isHighOil` 的同一个阈值改判 —— 否则详情页写着「少油」，而
 *   「清淡」偏好又同时在报冲突，两处自相矛盾。
 */
function toRecipe(meal: RawMeal, date: string, fridge: FridgeItem[], warnings: string[]): Recipe {
  const recipe: Recipe = {
    id: aiRecipeId(date, meal.slot),
    name: meal.name,
    slots: [meal.slot],
    minutes: meal.minutes,
    calories: meal.calories,
    protein: meal.protein,
    oilLevel: meal.oilLevel,
    // AI 的菜永远不进本地候选池（`planner` 只从 `RECIPES` 里挑），所以这两个标签只用于展示；
    // 空数组好过给模型的菜编一个「适合减脂」。
    goals: [],
    preferences: [],
    ingredients: meal.ingredients,
    seasonings: meal.seasonings,
    steps: meal.steps,
    spice: meal.spice,
    aiCare: meal.care,
    tip: meal.tip,
  };

  if (meal.staple) {
    recipe.staple = meal.staple;
  } else if (meal.slot !== 'breakfast' && !meal.ingredients.some((item) => item.category === 'staple')) {
    // 午/晚连主食都没写：补一碗白米饭。补的是「没写」而不是「写错」，不值得丢一份菜单 —— 但要说出来。
    recipe.staple = { name: '白米饭', amount: 150, unit: 'g' };
    warnings.push(`${meal.name} 没写主食，已按白米饭 150 g 补上`);
  }

  if (meal.raw || looksRawByName(recipe)) {
    recipe.exclusions = { pregnancy: '生食', toddler: '生食' };
    if (!meal.raw) warnings.push(`${meal.name} 的名字看着像生食，已按生食处理`);
  }

  const oil = meal.seasonings
    .filter((item) => !item.optional && /油/.test(item.name))
    .reduce((sum, item) => sum + (item.unit === 'ml' ? item.amount : 0), 0);
  if (oil >= OIL_LIMIT_ML) recipe.oilLevel = 'high';

  // 缺货清单：本地是唯一事实来源，AI 那份只作对照。比**条数**而不是名字 —— 名字有别名（西红柿/番茄），
  // 逐名对比会把「本地认出来了」误报成不一致。
  const missingLocally = missingIngredients(recipe, fridge).length;
  if (meal.missing.length !== missingLocally) {
    warnings.push(
      `${meal.name} 自报缺 ${meal.missing.length} 样，本地按冰箱算是 ${missingLocally} 样（以本地为准）`,
    );
  }

  return repairLabels(recipe);
}

export interface ParsedMenu {
  recipes: Recipe[];
  /** 归一化时的让步（补主食、按生食处理、缺货对不上…）。调用方打一行日志即可，不影响可用性。 */
  warnings: string[];
}

export type MenuParseResult = { ok: true; menu: ParsedMenu } | { ok: false; failure: AiFailure };

/** 形状校验 + 归一化。不含禁忌 —— 那一关要拿画像来判（`validateMenu`），所以单独一步。 */
export function normalizeMenu(content: string, date: string, fridge: FridgeItem[]): MenuParseResult {
  const json = extractJson(content);
  if (!json) return { ok: false, failure: failure('parse', '没找到 json') };

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    return {
      ok: false,
      failure: failure('parse', error instanceof Error ? error.message : 'JSON 解析失败'),
    };
  }

  let meals: RawMeal[];
  try {
    if (!isRecord(parsed)) return shapeFail('顶层不是对象');
    meals = readMeals(parsed.meals);
  } catch (error) {
    if (error instanceof ShapeError) return { ok: false, failure: failure('schema', error.message) };
    throw error;
  }

  const warnings: string[] = [];
  const recipes = meals.map((meal) => toRecipe(meal, date, fridge, warnings));
  return { ok: true, menu: { recipes, warnings } };
}

/**
 * 本地禁忌校验：**不信任模型自报的任何字段**。
 *
 * 走到这里时菜谱已经过 `repairLabels`（类别与辣度按名字核对过）、生食也已写进 `exclusions`，所以
 * 直接跑的就是那套一直在用的 `isExcluded` —— 规则只有一份，与 16 道内置菜完全同一个口径。
 *
 * 命中就整份丢弃（`taboo`）：一份菜单里只要有一道菜撞了硬禁忌，剩下的两条也没法用了 —— 用户要的
 * 是一整顿饭。
 */
export function validateMenu(recipes: Recipe[], profile: Profile): AiFailure | null {
  for (const recipe of recipes) {
    if (!isExcluded(recipe, profile)) continue;
    const reasons = exclusionReasons(recipe, profile);
    return failure('taboo', `「${recipe.name}」${reasons.join('、')}`);
  }
  return null;
}

/**
 * 完整的一趟：容错解析 → 形状校验 → 归一化 → 本地禁忌校验。**每次调用只对应一次网络请求**，没有
 * 隐藏重试（「连续失败 2 次」要在界面上一说就明白，藏着重试就没法解释了）。
 */
export function parseMenu(
  content: string,
  profile: Profile,
  date: string,
  fridge: FridgeItem[],
): MenuParseResult {
  const normalized = normalizeMenu(content, date, fridge);
  if (!normalized.ok) return normalized;

  const taboo = validateMenu(normalized.menu.recipes, profile);
  if (taboo) return { ok: false, failure: taboo };

  return normalized;
}

/**
 * 把三份 AI 菜谱装成 `DayPlan`：形状与 `planner.generatePlan` 完全一样，只多一个 `source` ——
 * 这正是需求 9，下游（今日页、详情页、购物清单）分不出这份菜单是谁排的。
 *
 * 三餐各挑一份；缺任何一餐就返回 `null`，让调用方回退（正常走不到：`normalizeMenu` 已经保证三个
 * slot 各一条）。
 */
export function menuPlan(recipes: Recipe[], date: string, generatedAt = Date.now()): DayPlan | null {
  const breakfast = recipes.find((recipe) => recipe.slots.includes('breakfast'));
  const lunch = recipes.find((recipe) => recipe.slots.includes('lunch'));
  const dinner = recipes.find((recipe) => recipe.slots.includes('dinner'));
  if (!breakfast || !lunch || !dinner) return null;
  return {
    date,
    meals: { breakfast: breakfast.id, lunch: lunch.id, dinner: dinner.id },
    generatedAt,
    source: 'ai',
  };
}
