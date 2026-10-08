import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Radius, Spacing, TagColors, type TagTone } from '@/constants/theme';

export function Tag({
  label,
  tone = 'neutral',
  style,
}: {
  label: string;
  tone?: TagTone;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = TagColors[tone];

  return (
    <View style={[styles.tag, { backgroundColor: colors.bg }, style]}>
      <Text style={[styles.label, { color: colors.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Wrapping row that keeps pill spacing consistent wherever tags are shown together. */
export function TagRow({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  tag: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
});
