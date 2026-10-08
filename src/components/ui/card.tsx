import type { ReactNode } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const cardShadow: ViewStyle =
  Platform.OS === 'android'
    ? { elevation: 1 }
    : {
        shadowColor: '#000000',
        shadowOpacity: 0.05,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      };

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();

  return <View style={[styles.card, { backgroundColor: theme.card }, style]}>{children}</View>;
}

export function PressableCard({
  children,
  onPress,
  style,
  accessibilityLabel,
}: {
  children: ReactNode;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: pressed ? theme.background : theme.card },
        style,
      ]}>
      {children}
    </Pressable>
  );
}

/** Group header above a card, matching iOS grouped-list captions. */
export function SectionTitle({ children, trailing }: { children: string; trailing?: ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <ThemedText type="small" themeColor="textSecondary">
        {children}
      </ThemedText>
      {trailing}
    </View>
  );
}

/** A labeled row inside a card: title on the left, value on the right. */
export function CardRow({
  label,
  value,
  trailing,
  divider = true,
}: {
  label: ReactNode;
  value?: ReactNode;
  trailing?: ReactNode;
  /** Set to false on the first row of a group so it has no top hairline. */
  divider?: boolean;
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.row,
        divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.separator },
      ]}>
      <View style={styles.rowLabel}>{label}</View>
      {value ?? null}
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    padding: Spacing.three,
    gap: Spacing.two,
    ...cardShadow,
  },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.one,
    paddingBottom: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  rowLabel: {
    flexShrink: 1,
  },
});
