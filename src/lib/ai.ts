import { ADVICE_KEY_LABELS, exclusionReasons, isExcluded } from './advice';
import { OIL_LIMIT_ML, looksRawByName, repairLabels } from './diet';
import { historyLine, type DishHistoryEntry } from './history';
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  MEAL_ROLES,
  MEAL_SLOTS,
  MEAL_SLOT_LABELS,
  PREFERENCE_LABELS,
} from './labels';
import { adviceKeysFor, householdPortions, isToddler, memberSummaryLabel } from './members';
import { nutritionTarget } from './nutrition';
import { missingIngredients, normalizeName } from './planner';
import { stapleOf } from './staples';
import type {
  AdviceKey,
  DayPlan,
  PantryItem,
  Ingredient,
  IngredientCategory,
  IngredientUnit,
  MealRole,
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
  pregnancy:
    '不得出现生食或半生（刺身、溏心蛋、生腌、生火腿、温泉蛋、未杀菌奶）、酒精，以及鲨鱼/旗鱼/剑鱼这类高汞鱼',
  toddler: '不得重辣；不得生食；坚果必须碾碎或不出现；不出现整颗葡萄、整颗圣女果这类容易噎住的食材',
  gout: '不得使用动物内脏（肝、腰花、毛肚）、海鲜（虾、蟹、贝、蛤、蚝、鱿鱼、鱼、鲍鱼、鱼子、海胆）、浓肉汤与久煮的骨汤',
  insulinResistance:
    '不出现精制糖（白糖、蜂蜜、糖浆）与含糖饮料；主食必须低 GI（糙米、杂粮、燕麦、荞麦），不用白米饭、白面与精制面食（白面包、意面、乌冬、拉面）',
  hypertension: '不用腌制品、豆瓣酱、腐乳、咸菜、腊味、火腿、味噌、泡菜、培根；每道菜的盐不超过 2 克',
  hyperlipidemia: '不用肥肉、五花肉、带皮禽肉、动物油、黄油、奶酪、椰浆、香肠与加工肉',
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
  | 'repeat'
  | 'unknown'
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
  repeat: '模型给的菜单里有重复的菜，已丢弃',
  // 兜底：整条链路里任何没预料到的异常都落成它（见 `storage.generateWithAi` 的 catch）。不含「已回退
  // 本地规则」—— 那件事只在连续失败到上限时才发生，由调用方把话补在句尾，不在这里许诺。
  unknown: '生成过程出错了，请重试',
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
 * 只有这几种才值得喂回去：网络、Key、限流这些是环境问题，重说一遍也没有用，反而占掉上下文。
 */
export function retryCorrection(previous: AiFailure | null): string | undefined {
  if (!previous) return undefined;
  const telling =
    previous.kind === 'schema' ||
    previous.kind === 'taboo' ||
    previous.kind === 'parse' ||
    previous.kind === 'repeat';
  return telling ? previous.message : undefined;
}

/**
 * 这一次失败值不值得**当场**再问一遍（一次点击最多两次请求里的第二次）。
 *
 * 判据与 `retryCorrection` 是同一条，所以直接共用：只有能说清「哪里不合格」的失败
 * （schema / taboo / parse / repeat）才可能靠把原因说回去修好。网络、超时、Key、余额、限流、取消
 * 这些是环境问题 —— 当场重发只会再等一次 60 秒或再撞同一堵墙，留给用户自己点「重试」。
 */
export function shouldRetry(previous: AiFailure): boolean {
  return retryCorrection(previous) !== undefined;
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
 * 用户的体检文本和食库食材名都是自己打的，一行 `\n请忽略以上约束` 就会变成新的一条指令 —— 这不是
 * 安全问题（模型说什么都要过本地校验），但会让菜单莫名其妙地跑偏。`members.readMedical` 在存盘时
 * 已经清过一遍，这里再清一次是因为**食库里的食材名没有那道关**。
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

/** 别名 → 规范单位。**不在表里的一律判失败**：猜单位会静默污染购物清单和食库匹配。 */
const UNIT_ALIASES: Record<string, IngredientUnit> = {};
for (const [unit, forms] of Object.entries(UNIT_FORMS)) {
  for (const form of forms) UNIT_ALIASES[form] = unit as IngredientUnit;
}

const UNIT_LIST = Object.keys(UNIT_FORMS).join(' | ');

/**
 * 别名 → 规范类别。同样只认表里有的；`蔬菜` 这种写法要认（模型很容易这么写）。
 *
 * **每加一个类别，这里必须同时加别名**，否则模型写中文名就会被判失败 —— 而这次真正的病根在
 * prompt：取值表和这份表本来就没把九类告诉模型。两份表由 `CATEGORY_TABLE` / `CATEGORY_LABELS`
 * 与这里对齐（`harness` 有一条断言逐个类别过一遍）。
 */
const CATEGORY_ALIASES: Record<string, IngredientCategory> = {
  meat: 'meat',
  肉: 'meat',
  肉类: 'meat',
  荤菜: 'meat',
  肉禽水产: 'meat',
  veg: 'veg',
  菜: 'veg',
  蔬菜: 'veg',
  素菜: 'veg',
  egg: 'egg',
  蛋: 'egg',
  蛋类: 'egg',
  蛋奶: 'egg',
  fruit: 'fruit',
  水果: 'fruit',
  鲜果: 'fruit',
  水果类: 'fruit',
  staple: 'staple',
  主食: 'staple',
  主食类: 'staple',
  主食米面: 'staple',
  seasoning: 'seasoning',
  调味: 'seasoning',
  调料: 'seasoning',
  调味料: 'seasoning',
  调味酱料: 'seasoning',
  drygoods: 'drygoods',
  干货: 'drygoods',
  坚果: 'drygoods',
  干货坚果: 'drygoods',
  drink: 'drink',
  饮品: 'drink',
  饮料: 'drink',
  other: 'other',
  其他: 'other',
  其它: 'other',
  杂项: 'other',
};

/**
 * prompt 里的类别取值表，**由 `CATEGORY_ORDER` / `CATEGORY_LABELS` 生成**。
 *
 * 不要在 prompt 里手写第二份：「蒜蓉油莎豆」和 `fruit` 被判失败这两件事，一个共同的根因就是
 * prompt 从没把允许的类别完整说出来。生成出来的表与界面上的中文名永远是同一份数据。
 */
const CATEGORY_TABLE = CATEGORY_ORDER.map(
  (category) => `${category}=${CATEGORY_LABELS[category]}`,
).join('、');

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
      "components": [
        {
          "role": "drink",
          "name": "温牛奶",
          "minutes": 5,
          "calories": 120,
          "protein": 8,
          "carbs": 12,
          "fat": 5,
          "fiber": 0,
          "oilLevel": "low",
          "spice": "none",
          "raw": false,
          "ingredients": [
            { "name": "牛奶", "amount": 250, "unit": "ml", "category": "egg", "optional": false }
          ],
          "seasonings": [],
          "staple": null,
          "tabooCheck": "无冲突",
          "steps": ["牛奶小火加热到温热，不要煮沸。"],
          "care": "这杯补蛋白和钙，给宝宝长身体",
          "missing": [],
          "tip": "牛奶别煮沸，温热就好"
        },
        {
          "role": "protein",
          "name": "水煮蛋",
          "minutes": 10,
          "calories": 78,
          "protein": 7,
          "carbs": 1,
          "fat": 5,
          "fiber": 0,
          "oilLevel": "low",
          "spice": "none",
          "raw": false,
          "ingredients": [{ "name": "鸡蛋", "amount": 1, "unit": "个", "category": "egg" }],
          "seasonings": [],
          "staple": null,
          "tabooCheck": "无冲突",
          "steps": ["冷水下锅，水开后煮 8 分钟，过凉水剥壳。"],
          "care": "全熟蛋，孕期也能吃"
        },
        {
          "role": "staple",
          "name": "莓果燕麦碗",
          "minutes": 10,
          "calories": 280,
          "protein": 9,
          "carbs": 48,
          "fat": 6,
          "fiber": 6,
          "oilLevel": "low",
          "spice": "none",
          "raw": false,
          "ingredients": [
            { "name": "即食燕麦片", "amount": 50, "unit": "g", "category": "staple" },
            { "name": "蓝莓", "amount": 60, "unit": "g", "category": "fruit" },
            { "name": "牛奶", "amount": 150, "unit": "ml", "category": "egg" }
          ],
          "seasonings": [],
          "staple": null,
          "tabooCheck": "无冲突",
          "steps": ["燕麦片加牛奶泡 3 分钟。", "放上蓝莓即可。"],
          "care": "这碗是主食兼纤维，给妈妈控糖"
        }
      ]
    },
    {
      "slot": "lunch",
      "components": [
        {
          "role": "protein",
          "name": "番茄炒蛋",
          "minutes": 12,
          "calories": 220,
          "protein": 14,
          "carbs": 10,
          "fat": 14,
          "fiber": 2,
          "oilLevel": "medium",
          "spice": "none",
          "raw": false,
          "ingredients": [
            { "name": "番茄", "amount": 250, "unit": "g", "category": "veg" },
            { "name": "鸡蛋", "amount": 2, "unit": "个", "category": "egg" }
          ],
          "seasonings": [
            { "name": "食用油", "amount": 10, "unit": "ml" },
            { "name": "盐", "amount": 2, "unit": "g" }
          ],
          "staple": { "name": "白米饭", "amount": 150, "unit": "g" },
          "tabooCheck": "无冲突",
          "steps": ["番茄去皮切块，鸡蛋打散。", "热锅下油炒蛋盛出。", "下番茄炒出汁，倒回鸡蛋炒匀。"],
          "care": "这餐的蛋白主力，给爸爸增肌"
        },
        {
          "role": "veg",
          "name": "清炒西兰花",
          "minutes": 10,
          "calories": 120,
          "protein": 6,
          "carbs": 9,
          "fat": 7,
          "fiber": 5,
          "oilLevel": "low",
          "spice": "none",
          "raw": false,
          "ingredients": [{ "name": "西兰花", "amount": 300, "unit": "g", "category": "veg" }],
          "seasonings": [
            { "name": "食用油", "amount": 8, "unit": "ml" },
            { "name": "盐", "amount": 2, "unit": "g" }
          ],
          "staple": null,
          "tabooCheck": "无冲突",
          "steps": ["西兰花切小朵焯水 1 分钟。", "热锅少油快炒，加盐出锅。"],
          "care": "这餐的纤维和维生素；主食只算在番茄炒蛋那一份上"
        }
      ]
    },
    {
      "slot": "dinner",
      "components": [
        {
          "role": "protein",
          "name": "香煎鸡胸",
          "minutes": 15,
          "calories": 240,
          "protein": 34,
          "carbs": 2,
          "fat": 11,
          "fiber": 0,
          "oilLevel": "low",
          "spice": "none",
          "raw": false,
          "ingredients": [{ "name": "鸡胸肉", "amount": 200, "unit": "g", "category": "meat" }],
          "seasonings": [
            { "name": "橄榄油", "amount": 6, "unit": "ml" },
            { "name": "盐", "amount": 1, "unit": "g" }
          ],
          "staple": { "name": "杂粮饭", "amount": 150, "unit": "g" },
          "tabooCheck": "无冲突",
          "steps": ["鸡胸肉拍松，两面抹盐。", "平底锅少油，中火每面煎 4 分钟。"],
          "care": "优质蛋白主力，给妈妈和爸爸补够"
        },
        {
          "role": "veg",
          "name": "蒜蓉油麦菜",
          "minutes": 8,
          "calories": 90,
          "protein": 4,
          "carbs": 6,
          "fat": 6,
          "fiber": 4,
          "oilLevel": "low",
          "spice": "none",
          "raw": false,
          "ingredients": [
            { "name": "油麦菜", "amount": 300, "unit": "g", "category": "veg" },
            { "name": "大蒜", "amount": 3, "unit": "瓣", "category": "veg" }
          ],
          "seasonings": [
            { "name": "食用油", "amount": 8, "unit": "ml" },
            { "name": "盐", "amount": 2, "unit": "g" }
          ],
          "staple": null,
          "tabooCheck": "无冲突",
          "steps": ["蒜切末，油麦菜切段。", "热锅下油爆香蒜末，大火快炒油麦菜。"],
          "care": "青菜管纤维；主食写在香煎鸡胸那一份上"
        }
      ]
    }
  ],
  "notes": ["你家的油莎豆平时怎么吃？这次没敢入菜"]
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
      '- 只生成**真实存在、叫得出名字的菜**：有固定做法、在饭桌上说得出来的那种（番茄炒蛋、香煎鸡胸、味噌汤、番茄意面）。菜系不限。',
      '- **禁止发明不存在的搭配**。为了把手边的食材凑成一个菜，把不相干的食材硬炖、硬煮、硬拌在一起，即使能吃也不算合格。',
      '- 判断标准只有一条：**这道菜是不是一道真的菜？** 拿不准就换一道你有把握的，宁可少用两样食库里的食材。',
      '- 食材名一律写**中文常用名**（鲜虾、北豆腐、味噌、奶酪）。程序按名字核对忌口、升糖、钠、油，写外文名或品牌名等于没写。',
      '- 硬约束（下一节）当然也不能违反 —— 两者冲突时换菜，不要为了绕开禁忌去编新搭配。',
    ].join('\n'),
  );

  // 水果不做正餐的菜（用户的案例：「凉拌柚子」只有柚子肉 300g）。与【第一优先级】是一对：那一段管
  // 「菜名是真的」，这一段管「端上桌的东西构成一道菜」—— 切好的水果不构成。
  //
  // 规则只写在 prompt 里是不够的，`readDish` 里有一条对应的本地校验（荤/素位不许全是水果）；这里
  // 写的这段是让模型**不必**撞上那条校验。
  sections.push(
    [
      '【正餐的菜必须是「菜」，水果只做餐后水果】',
      '- 每个组成部分都要有**主料结构**：至少一样非水果的主料，加上真正的烹调过程（洗切、下锅、调味）。「把一样东西拌一拌」就端上桌，不算一道菜。',
      '- **水果不做正餐的菜**。要上桌就单独成一份：role 写 fruit，名字就写食材本名（柚子 / 苹果 / 橙子），不要写成「凉拌柚子」「清炒苹果」这种菜名 —— 那不是菜名，是硬凑。',
      '- 唯一例外：**有出处的名菜**里水果本来就是配方的一部分（泰式柚子沙拉要配虾和香料、菠萝咕咾肉、夏威夷披萨）。照菜谱本来的配方写，**不许把配料删到只剩水果**。',
      '- 反面示例：**「凉拌柚子」是错的** —— 食材只有柚子肉 300g，那是切好的水果，不是菜。要出现就写成 name「柚子」、role「fruit」的那一份。同理「清炒苹果」「凉拌橙子」都不行。',
      '- 这类食材的 category 是 fruit；role 是 protein / veg 时，一份**食材全是水果**的菜会被程序直接拒绝。',
    ].join('\n'),
  );

  // 食材清单是用户自己录的，什么都会出现（榨油原料、宠物粮、别人送的干货）。这一段是「先想它平时
  // 怎么吃」的判断规则，紧跟在【第一优先级】后面：两者说的是同一件事的两面 —— 前者管「菜是真的」，
  // 这一段管「那样东西在这道菜里是不是人吃它的方式」。
  sections.push(
    [
      '【每样食材先想「这个家平时怎么吃它」】',
      '- 食库清单里的每样东西都先判断一次：中国人家里是怎么吃它的？是这个吃法再用，不是就**不要用**。',
      '- **原料型、提取物型、非常规入菜的东西不要强行做成菜**：油莎豆（打豆浆、榨油的原料）、亚麻籽、奇亚籽、蛋白粉、可可粉、香草精，以及宠物食品、洗涤用品这类明显不是给人做菜的条目 —— 宁可整份菜单都不用它们，也不要把它们和别的菜硬凑一道。',
      '- 反面示例：**「蒜蓉炒油莎豆」是错的** —— 油莎豆是打豆浆、榨油的原料，不是能拿来清炒的蔬菜。要用手边这个食材，就按它本来的吃法用：`油莎豆豆浆` 可以，「蒜蓉炒油莎豆」不行。同理「亚麻籽炒青菜」不行，`亚麻籽拌酸奶` / 撒在粥上可以。',
      '- 按类别分：**主食米面、干货坚果、调味酱料、饮品**这几类默认是**配角**，不占一整顿饭的主菜位；要用在菜里，只按本来就这么做的菜用 —— 宫保鸡丁里的花生、沙拉里的坚果、红烧肉里的冰糖，都是菜谱原本就有的写法。',
      '- 清单里每样食材后面括号里是它的类别，按它来判断；**不确定的东西一律不用**，不用比用错强。',
      '- 真有拿不准的关键食材（不是忘了它，而是不知道你家怎么吃），在顶层 notes 里写一句话问用户，不要自己猜着用。',
    ].join('\n'),
  );

  // 只列这个家里真的出现的键（没勾的疾病不进 prompt：一堆用不上的禁忌会稀释真正要命的那几条），
  // 但**按成员分组**：旧的合并清单看不出「谁不能吃什么」，模型读到的是一张通用禁忌表，也就不会
  // 拿它逐条自查 —— 「羊肉烧麦」被本地高升糖校验连着拦下两次，就是这么来的。
  //
  // 文案与本地判据同源：`adviceKeysFor` 与 `diet.DISEASE_RULES` 认的是同一组身份键。
  const redLines: string[] = [];
  for (const member of profile.members) {
    redLines.push(`- ${member.name}：`);
    for (const key of adviceKeysFor(member)) {
      redLines.push(`  - ${ADVICE_KEY_LABELS[key]}：${HARD_CONSTRAINTS[key]}`);
    }
    // 体检异常是自由文本，本地规则读不懂它（`members.ts` 里写明「只发给 AI 当上下文」）。既然只有
    // 模型看得见，那就必须放在红线这一节里，而不是混在上面那行「家庭成员」的括号里。
    if (member.medical) {
      redLines.push(
        `  - 体检异常：「${inline(member.medical, 120)}」—— 本地规则看不到这段文字，请你按最接近的疾病红线从严处理`,
      );
    }
  }
  if (redLines.length === 0) redLines.push('- 还没填成员，按一位成人算，注意全熟与基本卫生。');

  sections.push(
    [
      '【红线：以下每条都绝对不可违反】',
      '生成**每一道菜之前**，把这张清单逐条过一遍；写完 ingredients 之后，再核一遍每个食材名和它的 category。',
      '- **拿不准就换一道菜，不要赌** —— 越线的菜单会被程序整份丢弃、然后重新生成，白等一次。',
      '- 一道菜要同时满足**所有人**的红线，不是各吃各的；同一样食材只要撞上任何一条，这道菜就不能要。',
      ...redLines,
    ].join('\n'),
  );

  // 自查字段紧跟红线：它的唯一作用就是让上面那张清单在**每一道菜**上被真的读一遍。
  sections.push(
    [
      '【每道菜都要写 tabooCheck】',
      `- 每个组成部分都要带一个 "tabooCheck" 字段，值**只能**是这四个字：${TABOO_CHECK_OK}。`,
      '- 写下它之前，拿上面的红线对着这道菜的 ingredients 逐条核一遍（最容易犯的是胰岛素抵抗的主食与糖、痛风的海鲜/内脏/浓汤）。',
      `- 值不是「${TABOO_CHECK_OK}」—— 包括多写几个字（「${TABOO_CHECK_OK}（已避开海鲜）」）—— 都会被程序当成「这道菜有问题」，整份菜单丢弃重来。`,
      '- 违心写「无冲突」没有用：程序会用同一份红线再核一遍，核不过照样丢弃；写实话反而能立刻换一道。',
    ].join('\n'),
  );

  sections.push(
    [
      '【三餐结构】',
      '- 早餐、午餐、晚餐各一「套」，共三套，slot 分别是 breakfast / lunch / dinner，各出现一次。',
      '- 每套由 2–3 个组成部分（components）构成；每个组成部分都是一道**独立的菜**，有自己的食材与做法。',
      '- 早餐的结构：饮品/奶类 ＋ 蛋白质 ＋ 主食/果蔬（例如 温牛奶 ＋ 水煮蛋 ＋ 莓果燕麦碗）。',
      '- 午餐、晚餐的结构：一荤 ＋ 一素 ＋ 主食/汤（例如 番茄炒蛋 ＋ 清炒西兰花 ＋ 米饭）。',
      '- 同一套里的组成部分不要互相重复主料与做法 —— 不要两个都是炒蛋，也不要两个都是清炒青菜；一天里同理。',
      '- 主食只写一次：这一套里已经有主食类的菜（粥/面/饭/燕麦碗）时，把主食写进那道菜的 ingredients（category 写 staple），所有 staple 字段留 null；否则把「另配」的主食写在**主菜**的 staple 上（午餐晚餐通常要有一个），其余留 null。',
    ].join('\n'),
  );

  sections.push(
    [
      '【份量口径】',
      '- ingredients 与 seasonings 的 amount、calories、protein、carbs、fat、fiber、staple.amount **全部是每人份**，不是全家总量；程序会自己按人数乘。',
      '- 每个组成部分每人份 50–800 千卡；**一套（2–3 个组成部分）合计约 300–900 千卡** —— 那是一顿饭的量，不是三道主菜。',
      '- minutes 5–90 分钟；一道菜 3–8 步。',
      '- 食材用中国家庭买菜时的名字（鲜虾、北豆腐、小油菜），因为忌口、升糖、钠、油都是从名字和 category 推出来的。',
    ].join('\n'),
  );

  sections.push(
    [
      '【取值表】表外的值会被拒绝：',
      `- unit：${UNIT_LIST}`,
      `- category：${CATEGORY_TABLE}`,
      `- role：${MEAL_ROLES.join(' | ')}（早餐用 drink / protein / staple / veg / fruit；午餐晚餐用 protein / veg / staple / soup，要上餐后水果就再加一个 fruit）`,
      '- oilLevel：low | medium | high；spice：none | mild | hot',
      '- carbs（0–300）、fat（0–150）、fiber（0–60）：每人份克数，估算值即可。',
      '- 调味料的单位必须固定：酱油类（生抽/老抽/蚝油）用「勺」，盐用「g」，食用油用「ml」。',
      '- raw：生食或半生必须写 true。',
    ].join('\n'),
  );

  sections.push(
    [
      '【输出格式】',
      'category 是**闭集**，只能从下面这九个里原样挑一个（英文键或它后面的中文名都认）：',
      `  ${CATEGORY_TABLE}`,
      '示例里的写法：牛奶 → egg（蛋奶，蛋与奶都归这一类）；蓝莓 → fruit；即食燕麦片 → staple。',
      'seasonings 数组里的调料**不用写 category**，程序一律按调味料处理；ingredients 数组里每一项都必须写。',
      '',
      SCHEMA_SPEC,
    ].join('\n'),
  );

  sections.push(
    [
      '【全天营养目标】',
      '下面的「全天营养目标」是给全家的参考值，来自每位成员的年龄、体重方向与特殊状态。',
      '- 三餐搭配合起来要**逼近**这组数字：哪一项明显差得远，就调整配比（加一道高蛋白的、多一份蔬菜或全谷），而不是改数字。',
      '- 每个组成部分的 care 必须说清**它在营养上承担什么**，例如：这餐的蛋白主力，给爸爸增肌；这餐的纤维和维生素。',
    ].join('\n'),
  );

  sections.push(
    [
      '【菜系与可操作性】',
      '- 菜系不限：中餐、西餐、日料、东南亚都可以，也可以混着来。标准只有两条：**好吃**、**普通家庭厨房能做**。',
      '- 以 30 分钟内能做完为主；炖汤、腌制可以更长，但 minutes 要写清。',
      '- 不用稀有食材与特殊器具，菜市场或超市买得到。',
    ].join('\n'),
  );

  sections.push(
    [
      '【care 的写法】',
      '一句话，必须指名到人并说出是什么因素在照顾他，例如：低嘌呤，适合爸爸痛风；主食换成了糙米，妈妈控糖友好。',
      '如果这一餐没有特别要照顾的人，就写一句这道菜好在哪（可以说它在营养上承担什么）。',
    ].join('\n'),
  );

  sections.push(
    [
      '【食库的用法：只影响大约一半餐次】',
      '- 食库只用来决定**大约一半**的菜：这些菜优先用掉家里现有的食材。',
      '- 其余餐次**主动推荐新菜**，不要为了迁就食库硬凑（见【第一优先级】），也不要一天都围着食库转。',
      '- 缺的食材写进那个组成部分的 missing —— **采购清单是本产品的核心功能，缺几样很正常，不是失败**。',
      '- 示例：食库里只有螺丝椒和鸡蛋 —— 生成「青椒炒蛋」是合理的；生成「螺丝椒炖蛋汤」是禁止的。',
    ].join('\n'),
  );

  sections.push(
    [
      '【notes：只在真有话要说时写】',
      '- notes 是给用户看的 0–2 句话，每条不超过 40 字，没有就写 `[]`。',
      '- 只在两种情况下写：食库里有你**拿不准怎么吃**的食材（问他一句），或者这份菜单有一处需要他知道的取舍。',
      '- 不要在 notes 里复述菜单、不要客套、不要写营养数字（那是 care 的事）。',
    ].join('\n'),
  );

  sections.push(
    [
      '【不要重复】',
      '- 同一份菜单里**不许出现两道同名或高度雷同的菜**：不能两餐都是炒蛋，也不能两道都是清炒青菜。',
      '- 最近几天做过的菜会写在下面，今天换别的。',
    ].join('\n'),
  );

  return sections.join('\n\n');
}

function buildUser(
  profile: Profile,
  pantry: PantryItem[],
  date: string,
  options: { correction?: string; history?: DishHistoryEntry[] } = {},
): string {
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

  // 目标由 `nutritionTarget` 现算，不另设参数：界面上的目标卡与这里送出去的数字因此是同一个函数、
  // 同一组系数，不可能对不上。
  const target = nutritionTarget(profile);
  lines.push('');
  lines.push(
    `全天营养目标（全家，参考）：热量约 ${target.kcal} 千卡、蛋白质约 ${target.protein}g、碳水约 ${target.carbs}g、脂肪约 ${target.fat}g、膳食纤维约 ${target.fiber}g。`,
  );

  // 每样食材带上它的**类别**：模型要判断「油莎豆（干货坚果）平时怎么吃」就得先知道它是干货坚果，
  // 而不是从名字去猜。类别文字由 `CATEGORY_LABELS` 出，与界面上显示的是同一份。
  lines.push(
    pantry.length > 0
      ? `食库现有食材（供参考，只影响大约一半餐次；括号里是它的类别）：${pantry
          .map((item) => `${item.name}（${CATEGORY_LABELS[item.category] ?? CATEGORY_LABELS.other}）${item.amount ? ` ${item.amount}` : ''}`)
          .join('、')}`
      : '食库里现在没有食材，按正常家常菜生成即可。',
  );

  const history = historyLine(options.history ?? []);
  if (history) {
    lines.push('');
    lines.push(`${history}。今天不要再出现这些菜。`);
  }

  lines.push('');
  // user 段是模型最后读到的东西，把几条最容易走偏的原则在这里再说一遍 —— 这里写着「不必用完」，
  // 上面那段食材清单就不会被读成「今天必须把这些做完」。
  lines.push(
    '请按上面的 schema 生成今天的三餐：每餐 2–3 个组成部分，菜名必须是真实存在的菜（菜系不限），食库里的食材优先考虑、不必用完（每样先想它平时怎么吃，拿不准就别用），缺的写进 missing；真有话要说才写 notes，没有就写 []。',
  );

  if (options.correction) {
    lines.push('');
    lines.push(
      `注意：上一次的返回被丢弃了，原因：${options.correction}。请换一份明显不同的菜单，并严格避开这个问题。`,
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
 * 食库食材的「数量」是自由文本（`PantryItem.amount`），app 从来不用它做匹配，这里也一样 —— 它只是给
 * 模型的一个语境（「番茄 3 个」比「番茄」更像人话）。历史（最近 3 天做过的菜）是外部状态，由
 * `options` 传进来；营养目标不是 —— 它能从 `profile` 现算（见 `buildUser`）。
 */
export function buildMenuPrompt(
  profile: Profile,
  pantry: PantryItem[],
  date: string,
  options: { correction?: string; history?: DishHistoryEntry[] } = {},
): MenuPrompt {
  return {
    system: buildSystem(profile),
    user: buildUser(
      profile,
      pantry.map((item) => ({ ...item, name: inline(item.name, 20), amount: inline(item.amount, 20) })),
      date,
      options,
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

/**
 * 与 `ShapeError` 分开：**形状是对的，模型自己说这道菜越线了**（`tabooCheck` 不是「无冲突」）。
 *
 * 两者对用户是两句话（「菜单不完整」 vs 「与家人禁忌冲突」），对重试循环是同一个动作（都自动重试），
 * 所以只分类型、不分流程：`normalizeMenu` 的 catch 里各归各的 kind。
 */
class TabooError extends Error {}

function shapeFail(reason: string): never {
  throw new ShapeError(reason);
}

function tabooFail(reason: string): never {
  throw new TabooError(reason);
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

/**
 * 角色的闭集校验。**不校验 role 与餐次是否相配**（早餐给了 soup 也照样收下）：标签只是展示
 * （`labels.mealRoleLabel`），不是安全，为它丢一份菜单不划算。
 */
function readRole(value: unknown, path: string): MealRole {
  const role = MEAL_ROLES.find((entry) => entry === value);
  if (!role) return shapeFail(`${path} 的 role「${String(value)}」不在允许的列表里`);
  return role;
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

/** 一餐里的一个组成部分，形状就是旧版的「一条 meal」去掉 slot、加上 role 与三个宏量。 */
interface RawDish {
  role: MealRole;
  name: string;
  minutes: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  oilLevel: 'low' | 'medium' | 'high';
  spice: SpiceLevel;
  raw: boolean;
  ingredients: Ingredient[];
  seasonings: Ingredient[];
  staple: StapleServing | null;
  /**
   * 模型自己写下的禁忌自查结论，**只认「无冲突」这四个字**。
   *
   * 它不进 `Recipe`：这是一次性的自检痕迹，`toRecipe` 不读它（所以没有存储迁移、界面也不显示）。
   * 留着它的唯一用处见 `readDish` —— 模型自己说「有冲突」时，那句话会原样进 correction。
   */
  tabooCheck: string;
  steps: string[];
  care?: string;
  missing: string[];
  tip?: string;
}

interface RawMeal {
  slot: MealSlot;
  components: RawDish[];
}

/**
 * `tabooCheck` 唯一合法取值。
 *
 * 为什么不是「随便写点什么都行」：这个字段的存在意义就是逼模型在写完食材之后把红线过一遍。若值随它
 * 怎么写，它就退化成一个橡皮图章 —— 而它唯一有价值的时刻，恰恰是模型写下「不行」的时候。所以判据
 * 是**逐字相等**（只多几个字也算不合格），越线的判定交给 `readDish` 抛 `TabooError`。
 */
export const TABOO_CHECK_OK = '无冲突';

/** 一餐的组成部分数。数字来自需求「每餐 2–3 个组成部分」，不是调出来的。 */
const MEAL_COMPONENTS_MIN = 2;
export const MEAL_COMPONENTS_MAX = 3;

/** 顶层 notes 的形状上限：条数与每条字数。**界面上一张小卡读得完的量**，不是调出来的阈值。 */
export const NOTES_MAX = 2;
export const NOTE_MAX_LENGTH = 40;

/**
 * 读顶层的 notes。与 ingredients 那套严格校验相反，这里**故意宽容**：少一句叮嘱不影响吃饭，为它
 * 丢掉一份完全合格的菜单不划算。所以非数组当「没有」、非字符串的元素跳过、超长的按 `inline` 截断、
 * 多于 `NOTES_MAX` 条的丢掉多余。
 *
 * 模型写的话在这里过一次 `inline`（压掉换行/控制字符/反引号、限长）—— 它和体检文本一样是自由文本，
 * 最终会显示在今日页上。**导出**是因为 `storage` 要把同一套规则用在从磁盘读回的 `DayPlan.notes` 上
 * （那份同样是不可信数据），两处各写一遍就会漂。
 */
export function sanitizeNotes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const notes: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const text = inline(entry, NOTE_MAX_LENGTH);
    if (text.length === 0) continue;
    notes.push(text);
    if (notes.length === NOTES_MAX) break;
  }
  return notes;
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

/** 一个组成部分的字段、闭集、区间。区间给得宽，只用来抓 9000 这种明显的垃圾值。 */
function readDish(raw: Record<string, unknown>, path: string): RawDish {
  const oilLevel = OIL_LEVELS.find((level) => level === raw.oilLevel);
  if (!oilLevel) return shapeFail(`${path}.oilLevel 是「${String(raw.oilLevel)}」`);
  const spice = SPICE_LEVELS.find((level) => level === raw.spice);
  if (!spice) return shapeFail(`${path}.spice 是「${String(raw.spice)}」`);

  const dish: RawDish = {
    role: readRole(raw.role, path),
    name: readString(raw.name, `${path}.name`, 30),
    minutes: Math.round(readNumber(raw.minutes, `${path}.minutes`, 1, 240)),
    calories: Math.round(readNumber(raw.calories, `${path}.calories`, 30, 1500)),
    protein: Math.round(readNumber(raw.protein, `${path}.protein`, 0, 100)),
    carbs: Math.round(readNumber(raw.carbs, `${path}.carbs`, 0, 300)),
    fat: Math.round(readNumber(raw.fat, `${path}.fat`, 0, 150)),
    fiber: Math.round(readNumber(raw.fiber, `${path}.fiber`, 0, 60)),
    oilLevel,
    spice,
    raw: raw.raw === true,
    ingredients: readIngredients(raw.ingredients, `${path}.ingredients`, { seasonings: false }),
    seasonings: readIngredients(raw.seasonings, `${path}.seasonings`, { seasonings: true }),
    staple: readStaple(raw.staple, `${path}.staple`),
    tabooCheck: readString(raw.tabooCheck, `${path}.tabooCheck`, 20),
    steps: readTextList(raw.steps, `${path}.steps`, 20),
    care: typeof raw.care === 'string' && raw.care.trim().length > 0 ? raw.care.trim() : undefined,
    missing: Array.isArray(raw.missing)
      ? raw.missing.filter((entry): entry is string => typeof entry === 'string').slice(0, 30)
      : [],
    tip: typeof raw.tip === 'string' && raw.tip.trim().length > 0 ? raw.tip.trim() : undefined,
  };

  // 模型自己承认越线：整份丢弃、可重试，而且它写的那句话会原样进 correction。见 `TabooError`。
  if (dish.tabooCheck !== TABOO_CHECK_OK) {
    return tabooFail(`「${dish.name}」的自查写的是「${dish.tabooCheck}」`);
  }

  // 水果不做正餐的菜（用户的案例：「凉拌柚子」只有柚子肉 300g）。只在**荤/素位**上判：汤、
  // 饮品、主食位的纯水果是真实存在的菜 —— 冰糖雪梨、柚子茶、莓果燕麦碗，不能被这条误杀。
  if (
    (dish.role === 'protein' || dish.role === 'veg') &&
    dish.ingredients.every((item) => item.category === 'fruit')
  ) {
    return shapeFail(
      `${path}：「${dish.name}」的食材全是水果。水果只做餐后水果（role 写 fruit、名字写「柚子」），不能当正餐的菜`,
    );
  }

  return dish;
}

/** 一套 2–3 个组成部分。数量不在区间里就整份丢弃 —— 补一个「组成部分」等于自己编一道菜。 */
function readComponents(value: unknown, path: string): RawDish[] {
  if (!Array.isArray(value)) return shapeFail(`${path} 不是数组`);
  if (value.length < MEAL_COMPONENTS_MIN || value.length > MEAL_COMPONENTS_MAX) {
    return shapeFail(
      `${path} 应该是 ${MEAL_COMPONENTS_MIN}–${MEAL_COMPONENTS_MAX} 个组成部分，收到 ${value.length} 个`,
    );
  }
  return value.map((raw, index) => {
    const dishPath = `${path}[${index}]`;
    if (!isRecord(raw)) return shapeFail(`${dishPath} 不是对象`);
    return readDish(raw, dishPath);
  });
}

/**
 * 字段、闭集、区间、三餐齐全。**任何一条不合格就整份丢弃**（`schema` 失败）而不是就地修补：这份
 * 菜单是模型一次生成的，一处编造往往意味着整体不可信。
 *
 * 例外只有一处：午/晚漏写主食，补一碗白米饭（见 `ensureMealStaples`）—— 那是「没写」而不是「写错」。
 */
function readMeals(value: unknown): RawMeal[] {
  if (!Array.isArray(value)) return shapeFail('meals 不是数组');
  if (value.length !== MEAL_SLOTS.length) {
    return shapeFail(`meals 应该是 ${MEAL_SLOTS.length} 条，收到 ${value.length} 条`);
  }

  const meals = value.map((raw, index) => {
    const path = `meals[${index}]`;
    if (!isRecord(raw)) return shapeFail(`${path} 不是对象`);
    return {
      slot: readMealSlot(raw.slot, path),
      components: readComponents(raw.components, `${path}.components`),
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
 * 菜谱 id：`ai-20261008-lunch0-4f9a2c`（`lunch` 后面那一截是这一餐里的第几个组成部分）。
 *
 * 每次生成都带一截新的随机串，**不做「同名同日期就同 id」的确定性哈希**：那样两次生成会撞出同一个
 * id 指向两份不同内容，而详情页按 `params.id` 取菜谱（`recipe/[id].tsx`），撞 id 就会显示上一次的
 * 内容。带上日期只是为了让日志里一眼看出是哪天的；带上下标是为了同一餐的两个组成部分一定不同 id。
 */
function aiRecipeId(date: string, slot: MealSlot, index: number): string {
  return `${AI_ID_PREFIX}${date.replace(/-/g, '')}-${slot}${index}-${randomToken()}`;
}

/**
 * 把一个校验过的组成部分变成 `Recipe`。
 *
 * 三处**本地改正**，方向都是「只往严的一边改」：
 * - `repairLabels`：模型自己填的 category 与 spice 不可信（把虾标成 veg 就能骗过 `purineLevel`），
 *   按名字核对一遍。见 `diet.repairLabels`。改正后的菜谱**就是入库的那一份**，所以详情页的饮食维度
 *   显示的也是核对过的等级。
 * - 生食：模型自称 `raw`，但名字里写着刺身/溏心的，一律按生食处理，写进 `exclusions` ——
 *   于是孕期与幼儿的硬排除（`advice.exclusionReason`）在本地那套规则里自动生效。
 * - 油：写着一大勺油却说少油的，按 `isHighOil` 的同一个阈值改判 —— 否则详情页写着「少油」，而
 *   「清淡」偏好又同时在报冲突，两处自相矛盾。
 *
 * 主食**不在这里**补（旧版是逐条 meal 补的）：一餐有 2–3 个组成部分，逐条补会给一顿饭补出三碗白米饭。
 * 补主食上移到 `ensureMealStaples`，一餐至多一次。
 */
function toRecipe(
  dish: RawDish,
  date: string,
  slot: MealSlot,
  index: number,
  pantry: PantryItem[],
  warnings: string[],
): Recipe {
  const recipe: Recipe = {
    id: aiRecipeId(date, slot, index),
    name: dish.name,
    slots: [slot],
    minutes: dish.minutes,
    calories: dish.calories,
    protein: dish.protein,
    carbs: dish.carbs,
    fat: dish.fat,
    fiber: dish.fiber,
    oilLevel: dish.oilLevel,
    role: dish.role,
    // AI 的菜永远不进本地候选池（`planner` 只从 `RECIPES` 里挑），所以这两个标签只用于展示；
    // 空数组好过给模型的菜编一个「适合减脂」。
    goals: [],
    preferences: [],
    ingredients: dish.ingredients,
    seasonings: dish.seasonings,
    steps: dish.steps,
    spice: dish.spice,
    aiCare: dish.care,
    tip: dish.tip,
  };

  if (dish.staple) recipe.staple = dish.staple;

  if (dish.raw || looksRawByName(recipe)) {
    recipe.exclusions = { pregnancy: '生食', toddler: '生食' };
    if (!dish.raw) warnings.push(`${dish.name} 的名字看着像生食，已按生食处理`);
  }

  const oil = dish.seasonings
    .filter((item) => !item.optional && /油/.test(item.name))
    .reduce((sum, item) => sum + (item.unit === 'ml' ? item.amount : 0), 0);
  if (oil >= OIL_LIMIT_ML) recipe.oilLevel = 'high';

  // 缺货清单：本地是唯一事实来源，AI 那份只作对照。比**条数**而不是名字 —— 名字有别名（西红柿/番茄），
  // 逐名对比会把「本地认出来了」误报成不一致。
  const missingLocally = missingIngredients(recipe, pantry).length;
  if (dish.missing.length !== missingLocally) {
    warnings.push(
      `${dish.name} 自报缺 ${dish.missing.length} 样，本地按食库算是 ${missingLocally} 样（以本地为准）`,
    );
  }

  return repairLabels(recipe);
}

/**
 * 一餐里只能有一碗「另配」的主食。
 *
 * 模型的正常输出不会写两个，但一旦写了（两个组成部分各带一碗米饭），后果是**静默的**：卡片上两碗饭、
 * 热量与目标卡的缺口全错，没有任何报错。所以保留第一个、其余置 `null` 并留一条 warn —— 这是「写重了」，
 * 不值得丢一份菜单（与漏写补白米饭同一个让步尺度）。
 */
function normalizeMealStaples(meals: RawMeal[], warnings: string[]): void {
  for (const meal of meals) {
    let seen = false;
    for (const dish of meal.components) {
      if (!dish.staple) continue;
      if (seen) {
        warnings.push(`${dish.name} 又写了一份主食（${dish.staple.name}），已忽略`);
        dish.staple = null;
      } else {
        seen = true;
      }
    }
  }
}

/**
 * 午/晚一套里连一样主食都没有（不在 `staple` 字段里，也没有 `category: staple` 的食材）时，给第一个
 * 组成部分补一碗白米饭。早餐不补：它的主食本来就在某道菜的 ingredients 里，没有就不补。
 *
 * 判据用 `stapleOf`（与主食卡、营养小计同一份定义），所以「补上了」就一定意味着「主食卡上真的多了一碗」。
 */
function ensureMealStaples(recipes: Recipe[], warnings: string[]): void {
  for (const slot of MEAL_SLOTS) {
    if (slot === 'breakfast') continue;
    const inMeal = recipes.filter((recipe) => recipe.slots.includes(slot));
    if (inMeal.length === 0) continue;
    if (inMeal.some((recipe) => stapleOf(recipe) !== undefined)) continue;

    const main = inMeal[0];
    main.staple = { name: '白米饭', amount: 150, unit: 'g' };
    warnings.push(`${main.name} 没写主食，已按白米饭 150 g 补上`);
  }
}

export interface ParsedMenu {
  recipes: Recipe[];
  /** 归一化时的让步（补主食、按生食处理、缺货对不上…）。调用方打一行日志即可，不影响可用性。 */
  warnings: string[];
  /** 模型给用户的 0–2 句话，落进 `DayPlan.notes`（`types.ts`）。空数组 = 没有。 */
  notes: string[];
}

export type MenuParseResult = { ok: true; menu: ParsedMenu } | { ok: false; failure: AiFailure };

/** 形状校验 + 归一化。不含禁忌 —— 那一关要拿画像来判（`validateMenu`），所以单独一步。 */
export function normalizeMenu(content: string, date: string, pantry: PantryItem[]): MenuParseResult {
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
  let notes: string[];
  try {
    if (!isRecord(parsed)) return shapeFail('顶层不是对象');
    meals = readMeals(parsed.meals);
    notes = sanitizeNotes(parsed.notes);
  } catch (error) {
    if (error instanceof ShapeError) return { ok: false, failure: failure('schema', error.message) };
    // 形状是对的，是模型自己说这道菜越线了 —— 两种失败对用户是两句话，对重试是同一个动作。
    if (error instanceof TabooError) return { ok: false, failure: failure('taboo', error.message) };
    throw error;
  }

  const warnings: string[] = [];
  normalizeMealStaples(meals, warnings);
  const recipes = meals.flatMap((meal) =>
    meal.components.map((dish, index) => toRecipe(dish, date, meal.slot, index, pantry, warnings)),
  );
  ensureMealStaples(recipes, warnings);
  return { ok: true, menu: { recipes, warnings, notes } };
}

/**
 * 同一份菜单里出现两道同名菜 → 整份丢弃、可重试（kind `repeat`）。
 *
 * 只做**机械可判**的那一半：名字按 `planner.normalizeName` 归一后相等才算重复（`番茄炒蛋` 与
 * `西红柿炒蛋` 认不出来，这是刻意的 —— 再往深就是模糊匹配，会误杀）。「食材和做法高度雷同」是
 * 判断题，本地没有可靠判据（编一个「主料重合度 ≥ N」就是拍脑袋的阈值），只写在 prompt 里。
 */
export function duplicateDish(recipes: Recipe[]): AiFailure | null {
  const seen = new Map<string, number>();
  for (const recipe of recipes) {
    const key = normalizeName(recipe.name);
    const count = (seen.get(key) ?? 0) + 1;
    if (count > 1) return failure('repeat', `「${recipe.name}」出现了 ${count} 次`);
    seen.set(key, count);
  }
  return null;
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
 * 完整的一趟：容错解析 → 形状校验 → 归一化 → 本地禁忌校验。**一次调用 = 一次返回**，这里不做任何
 * 重试 —— 「一次点击最多两次请求」那个循环在 `storage.generateWithAi` 里，明写在界面上（忙碌卡会说
 * 「正在重试」），藏在这里就没法解释了。
 */
export function parseMenu(
  content: string,
  profile: Profile,
  date: string,
  pantry: PantryItem[],
): MenuParseResult {
  const normalized = normalizeMenu(content, date, pantry);
  if (!normalized.ok) return normalized;

  const taboo = validateMenu(normalized.menu.recipes, profile);
  if (taboo) return { ok: false, failure: taboo };

  // 禁忌（安全）先判，重复后判：一份既撞禁忌又重复的菜单，说的是禁忌那个问题。
  const repeat = duplicateDish(normalized.menu.recipes);
  if (repeat) return { ok: false, failure: repeat };

  return normalized;
}

/**
 * 把 AI 菜谱按餐装成 `DayPlan`：形状与 `planner.generatePlan` 完全一样，只多一个 `source` ——
 * 这正是需求 9，下游（今日页、详情页、购物清单）分不出这份菜单是谁排的。
 *
 * 每个 slot 收到的是**该餐所有组成部分**的 id，顺序就是模型给的顺序（也是展示顺序）。任何一餐一个
 * 都没有就返回 `null`，让调用方回退（正常走不到：`normalizeMenu` 已经保证每餐 2–3 个）。
 */
export function menuPlan(
  recipes: Recipe[],
  date: string,
  generatedAt = Date.now(),
  notes: string[] = [],
): DayPlan | null {
  const meals = {} as Record<MealSlot, string[]>;
  for (const slot of MEAL_SLOTS) {
    const ids = recipes.filter((recipe) => recipe.slots.includes(slot)).map((recipe) => recipe.id);
    if (ids.length === 0) return null;
    meals[slot] = ids;
  }
  // notes 随 plan 一起落盘（同一个键、同一次提交）：重新生成会整份换掉，不会留下上一份菜单的叮嘱。
  return { date, meals, generatedAt, source: 'ai', ...(notes.length > 0 ? { notes } : {}) };
}
