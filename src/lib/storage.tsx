import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { generatePlan, todayKey } from './planner';
import { buildShoppingList, fridgeAmountLabel, type ShoppingLine } from './shopping';
import type { DayPlan, FridgeItem, IngredientCategory, Profile } from './types';

const KEYS = {
  profile: 'daily-meals/profile/v1',
  fridge: 'daily-meals/fridge/v1',
  plan: 'daily-meals/plan/v1',
  shopping: 'daily-meals/shopping/v1',
} as const;

/** Used before the user has saved the 录入 form, so the app works on first launch. */
export const DEFAULT_PROFILE: Profile = {
  servings: 2,
  goal: 'balanced',
  preferences: [],
  savedAt: 0,
};

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
  /** Rebuilds today's menu, keeping the current profile and fridge. */
  regeneratePlan: () => void;
  /** Today's missing ingredients merged across meals, each flagged with whether it is checked off. */
  shoppingList: ShoppingLine[];
  /** How many lines are still unchecked — the 购物 tab badge. */
  shoppingPending: number;
  toggleBought: (key: string) => void;
  /** Writes the checked-off lines into the fridge as one batch; they then leave the list. */
  addBoughtToFridge: () => void;
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

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [fridge, setFridge] = useState<FridgeItem[]>([]);
  const [plan, setPlan] = useState<DayPlan | null>(null);
  /** Normalized names of the shopping lines the user has already bought, for today. */
  const [bought, setBought] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [storedProfile, storedFridge, storedPlan, storedChecks] = await Promise.all([
        readJson<Profile>(KEYS.profile),
        readJson<FridgeItem[]>(KEYS.fridge),
        readJson<DayPlan>(KEYS.plan),
        readJson<StoredChecks>(KEYS.shopping),
      ]);
      if (cancelled) return;

      const nextProfile = storedProfile ?? DEFAULT_PROFILE;
      const nextFridge = storedFridge ?? [];
      // A stored plan is only valid on the day it was generated for.
      const isToday = storedPlan !== null && storedPlan.date === todayKey();
      // Same rule for the checks. Yesterday's 「已买」 says nothing about today's shopping, and
      // carrying it over would light up an ingredient the user has not actually bought this time.
      const checksAreToday = storedChecks !== null && storedChecks.date === todayKey();

      setProfile(nextProfile);
      setFridge(nextFridge);
      setPlan(isToday ? storedPlan : generatePlan(nextProfile, nextFridge, storedPlan));
      setBought(checksAreToday ? storedChecks.keys : []);
      setHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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

  // Saving the form also refreshes today's menu, so the new goal and preferences take
  // effect in one tap instead of leaving a stale plan on the 今日 tab.
  const saveProfile = useCallback(
    (next: Omit<Profile, 'savedAt'>) => {
      const saved: Profile = { ...next, savedAt: Date.now() };
      setProfile(saved);
      setPlan((current) => generatePlan(saved, fridge, current));
    },
    [fridge],
  );

  const regeneratePlan = useCallback(() => {
    setPlan((current) => generatePlan(profile, fridge, current));
  }, [profile, fridge]);

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
      regeneratePlan,
      shoppingList,
      shoppingPending,
      toggleBought,
      addBoughtToFridge,
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
      regeneratePlan,
      shoppingList,
      shoppingPending,
      toggleBought,
      addBoughtToFridge,
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
