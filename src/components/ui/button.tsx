import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Filled call-to-action, e.g. 「重新生成今日菜单」.
 *
 * `loading` 只是把「禁用 + 转圈」这两件事绑在一起：AI 生成要 10–30 秒，按钮必须同时说明「正在忙」
 * 和「别再点了」，拆成两个 prop 就一定会有人只传一个。
 */
export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const inert = Boolean(disabled) || Boolean(loading);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inert, busy: Boolean(loading) }}
      disabled={inert}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: theme.tint,
          opacity: inert ? 0.4 : pressed ? 0.85 : 1,
        },
        style,
      ]}>
      <View style={styles.content}>
        {loading ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
        <Text style={styles.primaryLabel}>{label}</Text>
      </View>
    </Pressable>
  );
}

/** Tinted secondary action, e.g. 「＋ 添加食材」. */
export function SoftButton({
  label,
  onPress,
  style,
}: {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: theme.tintSoft, opacity: pressed ? 0.7 : 1 },
        style,
      ]}>
      <Text style={[styles.softLabel, { color: theme.tint }]}>{label}</Text>
    </Pressable>
  );
}

/** Borderless text action used inside rows (「删除」「去录入」). */
export function PlainButton({
  label,
  onPress,
  tone = 'tint',
}: {
  label: string;
  onPress: () => void;
  tone?: 'tint' | 'danger';
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => (pressed ? styles.pressed : undefined)}>
      <Text style={[styles.plainLabel, { color: tone === 'danger' ? theme.danger : theme.tint }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 50,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  primaryLabel: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  softLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  plainLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  pressed: {
    opacity: 0.6,
  },
});
