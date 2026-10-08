import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PrimaryButton } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { CheckRow } from '@/components/ui/check-row';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { CATEGORY_LABELS, CATEGORY_ORDER } from '@/lib/labels';
import { shoppingAmountLabel } from '@/lib/shopping';
import { useAppStore } from '@/lib/storage';

/**
 * What today's three meals are missing, merged into one list to take shopping.
 *
 * The list comes from the store, which derives it from the plan the 今日 tab is showing, so the
 * two screens can never disagree.
 */
export default function ShoppingScreen() {
  const { shoppingList, toggleBought, addBoughtToPantry } = useAppStore();

  const boughtCount = shoppingList.filter((line) => line.bought).length;

  const groups = CATEGORY_ORDER.map((category) => ({
    category,
    items: shoppingList.filter((line) => line.category === category),
  })).filter((group) => group.items.length > 0);

  return (
    <Screen
      title="购物"
      subtitle="今日三餐还缺的食材，同名合并了用量"
      footer={
        shoppingList.length > 0 ? (
          <>
            <ThemedText type="caption" themeColor="textSecondary">
              {boughtCount > 0
                ? `已勾选 ${boughtCount} / ${shoppingList.length} 样，放进食库后自动从清单移除`
                : `共 ${shoppingList.length} 样，点一下代表已经买到`}
            </ThemedText>
            <PrimaryButton
              label={boughtCount > 0 ? `将 ${boughtCount} 样放进食库` : '勾选买到的食材'}
              onPress={addBoughtToPantry}
              disabled={boughtCount === 0}
            />
          </>
        ) : undefined
      }>
      {groups.length === 0 ? (
        <EmptyState
          title="今天不用买菜"
          description="今日菜单的食材食库里都有，可以直接开做。"
          actionLabel="去食库看看"
          onAction={() => router.navigate('/pantry')}
        />
      ) : null}

      {groups.map((group) => (
        <View key={group.category} style={styles.group}>
          <SectionTitle>{`${CATEGORY_LABELS[group.category]} · ${group.items.length} 样`}</SectionTitle>
          <Card style={styles.listCard}>
            {group.items.map((line, index) => (
              <CheckRow
                key={line.key}
                divider={index > 0}
                checked={line.bought}
                onPress={() => toggleBought(line.key)}
                label={line.optional ? `${line.name}（可选）` : line.name}
                detail={`${line.usedIn} · ${shoppingAmountLabel(line)}`}
              />
            ))}
          </Card>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: Spacing.one,
  },
  listCard: {
    gap: 0,
  },
});
