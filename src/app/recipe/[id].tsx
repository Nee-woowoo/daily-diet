import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, CardRow, SectionTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Tag, TagRow } from '@/components/ui/tag';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  formatAmount,
  GOAL_LABELS,
  GOAL_TONES,
  MEAL_SLOT_LABELS,
  OIL_LEVEL_LABELS,
  PREFERENCE_LABELS,
  PREFERENCE_TONES,
} from '@/lib/labels';
import { matchRecipe } from '@/lib/planner';
import { getRecipe, scaleAmount } from '@/lib/recipes';
import { useAppStore } from '@/lib/storage';
import type { Ingredient } from '@/lib/types';

export default function RecipeDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const { fridge, profile } = useAppStore();
  const theme = useTheme();

  const recipe = getRecipe(params.id ?? '');

  if (!recipe) {
    return (
      <View style={[styles.fallback, { backgroundColor: theme.background }]}>
        <EmptyState
          title="没找到这道菜"
          description="菜单可能已经重新生成，回「今日」看看最新的安排。"
        />
      </View>
    );
  }

  const match = matchRecipe(recipe, fridge);
  const ready = match.missing.length === 0;
  const seasoningsNote = `1 勺 ≈ 15 毫升，用量按 ${profile.servings} 人份换算`;

  return (
    <>
      <Stack.Screen options={{ title: recipe.name }} />
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <Card>
          <ThemedText type="title">{recipe.name}</ThemedText>
          <TagRow>
            <Tag label={`总耗时 ${recipe.minutes} 分钟`} />
            <Tag label={`${recipe.calories} 千卡/人`} tone="calories" />
            <Tag label={`蛋白质 ${recipe.protein} 克`} />
            <Tag
              label={OIL_LEVEL_LABELS[recipe.oilLevel]}
              tone={recipe.oilLevel === 'low' ? 'ready' : 'neutral'}
            />
          </TagRow>
          <TagRow>
            {recipe.goals.map((goal) => (
              <Tag key={goal} label={GOAL_LABELS[goal]} tone={GOAL_TONES[goal]} />
            ))}
            {recipe.preferences.map((preference) => (
              <Tag
                key={preference}
                label={PREFERENCE_LABELS[preference]}
                tone={PREFERENCE_TONES[preference]}
              />
            ))}
          </TagRow>
          <ThemedText type="caption" themeColor="textSecondary">
            适合{recipe.slots.map((slot) => MEAL_SLOT_LABELS[slot]).join(' / ')} · 用量按{' '}
            {profile.servings} 人份计算
          </ThemedText>
        </Card>

        <Card>
          <View style={styles.matchHeader}>
            <ThemedText type="headline">
              {ready ? '食材齐全' : `还缺 ${match.missing.length} 样主料`}
            </ThemedText>
            <Tag label={ready ? '可以直接做' : '需要补货'} tone={ready ? 'ready' : 'missing'} />
          </View>
          <ThemedText type="caption" themeColor="textSecondary">
            冰箱里已有 {match.readyCount}/{match.totalCount} 样主料。
          </ThemedText>
          {match.missing.length > 0 ? (
            <TagRow>
              {match.missing.map((name) => (
                <Tag key={name} label={name} tone="missing" />
              ))}
            </TagRow>
          ) : null}
          {recipe.pairing ? (
            <ThemedText type="caption" themeColor="textSecondary">
              建议搭配：{recipe.pairing}
            </ThemedText>
          ) : null}
        </Card>

        <View style={styles.section}>
          <SectionTitle>{`食材清单 · ${profile.servings} 人份`}</SectionTitle>
          <Card style={styles.listCard}>
            {recipe.ingredients.map((ingredient, index) => (
              <IngredientRow
                key={ingredient.name}
                ingredient={ingredient}
                servings={profile.servings}
                divider={index > 0}
              />
            ))}
          </Card>
        </View>

        <View style={styles.section}>
          <SectionTitle>调味料</SectionTitle>
          <Card style={styles.listCard}>
            {recipe.seasonings.map((ingredient, index) => (
              <IngredientRow
                key={ingredient.name}
                ingredient={ingredient}
                servings={profile.servings}
                divider={index > 0}
              />
            ))}
          </Card>
          <ThemedText type="caption" themeColor="textSecondary" style={styles.note}>
            {seasoningsNote}
          </ThemedText>
        </View>

        <View style={styles.section}>
          <SectionTitle>{`做法 · 共 ${recipe.steps.length} 步`}</SectionTitle>
          <Card style={styles.stepCard}>
            {recipe.steps.map((step, index) => (
              <View key={step} style={styles.step}>
                <View style={[styles.stepIndex, { backgroundColor: theme.tintSoft }]}>
                  <Text style={[styles.stepIndexLabel, { color: theme.tint }]}>{index + 1}</Text>
                </View>
                <ThemedText type="body" style={styles.stepText}>
                  {step}
                </ThemedText>
              </View>
            ))}
          </Card>
        </View>

        {recipe.tip ? (
          <View style={styles.section}>
            <SectionTitle>小贴士</SectionTitle>
            <Card>
              <ThemedText type="small" themeColor="textSecondary">
                {recipe.tip}
              </ThemedText>
            </Card>
          </View>
        ) : null}
      </ScrollView>
    </>
  );
}

function IngredientRow({
  ingredient,
  servings,
  divider,
}: {
  ingredient: Ingredient;
  servings: number;
  divider: boolean;
}) {
  const amount = scaleAmount(ingredient.amount, ingredient.unit, servings);

  return (
    <CardRow
      divider={divider}
      label={
        <ThemedText type="body">
          {ingredient.name}
          {ingredient.optional ? '（可选）' : ''}
        </ThemedText>
      }
      value={<ThemedText type="body" themeColor="textSecondary">{formatAmount(amount, ingredient.unit)}</ThemedText>}
    />
  );
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    padding: Spacing.three,
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  matchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  section: {
    gap: Spacing.one,
  },
  listCard: {
    gap: 0,
  },
  stepCard: {
    gap: Spacing.three,
  },
  step: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  stepIndex: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepIndexLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  stepText: {
    flex: 1,
  },
  note: {
    paddingHorizontal: Spacing.one,
  },
});
