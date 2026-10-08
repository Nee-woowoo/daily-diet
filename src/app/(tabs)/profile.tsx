import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PrimaryButton } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { Chip, OptionCard } from '@/components/ui/chip';
import { Screen } from '@/components/ui/screen';
import { Stepper } from '@/components/ui/stepper';
import { TagRow } from '@/components/ui/tag';
import { Spacing } from '@/constants/theme';
import { GOAL_DESCRIPTIONS, GOAL_LABELS, PREFERENCE_LABELS } from '@/lib/labels';
import { useAppStore } from '@/lib/storage';
import type { Goal, Preference } from '@/lib/types';

const GOALS: Goal[] = ['fatLoss', 'muscleGain', 'balanced'];
const PREFERENCES: Preference[] = ['light', 'spicy', 'vegetarian', 'lowSugar'];

export default function ProfileScreen() {
  const { profile, saveProfile } = useAppStore();
  const [servings, setServings] = useState(profile.servings);
  const [goal, setGoal] = useState<Goal>(profile.goal);
  const [preferences, setPreferences] = useState<Preference[]>(profile.preferences);
  const [justSaved, setJustSaved] = useState(false);

  const togglePreference = (preference: Preference) => {
    setPreferences((current) =>
      current.includes(preference)
        ? current.filter((item) => item !== preference)
        : [...current, preference],
    );
  };

  const save = () => {
    // Saving also rebuilds today's menu from the new settings.
    saveProfile({ servings, goal, preferences });
    setJustSaved(true);
  };

  return (
    <Screen title="录入" subtitle="填好基本信息，菜单会按你的目标筛选">
      <View style={styles.section}>
        <SectionTitle>家里几口人</SectionTitle>
        <Card>
          <Stepper value={servings} onChange={setServings} />
          <ThemedText type="caption" themeColor="textSecondary">
            食材用量按 {servings} 人份换算，热量按每人份估算。
          </ThemedText>
        </Card>
      </View>

      <View style={styles.section}>
        <SectionTitle>身体目标</SectionTitle>
        <View style={styles.options}>
          {GOALS.map((option) => (
            <OptionCard
              key={option}
              title={GOAL_LABELS[option]}
              description={GOAL_DESCRIPTIONS[option]}
              selected={goal === option}
              onPress={() => setGoal(option)}
            />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <SectionTitle>饮食偏好 · 可多选</SectionTitle>
        <Card>
          <TagRow>
            {PREFERENCES.map((preference) => (
              <Chip
                key={preference}
                label={PREFERENCE_LABELS[preference]}
                selected={preferences.includes(preference)}
                onPress={() => togglePreference(preference)}
              />
            ))}
          </TagRow>
          <ThemedText type="caption" themeColor="textSecondary">
            选「素食」会排除所有荤菜；没选「辣」时辣菜会被降权，但仍可能出现在菜单里。
          </ThemedText>
        </Card>
      </View>

      <PrimaryButton label="保存设置" onPress={save} />

      {justSaved ? (
        <Card>
          <ThemedText type="headline">已保存</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            今日菜单已经按新的设置重新生成，切到「今日」就能看到。
          </ThemedText>
        </Card>
      ) : null}

      <ThemedText type="caption" themeColor="textSecondary" style={styles.footnote}>
        所有数据只保存在这台设备上，不会上传。
      </ThemedText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.one,
  },
  options: {
    gap: Spacing.two,
  },
  footnote: {
    textAlign: 'center',
    paddingTop: Spacing.one,
  },
});
