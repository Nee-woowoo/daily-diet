import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PrimaryButton } from '@/components/ui/button';
import { Card, PressableCard } from '@/components/ui/card';
import { Tag, TagRow } from '@/components/ui/tag';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import {
  GOAL_LABELS,
  GOAL_TONES,
  MEAL_SLOT_LABELS,
  MEAL_SLOTS,
  OIL_LEVEL_LABELS,
} from '@/lib/labels';
import { matchRecipe, todayLabel } from '@/lib/planner';
import { getRecipe } from '@/lib/recipes';
import { useAppStore } from '@/lib/storage';
import type { MealSlot, Recipe } from '@/lib/types';

export default function TodayScreen() {
  const { hydrated, plan, fridge, profile, regeneratePlan } = useAppStore();

  if (!hydrated || !plan) {
    return (
      <Screen title="今日" subtitle={todayLabel()}>
        <Card style={styles.loading}>
          <ActivityIndicator />
          <ThemedText type="small" themeColor="textSecondary">
            正在读取今日菜单…
          </ThemedText>
        </Card>
      </Screen>
    );
  }

  const meals = MEAL_SLOTS.map((slot) => ({ slot, recipe: getRecipe(plan.meals[slot]) })).filter(
    (meal): meal is { slot: MealSlot; recipe: Recipe } => meal.recipe !== undefined,
  );
  const totalCalories = meals.reduce((sum, meal) => sum + meal.recipe.calories, 0);

  return (
    <Screen
      title="今日"
      subtitle={todayLabel()}
      footer={<PrimaryButton label="重新生成今日菜单" onPress={regeneratePlan} />}>
      <Card>
        <View style={styles.summaryRow}>
          <View>
            <ThemedText type="caption" themeColor="textSecondary">
              三餐菜品合计
            </ThemedText>
            <ThemedText type="title">约 {totalCalories} 千卡</ThemedText>
          </View>
          <TagRow>
            <Tag label={GOAL_LABELS[profile.goal]} tone={GOAL_TONES[profile.goal]} />
            <Tag label={`${profile.servings} 人份`} />
          </TagRow>
        </View>
        <ThemedText type="caption" themeColor="textSecondary">
          每人份估算，只算菜品本身、不含搭配的主食。
          {fridge.length > 0
            ? `会优先挑冰箱里已有食材的菜，当前有 ${fridge.length} 样。`
            : '冰箱还是空的，先添加食材，菜单会更实用。'}
        </ThemedText>
      </Card>

      {profile.savedAt === 0 ? (
        <PressableCard onPress={() => router.navigate('/profile')}>
          <ThemedText type="headline">还没设置身体目标</ThemedText>
          <ThemedText type="caption" themeColor="textSecondary">
            去「录入」填一下人数、目标和口味偏好，菜单会按减脂或增肌重新筛选。点击前往 ›
          </ThemedText>
        </PressableCard>
      ) : null}

      {meals.map(({ slot, recipe }) => {
        const match = matchRecipe(recipe, fridge);
        const ready = match.missing.length === 0;

        return (
          <PressableCard
            key={slot}
            accessibilityLabel={`${MEAL_SLOT_LABELS[slot]}，${recipe.name}`}
            onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: recipe.id } })}>
            <View style={styles.mealHeader}>
              <ThemedText type="caption" themeColor="textSecondary">
                {MEAL_SLOT_LABELS[slot]}
              </ThemedText>
              <ThemedText type="caption" themeColor="textTertiary">
                查看做法 ›
              </ThemedText>
            </View>

            <ThemedText type="title">{recipe.name}</ThemedText>

            <TagRow>
              <Tag label={`${recipe.minutes} 分钟`} />
              <Tag label={`${recipe.calories} 千卡`} tone="calories" />
              <Tag
                label={OIL_LEVEL_LABELS[recipe.oilLevel]}
                tone={recipe.oilLevel === 'low' ? 'ready' : 'neutral'}
              />
            </TagRow>

            <View style={styles.matchRow}>
              <Tag label={ready ? '食材齐全' : `缺 ${match.missing.length} 样`} tone={ready ? 'ready' : 'missing'} />
              <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1} style={styles.matchText}>
                {ready ? '冰箱里都有，可以直接做' : `缺 ${match.missing.join('、')}`}
              </ThemedText>
            </View>

            {recipe.pairing ? (
              <ThemedText type="caption" themeColor="textSecondary">
                建议搭配：{recipe.pairing}
              </ThemedText>
            ) : null}
          </PressableCard>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    paddingVertical: Spacing.five,
    gap: Spacing.three,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  mealHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  matchText: {
    flexShrink: 1,
  },
});
