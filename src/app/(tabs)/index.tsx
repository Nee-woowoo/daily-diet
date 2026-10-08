import { router, type ErrorBoundaryProps } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PlainButton, PrimaryButton } from '@/components/ui/button';
import { Card, CardRow, PressableCard } from '@/components/ui/card';
import { Tag, TagRow } from '@/components/ui/tag';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { AI_DISCLAIMER, isAiRecipe, NO_KEY_HINT } from '@/lib/ai';
import { careLine, excludedRecipes } from '@/lib/advice';
import {
  MEAL_SLOT_LABELS,
  MEAL_SLOTS,
  OIL_LEVEL_LABELS,
  mealRoleLabel,
} from '@/lib/labels';
import { householdLabel, householdPortionsLabel, needsMigrationCheck } from '@/lib/members';
import { achievement, dayNutrition, mealTotals, nutritionTarget } from '@/lib/nutrition';
import { matchRecipe, todayLabel } from '@/lib/planner';
import { getRecipe } from '@/lib/recipes';
import {
  buildStaplePlan,
  memberPortionLine,
  roundKcal,
  stapleAmountLabel,
  stapleLineLabel,
} from '@/lib/staples';
import { useAppStore } from '@/lib/storage';
import type { Recipe } from '@/lib/types';

/** 从「轻」到「重」：一餐里多道菜时，标签取最重的那道的油量。 */
const OIL_ORDER = { low: 0, medium: 1, high: 2 } as const;

/** 达成情况只报这三项：其余两项（脂肪、纤维）仍以克数显示，但不给比例。 */
const ACHIEVEMENT_LABELS = { kcal: '热量', protein: '蛋白质', carbs: '碳水' } as const;
const ACHIEVEMENT_KEYS = ['kcal', 'protein', 'carbs'] as const;

function joinParts(parts: (string | null)[]): string {
  return parts.filter((part): part is string => part !== null).join(' · ');
}

/**
 * 今日页的兜底屏。整个 app 里目前只有这一个路由导出 `ErrorBoundary`（`expo-router` 只会给导出它的
 * 路由套一层 `Try`，见 `node_modules/expo-router/build/useScreens.js`），而它挡的是最要紧的那个页面：
 * 没有它的话，今日页渲染时抛一个异常就是**白屏**，用户没有任何恢复手段（连「重新生成」都点不到）。
 *
 * `error.message` 只在开发构建里显示：它是给开发看的，正式包里显示出来对用户没有意义。
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <Screen title="今日" subtitle={todayLabel()}>
      <Card>
        <ThemedText type="headline">今日页出错了</ThemedText>
        <ThemedText type="caption" themeColor="textSecondary">
          这一页没能画出来。点下面的按钮重试；一直不行就去「我的 · 数据」用本地规则重新生成今天的三餐。
        </ThemedText>
        {__DEV__ ? (
          <ThemedText type="caption" themeColor="textTertiary">
            {error.message}
          </ThemedText>
        ) : null}
        <PlainButton label="重试" onPress={() => void retry()} />
      </Card>
    </Screen>
  );
}

/**
 * 一餐里的一个组成部分：整行可点，进详情页看做法。
 *
 * 行的形状与「今日主食」卡里的 `CardRow` 一致（左侧名称、右侧数值、行间发丝线），只是整行包在
 * `Pressable` 里 —— 一餐有 2–3 个组成部分，点整张卡片已经没法表达「点开哪一道」。
 */
function DishRow({
  label,
  kcal,
  divider,
  onPress,
}: {
  label: string;
  kcal: number;
  divider: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}，约 ${kcal} 千卡，查看做法`}
      onPress={onPress}
      style={({ pressed }) => (pressed ? styles.rowPressed : undefined)}>
      <CardRow
        divider={divider}
        label={<ThemedText type="body">{label}</ThemedText>}
        value={
          <ThemedText type="body" themeColor="textSecondary">
            约 {kcal} 千卡 ›
          </ThemedText>
        }
      />
    </Pressable>
  );
}

export default function TodayScreen() {
  const {
    hydrated,
    plan,
    pantry,
    profile,
    regenerateToday,
    regeneratePlan,
    shoppingList,
    aiConfigured,
    aiBusy,
    aiAttempt,
    aiError,
    cancelAiGeneration,
  } = useAppStore();

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

  // 每个槽位是 2–3 个组成部分（本地路径只有一道，数组长度 1）。解析不出的 id 与其它消费方一样静默跳过。
  const meals = MEAL_SLOTS.map((slot) => ({
    slot,
    recipes: plan.meals[slot]
      .map((id) => getRecipe(id))
      .filter((recipe): recipe is Recipe => recipe !== undefined),
  })).filter((meal) => meal.recipes.length > 0);

  const target = nutritionTarget(profile);
  const nutrition = dayNutrition(plan, profile);
  const staples = buildStaplePlan(plan, profile);
  const members = profile.members;
  const stapleKcal = roundKcal(staples.addedMacrosPerServing.kcal);
  const achievementParts = nutrition
    ? joinParts(
        ACHIEVEMENT_KEYS.map((key) => {
          const percent = achievement(nutrition.household, target)[key];
          return percent === undefined ? null : `${ACHIEVEMENT_LABELS[key]} ${percent}%`;
        }),
      )
    : '';
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
      footer={
        <>
          <PrimaryButton
            label={aiBusy ? 'AI 正在设计菜单…' : '重新生成今日菜单'}
            onPress={regenerateToday}
            loading={aiBusy}
          />
          {/* 没配 Key 时说明按钮会走哪条路。放在按钮正下方而不是页面顶部：这句话说的是「下次生成
              会怎样」，贴着按钮才不会被读成对当前这份菜单的描述（清掉 Key 后菜单可能还是 AI 排的）。 */}
          {!aiConfigured ? (
            <ThemedText type="caption" themeColor="textSecondary" style={styles.footerNote}>
              {NO_KEY_HINT}
            </ThemedText>
          ) : null}
        </>
      }>
      {/* 生成中：预计 10–30 秒，所以除了按钮上的转圈，还给一句人话和一个出口。
          切到别的 Tab 不会中断请求 —— 请求已经计费了，让它跑完并缓存下来。 */}
      {aiBusy ? (
        <Card>
          <View style={styles.busyRow}>
            <ActivityIndicator />
            <ThemedText type="body">
              {aiAttempt > 1 ? '第一次返回不合格，正在重试…' : 'AI 正在设计菜单，通常 10–30 秒'}
            </ThemedText>
          </View>
          <ThemedText type="caption" themeColor="textSecondary">
            {aiAttempt > 1
              ? '已经把不合格的原因讲给模型听了，这次通常会好。'
              : '生成完会按家人的禁忌在本机复核一遍。切到别的页面也不会中断。'}
          </ThemedText>
          <PlainButton label="取消" onPress={cancelAiGeneration} />
        </Card>
      ) : null}

      {/* 失败：说清原因 + 一键重试。AI 已经回退到本地规则时，菜单其实已经换好了，
          所以只有「重试」；还在吃 AI 菜单时才给「改用本地规则」这个出口。 */}
      {aiError && !aiBusy ? (
        <Card>
          <ThemedText type="headline">
            {aiError.kind === 'auth' || aiError.kind === 'balance' ? 'AI 暂时用不了' : 'AI 生成失败'}
          </ThemedText>
          <ThemedText type="caption" themeColor="textSecondary">
            {aiError.message}
          </ThemedText>
          <View style={styles.errorRow}>
            <PlainButton label="重试" onPress={regenerateToday} />
            {plan.source === 'ai' ? (
              <PlainButton label="改用本地规则" onPress={regeneratePlan} />
            ) : null}
          </View>
        </Card>
      ) : null}

      {plan.source === 'ai' ? (
        <ThemedText type="caption" themeColor="textSecondary" style={styles.topNote}>
          {AI_DISCLAIMER}
        </ThemedText>
      ) : null}

      {/* 模型有话要说时的一张卡（0–2 句）：典型的是「食库里有样食材我不知道你家怎么吃，先没敢用」。
          随 plan 落盘，所以重启后还在；重新生成会整份换掉。本地菜单永远没有这张卡。 */}
      {plan.notes && plan.notes.length > 0 ? (
        <Card>
          <ThemedText type="headline">菜单说明</ThemedText>
          {plan.notes.map((note, index) => (
            // 用下标做 key：两句话可能一模一样（模型不是没干过），用文案当 key 会撞。
            <ThemedText key={`note-${index}`} type="small" themeColor="textSecondary">
              {note}
            </ThemedText>
          ))}
        </Card>
      ) : null}

      {/* 今日目标 + 今天这份菜单的达成情况。原来那张「三餐菜品合计」卡的全家合计行并到了这里：
          两处各报一个当天总数，口径迟早对不上。 */}
      <Card>
        <View style={styles.mealHeader}>
          <ThemedText type="headline">今日目标</ThemedText>
          <TagRow>
            {members.length > 0 ? (
              <Tag label={householdPortionsLabel(profile)} />
            ) : (
              <Tag label="还没添加成员" tone="missing" />
            )}
          </TagRow>
        </View>
        <ThemedText type="body">
          热量约 {target.kcal} 千卡 · 蛋白质约 {target.protein}g
        </ThemedText>
        <ThemedText type="body">
          碳水约 {target.carbs}g · 脂肪约 {target.fat}g · 纤维约 {target.fiber}g
        </ThemedText>
        {nutrition ? (
          <>
            <ThemedText type="caption" themeColor="textSecondary">
              {`今天这份菜单（全家）：${joinParts([
                `约 ${roundKcal(nutrition.household.kcal)} 千卡`,
                `蛋白质 ${Math.round(nutrition.household.protein)}g`,
                nutrition.household.carbs === null ? null : `碳水 ${Math.round(nutrition.household.carbs)}g`,
                nutrition.household.fat === null ? null : `脂肪 ${Math.round(nutrition.household.fat)}g`,
                nutrition.household.fiber === null ? null : `纤维 ${Math.round(nutrition.household.fiber)}g`,
              ])}`}
            </ThemedText>
            {achievementParts.length > 0 ? (
              <ThemedText type="caption" themeColor="textSecondary">
                达成：{achievementParts}
              </ThemedText>
            ) : null}
          </>
        ) : null}
        <ThemedText type="caption" themeColor="textSecondary">
          按每位成员的年龄、体重方向与特殊状态估算，仅供参考；特殊疾病请遵医嘱。
        </ThemedText>
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
          {members.length > 0 ? (
            <ThemedText type="caption" themeColor="textSecondary">
              每人份量：{memberPortionLine(profile)}
            </ThemedText>
          ) : null}

          <View style={styles.rowList}>
            {staples.lines.map((line, index) => (
              // 一餐可能有多个组成部分（各自的菜里都带主食），所以 key 由 slot 与下标组成，不能只用 slot。
              <CardRow
                key={line.key}
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
            早餐的主食就是菜本身，已含在菜品热量里；主食请自备，不在采购清单和食库匹配里。
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
            今天的菜单还缺 {shoppingList.length} 样食材。食库只影响大约一半餐次的选菜，其余餐次是特意推荐的新菜
            —— 缺几样很正常。买到的勾上，一键放进食库。
          </ThemedText>
        </PressableCard>
      ) : null}

      {meals.map(({ slot, recipes }) => {
        // 一餐的小计是**每人份**（卡片上其它数字也都是每人份），含这一餐的另配主食标准份。
        const totals = mealTotals(plan, slot, profile);
        const stapleLines = staples.lines.filter((line) => line.slot === slot);
        const hasAddedStaple = stapleLines.some((line) => !line.fromDish);
        const missing = [
          ...new Set(recipes.flatMap((recipe) => matchRecipe(recipe, pantry).missing)),
        ];
        const ready = missing.length === 0;
        const longest = Math.max(...recipes.map((recipe) => recipe.minutes));
        const oil = recipes.reduce(
          (worst, recipe) => (OIL_ORDER[recipe.oilLevel] > OIL_ORDER[worst] ? recipe.oilLevel : worst),
          'low' as Recipe['oilLevel'],
        );
        // 「兼顾说明」：这道菜怎么照顾到每个人。家里还没有成员时 `careLine` 返回空串，不渲染。
        const cares = recipes
          .map((recipe) => ({ id: recipe.id, name: recipe.name, text: careLine(recipe, profile) }))
          .filter((care) => care.text.length > 0);
        const aiCares = recipes
          .map((recipe) => ({ id: recipe.id, name: recipe.name, text: recipe.aiCare }))
          .filter(
            (care): care is { id: string; name: string; text: string } =>
              typeof care.text === 'string' && care.text.length > 0,
          );
        const single = recipes.length === 1;

        return (
          // **整张卡片可点**，点空白处（标题、小计、标签那些地方）打开**第一道**的做法；每一行仍然是
          // 自己的 `Pressable`（内层优先），点哪一行就开哪一道。单组成部分的本地菜单因此回到改动前的
          // 行为：整张卡就是那一道菜。
          //
          // 上一版只把每一行做成可点，卡片上那片没有响应者的区域点上去毫无反应 —— 看起来像「卡死」。
          <PressableCard
            key={slot}
            accessibilityLabel={`${MEAL_SLOT_LABELS[slot]}共 ${recipes.length} 道菜，打开第一道 ${recipes[0].name} 的做法`}
            onPress={() =>
              router.push({ pathname: '/recipe/[id]', params: { id: recipes[0].id } })
            }>
            <ThemedText type="caption" themeColor="textSecondary">
              {MEAL_SLOT_LABELS[slot]}
            </ThemedText>

            <ThemedText type="body" themeColor="textSecondary">
              {`约 ${roundKcal(totals.kcal)} 千卡 · 蛋白质 ${Math.round(totals.protein)}g${
                totals.carbs === null ? '' : ` · 碳水 ${Math.round(totals.carbs)}g`
              }（每人份${hasAddedStaple ? '，含另配主食' : ''}）`}
            </ThemedText>

            <View style={styles.rowList}>
              {recipes.map((recipe, index) => (
                <DishRow
                  key={recipe.id}
                  divider={index > 0}
                  label={`${recipe.role ? `${mealRoleLabel(recipe.role, slot)} · ` : ''}${recipe.name}`}
                  kcal={recipe.calories}
                  onPress={() =>
                    router.push({ pathname: '/recipe/[id]', params: { id: recipe.id } })
                  }
                />
              ))}
            </View>

            {stapleLines.map((line) => (
              <ThemedText key={line.key} type="caption" themeColor="textSecondary">
                {stapleLineLabel(line, profile)}
              </ThemedText>
            ))}

            <TagRow>
              {recipes.some((recipe) => isAiRecipe(recipe)) ? <Tag label="AI" tone="ai" /> : null}
              <Tag label={`最长 ${longest} 分钟`} />
              {oil !== 'low' ? (
                <Tag label={OIL_LEVEL_LABELS[oil]} tone="neutral" />
              ) : (
                <Tag label={OIL_LEVEL_LABELS.low} tone="ready" />
              )}
            </TagRow>

            <View style={styles.matchRow}>
              <Tag label={ready ? '食材齐全' : `缺 ${missing.length} 样`} tone={ready ? 'ready' : 'missing'} />
              <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1} style={styles.matchText}>
                {ready ? '食库里都有，可以直接做' : `缺 ${missing.join('、')}`}
              </ThemedText>
            </View>

            {cares.map((care) => (
              <ThemedText
                key={`care-${care.id}`}
                type="caption"
                themeColor="textSecondary"
                style={styles.careText}>
                {single ? care.text : `${care.name}：${care.text}`}
              </ThemedText>
            ))}

            {/* 模型写的「兼顾说明」是**多出来的一行**，不替换上面那句模板文案：模板那句由配料
                算出、高血压会提醒少喝汤汁，比模型的一句话更靠得住。 */}
            {aiCares.map((care) => (
              <ThemedText
                key={`ai-care-${care.id}`}
                type="caption"
                themeColor="textSecondary"
                style={styles.careText}>
                {single ? `AI 说明：${care.text}` : `AI 说明（${care.name}）：${care.text}`}
              </ThemedText>
            ))}

            {/* 午晚餐的 pairing 写的就是主食，已经由上面那行按人数和目标算好了；早餐的 pairing
                是蛋白/饮品这类别的搭配，照原样显示。多组成部分时 pairing 只可能是模型给的额外建议，
                每道一行会太长 —— 只在单组成部分时显示（与改动前的本地菜单逐字相同）。 */}
            {single && recipes[0].pairing && !recipes[0].staple ? (
              <ThemedText type="caption" themeColor="textSecondary">
                建议搭配：{recipes[0].pairing}
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
  rowList: {
    gap: 0,
  },
  // 行内点击的反馈：整行变淡，不改背景色（卡片有自己的底色）。
  rowPressed: {
    opacity: 0.5,
  },
  matchText: {
    flexShrink: 1,
  },
  // 卡片外的那行免责小字贴着屏幕边缘太挤，退回一档内边距。
  topNote: {
    paddingHorizontal: Spacing.one,
  },
  footerNote: {
    textAlign: 'center',
  },
  busyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  // 兼顾说明会长到两行，给它一点点左内边距当作引文，和上面的标签区分开。
  careText: {
    paddingLeft: Spacing.two,
  },
});
