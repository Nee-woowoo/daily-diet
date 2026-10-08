import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * A tap-to-toggle row for a checklist: glyph on the left, name and detail in the middle.
 *
 * Kept separate from `CardRow` on purpose. `CardRow` is a label/value row, and two other screens
 * (食库, 我的) put buttons in its trailing slot — turning that row's root into a Pressable would
 * change how those nested buttons negotiate the touch responder, for no gain here. The checked
 * glyph (`✓` / `○`) is the same unicode pair `OptionCard` uses.
 */
export function CheckRow({
  label,
  detail,
  checked,
  onPress,
  divider = true,
}: {
  label: string;
  /** Second line, e.g. `早・晚 · 250 克`. */
  detail: string;
  checked: boolean;
  onPress: () => void;
  /** Set to false on the first row of a group so it has no top hairline. */
  divider?: boolean;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.separator },
        { opacity: pressed ? 0.6 : 1 },
      ]}>
      <ThemedText type="headline" themeColor={checked ? 'tint' : 'textTertiary'}>
        {checked ? '✓' : '○'}
      </ThemedText>
      <View style={styles.body}>
        <ThemedText
          type="body"
          themeColor={checked ? 'textSecondary' : 'text'}
          style={checked ? styles.bought : undefined}>
          {label}
        </ThemedText>
        <ThemedText type="caption" themeColor="textSecondary">
          {detail}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  body: {
    flex: 1,
    gap: Spacing.half,
  },
  // Checked rows stay in place — reordering them under the user's finger is the classic
  // checklist annoyance — so being dimmed and struck through is what marks them as done.
  bought: {
    textDecorationLine: 'line-through',
  },
});
