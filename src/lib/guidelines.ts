import type { Goal, MetabolicTag, Sex } from './types';

/**
 * 参考数据：把营养目标从「估算」升级成「有出处」。
 *
 * 两个来源，各管一根轴：
 * - 《中国居民膳食指南（2022）》的平衡膳食宝塔 —— 管**食物类别**（一天蔬菜够不够 300g、有没有奶）。
 * - 《中国居民膳食营养素参考摄入量（2023 版）》（下称 DRIs）—— 管**能量与营养素**（千卡、克、毫克）。
 *
 * 三条硬规矩，改这个文件之前先读一遍：
 *
 * 1. **每个数字都要挂 `source`。** 没有出处的不许写进来 —— 那正是这一版要消灭的东西。
 * 2. **核实不到的就写 `todo`，不编。** `todo` 会在卡片上显示成「（待核实）」，也会被校验脚本逐条打印
 *    出来。宁可让用户看到「这个数还没核完」，也不要给一个看起来很确定的假数。
 * 3. **`source: 'product'` 不许写成「依据」。** 那是本应用自己的口径（比如胰岛素抵抗的碳水上限），
 *    不是哪位专家写的推荐值，混进「依据」里就是在给产品决策套官方背书。
 *
 * ## 核实程度（必须如实说明）
 *
 * - **能量与蛋白质（DRIs 2023）**：WebFetch 在本环境被阻断（连 example.com 都返回「无法验证域名
 *   安全」），但 `curl` 可用 —— 中国营养学会官网 cnsoc.org 上 2023 版的表格是**图片**，这些数是
 *   逐张下载、放大后**人工逐格读取**的，不是机器解析，也不是检索摘要。比摘要硬，但仍不等于程序化
 *   核对，换行看错一格是可能的。官方表以 **MJ/d** 印刷，这里的千卡是按表内脚注 1MJ=239kcal 换算
 *   后取到十位的，不是原文印刷值。
 * - **宝塔（膳食指南 2022）**：来自多个公开来源的检索摘要互相印证，没拿到官方原图逐字核对。
 * - **孕期**：按用户要求以 2023《DRIs》为准，取自表15/表16/表17（孕早/中/晚期）与非孕表（表10）相减，
 *   所以孕中期是 +250 千卡（**不是** 2022 指南孕期篇的 +300），铁是 25/29mg（不是指南的 24/29），
 *   钙孕期不额外增加（不是指南的 +200）。官方表只印总值、不印增量，「增量」三个字是算出来的，
 *   每条都标了 `todo` 说明这一点。
 *
 * 凡核实不到的一律进 `todo`（卡片上显示「（待核实）」）或 `TODO_NOTES`，绝不填一个看起来确定的数。
 * 结论写在界面上就是那句「依据《中国居民膳食指南（2022）》，仅供参考」—— 不写「权威」也不写「精确」。
 */

// ─────────────────────────────────────────────────────────────────────────────
// 出处
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 出处键。`short` 上卡片（「依据 DRIs 2023 能量」），`full` 给详情页与校验脚本（写清是哪张表）。
 */
export type SourceKey =
  | 'pagodaAdult'
  | 'pagodaPreschool'
  | 'pagodaSenior'
  | 'pregnancyGuide'
  | 'guideText'
  | 'guideHyperlipidemia'
  | 'driEnergy'
  | 'driProtein'
  | 'driPregnancy'
  | 'driFiber'
  | 'driFolate'
  | 'driIron'
  | 'driCalcium'
  | 'product';

export interface SourceLabel {
  /** 卡片上那串短依据。 */
  short: string;
  /** 完整出处，写到「哪一版、哪一篇、哪张表」。 */
  full: string;
}

export const SOURCES: Record<SourceKey, SourceLabel> = {
  pagodaAdult: {
    short: '膳食指南 2022 宝塔',
    full: '《中国居民膳食指南（2022）》平衡膳食宝塔（成人，1600–2400 千卡档）',
  },
  pagodaPreschool: {
    short: '膳食指南 2022 学龄前儿童宝塔',
    full: '《中国居民膳食指南（2022）》学龄前儿童平衡膳食宝塔（分 2–3 岁、4–5 岁两栏）',
  },
  pagodaSenior: {
    short: '膳食指南 2022 老年人宝塔',
    full: '《中国居民膳食指南（2022）》一般老年人（65–79 岁）与高龄老年人（80 岁以上）膳食宝塔',
  },
  pregnancyGuide: {
    short: '膳食指南 2022 孕期篇',
    full: '《中国居民膳食指南（2022）》备孕和孕期妇女膳食指南（分孕早期、孕中期、孕晚期）',
  },
  guideText: {
    short: '膳食指南 2022',
    full: '《中国居民膳食指南（2022）》正文（非宝塔图内的表述）',
  },
  guideHyperlipidemia: {
    short: '高脂血症食养指南 2023',
    full:
      '《成人高脂血症食养指南（2023 年版）》（国家卫生健康委）「吃动平衡，保持健康体重」：' +
      '超重和肥胖人群每天可减少 300–500 千卡的能量摄入',
  },
  driEnergy: {
    short: 'DRIs 2023 能量',
    full:
      '《中国居民膳食营养素参考摄入量（2023 版）》能量 EER，取各年龄表的 PAL Ⅰ（低强度 / 轻身体活动）行；' +
      '官方表以 MJ/d 印刷，此处按表内脚注 1MJ=239kcal 换算',
  },
  driProtein: {
    short: 'DRIs 2023 蛋白质',
    full: '《中国居民膳食营养素参考摄入量（2023 版）》蛋白质 RNI',
  },
  driPregnancy: {
    short: 'DRIs 2023 孕期表',
    full:
      '《中国居民膳食营养素参考摄入量（2023 版）》表15/表16/表17（孕早期 / 孕中期 / 孕晚期，' +
      '中国 18–49 岁孕期女性）的 PAL Ⅰ（低强度）行；官方只印总值，增量是与非孕女性（表10，7.11 MJ/d、' +
      '蛋白质 RNI 55g）相减得出的',
  },
  driFiber: {
    short: 'DRIs 2023 膳食纤维',
    full: '《中国居民膳食营养素参考摄入量（2023 版）》膳食纤维适宜摄入量（AI）',
  },
  driFolate: {
    short: 'DRIs 2023 叶酸',
    full: '《中国居民膳食营养素参考摄入量（2023 版）》叶酸 RNI（µg DFE）',
  },
  driIron: {
    short: 'DRIs 2023 铁',
    full: '《中国居民膳食营养素参考摄入量（2023 版）》铁 RNI',
  },
  driCalcium: {
    short: 'DRIs 2023 钙',
    full: '《中国居民膳食营养素参考摄入量（2023 版）》钙 RNI',
  },
  product: {
    short: '本应用口径',
    full: '本应用自己的取值口径，不是指南或 DRIs 的推荐值',
  },
};

/** 出处的一句话标签；`todo` 存在时附带「待核实」，让界面和文案都不会把没核完的数说成定论。 */
export function sourceLabel(key: SourceKey, todo?: string): string {
  return todo ? `${SOURCES[key].short}（待核实）` : SOURCES[key].short;
}

/** 「（待核实）」这一个后缀只写一处 —— 卡片、提示词、校验脚本都用它，免得三种写法各表一态。 */
export function todoSuffix(todo?: string): string {
  return todo ? '（待核实）' : '';
}

/** 每条数据都挂出处。`todo` 非空 = 还没核实到官方原表，界面上会带「待核实」。 */
export interface Ref {
  source: SourceKey;
  todo?: string;
}

/**
 * 全模块的待办清单 —— 校验脚本会打印它，交付说明也照它讲。放在这里而不是散在各处，是为了让
 * 「哪些数字还不硬」一眼可见。
 */
export const TODO_NOTES: string[] = [
  '能量与蛋白质的全部数值取自中国营养学会官网 cnsoc.org 的 2023 版表格图片（人工逐格读取：WebFetch 被阻断、curl 可用）；官方表以 MJ/d 印刷，千卡是按表内脚注 1MJ=239kcal 换算后取到十位的，不是原文印刷值。',
  '4–11 岁（官方表4/5/6）只给「中等强度」的 EER，没有轻身体活动（PAL Ⅰ）行 —— 这几档用的是中等强度值，卡片上带「待核实」。',
  '官方各表 PAL Ⅰ 的系数写法不统一（18–29 岁表写 1.5「轻」，其余表写 1.40「低强度」），本模块一律取各表的 PAL Ⅰ 行，不自行统一系数。',
  '1–3 岁（官方表3）的 EER 同样只有中等强度值，逐年取值（1 岁 3.77/3.35、2 岁 4.60/4.18、3 岁 5.23/4.81 MJ/d，已换算）；表3 的蛋白质 RNI 不分性别（25/25/30g），两列填的是同一个官方值，不是取中值。',
  '指南（2022）与 DRIs（2023）的老龄分档不同：宝塔是 65–79 / 80 岁以上，能量是 65–74 / 75 岁以上。同一位长辈可能同时看到两种档位，那是两份文件各自的分档，不是笔误。',
  '学龄儿童（6–17 岁）另有官方宝塔 ——《中国学龄儿童膳食指南（2022）》按 6–10 / 11–13 / 14–17 岁分三档（中国营养学会官网 dg.cnsoc.org 有原文，已逐步核对到），但本模块还没收录这三档，所以 6–17 岁暂时按成人宝塔算，依据如实写成人宝塔，不冒充儿童标准。',
  '学龄前宝塔（2–3、4–5 岁）的官方页面只有图（中国营养学会妇幼营养分会），本文本是从三份独立复现交叉核对的（含南宁市妇幼保健院的官方解读 PDF）；两档的薯类官方只写「适量」，本模块留空标「待核实」，没有编克数。',
  '老年人这一档两份文件对不上：《老年人膳食指南（2022）》只讲粗细搭配、没给谷类克数，2024 版《中国老年人平衡膳食宝塔》才给 200–300g。本模块按 2022 那份，谷类留空。另外老年人指南的蛋白质目标写成「每公斤体重 1.0–1.2g」（抗阻训练者 1.2–1.5g），不是克/天，本模块没有体重，用的是 DRIs 的 RNI。',
  '减脂「每天减少 300–500 千卡」这个区间出自《成人高脂血症食养指南（2023 年版）》，不是《膳食指南（2022）》八准则的原文；《成人肥胖食养指南（2024 年版）》给的是 500–1000 千卡（或降低 30%–50%）。两处口径不同，本应用取的是前者，且取的是它的中值。',
  '孕期的能量/蛋白质增量、叶酸/铁/钙目标取自 2023《DRIs》表15/16/17，与《膳食指南（2022）》孕期篇的数处表述不一致（能量 +300/+450 vs +250/+400、铁 24/29 vs 25/29、钙 +200→1000 vs 不额外增加）。用户选了 DRIs，本模块按 DRIs，卡片上标的是 DRIs。',
  '官方孕期表只印各档总能量（7.11 / 8.16 / 8.78 MJ），**没有印「+250」「+400」这样的增量**：这三个增量是与非孕女性表相减算出来的，卡片上带「待核实」。',
  '本模块未收录孕期宝塔的增加量（如孕中晚期奶类、鱼禽蛋肉的加量），因未能核实到具体克数。',
  '增肌的 +300 千卡与蛋白质 ×1.5、胰岛素抵抗的碳水上限 45%、高血脂的脂肪取 20%、慢性肾病的蛋白质 ×0.8 —— 这四条都是本应用口径，卡片上不写成「依据」。',
];

// ─────────────────────────────────────────────────────────────────────────────
// 食物类别（宝塔层）—— 「一天吃够 300g 蔬菜了吗」
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 宝塔里的层。`wholeGrains` 不是独立一层（是谷类里的一部分），单独列出来是因为提示词要单独盯它
 * （全谷物和杂豆 50–150g 是 2022 版新强调的一条）。
 */
export type FoodGroupKey =
  | 'grains'
  | 'wholeGrains'
  | 'tubers'
  | 'vegetables'
  | 'fruit'
  | 'animal'
  | 'dairy'
  | 'soyNuts'
  | 'salt'
  | 'oil'
  | 'addedSugar'
  | 'water';

export interface FoodGroup extends Ref {
  key: FoodGroupKey;
  label: string;
  /**
   * 每日量。`max === null` 表示「不超过」型的上限值（盐、添加糖）——这类只约束上限，不设下限，
   * 所以 `min` 记 0 而不是编一个「至少吃多少盐」。
   */
  min: number;
  max: number | null;
  unit: 'g' | 'ml';
  /**
   * 宝塔图旁边的口径说明（如「深色蔬菜占一半」）。进提示词和卡片，不参与核算。
   *
   * 规矩：**note 里不许出现和这一行打架的量**。宝塔图是一人份的图，而本应用把食物类别按人头相加，
   * 一行 `300–500g` 在两口之家会显示成 `600–1000g` —— 此时 note 里若还写着「每天 300–500ml」，
   * 同一个东西就出现了两个数。所以：能进 `min/max` 的量就别写进 note（盐那行原来就重复写了 5g）；
   * 确实没有自己一行的每人份量（鸡蛋、坚果、水产品的次数）必须写明「按每位成员算」。
   */
  note?: string;
}

/** 成人宝塔（2022 版）核心量化数据。数字逐层对应宝塔图旁边的那几行字。 */
export const ADULT_PAGODA: FoodGroup[] = [
  {
    key: 'grains',
    label: '谷类',
    min: 200,
    max: 300,
    unit: 'g',
    source: 'pagodaAdult',
    // 2022 版把「谷薯类 250–400g」拆成了谷类与薯类两行 —— 旧版（2016）才是合着写的那一个区间。
    //
    // 宝塔图上谷类这一行还印着「其中全谷物和杂豆 50–150g」，这里**故意不抄**：本模块把它单列成了
    // `wholeGrains` 一层，而食物类别是按人头相加的 —— 抄进来就会出现「谷类 400–600g（其中全谷物
    // 50–150g）」压着「全谷物和杂豆 100–300g」这种同一件事两个数的画面（前者是每人、后者是全家）。
  },
  {
    key: 'wholeGrains',
    label: '全谷物和杂豆',
    min: 50,
    max: 150,
    unit: 'g',
    source: 'pagodaAdult',
    note: '包含在谷类里，不是额外再吃这么多',
  },
  {
    key: 'tubers',
    label: '薯类',
    min: 50,
    max: 100,
    unit: 'g',
    source: 'pagodaAdult',
    note: '红薯、土豆、山药等，可部分替代主食',
  },
  {
    key: 'vegetables',
    label: '蔬菜',
    min: 300,
    max: 500,
    unit: 'g',
    source: 'pagodaAdult',
    note: '深色蔬菜应占一半',
  },
  {
    key: 'fruit',
    label: '水果',
    min: 200,
    max: 350,
    unit: 'g',
    source: 'pagodaAdult',
    note: '果汁不能替代鲜果',
  },
  {
    key: 'animal',
    label: '动物性食物',
    min: 120,
    max: 200,
    unit: 'g',
    source: 'pagodaAdult',
    // 这条里的「1 个鸡蛋」是**每人**的量，而上面这行在卡片和提示词里是全家的合计 —— 不写清楚就会被
    // 当成全家一天只吃 1 个蛋。宝塔图上没有这个歧义（那是一人份的图）。
    note: '每周至少 2 次水产品、每天 1 个鸡蛋（都按每位成员算）',
  },
  {
    key: 'dairy',
    label: '奶及奶制品',
    min: 300,
    max: 500,
    unit: 'g',
    source: 'pagodaAdult',
    // 原文是「相当于每天 300–500ml 液态奶」，那个数就是这一行的量，写进 note 会跟全家的合计打架。
    note: '按鲜奶折算（1g ≈ 1ml）',
  },
  {
    key: 'soyNuts',
    label: '大豆及坚果',
    min: 25,
    max: 35,
    unit: 'g',
    source: 'pagodaAdult',
    note: '坚果每周 50–70g（约每天 10g，按每位成员算）',
  },
  {
    key: 'salt',
    label: '盐',
    min: 0,
    max: 5,
    unit: 'g',
    source: 'pagodaAdult',
    note: '越少越好',
  },
  {
    key: 'oil',
    label: '烹调油',
    min: 25,
    max: 30,
    unit: 'g',
    source: 'pagodaAdult',
  },
  {
    key: 'addedSugar',
    label: '添加糖',
    min: 0,
    max: 50,
    unit: 'g',
    source: 'pagodaAdult',
    note: '最好控制在 25g 以下',
  },
  {
    key: 'water',
    label: '水',
    min: 1500,
    max: 1700,
    unit: 'ml',
    source: 'pagodaAdult',
    // 这一行的两头是男女之差（不是「每天浮动 1500–1700」），说清楚，免得全家合计时对不上号。
    note: '两头是男女之差：男 1700ml、女 1500ml 上下（按每位成员算）；按饮水量计，不含食物中的水',
  },
];

/**
 * 学龄前儿童宝塔（2022 版）分 2–3 岁与 4–5 岁两栏，数值不同，所以按档存。
 *
 * `salt` 一档在儿童宝塔里写的是「<2g」；`oil` 是 10–20g（2–3 岁）与 20–25g（4–5 岁）。
 */
export const PRESCHOOL_PAGODA: Record<'toddler' | 'preschool', FoodGroup[]> = {
  toddler: [
    { key: 'grains', label: '谷类', min: 75, max: 125, unit: 'g', source: 'pagodaPreschool' },
    {
      key: 'tubers',
      label: '薯类',
      min: 0,
      max: null,
      unit: 'g',
      source: 'pagodaPreschool',
      todo: '2–3 岁档的薯类只写「适量」，官方原图与复现文本都没有克数。',
    },
    { key: 'vegetables', label: '蔬菜', min: 100, max: 200, unit: 'g', source: 'pagodaPreschool' },
    { key: 'fruit', label: '水果', min: 100, max: 200, unit: 'g', source: 'pagodaPreschool' },
    {
      key: 'animal',
      label: '畜禽肉水产',
      min: 50,
      max: 75,
      unit: 'g',
      source: 'pagodaPreschool',
      note: '另有鸡蛋 50g（按每位成员算，没算进上面的总量）',
    },
    { key: 'dairy', label: '奶及奶制品', min: 350, max: 500, unit: 'g', source: 'pagodaPreschool' },
    { key: 'soyNuts', label: '大豆', min: 5, max: 15, unit: 'g', source: 'pagodaPreschool' },
    { key: 'salt', label: '盐', min: 0, max: 2, unit: 'g', source: 'pagodaPreschool' },
    { key: 'oil', label: '烹调油', min: 10, max: 20, unit: 'g', source: 'pagodaPreschool' },
    { key: 'water', label: '水', min: 600, max: 700, unit: 'ml', source: 'pagodaPreschool' },
  ],
  preschool: [
    { key: 'grains', label: '谷类', min: 100, max: 150, unit: 'g', source: 'pagodaPreschool' },
    {
      key: 'tubers',
      label: '薯类',
      min: 0,
      max: null,
      unit: 'g',
      source: 'pagodaPreschool',
      todo: '4–5 岁档的薯类同 2–3 岁档，官方只写「适量」，没有克数。',
    },
    { key: 'vegetables', label: '蔬菜', min: 150, max: 300, unit: 'g', source: 'pagodaPreschool' },
    { key: 'fruit', label: '水果', min: 150, max: 250, unit: 'g', source: 'pagodaPreschool' },
    {
      key: 'animal',
      label: '畜禽肉水产',
      min: 50,
      max: 75,
      unit: 'g',
      source: 'pagodaPreschool',
      note: '另有鸡蛋 50g（按每位成员算，没算进上面的总量）',
    },
    { key: 'dairy', label: '奶及奶制品', min: 350, max: 500, unit: 'g', source: 'pagodaPreschool' },
    { key: 'soyNuts', label: '大豆', min: 15, max: 20, unit: 'g', source: 'pagodaPreschool' },
    // 原来这里照抄了 2–3 岁档的 2g，是错的：4–5 岁档原文写的是 <3g（三份来源一致，含南宁市妇幼保健院
    // 的官方解读 PDF 与青岛新闻网 PDF 里的一日食谱「食用加碘盐 <3g」）。
    { key: 'salt', label: '盐', min: 0, max: 3, unit: 'g', source: 'pagodaPreschool' },
    { key: 'oil', label: '烹调油', min: 20, max: 25, unit: 'g', source: 'pagodaPreschool' },
    { key: 'water', label: '水', min: 700, max: 800, unit: 'ml', source: 'pagodaPreschool' },
  ],
};

/**
 * 老年人宝塔（2022 版）分一般老年人（65–79 岁）与高龄老年人（80 岁以上）。
 *
 * 只收录核实到的层；`grains` 一档两份文件的说法对不上（2022 指南没给克数，2024 版宝塔给了 200–300g），
 * 宁可留 `todo` 也不填一个折中数。
 */
export const SENIOR_PAGODA: Record<'general' | 'oldest', FoodGroup[]> = {
  general: [
    {
      key: 'grains',
      label: '谷类',
      min: 0,
      max: null,
      unit: 'g',
      source: 'pagodaSenior',
      todo: '《老年人膳食指南（2022）》核心推荐里没有谷类克数（只讲粗细搭配、杂粮占谷类 1/3）；200–300g 那个数是 2024 版《中国老年人平衡膳食宝塔》给的，不是同一份文件，本模块不混用，所以留空。',
    },
    { key: 'vegetables', label: '蔬菜', min: 300, max: 500, unit: 'g', source: 'pagodaSenior' },
    { key: 'fruit', label: '水果', min: 200, max: 350, unit: 'g', source: 'pagodaSenior' },
    {
      key: 'animal',
      label: '动物性食物',
      min: 120,
      max: 150,
      unit: 'g',
      source: 'pagodaSenior',
      note: '鱼 40–50g、畜禽肉 40–50g、蛋 40–50g（按每位成员算）',
    },
    { key: 'dairy', label: '奶及奶制品', min: 300, max: 400, unit: 'g', source: 'pagodaSenior' },
    { key: 'soyNuts', label: '大豆', min: 15, max: 15, unit: 'g', source: 'pagodaSenior' },
    { key: 'salt', label: '盐', min: 0, max: 5, unit: 'g', source: 'pagodaSenior' },
    { key: 'oil', label: '烹调油', min: 25, max: 30, unit: 'g', source: 'pagodaSenior' },
  ],
  oldest: [
    {
      key: 'grains',
      label: '谷类',
      min: 0,
      max: null,
      unit: 'g',
      source: 'pagodaSenior',
      todo: '80 岁以上的谷类克数同 65–79 岁档：《老年人膳食指南（2022）》没给克数，2024 版宝塔的 200–300g 是另一份文件。',
    },
    { key: 'vegetables', label: '蔬菜', min: 300, max: 300, unit: 'g', source: 'pagodaSenior' },
    { key: 'dairy', label: '奶及奶制品', min: 300, max: 500, unit: 'g', source: 'pagodaSenior' },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// 能量与蛋白质（DRIs）—— 「这位成员一天该吃多少千卡」
// ─────────────────────────────────────────────────────────────────────────────

/** 一条按年龄（闭区间）分档的记录，值按性别分列 —— DRIs 的表就是这么排的。 */
export interface BandedValues extends Ref {
  /** 年龄下界（含）。 */
  minAge: number;
  /** 年龄上界（含）。`null` = 不设上界。 */
  maxAge: number | null;
  values: Record<Sex, number>;
}

/**
 * 4–11 岁的官方表（表4/5/6）只印了一个活动水平的能量值，脚注写的是「身体活动水平为中等强度」——
 * 没有轻身体活动（PAL Ⅰ）行。这条说明要挂在每一档上，所以写成常量，别在下面抄 8 遍。
 */
const PAL_CHILD_TODO =
  '官方 4–11 岁各表只给「中等强度」的 EER，没有轻身体活动（PAL Ⅰ）行 —— 这里用的是表内的中等强度值。';

/**
 * 1–3 岁（表3）与上一条是同一个问题，但表3 是「1–3 岁婴幼儿」那张表，脚注同样只写中等强度。
 * 顺带说明换算：原表印 3.77/3.35、4.60/4.18、5.23/4.81 MJ/d，按 1MJ=239kcal 取到十位。
 */
const PAL_TODDLER_TODO =
  '官方表3（1–3 岁）也只给「中等强度」的 EER，没有轻身体活动（PAL Ⅰ）行 —— 这里用的是表内的中等强度值（原表为 MJ/d，已换算）。';

/**
 * 能量的估算能量需要量（EER），**轻身体活动**（PAL Ⅰ）—— 活动量在表单里是固定的，用户不选。
 *
 * 分档**照抄官方表**：学龄期 4–11 岁逐年一档（表4/5/6），12–14 与 15–17 各一档（表7/表8，表内不分
 * 到年），成人 18–29 / 30–49 / 50–64（表9–表14，2023 版把 2013 的 18–49 拆成了两档），老年
 * 65–74 与 75 岁以上（表20–表23）。逐年取值而不是归成粗档，是因为官方表本来就是逐年印的：归并出来
 * 的那个区间官方并没有，那是自己造的数。
 *
 * 官方以 MJ/d 印刷，这里的千卡是换算值（见表头）。「年龄没填」（`age: 0`）落到 18–29 档，见 `nutrition`。
 */
export const EER_BANDS: BandedValues[] = [
  // 1–3 岁（表3）与 4–11 岁同理：官方每岁只印一个中等强度的值，没有 PAL Ⅰ 行，所以逐年列、不用粗档。
  { minAge: 1, maxAge: 1, values: { male: 900, female: 800 }, source: 'driEnergy', todo: PAL_TODDLER_TODO },
  { minAge: 2, maxAge: 2, values: { male: 1100, female: 1000 }, source: 'driEnergy', todo: PAL_TODDLER_TODO },
  { minAge: 3, maxAge: 3, values: { male: 1250, female: 1150 }, source: 'driEnergy', todo: PAL_TODDLER_TODO },
  { minAge: 4, maxAge: 4, values: { male: 1300, female: 1250 }, source: 'driEnergy', todo: PAL_CHILD_TODO },
  { minAge: 5, maxAge: 5, values: { male: 1400, female: 1300 }, source: 'driEnergy', todo: PAL_CHILD_TODO },
  { minAge: 6, maxAge: 6, values: { male: 1600, female: 1450 }, source: 'driEnergy', todo: PAL_CHILD_TODO },
  { minAge: 7, maxAge: 7, values: { male: 1700, female: 1550 }, source: 'driEnergy', todo: PAL_CHILD_TODO },
  { minAge: 8, maxAge: 8, values: { male: 1850, female: 1700 }, source: 'driEnergy', todo: PAL_CHILD_TODO },
  { minAge: 9, maxAge: 9, values: { male: 1950, female: 1800 }, source: 'driEnergy', todo: PAL_CHILD_TODO },
  { minAge: 10, maxAge: 10, values: { male: 2050, female: 1900 }, source: 'driEnergy', todo: PAL_CHILD_TODO },
  { minAge: 11, maxAge: 11, values: { male: 2200, female: 2000 }, source: 'driEnergy', todo: PAL_CHILD_TODO },
  { minAge: 12, maxAge: 14, values: { male: 2300, female: 1950 }, source: 'driEnergy' },
  { minAge: 15, maxAge: 17, values: { male: 2600, female: 2100 }, source: 'driEnergy' },
  { minAge: 18, maxAge: 29, values: { male: 2150, female: 1700 }, source: 'driEnergy' },
  { minAge: 30, maxAge: 49, values: { male: 2050, female: 1700 }, source: 'driEnergy' },
  { minAge: 50, maxAge: 64, values: { male: 1950, female: 1600 }, source: 'driEnergy' },
  { minAge: 65, maxAge: 74, values: { male: 1900, female: 1550 }, source: 'driEnergy' },
  { minAge: 75, maxAge: null, values: { male: 1800, female: 1500 }, source: 'driEnergy' },
];

/** 蛋白质 RNI（克/日）。分档与 `EER_BANDS` 对齐 —— 同一份 DRIs 的同一套年龄段。 */
export const PROTEIN_BANDS: BandedValues[] = [
  // 表3 的蛋白质 RNI **不分性别**（1 岁 25g、2 岁 25g、3 岁 30g），所以这两列填的是同一个值 ——
  // 不是「两性平均值」，是官方本来就只给了一个数。没有 todo：数值本身核到了原表。
  { minAge: 1, maxAge: 1, values: { male: 25, female: 25 }, source: 'driProtein' },
  { minAge: 2, maxAge: 2, values: { male: 25, female: 25 }, source: 'driProtein' },
  { minAge: 3, maxAge: 3, values: { male: 30, female: 30 }, source: 'driProtein' },
  { minAge: 4, maxAge: 4, values: { male: 30, female: 30 }, source: 'driProtein' },
  { minAge: 5, maxAge: 5, values: { male: 30, female: 30 }, source: 'driProtein' },
  { minAge: 6, maxAge: 6, values: { male: 35, female: 35 }, source: 'driProtein' },
  { minAge: 7, maxAge: 7, values: { male: 40, female: 40 }, source: 'driProtein' },
  { minAge: 8, maxAge: 8, values: { male: 40, female: 40 }, source: 'driProtein' },
  { minAge: 9, maxAge: 9, values: { male: 45, female: 45 }, source: 'driProtein' },
  { minAge: 10, maxAge: 10, values: { male: 50, female: 50 }, source: 'driProtein' },
  { minAge: 11, maxAge: 11, values: { male: 55, female: 55 }, source: 'driProtein' },
  { minAge: 12, maxAge: 14, values: { male: 70, female: 60 }, source: 'driProtein' },
  { minAge: 15, maxAge: 17, values: { male: 75, female: 60 }, source: 'driProtein' },
  { minAge: 18, maxAge: 29, values: { male: 65, female: 55 }, source: 'driProtein' },
  { minAge: 30, maxAge: 49, values: { male: 65, female: 55 }, source: 'driProtein' },
  { minAge: 50, maxAge: 64, values: { male: 65, female: 55 }, source: 'driProtein' },
  // 老年人蛋白质高于成人：官方 65 岁起是 72/62，不再沿用 65/55（旧版注释里那个猜测猜对了）。
  { minAge: 65, maxAge: 74, values: { male: 72, female: 62 }, source: 'driProtein' },
  { minAge: 75, maxAge: null, values: { male: 72, female: 62 }, source: 'driProtein' },
];

/**
 * 供能比（AMDR）与膳食纤维。
 *
 * 蛋白质不按供能比算 —— DRIs 给的是**绝对克数 RNI**（`PROTEIN_BANDS`），那是更硬的数，直接用它。
 * 脂肪取 AMDR 20–30% 的中值 25%，碳水吃剩下的能量。两条都在 DRIs 的 AMDR 区间内。
 */
export const FAT_ENERGY_SHARE = 0.25;

/** 上一条的出处：出处在 AMDR 区间，取中值是本应用的选择 —— 两件事分开写清楚。 */
export const FAT_ENERGY_SHARE_REF: Ref = {
  source: 'driEnergy',
  todo: 'AMDR 的脂肪区间 20–30% 是官方值，取中值 25% 是本应用的选择。',
};

/** 膳食纤维适宜摄入量（AI，成人 25–30g，取下限 25g）。 */
export const FIBER_G = 25;

/** 上一条的出处。纤维不随能量派生 —— DRIs 给的是绝对量，所以是常量而不是比例。 */
export const FIBER_G_REF: Ref = {
  source: 'driFiber',
  todo: '成人 AI 是 25–30g，取下限 25g 是本应用的选择。',
};

/** 千卡/克。 */
export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

/**
 * 减脂成员在 EER 基础上减多少千卡。官方给的是「减少 300–500 千卡」这个区间（《成人高脂血症食养指南
 * （2023 年版）》），本应用取中值 400 —— 这个 400 是本应用的选择，不是哪份文件的推荐值。
 * 取中值是**产品选择**（区间两端都是指南允许的），所以出处写指南正文、取值写清是中值。
 */
export const FAT_LOSS_KCAL_DELTA = 400;
export const FAT_LOSS_KCAL_RANGE: [number, number] = [300, 500];

// ─────────────────────────────────────────────────────────────────────────────
// 孕期（指南孕期篇 + DRIs）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 孕期分段的边界（周）。用孕周而不是「第几个月」，因为指南就是这么分段的。
 */
export type PregnancyStage = 'early' | 'middle' | 'late';

export const PREGNANCY_STAGE_LABELS: Record<PregnancyStage, string> = {
  early: '孕早期',
  middle: '孕中期',
  late: '孕晚期',
};

/** 孕周 → 分段。14 周起孕中期，28 周起孕晚期。孕周没填时**不在这里**兜底（那是 `nutrition` 的事）。 */
export function pregnancyStage(week: number): PregnancyStage {
  if (week < 14) return 'early';
  if (week < 28) return 'middle';
  return 'late';
}

/** 没填孕周时按孕中期算 —— 与 `Member.pregnancyWeek` 的注释、表单提示保持一致。 */
export const DEFAULT_PREGNANCY_STAGE: PregnancyStage = 'middle';

export interface PregnancyExtra extends Ref {
  /** 在 EER 上增加多少千卡。 */
  kcal: number;
  /** 在蛋白质 RNI 上增加多少克。 */
  protein: number;
}

/**
 * 孕期的**增量**（相对同年龄同性别的基础值），不是另起一套总量。
 *
 * 用户明确要求「以 2023《DRIs》为准」，所以用的是 DRIs 2023 表15/16/17（孕早/中/晚期，中国 18–49 岁
 * 孕期女性）的 PAL Ⅰ 行总值，减去非孕同表（表10：7.11 MJ/d、蛋白质 RNI 55g）得到的差：
 * 孕早期 0 / 0，孕中期 +1.05 MJ（≈+250 千卡）/ +15g，孕晚期 +1.67 MJ（≈+400 千卡）/ +30g。
 *
 * 注意这里与 2022 指南孕期篇的表述**不一致**（指南写 +300/+450）——那是旧版口径，用户选了 DRIs。
 * 两版的蛋白质增量相同，能量差 50 千卡。
 *
 * 「增量」这三个字是**算出来的**，官方表只印总值（7.11 / 8.16 / 8.78 MJ），没有哪张图印着「+250」——
 * 所以 `todo` 写的是这件事，而不是数字存疑。
 */
export const PREGNANCY: Record<PregnancyStage, PregnancyExtra> = {
  early: {
    kcal: 0,
    protein: 0,
    source: 'driPregnancy',
    todo: '孕早期增量 = 0 是表15 与表10 相减的结果（7.11 − 7.11 MJ），官方表上没有印「+0」这种写法。',
  },
  middle: {
    kcal: 250,
    protein: 15,
    source: 'driPregnancy',
    todo: '增量由表16 减表10 得出（8.16 − 7.11 MJ ≈ +250 千卡），官方表只印总值 8.16 MJ，未印增量。',
  },
  late: {
    kcal: 400,
    protein: 30,
    source: 'driPregnancy',
    todo: '增量由表17 减表10 得出（8.78 − 7.11 MJ ≈ +400 千卡），官方表只印总值 8.78 MJ，未印增量。',
  },
};

/** 孕期重点提示（叶酸/铁/钙）。这些只进提示词与卡片提示，不参与热量核算。 */
export interface PregnancyNutrient extends Ref {
  label: string;
  amount: string;
  note?: string;
}

export const PREGNANCY_NUTRIENTS: PregnancyNutrient[] = [
  {
    label: '叶酸',
    amount: '600µg DFE/日',
    source: 'driFolate',
    todo: '值取自 2023 版表15/16/17 的 RNI 一列（三张表都是 600），但中国营养学会官网没有以文字形式写「孕期叶酸 RNI 600」，此数为图片原件读得。',
    note: '指南孕期篇另建议每天补充叶酸 400µg（补充剂）',
  },
  {
    label: '铁',
    // 非孕 18mg（2023 版把 2013 版的 20mg 降下来了），孕中期 25、孕晚期 29 —— 即 +7 / +11。
    // 2022 指南写的是 20 / 24 / 29（+4 / +9），与 DRIs 不一致；用户选了 DRIs，所以这里用 25 / 29。
    amount: '孕中期 25mg、孕晚期 29mg/日',
    source: 'driIron',
    todo: '值取自 2023 版表16/表17 的 RNI 一列；2022 指南孕期篇写的是 24 / 29mg，两版不一致，本应用按 DRIs。',
    note: '未孕同年龄女性是 18mg（2023 版比旧版下调 2mg）',
  },
  {
    label: '钙',
    amount: '800mg/日（孕期不额外增加）',
    source: 'driCalcium',
    todo: '「孕期不额外增加」出自 2023 版表15/16/17 钙 RNI 与非孕同为 800mg 的对比，官方没有一句文字直说。',
    note: '2022 指南孕期篇的口径是「+200mg（总量 1000mg）」，两版不一致，本应用按 DRIs；奶类 300–500g 是钙的主要来源',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 胰岛素抵抗的碳水上限 —— 本应用口径，不是指南数字
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 胰岛素抵抗成员的碳水供能比上限。
 *
 * **这是产品口径**（见 `HARD_CONSTRAINTS.insulinResistance` 与卡片上的「本应用口径」），不是指南或
 * DRIs 写了 45% —— 指南给的是碳水 AMDR 50–65%，把上限压到 45% 是本应用为了控糖做的决定。所以它挂
 * `source: 'product'`，卡片上不许显示成「依据」。
 *
 * 省下来的能量**全部给蛋白质**，不给脂肪：把碳水换成脂肪对胰岛素抵抗没有好处（见 `nutrition`）。
 */
export const IR_CARB_SHARE_CAP = 0.45;

export const IR_CARB_SHARE_CAP_REF: Ref = {
  source: 'product',
  todo: '45% 是本应用自己划的线，没有官方出处 —— 不要写成「依据」。',
};

// ─────────────────────────────────────────────────────────────────────────────
// 体重方向与疾病的调整 —— 一半来自指南、一半是本应用口径，分开标
// ─────────────────────────────────────────────────────────────────────────────

export interface GoalAdjustment extends Ref {
  /** 在 EER 上加减多少千卡。 */
  kcal: number;
  /** 蛋白质在 RNI 上的倍数（1 = 就用 RNI）。 */
  proteinFactor: number;
  /** 挂在热量那行后面的短说明；`''` = 不加。 */
  kcalNote: string;
  /** 挂在蛋白质那行后面的短说明；`''` = 不加。 */
  proteinNote: string;
}

/**
 * 体重方向的调整。**只有减脂有官方出处**（《成人高脂血症食养指南（2023 年版）》的「每天可减少
 * 300–500 千卡」，不是《膳食指南（2022）》八准则的原文 —— 那一版查不到这句话）；增肌那组数是本应用
 * 口径 —— DRIs 里没有「增肌要多多少千卡」这一条，与其编一个像样的出处，不如照实标 `product`。
 */
export const GOAL_ADJUST: Record<Goal, GoalAdjustment> = {
  fatLoss: {
    kcal: -FAT_LOSS_KCAL_DELTA,
    proteinFactor: 1,
    kcalNote: `减脂 −${FAT_LOSS_KCAL_DELTA} 千卡（《成人高脂血症食养指南（2023 年版）》区间 300–500 的中值）`,
    proteinNote: '',
    source: 'guideHyperlipidemia',
    todo: '官方给的是「减少 300–500 千卡」这个区间（出自《成人高脂血症食养指南（2023 年版）》，不是膳食指南八准则原文），取中值 400 是本应用的选择。另：《成人肥胖食养指南（2024 年版）》给的是 500–1000 千卡或降低 30%–50%，口径不同，本应用没有采用。',
  },
  balanced: { kcal: 0, proteinFactor: 1, kcalNote: '', proteinNote: '', source: 'driEnergy' },
  muscleGain: {
    kcal: 300,
    proteinFactor: 1.5,
    kcalNote: '增肌 +300 千卡（本应用口径）',
    proteinNote: '增肌蛋白质 ×1.5（本应用口径）',
    source: 'product',
    todo: '增肌没有官方 EER 增量，+300 千卡与蛋白质 ×1.5 是本应用口径，不是 DRIs 推荐值。',
  },
};

export interface ClinicalAdjustment extends Ref {
  /** 供能比里的脂肪份额；不填 = 用 `FAT_ENERGY_SHARE`。 */
  fatShare?: number;
  proteinFactor: number;
  note: string;
}

/**
 * 代谢疾病对**数量**的调整。只管数量：整道菜的排除在 `diet` 里（按配料分级），两处不要互相抄。
 *
 * 只列有两个病的：痛风、高血压管的是「选什么菜」（嘌呤、钠），不改变一天吃多少千卡，所以不在表里 ——
 * 这是有意的，别当成漏了。
 */
export const CLINICAL_ADJUST: Partial<Record<MetabolicTag, ClinicalAdjustment>> = {
  ckd: {
    proteinFactor: 0.8,
    note: '慢性肾病蛋白质按下调（本应用口径），实际限量请遵医嘱',
    source: 'product',
    todo: 'CKD 的蛋白质限量要按分期由医生定（0.6–0.8g/kg），这里只做了 0.8 倍的保守下调。',
  },
  hyperlipidemia: {
    fatShare: 0.2,
    proteinFactor: 1,
    note: '脂肪取 AMDR 下限 20%（本应用口径）',
    source: 'product',
    todo: 'AMDR 的官方区间是 20–30%，取哪一端是本应用的选择，不是推荐值。',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 查表
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 按年龄取档。`age === 0`（没填）落到**成人第一档**（18–29 岁，2023 版里最年轻的一档成人），
 * 由 `nutrition` 在卡片上写明「按成人档算」。
 */
function bandFor(bands: BandedValues[], age: number): BandedValues {
  const adult = bands.find((band) => band.minAge === 18)!;
  if (age <= 0) return adult;
  return (
    bands.find((band) => age >= band.minAge && (band.maxAge === null || age <= band.maxAge)) ?? adult
  );
}

export function energyBandFor(age: number): BandedValues {
  return bandFor(EER_BANDS, age);
}

export function proteinBandFor(age: number): BandedValues {
  return bandFor(PROTEIN_BANDS, age);
}

/**
 * 该成员按哪张宝塔算食物类别。
 *
 * - 1–5 岁 → 学龄前儿童宝塔（分两档；1 岁没有自己的宝塔，按最近的 2–3 岁档算，比大人档近得多）
 * - 65 岁起 → 老年人宝塔（65–79 一般、80 以上高龄）
 * - 其余 → 成人宝塔。**6–17 岁的学龄儿童另有官方宝塔**（《中国学龄儿童膳食指南（2022）》，6–10 /
 *   11–13 / 14–17 岁三档，中国营养学会官网有原文），但本模块还没收录，所以它拿到的也是成人宝塔，
 *   依据那行写的就是成人宝塔 —— 宁可口径粗，也不冒充一份没录进来的儿童标准。
 *
 * `age === 0` 是「没填」不是「刚出生」，所以走成人档，和 `energyBandFor` 一致。
 */
export function pagodaFor(age: number): { groups: FoodGroup[]; source: SourceKey } {
  if (age >= 80) return { groups: SENIOR_PAGODA.oldest, source: 'pagodaSenior' };
  if (age >= 65) return { groups: SENIOR_PAGODA.general, source: 'pagodaSenior' };
  // 学龄儿童暂时与成人共用成人宝塔，所以这条要排在学龄前前面 —— 否则 4 岁以上所有人都落进儿童档
  // （`age >= 4` 是不设上界的，写反顺序会让成年人的家庭目标变成几岁孩子的量）。
  if (age >= 6) return { groups: ADULT_PAGODA, source: 'pagodaAdult' };
  if (age >= 4) return { groups: PRESCHOOL_PAGODA.preschool, source: 'pagodaPreschool' };
  if (age >= 1) return { groups: PRESCHOOL_PAGODA.toddler, source: 'pagodaPreschool' };
  return { groups: ADULT_PAGODA, source: 'pagodaAdult' };
}
