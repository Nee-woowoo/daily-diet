import { StyleSheet, TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  autoFocus,
  keyboardType,
  returnKeyType,
  onSubmitEditing,
  secureTextEntry,
  autoCapitalize = 'sentences',
  autoCorrect = true,
}: {
  label?: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  keyboardType?: KeyboardTypeOptions;
  returnKeyType?: 'done' | 'next';
  /**
   * 键盘的完成键（或「next」以外的提交动作）按下了。**参数是输入框自己的文本**，不是让调用方去读
   * 自己那份 state：`onSubmitEditing` 由原生 `textFieldShouldReturn` 触发，此刻最后一次
   * `onChangeText` 未必已经落进 React state（自动填充尤其明显），而原生事件里的 `text` 一定是完整的。
   * 按老办法读 state，会在「刚打完就按完成键」时拿到缺尾巴的值 —— 保存下来的密钥是错的，还可能被
   * 当成空串。
   */
  onSubmitEditing?: (text: string) => void;
  /** 密码式遮蔽。AI 密钥用它，免得明文摆在屏幕上。 */
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
}) {
  const theme = useTheme();

  return (
    <View style={styles.field}>
      {label ? (
        <ThemedText type="caption" themeColor="textSecondary">
          {label}
        </ThemedText>
      ) : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textTertiary}
        autoFocus={autoFocus}
        keyboardType={keyboardType}
        returnKeyType={returnKeyType}
        onSubmitEditing={
          onSubmitEditing ? (event) => onSubmitEditing(event.nativeEvent.text) : undefined
        }
        secureTextEntry={secureTextEntry}
        // 密钥与「尿酸偏高」这类自由文本都不该被首字母大写或自动纠错改掉。
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        style={[styles.input, { backgroundColor: theme.background, color: theme.text }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: Spacing.one,
  },
  input: {
    height: 46,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
});
