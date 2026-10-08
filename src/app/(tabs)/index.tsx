import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PrimaryButton } from '@/components/ui/button';
import { Card, CardRow, PressableCard } from '@/components/ui/card';
import { Tag, TagRow } from '@/components/ui/tag';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { careLine, excludedRecipes } from '@/lib/advice';
import { MEAL_SLOT_LABELS, MEAL_SLOTS, OIL_LEVEL_LABELS } from '@/lib/labels';
import {
  householdLabel,
  householdPortions,
  householdPortionsLabel,
  needsMigrationCheck,
} from '@/lib/members';
import { matchRecipe, todayLabel } from '@/lib/planner';
import { getRecipe } from '@/lib/recipes';
import {
  buildStaplePlan,
  memberPortionLine,
  roundKcal,
  stapleAmountLabel,
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
  const members = profile.members;
  const portions = householdPortions(profile);
  const stapleKcal = roundKcal(staples.addedKcalPerServing);
  // 三餐菜品是「每人份」的数据，全家的数字就是它乘以份数；主食则是每位成员各自换算后的合计数。
  const householdKcal = roundKcal(totalCalories * portions + staples.addedKcalHousehold);
  // Both roundings happen once, on the raw total: rounding the staple first would add up to 10 kcal of drift.
  const dayKcal = roundKcal(totalCalories + staples.addedKcalPerServing);
  // 一次算一次：这道菜为什么被排除，整页只需要一个结论。
  const excluded = excludedRecipes(profile);
  const excludedReasons = excluded
    .flatMap((entry) => entry.reasons)
    .filter((reason, index, all) => all.indexOf(reason) === index)
    .join('、');
  const excludedNames = [
    excluded.slice(0, 2).map((entry) => entry.recipe.name).join('、'),
    excluded.length > 2 ? `等 ${excluded.length} 道` : '',
  ]
    .filter((part) => part.length > 0)
    .join(' ');

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
            {members.length > 0 ? (
              <Tag label={`${members.length} 人`} />
            ) : (
              <Tag label="还没添加成员" tone="missing" />
            )}
            {portions !== members.length ? <Tag label={householdPortionsLabel(profile)} /> : null}
          </TagRow>
        </View>
        <ThemedText type="caption" themeColor="textSecondary">
          每人份估算，只算菜品本身、不含另配的主食（见下方「今日主食」）。
          {fridge.length > 0
            ? `会优先挑冰箱里已有食材的菜，当前有 ${fridge.length} 样。`
            : '冰箱还是空的，先添加食材，菜单会更实用。'}
        </ThemedText>
        {members.length > 0 ? (
          <ThemedText type="caption" themeColor="textSecondary">
            {`全家 ${householdLabel(profile)} 菜品合计约 ${roundKcal(totalCalories * portions)} 千卡；含另配主食约 ${householdKcal} 千卡。`}
          </ThemedText>
        ) : null}
      </Card>

      {excluded.length > 0 ? (
        <Card>
          <ThemedText type="headline">已按家庭成员排除 {excluded.length} 道</ThemedText>
          <ThemedText type="caption" themeColor="textSecondary">
            {excludedReasons}（{excludedNames}）
          </ThemedText>
          <ThemedText type="caption" themeColor="textSecondary">
            这些菜不会出现在菜单里，也不会出现在采购清单里；完整的排除清单在「我的 · 菜谱库」。
          </ThemedText>
        </Card>
      ) : null}

      {needsMigrationCheck(profile) ? (
        <PressableCard onPress={() => router.navigate('/profile')}>
          <ThemedText type="headline">成员年龄待补</ThemedText>
          <ThemedText type="caption" themeColor="textSecondary">
            旧的单人设置已迁移成一位成员，年龄还不知道，食量先按成人 1 份算。去「录入」补上年龄和状态，食材用量会跟着变准。点击前往 ›
          </ThemedText>
        </PressableCard>
      ) : null}

      {staples.lines.length > 0 ? (
        <Card>
          <View style={styles.mealHeader}>
            <ThemedText type="headline">今日主食</ThemedText>
            <ThemedText type="caption" themeColor="textTertiary">
              {householdLabel(profile)}
            </ThemedText>
          </View>
          <ThemedText type="title">
            {stapleKcal > 0 ? `另配主食约 ${stapleKcal} 千卡/人（标准份）` : '今天的主食都在菜里'}
          </ThemedText>
          {stapleKcal > 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              含主食全天约 {dayKcal} 千卡/人（标准份）；全家合计约 {householdKcal} 千卡
            </ThemedText>
          ) : null}
          {members.length > 0 ? (
            <ThemedText type="caption" themeColor="textSecondary">
              每人份量：{memberPortionLine(profile)}
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
            行里的主食量是全家合计：按每位成员的份数（成人 1 份、儿童 0.5 份、长辈 0.8
            份）和各自的目标换算；热量是每人份（标准份）估算。
          </ThemedText>
          <ThemedText type="caption" themeColor="textSecondary">
            早餐的主食就是菜本身，已含在菜品热量里；主食请自备，不在采购清单和冰箱匹配里。
          </ThemedText>
        </Card>
      ) : null}

      {profile.savedAt === 0 ? (
        <PressableCard onPress={() => router.navigate('/profile')}>
          <ThemedText type="headline">还没填家庭成员</ThemedText>
          <ThemedText type="caption" themeColor="textSecondary">
            去「录入」添加家人、填上年龄和状态，菜单会自动避开孕期和幼儿的禁忌，并按每个人调整份量。点击前往 ›
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
        // 「兼顾说明」：这道菜怎么照顾到每个人。空串（家里还没有成员）时不渲染。
        const care = careLine(recipe, profile);

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

            {care ? (
              <ThemedText type="caption" themeColor="textSecondary" style={styles.careText}>
                {care}
              </ThemedText>
            ) : null}

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
  // 兼顾说明会长到两行，给它一点点左内边距当作引文，和上面的标签区分开。
  careText: {
    paddingLeft: Spacing.two,
  },
});
