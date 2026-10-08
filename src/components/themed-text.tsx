import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?:
    | 'largeTitle'
    | 'title'
    | 'headline'
    | 'body'
    | 'small'
    | 'smallBold'
    | 'caption'
    | 'code';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'body', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return <Text style={[{ color: theme[themeColor ?? 'text'] }, styles[type], style]} {...rest} />;
}

/** Type scale borrowed from Apple's HIG: a 34pt page title, 22pt card titles, 17pt emphasis. */
const styles = StyleSheet.create({
  largeTitle: {
    fontSize: 34,
    lineHeight: 41,
    fontWeight: '700',
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600',
  },
  headline: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '600',
  },
  body: {
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '400',
  },
  small: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '500',
  },
  smallBold: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: '700' as const }) ?? ('500' as const),
    fontSize: 12,
  },
});
