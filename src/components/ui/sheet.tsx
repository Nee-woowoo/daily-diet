import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Bottom sheet built on `Modal`, used for the add-ingredient and member forms. */
export function Sheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.root}>
        <Pressable accessibilityRole="button" accessibilityLabel="关闭" style={styles.backdrop} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            { backgroundColor: theme.card, paddingBottom: insets.bottom + Spacing.four },
          ]}>
          <View style={styles.header}>
            <ThemedText type="title">{title}</ThemedText>
            <Pressable accessibilityRole="button" hitSlop={8} onPress={onClose}>
              <ThemedText type="headline" themeColor="tint">
                关闭
              </ThemedText>
            </Pressable>
          </View>
          {/* 表单会长过一屏（成员表单有称呼、年龄、3 个目标卡、3 个状态），所以内容是滚动的：
              `maxHeight` 落在 sheet 上（父级是全屏的 KeyboardAvoidingView，高度确定），
              ScrollView 用 flexShrink 让出去，键盘顶上来时保存按钮依然能滚到。 */}
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    maxHeight: '85%',
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  body: {
    flexShrink: 1,
  },
  bodyContent: {
    gap: Spacing.three,
    paddingBottom: Spacing.one,
  },
});
