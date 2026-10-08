import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Household size / servings picker. */
export function Stepper({
  value,
  onChange,
  min = 1,
  max = 12,
  unit = '人',
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  unit?: string;
}) {
  const canDecrease = value > min;
  const canIncrease = value < max;

  return (
    <View style={styles.container}>
      <StepButton
        label="−"
        disabled={!canDecrease}
        onPress={() => onChange(value - 1)}
        accessibilityLabel="减少人数"
      />
      <View style={styles.value}>
        <ThemedText type="title">{value}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {unit}
        </ThemedText>
      </View>
      <StepButton
        label="＋"
        disabled={!canIncrease}
        onPress={() => onChange(value + 1)}
        accessibilityLabel="增加人数"
      />
    </View>
  );
}

function StepButton({
  label,
  disabled,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.step,
        { backgroundColor: theme.background, opacity: disabled ? 0.4 : pressed ? 0.6 : 1 },
      ]}>
      <Text style={[styles.stepLabel, { color: theme.tint }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  value: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.one,
  },
  step: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: {
    fontSize: 22,
    fontWeight: '500',
    lineHeight: 26,
  },
});
