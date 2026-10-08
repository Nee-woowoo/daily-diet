import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  buildMenuPrompt,
  failure,
  menuPlan,
  parseMenu,
  retryCorrection,
  type AiFailure,
} from './ai';
import { callDeepSeek, testConnection } from './deepseek';
import { MEAL_SLOTS } from './labels';
import { DEFAULT_PROFILE, migrateProfile } from './members';
import { generatePlan, todayKey } from './planner';
import { getRecipe, setCustomRecipes } from './recipes';
import { buildShoppingList, fridgeAmountLabel, type ShoppingLine } from './shopping';
import type { DayPlan, FridgeItem, IngredientCategory, Profile, Recipe } from './types';

const KEYS = {
  profile: 'daily-meals/profile/v1',
  fridge: 'daily-meals/fridge/v1',
  plan: 'daily-meals/plan/v1',
  shopping: 'daily-meals/shopping/v1',
  aiKey: 'daily-meals/ai-key/v1',
  aiRecipes: 'daily-meals/ai-recipes/v1',
} as const;

/** AI 连续失败到这个次数就自动换回本地规则。 */
const AI_FAILURE_LIMIT = 2;

export interface NewFridgeItem {
  name: string;
  amount: string;
  category: IngredientCategory;
}

/**
 * What the shopping list remembers: 「已买到」 is a statement about today, so it is stamped with the
 * day it was made on, exactly like `DayPlan.date`. Checks are kept by ingredient name while the menu
 * changes underneath them, and drop when the day rolls over.
 */
interface StoredChecks {
  date: string;
  keys: string[];
}

/**
 * AI 菜谱的缓存。**带日期**：AI 菜谱只活一天，与它服务的 `DayPlan` 同生命周期，所以没有历史归档
 * 这件事（见计划里的非目标）。
 */
interface StoredAiRecipes {
  date: string;
  recipes: Recipe[];
}

/** 「测试连接」的界面状态。成功只留耗时 —— 响应内容一个字节都不进内存。 */
export type AiTestState =
  | { state: 'idle' }
  | { state: 'testing' }
  | { state: 'ok'; ms: number }
  | { state: 'fail'; failure: AiFailure };

interface AppStore {
  /** False until AsyncStorage has been read, so screens do not flash empty states. */
  hydrated: boolean;
  profile: Profile;
  fridge: FridgeItem[];
  plan: DayPlan | null;
  addFridgeItem: (input: NewFridgeItem) => void;
  removeFridgeItem: (id: string) => void;
  clearFridge: () => void;
  saveProfile: (next: Omit<Profile, 'savedAt'>) => void;
  /** Today's missing ingredients merged across meals, each flagged with whether it is checked off. */
  shoppingList: ShoppingLine[];
  /** How many lines are still unchecked — the 购物 tab badge. */
  shoppingPending: number;
  toggleBought: (key: string) => void;
  /** Writes the checked-off lines into the fridge as one batch; they then leave the list. */
  addBoughtToFridge: () => void;

  /* ---------------- AI ---------------- */

  /** 有没有配 Key。没配时今日页走本地规则，并显示一句提示（不是错误）。 */
  aiConfigured: boolean;
  /**
   * Key 的**后 4 位**，只用于界面回显。
   *
   * 明文 Key 被刻意关在 store 里：页面拿不到它，就不可能把它渲染进某个 Text、塞进某个 log、
   * 或者随手写进别的存储键。本应用不加密 AsyncStorage（这是选它而不是 SecureStore 的代价），
   * 界面文案里也如实说了这一点。
   */
  aiKeyTail: string | null;
  /** 正在生成或正在测试连接。 */
  aiBusy: boolean;
  /** 上一次生成失败的原因；成功后清空。 */
  aiError: AiFailure | null;
  aiTest: AiTestState;
  /** 「重新生成今日菜单」：配了 Key 走 AI，没配走本地规则。 */
  regenerateToday: () => void;
  /** 用户手动切回本地规则（错误卡上的出口，也在「我的」页）。 */
  regeneratePlan: () => void;
  /** 中止正在进行的生成。取消不产生错误卡，菜单维持原样。 */
  cancelAiGeneration: () => void;
  saveAiKey: (value: string) => void;
  clearAiKey: () => void;
  testAiKey: () => Promise<void>;
}

const AppStoreContext = createContext<AppStore | null>(null);

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (error) {
    console.warn(`[storage] 读取 ${key} 失败`, error);
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  AsyncStorage.setItem(key, JSON.stringify(value)).catch((error) => {
    console.warn(`[storage] 写入 ${key} 失败`, error);
  });
}

function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 磁盘上的 AI 菜谱缓存是**不可信数据**：只校验消费方真的要读的那几个字段。
 *
 * 不校验的代价很具体 —— `getRecipe` 解析不出来的 id 会被四个消费方**静默跳过**（今日页空白、购物
 * 清单空白，而「我的」页还写着「已生成」），而 `seasonings` 不是数组会在 `diet.activeSeasonings`
 * 里直接抛异常。所以宁可把整份缓存当成没有，让水合走重算。
 *
 * 日期不对（昨天的）同样整份忽略：AI 菜谱只活一天。
 */
function readAiRecipes(value: unknown): Recipe[] {
  if (!isRecord(value) || value.date !== todayKey() || !Array.isArray(value.recipes)) return [];
  return value.recipes.filter(
    (entry): entry is Recipe =>
      isRecord(entry) &&
      typeof entry.id === 'string' &&
      entry.id.length > 0 &&
      typeof entry.name === 'string' &&
      Array.isArray(entry.ingredients) &&
      Array.isArray(entry.seasonings) &&
      Array.isArray(entry.steps) &&
      Array.isArray(entry.slots) &&
      entry.slots.length > 0,
  );
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [fridge, setFridge] = useState<FridgeItem[]>([]);
  const [plan, setPlan] = useState<DayPlan | null>(null);
  /** Normalized names of the shopping lines the user has already bought, for today. */
  const [bought, setBought] = useState<string[]>([]);
  const [aiKey, setAiKey] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<AiFailure | null>(null);
  const [aiTest, setAiTest] = useState<AiTestState>({ state: 'idle' });

  /** 第几次生成尝试。取消或被新的一次顶掉时，过期结果在回来路上就被丢掉。 */
  const aiRunId = useRef(0);
  const aiAbort = useRef<AbortController | null>(null);
  const testRunId = useRef(0);
  /**
   * 连续失败次数。**只存在内存里**，不持久化：持久化会让一次坏运气（比如早上断网两次）永久禁掉 AI。
   * 成功、回退、用户主动切回本地规则都清零。
   */
  const aiFailures = useRef(0);

  /**
   * **唯一**写 `plan` 的地方。
   *
   * `recipes.setCustomRecipes` 改的是模块级变量，而 React Compiler 看不见模块级变量：`index.tsx`
   * 在 render 里调 `getRecipe`、这里的 `useMemo` 在 `buildShoppingList`/`buildStaplePlan` 里也调，
   * 一旦 registry 变了而 `plan` 的引用没变，这些 memo 不会重算、也没有东西会触发重渲染 —— 菜单会
   * 「停在上一份」而没有任何报错。
   *
   * 所以不变式是：**registry 变 ⟺ `plan` 引用变，同一个提交里完成**。水合、保存画像、本地重新生成、
   * AI 成功、AI 回退，全部经过这个函数（`ai-harness` 里对 `setPlan(` 只出现一次做过文本断言）。
   */
  const publishPlan = useCallback((nextPlan: DayPlan, nextAiRecipes: Recipe[]) => {
    setCustomRecipes(nextAiRecipes);
    setPlan(nextPlan);
    writeJson(KEYS.aiRecipes, { date: nextPlan.date, recipes: nextAiRecipes } satisfies StoredAiRecipes);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [storedProfile, storedFridge, storedPlan, storedChecks, storedAiKey, storedAiRecipes] =
        await Promise.all([
          // `unknown` on purpose: what is on disk may be the v1 single-person shape, and only
          // `migrateProfile` decides what it means. Claiming `Profile` here would be a lie that
          // `strict` could not catch, and the v1 fields would flow in as `undefined`.
          readJson<unknown>(KEYS.profile),
          readJson<FridgeItem[]>(KEYS.fridge),
          readJson<DayPlan>(KEYS.plan),
          readJson<StoredChecks>(KEYS.shopping),
          readJson<string>(KEYS.aiKey),
          readJson<unknown>(KEYS.aiRecipes),
        ]);
      if (cancelled) return;

      // Read in place, same key: a v1 profile becomes a one-member household without the user
      // doing anything, and the persist effect below rewrites it in the new shape.
      const nextProfile = storedProfile === null ? DEFAULT_PROFILE : migrateProfile(storedProfile);
      const nextFridge = storedFridge ?? [];
      // A stored plan is only valid on the day it was generated for.
      const isToday = storedPlan !== null && storedPlan.date === todayKey();
      // Same rule for the checks. Yesterday's 「已买」 says nothing about today's shopping, and
      // carrying it over would light up an ingredient the user has not actually bought this time.
      const checksAreToday = storedChecks !== null && storedChecks.date === todayKey();

      // 先把菜谱登记回去，再问「这份 plan 还解析得出来吗」—— AI 菜单靠 id 解析，而 id 只在登记处里。
      const aiRecipes = readAiRecipes(storedAiRecipes);
      setCustomRecipes(aiRecipes);

      // **水合复验**：plan 与菜谱分两次写进 AsyncStorage，中间被杀进程就会留下「plan 在、菜谱不在」。
      // 不查这一步的话，四个消费方全部静默跳过 → 今日页空白、购物清单空白，而「我的」页还写着
      // 「今日菜单 已生成」：用户看到的是数据丢了，而不是一句报错。
      //
      // 磁盘上的 plan 同样是盲 cast 来的，`meals` 可能是坏的，所以连它的形状一起查。
      const storedMeals = storedPlan !== null && isRecord(storedPlan.meals) ? storedPlan.meals : null;
      const resolvable =
        isToday &&
        storedMeals !== null &&
        MEAL_SLOTS.map((slot) => storedMeals[slot]).every(
          (id) => typeof id === 'string' && getRecipe(id) !== undefined,
        );

      const nextPlan = resolvable ? storedPlan : generatePlan(nextProfile, nextFridge, storedPlan);

      setProfile(nextProfile);
      setFridge(nextFridge);
      // 复验失败时**不发 AI 请求**：那会在启动时用一份还没落定的状态拼 prompt，而且在用户没点
      // 任何东西的时候花钱。重算成本地菜单，想再要 AI 的手动点一下即可（见交付说明里的取舍）。
      publishPlan(nextPlan, resolvable ? aiRecipes : []);
      setAiKey(storedAiKey && storedAiKey.trim().length > 0 ? storedAiKey : null);
      setBought(checksAreToday ? storedChecks.keys : []);
      setHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [publishPlan]);

  // Persist on change, but only after the initial read so we never write back what we just loaded.
  useEffect(() => {
    if (hydrated) writeJson(KEYS.profile, profile);
  }, [hydrated, profile]);

  useEffect(() => {
    if (hydrated) writeJson(KEYS.fridge, fridge);
  }, [hydrated, fridge]);

  useEffect(() => {
    if (hydrated && plan) writeJson(KEYS.plan, plan);
  }, [hydrated, plan]);

  useEffect(() => {
    if (hydrated) writeJson(KEYS.shopping, { date: todayKey(), keys: bought } satisfies StoredChecks);
  }, [hydrated, bought]);

  // The shopping list is derived, never stored, so it always describes the plan the 今日 tab renders.
  // Checks are only read for lines that are on the list, so a name whose ingredient stops being
  // missing is simply inert until it comes back — which is the wanted behaviour: 「我今天已经买过
  // 番茄」 stays true whether or not 番茄 is still on today's list.
  //
  // Do not add any setState to this render body. An earlier version pruned the checks during render
  // (dropping the ones no longer on the list, guarded by comparing the list's identity) and it
  // looped the app into "Too many re-renders": a render-phase update re-runs the hooks, and with
  // `experiments.reactCompiler` on, the memoized list came back as a new object on every pass, so
  // the guard never matched and React hit its re-render limit.
  const missing = useMemo(() => buildShoppingList(plan, fridge, profile), [plan, fridge, profile]);
  const shoppingList = useMemo(
    () => missing.map((line) => ({ ...line, bought: bought.includes(line.key) })),
    [missing, bought],
  );
  const shoppingPending = useMemo(
    () => shoppingList.filter((line) => !line.bought).length,
    [shoppingList],
  );

  const addFridgeItem = useCallback((input: NewFridgeItem) => {
    setFridge((current) => [{ id: createId(), addedAt: Date.now(), ...input }, ...current]);
  }, []);

  const removeFridgeItem = useCallback((id: string) => {
    setFridge((current) => current.filter((item) => item.id !== id));
  }, []);

  const clearFridge = useCallback(() => setFridge([]), []);

  // Saving the form also refreshes today's menu, so the new members and preferences take
  // effect in one tap instead of leaving a stale plan on the 今日 tab.
  //
  // 取舍（有意保留）：保存后菜单变回本地规则排的那份，AI 菜谱随之清空。理由是少一个分支 ——
  // 一份按旧画像排的 AI 菜单本来就不该活过画像变更（改了疾病标签却还吃着按旧标签排的菜，比多点
  // 一次「重新生成」危险得多）。代价是只改一句体检文本也会丢掉当天的 AI 菜单。
  const saveProfile = useCallback(
    (next: Omit<Profile, 'savedAt'>) => {
      const saved: Profile = { ...next, savedAt: Date.now() };
      setProfile(saved);
      publishPlan(generatePlan(saved, fridge, plan), []);
    },
    [fridge, plan, publishPlan],
  );

  /**
   * 本地规则重排今天的三餐。这是「改用本地规则」那个出口，也是没配 Key 时今日页的按钮。
   */
  const regeneratePlan = useCallback(() => {
    aiFailures.current = 0;
    setAiError(null);
    publishPlan(generatePlan(profile, fridge, plan), []);
  }, [profile, fridge, plan, publishPlan]);

  /**
   * 一次 AI 生成尝试：**只发一次请求**，没有隐藏重试。
   *
   * 每次点按钮 = 一次请求，失败就是失败。所以「连续失败 2 次」在界面上一说就明白 —— 藏着重试的话
   * 这句话就没法解释了。
   */
  const generateWithAi = useCallback(async () => {
    if (!aiKey) return;

    const runId = aiRunId.current + 1;
    aiRunId.current = runId;
    const controller = new AbortController();
    aiAbort.current = controller;
    setAiBusy(true);
    setAiError(null);

    const date = todayKey();
    // 上一次的失败原因只在 schema/taboo/parse 时喂回去（见 `ai.retryCorrection`）：网络与 Key 的问题
    // 重说一遍没有用，只会占掉上下文。
    const correction = retryCorrection(aiError);
    const call = await callDeepSeek(
      aiKey,
      buildMenuPrompt(profile, fridge, date, { correction }),
      controller.signal,
    );

    // 被「取消」或被后一次点击顶掉：这一次的结果直接丢掉，不动菜单。
    if (aiRunId.current !== runId) return;
    aiAbort.current = null;
    setAiBusy(false);

    const parsed = call.ok ? parseMenu(call.content, profile, date, fridge) : null;
    const failed: AiFailure | null = !call.ok ? call.failure : parsed && !parsed.ok ? parsed.failure : null;

    if (failed) {
      if (failed.kind === 'cancelled') return;
      aiFailures.current += 1;
      // 连续失败到阈值，且当前这份菜单确实是 AI 排的 → 换回本地规则。
      // 已经是本地菜单时不动它：回退不该把用户正在看的本地菜单重新摇一遍（那会凭空换掉三道菜）。
      if (aiFailures.current >= AI_FAILURE_LIMIT && plan?.source === 'ai') {
        aiFailures.current = 0;
        publishPlan(generatePlan(profile, fridge, plan), []);
        setAiError({
          ...failed,
          message: `${failed.message}；AI 连续失败 ${AI_FAILURE_LIMIT} 次，已回退本地规则`,
        });
        return;
      }
      setAiError(failed);
      return;
    }

    if (!parsed || !parsed.ok) return;
    // 归一化时的让步（补主食、按生食处理、缺货对不上…）：打一行日志，不影响可用性。
    for (const warning of parsed.menu.warnings) console.warn(`[ai] ${warning}`);

    const nextPlan = menuPlan(parsed.menu.recipes, date);
    if (!nextPlan) {
      setAiError(failure('schema', '三餐不齐，已丢弃'));
      return;
    }

    aiFailures.current = 0;
    publishPlan(nextPlan, parsed.menu.recipes);
  }, [aiKey, aiError, profile, fridge, plan, publishPlan]);

  const regenerateToday = useCallback(() => {
    if (aiKey) {
      void generateWithAi();
      return;
    }
    regeneratePlan();
  }, [aiKey, generateWithAi, regeneratePlan]);

  const cancelAiGeneration = useCallback(() => {
    aiAbort.current?.abort();
    aiAbort.current = null;
    aiRunId.current += 1;
    setAiBusy(false);
  }, []);

  /**
   * 保存密钥。**空串什么都不做**。
   *
   * 这里曾经是「空串 = 清掉」，看着方便，实际是一条隐蔽的销毁路径：只要有任何一个入口拿着空串走到
   * 这里（键盘的完成键就是这么干的，见 `TextField.onSubmitEditing`），用户刚存好的密钥就被悄悄抹掉，
   * 界面只剩一个空输入框 —— 看起来像「没保存成功」，实际是被删了。
   *
   * 所以不变式是：**丢掉密钥只有 `clearAiKey` 一个入口，而它带确认弹窗。** 存空串不再有任何含义。
   */
  const saveAiKey = useCallback((value: string) => {
    const key = value.trim();
    if (key.length === 0) return;
    setAiKey(key);
    writeJson(KEYS.aiKey, key);
    // 换了 Key，上一次的连接测试结果就不算数了。
    setAiTest({ state: 'idle' });
    aiFailures.current = 0;
  }, []);

  const clearAiKey = useCallback(() => {
    setAiKey(null);
    // 注意：**不**动当前菜单与 registry。今天已经生成好的那份 AI 菜单还能正常看、正常做菜，
    // 清掉 Key 只是不再发新请求。
    AsyncStorage.removeItem(KEYS.aiKey).catch((error) =>
      console.warn('[storage] 清除 AI 密钥失败', error),
    );
    setAiTest({ state: 'idle' });
    setAiError(null);
    aiFailures.current = 0;
  }, []);

  /**
   * 「测试连接」：发一条 `max_tokens: 1` 的最短请求，只看成败与时延。
   *
   * 走的是与生成菜单完全相同的端点与鉴权，所以它成功就意味着生成也能通。fail 的 `message` 直接显示
   * 给人看，里头不含 Key。
   */
  const testAiKey = useCallback(async () => {
    if (!aiKey) {
      setAiTest({ state: 'fail', failure: failure('no-key') });
      return;
    }
    const runId = testRunId.current + 1;
    testRunId.current = runId;
    setAiTest({ state: 'testing' });
    const result = await testConnection(aiKey);
    if (testRunId.current !== runId) return;
    if (result.ok) {
      setAiTest({ state: 'ok', ms: result.ms });
      return;
    }
    // `FAILURE_MESSAGES.timeout` 写的是「生成超时」，而这一次什么都没生成。kind 不动（失败分类只有
    // 一个真相，界面靠它分组），只把这句话换成连接口径。
    const shown =
      result.failure.kind === 'timeout'
        ? { ...result.failure, message: '连接超时（超过 60 秒），请检查网络后重试' }
        : result.failure;
    setAiTest({ state: 'fail', failure: shown });
  }, [aiKey]);

  const toggleBought = useCallback((key: string) => {
    setBought((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  }, []);

  // 「缺」 is defined as 「冰箱里没有」, so writing these names in removes them from the list, and the
  // prune above drops their checks — no second bookkeeping step is needed here.
  const addBoughtToFridge = useCallback(() => {
    const picked = shoppingList.filter((line) => line.bought);
    if (picked.length === 0) return;
    setFridge((current) => [
      ...picked.map((line) => ({
        id: createId(),
        addedAt: Date.now(),
        name: line.name,
        amount: fridgeAmountLabel(line),
        category: line.category,
      })),
      ...current,
    ]);
  }, [shoppingList]);

  const value = useMemo<AppStore>(
    () => ({
      hydrated,
      profile,
      fridge,
      plan,
      addFridgeItem,
      removeFridgeItem,
      clearFridge,
      saveProfile,
      shoppingList,
      shoppingPending,
      toggleBought,
      addBoughtToFridge,
      aiConfigured: aiKey !== null,
      aiKeyTail: aiKey === null ? null : aiKey.slice(-4),
      aiBusy,
      aiError,
      aiTest,
      regenerateToday,
      regeneratePlan,
      cancelAiGeneration,
      saveAiKey,
      clearAiKey,
      testAiKey,
    }),
    [
      hydrated,
      profile,
      fridge,
      plan,
      addFridgeItem,
      removeFridgeItem,
      clearFridge,
      saveProfile,
      shoppingList,
      shoppingPending,
      toggleBought,
      addBoughtToFridge,
      aiKey,
      aiBusy,
      aiError,
      aiTest,
      regenerateToday,
      regeneratePlan,
      cancelAiGeneration,
      saveAiKey,
      clearAiKey,
      testAiKey,
    ],
  );

  // Screens seed their local form state from the stored profile when they mount, so rendering
  // them before hydration would show defaults and let a save overwrite real data. The splash
  // overlay covers this window, which lasts a few frames.
  if (!hydrated) return null;

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): AppStore {
  const store = useContext(AppStoreContext);
  if (!store) {
    throw new Error('useAppStore 必须在 AppStoreProvider 内部使用');
  }
  return store;
}
