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
import type { DayPlan, FridgeItem, IngredientCategory, Profile } from './types';

const KEYS = {
  profile: 'daily-meals/profile/v1',
  fridge: 'daily-meals/fridge/v1',
  plan: 'daily-meals/plan/v1',
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

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [storedProfile, storedFridge, storedPlan] = await Promise.all([
        readJson<Profile>(KEYS.profile),
        readJson<FridgeItem[]>(KEYS.fridge),
        readJson<DayPlan>(KEYS.plan),
      ]);
      if (cancelled) return;

      const nextProfile = storedProfile ?? DEFAULT_PROFILE;
      const nextFridge = storedFridge ?? [];
      // A stored plan is only valid on the day it was generated for.
      const isToday = storedPlan !== null && storedPlan.date === todayKey();

      setProfile(nextProfile);
      setFridge(nextFridge);
      setPlan(isToday ? storedPlan : generatePlan(nextProfile, nextFridge, storedPlan));
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
