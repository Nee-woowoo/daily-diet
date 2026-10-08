import { router } from 'expo-router';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PlainButton } from '@/components/ui/button';
import { Card, CardRow, SectionTitle } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Tag } from '@/components/ui/tag';
import { Spacing } from '@/constants/theme';
import { exclusionLabels } from '@/lib/advice';
import { PREFERENCE_LABELS } from '@/lib/labels';
import { householdPortionsLabel, memberCount } from '@/lib/members';
import { RECIPES } from '@/lib/recipes';
import { useAppStore } from '@/lib/storage';
import { useTheme } from '@/hooks/use-theme';

export default function MineScreen() {
  const { profile, fridge, plan, clearFridge, regeneratePlan } = useAppStore();
  const theme = useTheme();

  const confirmClearFridge = () => {
    Alert.alert('清空冰箱', '所有已添加的食材都会被删除，确定吗？', [
      { text: '取消', style: 'cancel' },
      { text: '清空', style: 'destructive', onPress: clearFridge },
    ]);
  };

  const preferenceLabel =
    profile.preferences.length > 0
      ? profile.preferences.map((preference) => PREFERENCE_LABELS[preference]).join('、')
      : '未设置';

  const memberNames =
    profile.members.length > 0
      ? `${profile.members.map((member) => member.name).join('、')}（${memberCount(profile)} 人）`
      : '还没添加';

  return (
    <Screen title="我的" subtitle="设置摘要与本地数据">
      <SectionTitle trailing={<PlainButton label="修改" onPress={() => router.navigate('/profile')} />}>
        我的设置
      </SectionTitle>
      <Card style={styles.listCard}>
        <CardRow divider={false} label={<ThemedText type="body">家庭成员</ThemedText>} value={<ThemedText type="body" themeColor="textSecondary">{memberNames}</ThemedText>} />
        <CardRow label={<ThemedText type="body">每人份量</ThemedText>} value={<ThemedText type="body" themeColor="textSecondary">{householdPortionsLabel(profile)}</ThemedText>} />
        <CardRow label={<ThemedText type="body">饮食偏好</ThemedText>} value={<ThemedText type="body" themeColor="textSecondary">{preferenceLabel}</ThemedText>} />
        <CardRow
          label={<ThemedText type="body">上次保存</ThemedText>}
          value={
            <ThemedText type="body" themeColor="textSecondary">
              {profile.savedAt > 0 ? new Date(profile.savedAt).toLocaleDateString('zh-CN') : '还没保存过'}
            </ThemedText>
          }
        />
      </Card>

      <SectionTitle>我的数据</SectionTitle>
      <Card style={styles.listCard}>
        <CardRow divider={false} label={<ThemedText type="body">冰箱食材</ThemedText>} value={<ThemedText type="body" themeColor="textSecondary">{fridge.length} 样</ThemedText>} />
        <CardRow label={<ThemedText type="body">菜谱库</ThemedText>} value={<ThemedText type="body" themeColor="textSecondary">{RECIPES.length} 道</ThemedText>} />
        <CardRow label={<ThemedText type="body">今日菜单</ThemedText>} value={<ThemedText type="body" themeColor="textSecondary">{plan ? '已生成' : '未生成'}</ThemedText>} />
      </Card>

      <SectionTitle>数据管理</SectionTitle>
      <Card style={styles.listCard}>
        <CardRow
          divider={false}
          label={<ThemedText type="body">重置今日菜单</ThemedText>}
          trailing={<PlainButton label="重新生成" onPress={regeneratePlan} />}
        />
        <CardRow
          label={<ThemedText type="body">清空冰箱</ThemedText>}
          trailing={<PlainButton label="清空" tone="danger" onPress={confirmClearFridge} />}
        />
      </Card>

      <SectionTitle>菜谱库</SectionTitle>
      <Card style={styles.listCard}>
        {RECIPES.map((recipe, index) => {
          // 被家人禁忌排除的菜永远不会出现在今日菜单里，标出来用户才知道是为什么。
          const excluded = exclusionLabels(recipe, profile);
          return (
          <Pressable
            key={recipe.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: recipe.id } })}
            style={({ pressed }) => [
              styles.recipeRow,
              index > 0 && {
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: theme.separator,
              },
              pressed && styles.pressed,
            ]}>
            <View style={styles.recipeHeader}>
              <ThemedText type="body">{recipe.name}</ThemedText>
              {excluded.length > 0 ? (
                <Tag label={`排除：${excluded.join('、')}`} tone="unsafe" />
              ) : null}
            </View>
            <ThemedText type="caption" themeColor="textSecondary">
              {recipe.minutes} 分钟 · {recipe.calories} 千卡/人
            </ThemedText>
          </Pressable>
          );
        })}
      </Card>

      <SectionTitle>关于</SectionTitle>
      <Card>
        <ThemedText type="body">每日饮食 · 版本 1.0.0</ThemedText>
        <ThemedText type="caption" themeColor="textSecondary">
          菜单由冰箱食材和家庭成员在本机计算生成，第一版还没有接入 AI。数据存放在设备本地存储中，卸载应用会一并清除。
        </ThemedText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  listCard: {
    gap: 0,
  },
  recipeRow: {
    paddingVertical: Spacing.two,
    gap: 2,
  },
  recipeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  pressed: {
    opacity: 0.6,
  },
});
