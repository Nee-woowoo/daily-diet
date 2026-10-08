import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Multi-select pill used for 饮食偏好 and 食材分类. */
export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: selected ? theme.tint : theme.border,
          backgroundColor: selected ? theme.tintSoft : theme.card,
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      <Text style={[styles.chipLabel, { color: selected ? theme.tint : theme.text }]}>{label}</Text>
    </Pressable>
  );
}

/** Single-select card used for a member's 体重方向; richer than a chip so each goal can explain itself. */
export function OptionCard({
  title,
  description,
  selected,
  onPress,
}: {
  title: string;
  description: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        {
          borderColor: selected ? theme.tint : theme.border,
          backgroundColor: selected ? theme.tintSoft : theme.card,
          opacity: pressed ? 0.8 : 1,
        },
      ]}>
      <View style={styles.optionHeader}>
        <ThemedText type="headline" themeColor={selected ? 'tint' : 'text'}>
          {title}
        </ThemedText>
        <ThemedText type="headline" themeColor={selected ? 'tint' : 'textTertiary'}>
          {selected ? '✓' : '○'}
        </ThemedText>
      </View>
      <ThemedText type="caption" themeColor="textSecondary">
        {description}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  chipLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  option: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
