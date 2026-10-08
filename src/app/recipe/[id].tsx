import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, CardRow, SectionTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Tag, TagRow } from '@/components/ui/tag';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { cautions, exclusionLabels, exclusionReasons } from '@/lib/advice';
import { DIET_LEVEL_LABELS, dietDimensions } from '@/lib/diet';
import {
  formatAmount,
  GOAL_LABELS,
  GOAL_TONES,
  MEAL_SLOT_LABELS,
  OIL_LEVEL_LABELS,
  PREFERENCE_LABELS,
  PREFERENCE_TONES,
  SPICE_LABELS,
} from '@/lib/labels';
import {
  DISEASE_DISCLAIMER,
  hasMetabolicTag,
  householdPortions,
  memberSummaryLabel,
  portionLabel,
} from '@/lib/members';
import { matchRecipe } from '@/lib/planner';
import { getRecipe, scaleAmount } from '@/lib/recipes';
import { stapleAmountLabel, stapleSuggestion } from '@/lib/staples';
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
  // 全家份数：每位成员按年龄档各占一份（成人 1、儿童 0.5、长辈 0.8），食材克数是它乘出来的。
  const portions = householdPortions(profile);
  const portionsLabel = formatAmount(portions, '人份');
  const seasoningsNote = `1 勺 ≈ 15 毫升，用量按 ${portionsLabel}换算`;
  // 另配主食（`recipe.staple`）才在这里出现：早餐的主食是菜自己的配料，已经列在食材清单里了。
  const staple = recipe.staple ? stapleSuggestion(recipe, profile) : undefined;
  const cautionList = cautions(recipe, profile);
  const excludedLabels = exclusionLabels(recipe, profile);
  // 家里有慢病成员就显示免责提示 —— 即使这道菜一条提醒都没推出来（低等级 + 只有痛风时就是这样）。
  const hasDiseaseMember = profile.members.some(hasMetabolicTag);

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
            <Tag
              label={SPICE_LABELS[recipe.spice]}
              tone={recipe.spice === 'none' ? 'neutral' : 'spicy'}
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
            {portionsLabel}计算
          </ThemedText>
        </Card>

        {excludedLabels.length > 0 ? (
          <Card>
            <View style={styles.matchHeader}>
              <ThemedText type="headline">已从菜单里排除</ThemedText>
              <Tag label={excludedLabels.join('、')} tone="unsafe" />
            </View>
            <ThemedText type="caption" themeColor="textSecondary">
              {exclusionReasons(recipe, profile).join('；')}。要改的话去「录入」调整成员或状态。
            </ThemedText>
          </Card>
        ) : null}

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
          {/* `recipe.staple` 有值时，主食由下面「每人份量」那一行负责，而且可能按家庭成员换成
              糙米饭 —— 再显示一遍 `pairing` 里的「配白米饭」会和它自相矛盾。今日页也是这么判的。 */}
          {recipe.pairing && !recipe.staple ? (
            <ThemedText type="caption" themeColor="textSecondary">
              建议搭配：{recipe.pairing}
            </ThemedText>
          ) : null}
        </Card>

        <Card>
          <View style={styles.matchHeader}>
            <ThemedText type="headline">饮食维度</ThemedText>
          </View>
          <TagRow>
            {dietDimensions(recipe).map((dimension) => (
              <Tag
                key={dimension.label}
                label={`${dimension.label} ${DIET_LEVEL_LABELS[dimension.level]}`}
                tone={dimension.level}
              />
            ))}
          </TagRow>
          <ThemedText type="caption" themeColor="textSecondary">
            按配料和调料算出来的四档。标「高」的那一档，会被家里对应疾病的标签整道排除。
          </ThemedText>
        </Card>

        <View style={styles.section}>
          <SectionTitle>{`食材清单 · 共 ${portionsLabel}`}</SectionTitle>
          <Card style={styles.listCard}>
            {recipe.ingredients.map((ingredient, index) => (
              <IngredientRow
                key={ingredient.name}
                ingredient={ingredient}
                servings={portions}
                divider={index > 0}
              />
            ))}
          </Card>
        </View>

        {profile.members.length > 0 ? (
          <View style={styles.section}>
            <SectionTitle>每人份量</SectionTitle>
            <Card style={styles.listCard}>
              {profile.members.map((member, index) => (
                <CardRow
                  key={member.id}
                  divider={index > 0}
                  label={
                    <ThemedText type="body">
                      {member.name}（{memberSummaryLabel(member)}）
                    </ThemedText>
                  }
                  value={
                    <ThemedText type="body" themeColor="textSecondary">
                      {portionLabel(member)}
                    </ThemedText>
                  }
                />
              ))}
              {staple ? (
                <CardRow
                  label={<ThemedText type="body">主食 {staple.name}</ThemedText>}
                  value={
                    <ThemedText type="body" themeColor="textSecondary">
                      {stapleAmountLabel(staple)}
                    </ThemedText>
                  }
                />
              ) : null}
            </Card>
            <ThemedText type="caption" themeColor="textSecondary" style={styles.note}>
              份数是按年龄分的食量档：成人 1 份、儿童（未满 13 岁）0.5 份、长辈（60 岁起）0.8
              份。上面的食材克数是全家合计，不再按人分开四舍五入，免得总数对不上。
            </ThemedText>
          </View>
        ) : null}

        <View style={styles.section}>
          <SectionTitle>调味料</SectionTitle>
          <Card style={styles.listCard}>
            {recipe.seasonings.map((ingredient, index) => (
              <IngredientRow
                key={ingredient.name}
                ingredient={ingredient}
                servings={portions}
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

        {cautionList.length > 0 || hasDiseaseMember ? (
          <View style={styles.section}>
            <SectionTitle>注意事项</SectionTitle>
            <Card>
              {cautionList.map((item) => (
                <ThemedText key={`${item.name}-${item.tag}`} type="small" themeColor="textSecondary">
                  {item.name}（{item.tag}）：{item.text}
                </ThemedText>
              ))}
              {hasDiseaseMember ? (
                <ThemedText type="caption" themeColor="textSecondary">
                  {DISEASE_DISCLAIMER}
                </ThemedText>
              ) : null}
            </Card>
          </View>
        ) : null}

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
