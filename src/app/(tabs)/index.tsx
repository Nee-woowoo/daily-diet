import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PrimaryButton } from '@/components/ui/button';
import { Card, CardRow, PressableCard } from '@/components/ui/card';
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
import {
  buildStaplePlan,
  roundKcal,
  stapleAmountLabel,
  stapleGoalLabel,
  stapleLineLabel,
  stapleSuggestion,
} from '@/lib/staples';
import { useAppStore } from '@/lib/storage';
import type { MealSlot, Recipe } from '@/lib/types';

export default function TodayScreen() {
  const { hydrated, plan, fridge, profile, regeneratePlan, shoppingList } = useAppStore();

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

  const staples = buildStaplePlan(plan, profile);
  const stapleKcal = roundKcal(staples.addedKcalPerServing);
  // Both roundings happen once, on the raw total: rounding the staple first would add up to 10 kcal of drift.
  const dayKcal = roundKcal(totalCalories + staples.addedKcalPerServing);

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
          每人份估算，只算菜品本身、不含另配的主食（见下方「今日主食」）。
          {fridge.length > 0
            ? `会优先挑冰箱里已有食材的菜，当前有 ${fridge.length} 样。`
            : '冰箱还是空的，先添加食材，菜单会更实用。'}
        </ThemedText>
      </Card>

      {staples.lines.length > 0 ? (
        <Card>
          <View style={styles.mealHeader}>
            <ThemedText type="headline">今日主食</ThemedText>
            <ThemedText type="caption" themeColor="textTertiary">
              {profile.servings} 人份合计
            </ThemedText>
          </View>
          <ThemedText type="title">
            {stapleKcal > 0 ? `另配主食约 ${stapleKcal} 千卡/人` : '今天的主食都在菜里'}
          </ThemedText>
          {stapleKcal > 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              含主食全天约 {dayKcal} 千卡/人
            </ThemedText>
          ) : null}

          <View style={styles.stapleList}>
            {staples.lines.map((line, index) => (
              <CardRow
                key={line.slot}
                divider={index > 0}
                label={
                  <ThemedText type="body">
                    {MEAL_SLOT_LABELS[line.slot]} · {line.name}
                    {line.fromDish ? '（本菜已含）' : ''}
                  </ThemedText>
                }
                value={
                  <ThemedText type="body" themeColor="textSecondary">
                    {stapleAmountLabel(line)}
                  </ThemedText>
                }
              />
            ))}
          </View>

          <ThemedText type="caption" themeColor="textSecondary">
            {`热量为每人份估算；已按「${stapleGoalLabel(profile.goal)}」换算。`}
          </ThemedText>
          <ThemedText type="caption" themeColor="textSecondary">
            早餐的主食就是菜本身，已含在菜品热量里；主食请自备，不在采购清单和冰箱匹配里。
          </ThemedText>
        </Card>
      ) : null}

      {profile.savedAt === 0 ? (
        <PressableCard onPress={() => router.navigate('/profile')}>
          <ThemedText type="headline">还没设置身体目标</ThemedText>
          <ThemedText type="caption" themeColor="textSecondary">
            去「录入」填一下人数、目标和口味偏好，菜单会按减脂或增肌重新筛选。点击前往 ›
          </ThemedText>
        </PressableCard>
      ) : null}

      {shoppingList.length > 0 ? (
        <PressableCard
          accessibilityLabel="打开采购清单"
          onPress={() => router.navigate('/shopping')}>
          <View style={styles.mealHeader}>
            <ThemedText type="headline">采购清单</ThemedText>
            <ThemedText type="caption" themeColor="textTertiary">
              查看 ›
            </ThemedText>
          </View>
          <ThemedText type="caption" themeColor="textSecondary">
            三道菜还缺 {shoppingList.length} 样食材，买到的勾上，一键放进冰箱。
          </ThemedText>
        </PressableCard>
      ) : null}

      {meals.map(({ slot, recipe }) => {
        const match = matchRecipe(recipe, fridge);
        const ready = match.missing.length === 0;
        const suggestion = stapleSuggestion(recipe, profile);

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
              <Tag label={`${recipe.calories} 千卡/人`} tone="calories" />
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

            {suggestion ? (
              <ThemedText type="caption" themeColor="textSecondary">
                {stapleLineLabel(suggestion, profile)}
              </ThemedText>
            ) : null}

            {/* 午晚餐的 pairing 写的就是主食，已经由上面那行按人数和目标算好了；早餐的 pairing
                是蛋白/饮品这类别的搭配，照原样显示。 */}
            {recipe.pairing && !recipe.staple ? (
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
  // Cards holding `CardRow`s drop the card's gap: the rows carry their own padding and hairlines
  // (same as the 食材清单 card on the recipe page).
  stapleList: {
    gap: 0,
  },
  matchText: {
    flexShrink: 1,
  },
});
