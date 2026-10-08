import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PlainButton, PrimaryButton, SoftButton } from '@/components/ui/button';
import { Card, CardRow, SectionTitle } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { TagRow } from '@/components/ui/tag';
import { Sheet } from '@/components/ui/sheet';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { CATEGORY_LABELS, CATEGORY_ORDER } from '@/lib/labels';
import { useAppStore, type NewFridgeItem } from '@/lib/storage';
import type { IngredientCategory } from '@/lib/types';

export default function FridgeScreen() {
  const { fridge, addFridgeItem, removeFridgeItem } = useAppStore();
  const [sheetVisible, setSheetVisible] = useState(false);

  const groups = CATEGORY_ORDER.map((category) => ({
    category,
    items: fridge.filter((item) => item.category === category),
  })).filter((group) => group.items.length > 0);

  return (
    <Screen title="冰箱" subtitle={`已有 ${fridge.length} 样食材，菜单会优先用上它们`}>
      <SoftButton label="＋ 添加食材" onPress={() => setSheetVisible(true)} />

      {groups.length === 0 ? (
        <EmptyState
          title="冰箱还是空的"
          description="添加手头现有的食材，今日菜单会优先推荐能直接做的菜。"
          actionLabel="添加第一样食材"
          onAction={() => setSheetVisible(true)}
        />
      ) : null}

      {groups.map((group) => (
        <View key={group.category} style={styles.group}>
          <SectionTitle>{`${CATEGORY_LABELS[group.category]} · ${group.items.length} 样`}</SectionTitle>
          <Card style={styles.listCard}>
            {group.items.map((item, index) => (
              <CardRow
                key={item.id}
                divider={index > 0}
                label={
                  <View>
                    <ThemedText type="body">{item.name}</ThemedText>
                    {item.amount ? (
                      <ThemedText type="caption" themeColor="textSecondary">
                        {item.amount}
                      </ThemedText>
                    ) : null}
                  </View>
                }
                trailing={
                  <PlainButton label="删除" tone="danger" onPress={() => removeFridgeItem(item.id)} />
                }
              />
            ))}
          </Card>
        </View>
      ))}

      <AddIngredientSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        onSubmit={(input) => {
          addFridgeItem(input);
          setSheetVisible(false);
        }}
      />
    </Screen>
  );
}

function AddIngredientSheet({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (input: NewFridgeItem) => void;
}) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<IngredientCategory>('veg');

  const canSubmit = name.trim().length > 0;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit({ name: name.trim(), amount: amount.trim(), category });
    setName('');
    setAmount('');
    setCategory('veg');
  };

  return (
    <Sheet visible={visible} title="添加食材" onClose={onClose}>
      <TextField
        label="名称"
        value={name}
        onChangeText={setName}
        placeholder="例如：番茄"
        autoFocus
        returnKeyType="next"
      />
      <TextField
        label="数量"
        value={amount}
        onChangeText={setAmount}
        placeholder="例如：500 克 / 2 个"
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      <View style={styles.categoryField}>
        <ThemedText type="caption" themeColor="textSecondary">
          分类
        </ThemedText>
        <TagRow>
          {CATEGORY_ORDER.map((option) => (
            <Chip
              key={option}
              label={CATEGORY_LABELS[option]}
              selected={category === option}
              onPress={() => setCategory(option)}
            />
          ))}
        </TagRow>
      </View>
      <PrimaryButton label="添加" onPress={submit} disabled={!canSubmit} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: Spacing.one,
  },
  listCard: {
    gap: 0,
  },
  categoryField: {
    gap: Spacing.one,
  },
});
