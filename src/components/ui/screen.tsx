import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { BottomTabInsetFloor, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface ScreenProps {
  title: string;
  subtitle?: string;
  /**
   * Action bar pinned above the tab bar, outside the scrolling content. Use it for a primary
   * action that must never end up under the bar — as scroll content it depends on the content
   * padding clearing the bar, and on iOS the bar's height moves (it minimizes on scroll), so
   * that padding is a moving target.
   */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * Standard page frame: grouped grey background, an iOS-style large title, and a scrolling
 * body, optionally with a footer pinned above the tab bar.
 *
 * With a footer, the scroll view ends above the footer, so nothing in the scrolling content can
 * be occluded by the tab bar and the content itself needs no clearance for it. The footer is
 * laid out by flex and gets its bottom inset from `SafeAreaView edges={['bottom']}` — the
 * platform's own measurement — rather than from a height we assume.
 *
 * Without a footer the last row is the content's own bottom padding: the measured safe-area
 * inset plus one `Spacing.five` gap, floored by `BottomTabInsetFloor` in case the measurement
 * comes back as just the home indicator. `contentInsetAdjustmentBehavior` stays on "never" so
 * that padding remains the single source of truth instead of stacking with UIKit's content inset.
 */
export function Screen({ title, subtitle, footer, children }: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const bottomPadding = footer
    ? Spacing.three
    : Math.max(insets.bottom, BottomTabInsetFloor) + Spacing.five;

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <ScrollView
          contentInsetAdjustmentBehavior="never"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}>
          <View style={styles.header}>
            <ThemedText type="largeTitle">{title}</ThemedText>
            {subtitle ? (
              <ThemedText type="small" themeColor="textSecondary">
                {subtitle}
              </ThemedText>
            ) : null}
          </View>
          {children}
        </ScrollView>
      </SafeAreaView>

      {footer ? (
        <SafeAreaView
          edges={['bottom']}
          style={[
            styles.footer,
            { backgroundColor: theme.card, borderTopColor: theme.separator },
          ]}>
          <View style={styles.footerContent}>{footer}</View>
        </SafeAreaView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  header: {
    gap: Spacing.one,
    paddingTop: Spacing.two,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerContent: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    // Keeps a small, deliberate gap between the action and the bar; the bar's own height comes
    // from the safe area this view is wrapped in.
    paddingBottom: Spacing.three,
    gap: Spacing.two,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
});
