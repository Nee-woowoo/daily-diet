import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { Colors } from '@/constants/theme';

/**
 * Four native tabs: 今日 / 冰箱 / 录入 / 我的.
 *
 * Icons come from the platform itself — SF Symbols on iOS via `sf`, Material Symbols on
 * Android via `md` — so no icon package or image assets are needed.
 *
 * `minimizeBehavior="never"` keeps the iOS 26 tab bar at a constant height. By default it
 * minimizes while scrolling, and the device log showed the safe area it reports swinging between
 * 34 (bar hidden, home indicator only) and 83 (bar + home indicator). Any bottom spacing derived
 * from that number is chasing a moving target, so the bar is pinned instead.
 */
export default function TabsLayout() {
  return (
    <NativeTabs
      minimizeBehavior="never"
      backgroundColor={Colors.card}
      tintColor={Colors.tint}
      iconColor={{ default: Colors.textSecondary, selected: Colors.tint }}
      labelStyle={{
        default: { color: Colors.textSecondary },
        selected: { color: Colors.tint },
      }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>今日</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="fork.knife" md="restaurant" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="fridge">
        <NativeTabs.Trigger.Label>冰箱</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'refrigerator', selected: 'refrigerator.fill' }}
          md="kitchen"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>录入</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="square.and.pencil" md="edit_note" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="mine">
        <NativeTabs.Trigger.Label>我的</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }}
          md="person"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
