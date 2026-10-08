import { Colors } from '@/constants/theme';

/**
 * The app is light-only by design (it follows Apple's light appearance rather than
 * the system scheme), so this returns the same palette on every device.
 */
export function useTheme() {
  return Colors;
}
