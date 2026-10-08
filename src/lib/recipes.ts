import type { IngredientUnit, Recipe, StapleServing } from './types';

/**
 * Built-in recipe library. v1 deliberately ships fixed data instead of calling a model,
 * so the plan is generated offline from what is actually in the fridge.
 *
 * Conventions:
 * - Ingredient amounts are for ONE serving; the UI multiplies them by the household's total 份数
 *   (`members.householdPortions`, where an adult is 1 份, a child 0.5 and a 长辈 0.8).
 * - Seasoning liquids are measured in 勺 (1 勺 ≈ 15 毫升), powders in 克, aromatics in 瓣/片/根.
 * - Every dish declares `spice`. `'hot'` is a HARD exclusion for households with a 幼儿 — that rule
 *   lives in `diet.SPICY_HARD_EXCLUDE_KEYS`, not in `exclusions`, so the two cannot disagree.
 * - `exclusions` is for real taboos only (生食 / 酒精), never for taste — 口味 is the family-wide
 *   `Profile.preferences`, which only down-weights. Anything milder goes in `cautions`.
 * - `care` (今日页「兼顾说明」) and `cautions` (详情页「注意事项」) are keyed by member tag; `{name}` is
 *   replaced with the member's 称呼. Hand-written text wins, and a missing entry falls back to a
 *   template that is derived from the dish's own numbers (see `advice.ts`).
 * - `ingredients` are the main ingredients that drive fridge matching; `seasonings` are
 *   assumed to be pantry staples and never count as missing.
 * - `staple` is the 主食 a dish is served with, structured so the 今日 tab can scale it to the
 *   household's 份数, each member's 身体目标 (`staples.stapleFactorSum`). 午/晚餐 must set it (their
 *   `pairing` is only a staple); 早餐 leaves it undefined because its staple is already one of
 *   `ingredients` (category: 'staple'), which also means its energy is inside `calories`.
 * - Never move a `staple` into `ingredients`: those drive fridge matching and the 采购清单, and a
 *   suggested bowl of rice must not count as a missing ingredient.
 */

/** Shared 主食 suggestions so the same bowl is written once. Amounts are per person. */
const WHITE_RICE: StapleServing = { name: '白米饭', amount: 150, unit: 'g' };
const MIXED_GRAIN_RICE: StapleServing = { name: '杂粮饭', amount: 150, unit: 'g' };
const BROWN_RICE: StapleServing = { name: '糙米饭', amount: 150, unit: 'g' };
const MILLET_PORRIDGE: StapleServing = { name: '小米粥', amount: 250, unit: 'g' };

export const RECIPES: Recipe[] = [
  {
    id: 'xiaomi-nangua-zhou',
    name: '小米南瓜粥',
    slots: ['breakfast'],
    minutes: 30,
    calories: 220,
    protein: 6,
    oilLevel: 'low',
    goals: ['fatLoss', 'balanced'],
    preferences: ['light', 'vegetarian', 'lowSugar'],
    spice: 'none',
    ingredients: [
      { name: '小米', amount: 60, unit: 'g', category: 'staple' },
      { name: '南瓜', amount: 150, unit: 'g', category: 'veg' },
    ],
    seasonings: [
      { name: '清水', amount: 800, unit: 'ml', category: 'seasoning', optional: true },
      { name: '冰糖', amount: 5, unit: 'g', category: 'seasoning', optional: true },
    ],
    steps: [
      '小米淘洗两遍，沥干备用。',
      '南瓜去皮去瓤，切成 2 厘米见方的小块。',
      '锅中加 800 毫升清水，冷水下小米，大火煮沸后转小火煮 15 分钟，其间搅动两次防粘底。',
      '放入南瓜块继续小火煮 10 分钟，至南瓜软烂、粥体黏稠。',
      '关火焖 2 分钟，按口味决定是否加冰糖，搅匀即可。',
    ],
    pairing: '配水煮蛋 1 个',
    tip: '想更黏稠可减少 100 毫升水，或最后 5 分钟开盖收汁。',
  },
  {
    id: 'fanqie-jidan-mian',
    name: '番茄鸡蛋面',
    slots: ['breakfast'],
    minutes: 15,
    calories: 430,
    protein: 20,
    oilLevel: 'medium',
    goals: ['balanced', 'muscleGain'],
    preferences: ['light'],
    spice: 'none',
    ingredients: [
      { name: '番茄', amount: 200, unit: 'g', category: 'veg' },
      { name: '鸡蛋', amount: 2, unit: '个', category: 'egg' },
      { name: '挂面', amount: 100, unit: 'g', category: 'staple' },
      { name: '小葱', amount: 1, unit: '根', category: 'veg' },
    ],
    seasonings: [
      { name: '食用油', amount: 10, unit: 'ml', category: 'seasoning' },
      { name: '生抽', amount: 1, unit: '勺', category: 'seasoning' },
      { name: '盐', amount: 2, unit: 'g', category: 'seasoning' },
      { name: '白糖', amount: 3, unit: 'g', category: 'seasoning' },
    ],
    steps: [
      '番茄顶部划十字，开水烫 30 秒后去皮，切滚刀块。',
      '鸡蛋打散，加 1 克盐搅匀；小葱切葱花。',
      '热锅倒油，大火倒入蛋液炒至刚凝固即盛出。',
      '原锅下番茄中火炒 2 分钟出汁，加生抽、白糖和剩余的盐炒匀。',
      '加 400 毫升热水煮沸，下挂面煮 3 分钟至断生。',
      '倒回炒蛋煮 30 秒，撒葱花出锅。',
    ],
    pairing: '面本身就是主食，不用再配',
    tip: '鸡蛋先盛出最后回锅，口感才不会老。',
  },
  {
    id: 'shuizhudan-tusi',
    name: '水煮蛋全麦吐司',
    slots: ['breakfast'],
    minutes: 10,
    calories: 320,
    protein: 20,
    oilLevel: 'low',
    goals: ['fatLoss', 'muscleGain'],
    preferences: ['light', 'lowSugar'],
    spice: 'none',
    // 溏心（步骤里那个「煮 6 分钟」）是孕妇唯一要改的地方，整道菜不必排除。
    cautions: { pregnancy: '{name}要吃全熟蛋就别做溏心，煮够 7 分钟' },
    ingredients: [
      { name: '鸡蛋', amount: 2, unit: '个', category: 'egg' },
      { name: '全麦吐司', amount: 2, unit: '片', category: 'staple' },
      { name: '生菜', amount: 30, unit: 'g', category: 'veg' },
      { name: '番茄', amount: 80, unit: 'g', category: 'veg' },
    ],
    seasonings: [
      { name: '盐', amount: 1, unit: 'g', category: 'seasoning' },
      { name: '黑胡椒', amount: 0.5, unit: 'g', category: 'seasoning', optional: true },
    ],
    steps: [
      '鸡蛋冷水下锅，水沸后煮 7 分钟（想要溏心煮 6 分钟）。',
      '捞出过冷水，剥壳后切片。',
      '吐司放入烤箱或平底锅，小火烤 2 分钟至表面微脆。',
      '生菜洗净沥干，番茄切 5 毫米厚片。',
      '吐司上依次铺生菜、番茄和蛋片，撒盐和黑胡椒即可。',
    ],
    pairing: '配无糖豆浆 200 毫升',
    tip: '鸡蛋煮好立刻过冷水，蛋壳一剥就掉。',
  },
  {
    id: 'niunai-yanmai',
    name: '牛奶燕麦香蕉杯',
    slots: ['breakfast'],
    minutes: 5,
    calories: 380,
    protein: 15,
    oilLevel: 'low',
    goals: ['muscleGain', 'balanced'],
    preferences: ['light'],
    spice: 'none',
    care: { growingChild: '有奶有钙，{name}长个子' },
    ingredients: [
      { name: '即食燕麦片', amount: 50, unit: 'g', category: 'staple' },
      { name: '牛奶', amount: 250, unit: 'ml', category: 'egg' },
      { name: '香蕉', amount: 1, unit: '个', category: 'veg' },
    ],
    seasonings: [
      { name: '蜂蜜', amount: 1, unit: '勺', category: 'seasoning', optional: true },
      { name: '奇亚籽', amount: 5, unit: 'g', category: 'seasoning', optional: true },
    ],
    steps: [
      '燕麦片倒入碗中。',
      '牛奶加热到约 60 摄氏度（锅边冒小泡即可），倒入燕麦搅匀，静置 3 分钟。',
      '香蕉去皮切片，铺在表面。',
      '按口味淋蜂蜜、撒奇亚籽。',
    ],
    pairing: '配水煮蛋 1 个补齐蛋白质',
    tip: '牛奶不要煮沸，高温会让燕麦发黏、奶香变淡。',
  },
  {
    id: 'fanqie-chaodan',
    name: '番茄炒蛋',
    slots: ['lunch', 'dinner'],
    minutes: 10,
    calories: 240,
    protein: 15,
    oilLevel: 'medium',
    goals: ['balanced', 'muscleGain'],
    preferences: ['light'],
    spice: 'none',
    ingredients: [
      { name: '番茄', amount: 250, unit: 'g', category: 'veg' },
      { name: '鸡蛋', amount: 3, unit: '个', category: 'egg' },
      { name: '小葱', amount: 1, unit: '根', category: 'veg' },
    ],
    seasonings: [
      { name: '食用油', amount: 12, unit: 'ml', category: 'seasoning' },
      { name: '盐', amount: 2, unit: 'g', category: 'seasoning' },
      { name: '白糖', amount: 3, unit: 'g', category: 'seasoning' },
      { name: '番茄酱', amount: 1, unit: '勺', category: 'seasoning', optional: true },
    ],
    steps: [
      '番茄去皮切滚刀块；鸡蛋打散，加 1 克盐搅匀。',
      '热锅倒 8 毫升油，倒入蛋液大火炒至刚凝固盛出。',
      '补 4 毫升油，下番茄中火炒 2 分钟至出汁。',
      '加盐、白糖和番茄酱炒匀。',
      '倒回鸡蛋翻炒 30 秒，撒葱花出锅。',
    ],
    staple: WHITE_RICE,
    pairing: '配白米饭 1 小碗',
    tip: '番茄烫皮后更容易出汁，成品不会水塌塌。',
  },
  {
    id: 'qingchao-xilanhua',
    name: '清炒西兰花',
    slots: ['lunch', 'dinner'],
    minutes: 8,
    calories: 120,
    protein: 6,
    oilLevel: 'low',
    goals: ['fatLoss'],
    preferences: ['light', 'vegetarian', 'lowSugar'],
    spice: 'none',
    care: { growingChild: '西兰花含钙，{name}长身体正需要' },
    ingredients: [
      { name: '西兰花', amount: 300, unit: 'g', category: 'veg' },
      { name: '大蒜', amount: 2, unit: '瓣', category: 'veg' },
    ],
    seasonings: [
      { name: '食用油', amount: 8, unit: 'ml', category: 'seasoning' },
      { name: '盐', amount: 2, unit: 'g', category: 'seasoning' },
      { name: '生抽', amount: 1, unit: '勺', category: 'seasoning' },
    ],
    steps: [
      '西兰花掰成小朵，用淡盐水泡 5 分钟后洗净。',
      '水烧开加少许盐和几滴油，西兰花焯 40 秒，捞出过冷水沥干。',
      '大蒜切片。',
      '热锅下油，中火爆香蒜片。',
      '倒入西兰花大火翻炒 1 分钟，加盐和生抽炒匀出锅。',
    ],
    staple: MIXED_GRAIN_RICE,
    pairing: '配杂粮饭 1 小碗',
    tip: '焯水后过冷水能锁住翠绿，也不会炒出黄水。',
  },
  {
    id: 'suanrong-youmaicai',
    name: '蒜蓉油麦菜',
    slots: ['lunch', 'dinner'],
    minutes: 7,
    calories: 90,
    protein: 4,
    oilLevel: 'low',
    goals: ['fatLoss'],
    preferences: ['light', 'vegetarian', 'lowSugar'],
    spice: 'none',
    ingredients: [
      { name: '油麦菜', amount: 300, unit: 'g', category: 'veg' },
      { name: '大蒜', amount: 3, unit: '瓣', category: 'veg' },
    ],
    seasonings: [
      { name: '食用油', amount: 8, unit: 'ml', category: 'seasoning' },
      { name: '盐', amount: 2, unit: 'g', category: 'seasoning' },
      { name: '生抽', amount: 0.5, unit: '勺', category: 'seasoning' },
    ],
    steps: [
      '油麦菜洗净，切成 5 厘米长段，菜梗和菜叶分开放。',
      '大蒜切末，分成两半。',
      '热锅下油，中火爆香一半蒜末。',
      '先下菜梗炒 30 秒，再下菜叶大火翻炒 1 分钟。',
      '加盐和生抽，撒上剩余蒜末炒匀出锅。',
    ],
    staple: WHITE_RICE,
    pairing: '配白米饭 1 小碗',
    tip: '蒜末分两次放，起锅前那一把最提香。',
  },
  {
    id: 'xiangjian-jixiong-xilanhua',
    name: '香煎鸡胸配西兰花',
    slots: ['lunch', 'dinner'],
    minutes: 18,
    calories: 330,
    protein: 45,
    oilLevel: 'low',
    goals: ['fatLoss', 'muscleGain'],
    preferences: ['light', 'lowSugar'],
    spice: 'none',
    care: {
      fatLoss: '{name}减脂的好主菜，少油煎、饱腹',
      muscleGain: '蛋白质 45 克，{name}增肌刚好',
      growingChild: '蛋白质 45 克，{name}长身体管够'
    },
    ingredients: [
      { name: '鸡胸肉', amount: 200, unit: 'g', category: 'meat' },
      { name: '西兰花', amount: 150, unit: 'g', category: 'veg' },
      { name: '大蒜', amount: 2, unit: '瓣', category: 'veg' },
    ],
    seasonings: [
      { name: '橄榄油', amount: 8, unit: 'ml', category: 'seasoning' },
      { name: '生抽', amount: 1, unit: '勺', category: 'seasoning' },
      { name: '料酒', amount: 1, unit: '勺', category: 'seasoning' },
      { name: '盐', amount: 2, unit: 'g', category: 'seasoning' },
      { name: '黑胡椒', amount: 1, unit: 'g', category: 'seasoning' },
    ],
    steps: [
      '鸡胸肉横刀片成 1.5 厘米厚，用刀背轻拍松。',
      '加盐、黑胡椒、生抽和料酒抓匀，腌 10 分钟。',
      '西兰花掰小朵，沸水焯 1 分钟捞出沥干。',
      '平底锅刷橄榄油，中火预热后下鸡胸肉，每面煎 3 分钟至表面微焦。',
      '关火后静置 2 分钟再切片。',
      '同锅爆香蒜片，下西兰花翻炒 30 秒，与鸡胸肉一起装盘。',
    ],
    staple: BROWN_RICE,
    pairing: '配糙米饭 1 小碗',
    tip: '煎好静置 2 分钟再切，肉汁才不会全流出来。',
  },
  {
    id: 'baizhuo-xia',
    name: '白灼虾',
    slots: ['lunch', 'dinner'],
    minutes: 10,
    calories: 140,
    protein: 30,
    oilLevel: 'low',
    goals: ['fatLoss', 'muscleGain'],
    preferences: ['light', 'lowSugar'],
    spice: 'none',
    care: {
      pregnancy: '{name}可以放心吃，虾低汞、煮到全熟就行',
      growingChild: '高蛋白，{name}长身体正合适',
      fatLoss: '白灼几乎不加油，{name}减脂能吃'
    },
    cautions: { toddler: '{name}那份要剥壳去虾线，切成小块' },
    ingredients: [
      { name: '鲜虾', amount: 250, unit: 'g', category: 'meat' },
      { name: '姜', amount: 3, unit: '片', category: 'veg' },
      { name: '小葱', amount: 1, unit: '根', category: 'veg' },
    ],
    seasonings: [
      { name: '料酒', amount: 1, unit: '勺', category: 'seasoning' },
      { name: '生抽', amount: 1.5, unit: '勺', category: 'seasoning' },
      { name: '香醋', amount: 0.5, unit: '勺', category: 'seasoning' },
      { name: '香油', amount: 0.5, unit: '勺', category: 'seasoning' },
    ],
    steps: [
      '鲜虾剪去虾枪和长须，挑出虾线，洗净沥干。',
      '锅中加 1000 毫升水，放姜片、葱段和料酒煮沸。',
      '下虾煮 2 分钟，至虾身弯曲变红。',
      '捞出立刻过冰水 30 秒，沥干装盘。',
      '生抽、香醋、香油加姜末调成蘸料。',
    ],
    staple: WHITE_RICE,
    pairing: '配白米饭 1 小碗',
    tip: '煮好过一遍冰水，虾肉更紧实弹牙。',
  },
  {
    id: 'mapo-doufu',
    name: '麻婆豆腐',
    slots: ['lunch', 'dinner'],
    minutes: 15,
    calories: 320,
    protein: 22,
    oilLevel: 'medium',
    goals: ['balanced'],
    preferences: ['spicy'],
    spice: 'hot',
    ingredients: [
      { name: '嫩豆腐', amount: 400, unit: 'g', category: 'veg' },
      { name: '猪肉末', amount: 80, unit: 'g', category: 'meat' },
      { name: '大蒜', amount: 2, unit: '瓣', category: 'veg' },
      { name: '姜', amount: 2, unit: '片', category: 'veg' },
      { name: '小葱', amount: 1, unit: '根', category: 'veg' },
    ],
    seasonings: [
      { name: '豆瓣酱', amount: 2, unit: '勺', category: 'seasoning' },
      { name: '食用油', amount: 15, unit: 'ml', category: 'seasoning' },
      { name: '生抽', amount: 1, unit: '勺', category: 'seasoning' },
      { name: '淀粉', amount: 5, unit: 'g', category: 'seasoning' },
      { name: '花椒粉', amount: 2, unit: 'g', category: 'seasoning' },
      { name: '辣椒面', amount: 3, unit: 'g', category: 'seasoning', optional: true },
    ],
    steps: [
      '嫩豆腐切 2 厘米方块，放淡盐水里浸 5 分钟。',
      '锅中水烧开加盐，豆腐焯 1 分钟后捞出沥干。',
      '热锅下油，中小火把肉末炒散至微黄。',
      '下豆瓣酱、姜蒜末炒出红油，加辣椒面炒香。',
      '加 200 毫升热水和生抽煮沸，下豆腐轻推煮 3 分钟。',
      '淀粉加水调匀勾芡，出锅撒花椒粉和葱花。',
    ],
    staple: WHITE_RICE,
    pairing: '配白米饭 1 小碗',
    tip: '全程用推的别用铲子翻，豆腐才不碎。',
  },
  {
    id: 'gongbao-jiding',
    name: '宫保鸡丁',
    slots: ['lunch', 'dinner'],
    minutes: 20,
    calories: 450,
    protein: 30,
    oilLevel: 'high',
    goals: ['muscleGain'],
    preferences: ['spicy'],
    spice: 'hot',
    // 重辣对幼儿的排除是派生出来的（`diet.SPICY_HARD_EXCLUDE_KEYS`），这里只写别的提醒。
    cautions: { toddler: '花生米要碾碎，别整颗给{name}', seniorLight: '糖和油都偏高，{name}浅尝即可' },
    ingredients: [
      { name: '鸡腿肉', amount: 250, unit: 'g', category: 'meat' },
      { name: '花生米', amount: 40, unit: 'g', category: 'veg' },
      { name: '大葱', amount: 1, unit: '段', category: 'veg' },
      { name: '大蒜', amount: 2, unit: '瓣', category: 'veg' },
      { name: '姜', amount: 2, unit: '片', category: 'veg' },
    ],
    seasonings: [
      { name: '食用油', amount: 20, unit: 'ml', category: 'seasoning' },
      { name: '干辣椒', amount: 6, unit: '个', category: 'seasoning' },
      { name: '花椒', amount: 2, unit: 'g', category: 'seasoning' },
      { name: '生抽', amount: 1.5, unit: '勺', category: 'seasoning' },
      { name: '香醋', amount: 1, unit: '勺', category: 'seasoning' },
      { name: '料酒', amount: 1, unit: '勺', category: 'seasoning' },
      { name: '白糖', amount: 10, unit: 'g', category: 'seasoning' },
      { name: '淀粉', amount: 5, unit: 'g', category: 'seasoning' },
    ],
    steps: [
      '鸡腿肉去骨切 1.5 厘米丁，加料酒、半勺生抽和淀粉抓匀，腌 15 分钟。',
      '剩下的一勺生抽加香醋、白糖、3 克淀粉和 30 毫升水，调成料汁。',
      '花生米冷油下锅，小火炸 2 分钟至微黄盛出。',
      '热锅下油，中火下干辣椒和花椒炒香。',
      '下鸡丁大火炒至变色，约 3 分钟。',
      '下葱段、姜蒜炒 30 秒，倒入料汁炒至均匀裹上。',
      '关火拌入花生米出锅。',
    ],
    staple: WHITE_RICE,
    pairing: '配白米饭 1 小碗',
    tip: '花生米最后拌入才酥，早放会回软。',
  },
  {
    id: 'qingjiao-tudousi',
    name: '青椒土豆丝',
    slots: ['lunch', 'dinner'],
    minutes: 12,
    calories: 180,
    protein: 5,
    oilLevel: 'medium',
    goals: ['balanced'],
    preferences: ['spicy'],
    spice: 'mild',
    ingredients: [
      { name: '土豆', amount: 250, unit: 'g', category: 'staple' },
      { name: '青椒', amount: 100, unit: 'g', category: 'veg' },
      { name: '大蒜', amount: 2, unit: '瓣', category: 'veg' },
    ],
    seasonings: [
      { name: '食用油', amount: 12, unit: 'ml', category: 'seasoning' },
      { name: '白醋', amount: 1, unit: '勺', category: 'seasoning' },
      { name: '盐', amount: 2, unit: 'g', category: 'seasoning' },
      { name: '干辣椒', amount: 3, unit: '个', category: 'seasoning', optional: true },
      { name: '花椒', amount: 1, unit: 'g', category: 'seasoning', optional: true },
    ],
    steps: [
      '土豆去皮切细丝，清水冲两遍洗去淀粉，泡在清水里。',
      '青椒去籽切丝，大蒜切片。',
      '热锅下油，小火爆香花椒和干辣椒后捞出。',
      '转大火下土豆丝翻炒 2 分钟。',
      '淋白醋、加盐，下青椒丝炒 1 分钟。',
      '加蒜片炒匀出锅。',
    ],
    // 土豆 is the dish's own starchy main, not its 主食 — hence the explicit field.
    staple: MILLET_PORRIDGE,
    pairing: '配小米粥 1 碗',
    tip: '土豆丝冲掉淀粉再炒，口感才爽脆不粘锅。',
  },
  {
    id: 'xianggu-huaji',
    name: '香菇滑鸡',
    slots: ['lunch', 'dinner'],
    minutes: 25,
    calories: 360,
    protein: 32,
    oilLevel: 'medium',
    goals: ['muscleGain', 'balanced'],
    preferences: ['light'],
    spice: 'none',
    ingredients: [
      { name: '鸡腿肉', amount: 250, unit: 'g', category: 'meat' },
      { name: '干香菇', amount: 30, unit: 'g', category: 'veg' },
      { name: '姜', amount: 3, unit: '片', category: 'veg' },
      { name: '小葱', amount: 1, unit: '根', category: 'veg' },
    ],
    seasonings: [
      { name: '食用油', amount: 10, unit: 'ml', category: 'seasoning' },
      { name: '生抽', amount: 1.5, unit: '勺', category: 'seasoning' },
      { name: '蚝油', amount: 1, unit: '勺', category: 'seasoning' },
      { name: '料酒', amount: 1, unit: '勺', category: 'seasoning' },
      { name: '淀粉', amount: 5, unit: 'g', category: 'seasoning' },
      { name: '白糖', amount: 3, unit: 'g', category: 'seasoning' },
    ],
    steps: [
      '干香菇温水泡 30 分钟，挤干切片，泡菇水静置留用。',
      '鸡腿肉切 3 厘米块，加料酒、半勺生抽、淀粉和白糖抓匀，腌 15 分钟。',
      '热锅下油，中火下姜片和鸡块煎至表面变色。',
      '下香菇片炒 1 分钟。',
      '加剩余生抽、蚝油和 100 毫升澄清的泡菇水，盖盖小火焖 8 分钟。',
      '开盖大火收汁，撒葱花出锅。',
    ],
    staple: WHITE_RICE,
    pairing: '配白米饭 1 小碗',
    tip: '泡菇水是整道菜的鲜味来源，沉淀别倒进去。',
  },
  {
    id: 'donggua-paigu-tang',
    name: '冬瓜排骨汤',
    slots: ['lunch', 'dinner'],
    minutes: 60,
    calories: 280,
    protein: 25,
    oilLevel: 'medium',
    goals: ['balanced'],
    preferences: ['light'],
    spice: 'none',
    care: { seniorLight: '炖得软烂，{name}好入口' },
    cautions: { toddler: '排骨带骨，{name}那份先剔骨' },
    ingredients: [
      { name: '排骨', amount: 300, unit: 'g', category: 'meat' },
      { name: '冬瓜', amount: 300, unit: 'g', category: 'veg' },
      { name: '姜', amount: 3, unit: '片', category: 'veg' },
      { name: '小葱', amount: 1, unit: '根', category: 'veg' },
    ],
    seasonings: [
      { name: '清水', amount: 1200, unit: 'ml', category: 'seasoning', optional: true },
      { name: '料酒', amount: 1, unit: '勺', category: 'seasoning' },
      { name: '盐', amount: 3, unit: 'g', category: 'seasoning' },
      { name: '白胡椒粉', amount: 1, unit: 'g', category: 'seasoning' },
    ],
    steps: [
      '排骨冷水下锅，加料酒和 2 片姜，煮沸后撇净浮沫，捞出用温水冲净。',
      '排骨和姜片放进汤锅，加 1200 毫升清水，大火煮沸后转小火炖 40 分钟。',
      '冬瓜去皮去瓤，切 2 厘米块。',
      '下冬瓜继续炖 15 分钟，至冬瓜透明。',
      '加盐和白胡椒粉调味，撒葱花。',
    ],
    staple: WHITE_RICE,
    pairing: '配白米饭 1 小碗',
    tip: '焯水后用温水冲，冷水一激肉会发柴。',
  },
  {
    id: 'liangban-huanggua',
    name: '凉拌黄瓜',
    slots: ['lunch', 'dinner'],
    minutes: 5,
    calories: 70,
    protein: 2,
    oilLevel: 'low',
    goals: ['fatLoss'],
    preferences: ['light', 'vegetarian', 'lowSugar'],
    spice: 'mild',
    care: { fatLoss: '{name}减脂可以放开吃，几乎没热量' },
    cautions: { toddler: '小米辣可以不放，{name}那份单拌' },
    ingredients: [
      { name: '黄瓜', amount: 250, unit: 'g', category: 'veg' },
      { name: '大蒜', amount: 3, unit: '瓣', category: 'veg' },
      { name: '小米辣', amount: 2, unit: '个', category: 'veg', optional: true },
    ],
    seasonings: [
      { name: '生抽', amount: 1, unit: '勺', category: 'seasoning' },
      { name: '香醋', amount: 1, unit: '勺', category: 'seasoning' },
      { name: '香油', amount: 0.5, unit: '勺', category: 'seasoning' },
      { name: '白糖', amount: 3, unit: 'g', category: 'seasoning' },
      { name: '盐', amount: 1, unit: 'g', category: 'seasoning' },
    ],
    steps: [
      '黄瓜洗净拍裂，切成 3 厘米段。',
      '加盐抓匀腌 5 分钟，倒掉渗出的水。',
      '大蒜切末，小米辣切圈。',
      '生抽、香醋、白糖、香油调成料汁。',
      '所有材料拌匀，冷藏 5 分钟风味更好。',
    ],
    staple: MIXED_GRAIN_RICE,
    pairing: '配杂粮饭 1 小碗',
    tip: '先腌出水再拌，黄瓜才脆不出汤。',
  },
  {
    id: 'sanwenyu-cishen',
    name: '三文鱼刺身',
    slots: ['lunch', 'dinner'],
    minutes: 10,
    calories: 210,
    protein: 28,
    oilLevel: 'low',
    goals: ['fatLoss', 'muscleGain'],
    preferences: ['light', 'lowSugar'],
    spice: 'none',
    // 唯一一道生食菜：孕期和幼儿都是硬排除，也是「有禁忌就整道排除」这条规则最好的示例。
    exclusions: { pregnancy: '生食', toddler: '生食' },
    cautions: { pregnancy: '生鱼片有寄生虫和细菌风险，{name}请改吃煎熟的三文鱼' },
    care: {
      fatLoss: '{name}减脂可以放心吃，完全不用油',
      muscleGain: '蛋白质 28 克，{name}增肌够用'
    },
    ingredients: [
      { name: '三文鱼', amount: 200, unit: 'g', category: 'meat' },
      { name: '白萝卜', amount: 100, unit: 'g', category: 'veg' },
      { name: '紫苏叶', amount: 4, unit: '片', category: 'veg', optional: true },
    ],
    seasonings: [
      { name: '生抽', amount: 2, unit: '勺', category: 'seasoning' },
      { name: '芥末', amount: 5, unit: 'g', category: 'seasoning', optional: true },
      { name: '柠檬', amount: 2, unit: '片', category: 'seasoning', optional: true },
    ],
    steps: [
      '三文鱼提前一天放冷藏室解冻，全程别用热水泡。',
      '用厨房纸吸干表面水分，顺着纹理斜刀切成 5 毫米厚片。',
      '白萝卜去皮切成细丝，泡冰水 5 分钟后沥干垫底。',
      '鱼片摆盘，盖上保鲜膜冷藏 10 分钟再上桌。',
      '生抽加芥末调成蘸碟，吃前挤几滴柠檬。',
    ],
    staple: WHITE_RICE,
    pairing: '配白米饭 1 小碗',
    tip: '一定要买标注「刺身级」的冷冻三文鱼，普通鲜鱼不推荐生吃。',
  },
];

/**
 * AI 生成的菜谱，与 `RECIPES` 并列的第二本账。
 *
 * **为什么不直接 push 进 `RECIPES`**：那个数组同时是「菜谱库」的语义 —— `mine.tsx` 数它一共有几道、
 * 列出全部，`planner.ts` 的三个候选池与 `safeFallback` 从它里面挑，`advice.excludedRecipes` 拿它当
 * 「哪些菜不能吃」的对照表。把 AI 的菜混进去，明天的菜单就可能被本地规则挑中一道只存在于今天的菜，
 * 菜谱库也会一天天长起来。并列一本账，那些地方一个字节都不用改。
 *
 * **不变式（`reactCompiler: true` 下的硬要求）**：这是模块级状态，React Compiler 看不见它，而
 * `index.tsx`（渲染里解析菜谱）、`storage.tsx` 的 `useMemo`（`buildShoppingList` / `buildStaplePlan`
 * 内部也调 `getRecipe`）都按 `plan` 的**引用**做记忆。所以：
 *
 *   registry 变 ⟺ `plan` 引用变，必须在同一次提交里完成。
 *
 * 落地就是 `storage.tsx` 里那个唯一的 `publishPlan(plan, aiRecipes)` —— 不要绕过它单独调这个函数。
 *
 * **不要**让 `getRecipe` 自己按日期过期（内部查 `todayKey()`）：app 没有跨天定时器，跨天只在水合时
 * 发生一次；日期感知的 `getRecipe` 会在午夜静默把 AI 菜单变空，而本地菜单照常工作，最难查的就是这种。
 * 「昨天的菜谱还算不算数」由 `plan.date` 和 store 管。
 */
let customRecipes: Recipe[] = [];

/** 整体替换 AI 菜谱（传 `[]` 即清空）。调用方必须遵守上面的不变式。 */
export function setCustomRecipes(recipes: Recipe[]): void {
  customRecipes = recipes;
}

/** 今天的菜单还能不能解析出来 —— 水合时用它复验存下来的 plan，见 `storage.tsx`。 */
export function getRecipe(id: string): Recipe | undefined {
  return RECIPES.find((recipe) => recipe.id === id) ?? customRecipes.find((recipe) => recipe.id === id);
}

/**
 * Converts a per-serving amount into the amount needed for `servings` people: grams and
 * millilitres round to whole numbers once they get large, spoonfuls snap to half-spoon
 * precision, and countable pieces (个/片/根/瓣) stay whole.
 */
export function scaleAmount(amount: number, unit: IngredientUnit, servings: number): number {
  const scaled = amount * servings;
  switch (unit) {
    case 'g':
    case 'ml':
      return scaled >= 10 ? Math.round(scaled) : Math.round(scaled * 10) / 10;
    case '勺':
      return Math.round(scaled * 2) / 2;
    default:
      return Math.max(1, Math.round(scaled));
  }
}
