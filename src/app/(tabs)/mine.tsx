import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PlainButton, SoftButton } from '@/components/ui/button';
import { Card, CardRow, SectionTitle } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Tag } from '@/components/ui/tag';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { exclusionLabels } from '@/lib/advice';
import { PREFERENCE_LABELS } from '@/lib/labels';
import { householdPortionsLabel, memberCount } from '@/lib/members';
import { RECIPES } from '@/lib/recipes';
import { useAppStore } from '@/lib/storage';
import { useTheme } from '@/hooks/use-theme';

export default function MineScreen() {
  const {
    profile,
    pantry,
    plan,
    clearPantry,
    regeneratePlan,
    aiConfigured,
    aiKeyTail,
    aiTest,
    saveAiKey,
    clearAiKey,
    testAiKey,
  } = useAppStore();
  const theme = useTheme();
  /**
   * 输入框里是待保存的那份明文。
   *
   * **除了用户自己，谁都不清空它**：保存成功也不清。从前是「保存后顺手清空」，结果键盘的完成键
   * （`onSubmitEditing` 带着输入框自己的文本）和按钮走进同一条路，一次误触就把刚存好的密钥连同
   * 输入框一起清掉了。现在「保存密钥」和完成键是同一个动作 —— 提交草稿，草稿留在原地；要清掉
   * 只有下面那个带确认的「清除」。
   */
  const [aiKeyInput, setAiKeyInput] = useState('');

  const testLabel =
    aiTest.state === 'testing'
      ? '正在测试连接…'
      : aiTest.state === 'ok'
        ? `连接成功（${(aiTest.ms / 1000).toFixed(1)} 秒）`
        : aiTest.state === 'fail'
          ? aiTest.failure.message
          : null;

  const clearKey = () => {
    Alert.alert('清除 AI 密钥', '清除后「重新生成今日菜单」回到本地规则。已经生成的菜单不受影响。', [
      { text: '取消', style: 'cancel' },
      {
        text: '清除',
        style: 'destructive',
        // 用户明确说「不要这个密钥了」，这时把输入框一起带走才符合预期。
        onPress: () => {
          setAiKeyInput('');
          clearAiKey();
        },
      },
    ]);
  };

  const confirmClearPantry = () => {
    Alert.alert('清空食库', '所有已添加的食材都会被删除，确定吗？', [
      { text: '取消', style: 'cancel' },
      { text: '清空', style: 'destructive', onPress: clearPantry },
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
        <CardRow divider={false} label={<ThemedText type="body">食库食材</ThemedText>} value={<ThemedText type="body" themeColor="textSecondary">{pantry.length} 样</ThemedText>} />
        <CardRow label={<ThemedText type="body">菜谱库</ThemedText>} value={<ThemedText type="body" themeColor="textSecondary">{RECIPES.length} 道</ThemedText>} />
        <CardRow label={<ThemedText type="body">今日菜单</ThemedText>} value={<ThemedText type="body" themeColor="textSecondary">{plan ? (plan.source === 'ai' ? '已生成（AI）' : '已生成（本地规则）') : '未生成'}</ThemedText>} />
      </Card>

      <SectionTitle>数据管理</SectionTitle>
      <Card style={styles.listCard}>
        <CardRow
          divider={false}
          label={<ThemedText type="body">重置今日菜单</ThemedText>}
          trailing={<PlainButton label="用本地规则重新生成" onPress={regeneratePlan} />}
        />
        <CardRow
          label={<ThemedText type="body">清空食库</ThemedText>}
          trailing={<PlainButton label="清空" tone="danger" onPress={confirmClearPantry} />}
        />
      </Card>

      <SectionTitle>AI 设置</SectionTitle>
      <Card>
        <TextField
          label="DeepSeek API Key"
          value={aiKeyInput}
          onChangeText={setAiKeyInput}
          placeholder="sk-…"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          // 完成键 = 收起键盘 + 存下这一次的草稿，和下面那个按钮是同一件事。`TextField` 把输入框
          // 自己的文本传过来，所以「刚打完就按完成键」不会存下一个缺尾巴的密钥。
          onSubmitEditing={saveAiKey}
        />
        <View style={styles.buttonRow}>
          <SoftButton
            label="保存密钥"
            onPress={() => saveAiKey(aiKeyInput)}
            style={styles.buttonGrow}
          />
          <SoftButton label="测试连接" onPress={() => void testAiKey()} style={styles.buttonGrow} />
        </View>
        <View style={styles.statusRow}>
          <ThemedText type="caption" themeColor="textSecondary" style={styles.statusText}>
            {aiConfigured ? `已保存（sk-…${aiKeyTail}）` : '还没配置密钥，菜单由本地规则生成'}
            {testLabel ? `\n${testLabel}` : ''}
          </ThemedText>
          {aiConfigured ? <PlainButton label="清除" tone="danger" onPress={clearKey} /> : null}
        </View>
        <ThemedText type="caption" themeColor="textSecondary">
          配置后，生成菜单时会把家庭成员信息（称呼、年龄、体重方向、疾病标签、体检异常）和食库食材发给
          DeepSeek，用来设计当天三餐。密钥只保存在这台设备上，未加密。拿不准时点「测试连接」先验证一次。
        </ThemedText>
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
          菜单由食库食材和家庭成员在本机计算生成；配置了 API 密钥时改为请 AI 设计，规则仍然在本机复核一遍
          家人的硬禁忌。数据存放在设备本地存储中，卸载应用会一并清除。
        </ThemedText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  listCard: {
    gap: 0,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  buttonGrow: {
    flex: 1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  statusText: {
    flexShrink: 1,
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
