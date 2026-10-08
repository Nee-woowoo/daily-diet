/**
 * The app ships a single light palette modelled on Apple's system colours: a grouped
 * grey page background, white cards, and the system tint reserved for interactive
 * elements. Tag colours are darker foregrounds on tinted backgrounds so small labels
 * stay legible.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  /** Page background (iOS systemGroupedBackground). */
  background: '#F2F2F7',
  /** Cards and sheets sitting on top of `background`. */
  card: '#FFFFFF',
  border: '#E5E5EA',
  separator: '#EFEFF4',
  text: '#000000',
  textSecondary: '#8E8E93',
  textTertiary: '#C7C7CC',
  /** Interactive accent (iOS systemBlue). */
  tint: '#007AFF',
  tintSoft: '#EAF3FF',
  danger: '#FF3B30',
} as const;

export type ThemeColor = keyof typeof Colors;

export const TagColors = {
  fatLoss: { fg: '#1B7F45', bg: '#E6F7ED' },
  muscleGain: { fg: '#4540C0', bg: '#EEEDFB' },
  balanced: { fg: '#1A7C93', bg: '#E5F5F9' },
  light: { fg: '#1B6FA8', bg: '#E8F2FB' },
  spicy: { fg: '#C22E1C', bg: '#FDECEA' },
  vegetarian: { fg: '#1B7F45', bg: '#E6F7ED' },
  lowSugar: { fg: '#8A3AB8', bg: '#F6ECFB' },
  calories: { fg: '#A05500', bg: '#FFF3E0' },
  ready: { fg: '#1B7F45', bg: '#E6F7ED' },
  missing: { fg: '#A05500', bg: '#FFF3E0' },
  neutral: { fg: '#5A5F66', bg: '#F0F0F3' },
} as const;

export type TagTone = keyof typeof TagColors;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

/**
 * Lower bound for the bottom clearance `Screen` leaves under its content. It only guards against
 * a failed or zero measurement — the measured value is the real mechanism.
 *
 * Every tab screen reported a bottom inset of exactly 83 on device (the classic 49pt tab bar
 * plus the 34pt home indicator), so the safe-area channel is trustworthy and there is no need to
 * cover a taller bar. This was previously guessed at 96, 108, then 140 to chase a tab bar that
 * turned out to be shorter than the guesses: at 96 the last row cleared the bar by only 13pt and
 * sat inside its blur, and each guess above the real height became dead space at the end of
 * every list. Android's native tab host already insets the screen content, so this is just
 * breathing room on top of that.
 */
export const BottomTabInsetFloor = Platform.select({ ios: 83, android: 32, default: 32 }) ?? 0;
export const MaxContentWidth = 800;
