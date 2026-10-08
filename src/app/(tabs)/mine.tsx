import { router } from 'expo-router';
import { Alert, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PlainButton } from '@/components/ui/button';
import { Card, CardRow, SectionTitle } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { GOAL_LABELS, PREFERENCE_LABELS } from '@/lib/labels';
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

  return (
    <Screen title="我的" subtitle="设置摘要与本地数据">
      <SectionTitle trailing={<PlainButton label="修改" onPress={() => router.navigate('/profile')} />}>
        我的设置
      </SectionTitle>
      <Card style={styles.listCard}>
        <CardRow divider={false} label={<ThemedText type="body">家里人数</ThemedText>} value={<ThemedText type="body" themeColor="textSecondary">{profile.servings} 人</ThemedText>} />
        <CardRow label={<ThemedText type="body">身体目标</ThemedText>} value={<ThemedText type="body" themeColor="textSecondary">{GOAL_LABELS[profile.goal]}</ThemedText>} />
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
        {RECIPES.map((recipe, index) => (
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
            <ThemedText type="body">{recipe.name}</ThemedText>
            <ThemedText type="caption" themeColor="textSecondary">
              {recipe.minutes} 分钟 · {recipe.calories} 千卡
            </ThemedText>
          </Pressable>
        ))}
      </Card>

      <SectionTitle>关于</SectionTitle>
      <Card>
        <ThemedText type="body">每日饮食 · 版本 1.0.0</ThemedText>
        <ThemedText type="caption" themeColor="textSecondary">
          菜单由冰箱食材和身体目标在本机计算生成，第一版还没有接入 AI。数据存放在设备本地存储中，卸载应用会一并清除。
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
  pressed: {
    opacity: 0.6,
  },
});
