import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PlainButton, PrimaryButton, SoftButton } from '@/components/ui/button';
import { Card, CardRow, SectionTitle } from '@/components/ui/card';
import { Chip, OptionCard } from '@/components/ui/chip';
import { Screen } from '@/components/ui/screen';
import { Sheet } from '@/components/ui/sheet';
import { TagRow } from '@/components/ui/tag';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { GOAL_DESCRIPTIONS, GOAL_LABELS, PREFERENCE_LABELS, formatAmount } from '@/lib/labels';
import {
  DEFAULT_MEMBER,
  DISEASE_DISCLAIMER,
  METABOLIC_TAGS,
  METABOLIC_TAG_HINTS,
  METABOLIC_TAG_LABELS,
  SPECIAL_TAGS,
  SPECIAL_TAG_HINTS,
  SPECIAL_TAG_LABELS,
  createMemberId,
  householdLabel,
  householdPortions,
  memberSummaryLabel,
  needsMigrationCheck,
  portionLabel,
} from '@/lib/members';
import { useAppStore } from '@/lib/storage';
import type { Goal, Member, MemberTag, Preference } from '@/lib/types';

const GOALS: Goal[] = ['fatLoss', 'muscleGain', 'balanced'];
const PREFERENCES: Preference[] = ['light', 'spicy', 'vegetarian', 'lowSugar'];
/** 年龄输入的上限；`age: 0` 表示「没填」，引擎按成人 1 份算。 */
const AGE_MAX = 120;

export default function ProfileScreen() {
  const { profile, saveProfile } = useAppStore();
  const [members, setMembers] = useState<Member[]>(profile.members);
  const [preferences, setPreferences] = useState<Preference[]>(profile.preferences);
  /**
   * 正在编辑的成员草稿，`null` = 表单关着。
   *
   * 草稿属于**页面**而不是 Sheet：iOS 上 RN `Modal` 的 children 首次打开之后不再卸载
   * （`_shouldShowModal` 依赖 legacy 的 `modalDismissed` 事件），所以 Sheet 里的 `useState(初始值)`
   * 会一直拿着第一个人。打开时克隆一份、改草稿、提交时才写回列表，就不需要 effect 去同步，
   * 也不会踩 `react-hooks/set-state-in-effect`。
   */
  const [draft, setDraft] = useState<Member | null>(null);
  /** `null` = 新增；否则是被编辑成员的 id。 */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  // 摘要行按**草稿**算，用户改完不用保存就能看到份数怎么变。
  const draftProfile = { members, preferences, savedAt: profile.savedAt };

  const openAdd = () => {
    setEditingId(null);
    setDraft({ ...DEFAULT_MEMBER, id: createMemberId(), name: '' });
  };

  const openEdit = (member: Member) => {
    setEditingId(member.id);
    setDraft({ ...member, special: [...member.special] });
  };

  const closeSheet = () => {
    setDraft(null);
    setEditingId(null);
  };

  const submitDraft = () => {
    if (!draft || draft.name.trim().length === 0) return;
    const next = { ...draft, name: draft.name.trim() };
    setMembers((current) =>
      editingId === null
        ? [...current, next]
        : current.map((member) => (member.id === editingId ? next : member)),
    );
    setJustSaved(false);
    closeSheet();
  };

  const removeMember = (id: string) => {
    setMembers((current) => current.filter((member) => member.id !== id));
    setJustSaved(false);
  };

  const deleteDraft = () => {
    if (editingId !== null) removeMember(editingId);
    closeSheet();
  };

  const togglePreference = (preference: Preference) => {
    setPreferences((current) =>
      current.includes(preference)
        ? current.filter((item) => item !== preference)
        : [...current, preference],
    );
    setJustSaved(false);
  };

  const save = () => {
    // Saving also rebuilds today's menu from the new settings.
    saveProfile({ members, preferences });
    setJustSaved(true);
  };

  return (
    <Screen title="录入" subtitle="填好每位家人，菜单会按全家的口味和禁忌筛选">
      <View style={styles.section}>
        <SectionTitle>{`家庭成员 · ${members.length} 人`}</SectionTitle>
        <Card style={styles.listCard}>
          {members.map((member, index) => (
            <CardRow
              key={member.id}
              divider={index > 0}
              label={
                <View>
                  <ThemedText type="body">{member.name}</ThemedText>
                  <ThemedText type="caption" themeColor="textSecondary">
                    {memberSummaryLabel(member)}
                  </ThemedText>
                </View>
              }
              trailing={
                <View style={styles.rowActions}>
                  <PlainButton label="编辑" onPress={() => openEdit(member)} />
                  <PlainButton label="删除" tone="danger" onPress={() => removeMember(member.id)} />
                </View>
              }
            />
          ))}
          {members.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              还没有成员，先添加一位，菜单才知道该照顾谁。
            </ThemedText>
          ) : null}
        </Card>
        <SoftButton label="＋ 添加成员" onPress={openAdd} />
        <ThemedText type="caption" themeColor="textSecondary">
          家里人数自动等于成员数：
          {members.length === 0
            ? '现在是 0 人，食材按成人 1 份算。'
            : `${householdLabel(draftProfile)}，食材按 ${formatAmount(householdPortions(draftProfile), '人份')}换算。`}
        </ThemedText>
        <ThemedText type="caption" themeColor="textSecondary">
          食量档：成人 1 份、儿童（未满 13 岁）0.5 份、长辈（60 岁起）0.8 份。
        </ThemedText>
        {needsMigrationCheck(draftProfile) ? (
          <ThemedText type="caption" themeColor="tint">
            旧的单人设置已自动迁移成一位成员「我」，年龄还不知道，先按成人 1
            份算。补上年龄和状态，食材用量会跟着变准。
          </ThemedText>
        ) : null}
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
            这里是全家的口味：选「素食」会排除所有荤菜；没选「辣」时辣菜会被降权，但仍可能出现在菜单里。
          </ThemedText>
        </Card>
      </View>

      <PrimaryButton label="保存设置" onPress={save} />

      {justSaved ? (
        <Card>
          <ThemedText type="headline">已保存</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            今日菜单已经按新的成员和偏好重新生成，切到「今日」就能看到。
          </ThemedText>
        </Card>
      ) : null}

      <ThemedText type="caption" themeColor="textSecondary" style={styles.footnote}>
        家庭成员信息保存在本机；配置 AI 密钥后，生成菜单时这些信息（含体检异常那段文字）会发送给
        DeepSeek。
      </ThemedText>

      <MemberEditorSheet
        draft={draft}
        editing={editingId !== null}
        onChange={setDraft}
        onClose={closeSheet}
        onSubmit={submitDraft}
        onDelete={deleteDraft}
      />
    </Screen>
  );
}

/** 年龄输入：只留数字，留空就是「没填」（`age: 0`），不要在用户没给的时候编一个数。 */
function parseAge(text: string): number {
  const digits = text.replace(/[^0-9]/g, '');
  if (digits.length === 0) return 0;
  return Math.min(AGE_MAX, Number(digits));
}

function toggleSpecial(member: Member, tag: MemberTag): Member {
  const special = member.special.includes(tag)
    ? member.special.filter((item) => item !== tag)
    : [...member.special, tag];
  return { ...member, special };
}

/**
 * 成员表单。定义在模块顶层（`react-hooks/static-components` 不允许渲染期新建组件），内容全部由
 * `draft` 渲染 —— 只有 `draft === null` 时才什么都不画。
 */
function MemberEditorSheet({
  draft,
  editing,
  onChange,
  onClose,
  onSubmit,
  onDelete,
}: {
  draft: Member | null;
  editing: boolean;
  onChange: (next: Member) => void;
  onClose: () => void;
  onSubmit: () => void;
  onDelete: () => void;
}) {
  const canSubmit = draft !== null && draft.name.trim().length > 0;

  return (
    <Sheet visible={draft !== null} title={editing ? '编辑成员' : '添加成员'} onClose={onClose}>
      {draft ? (
        <>
          <TextField
            label="称呼"
            value={draft.name}
            onChangeText={(name) => onChange({ ...draft, name })}
            placeholder="例如：爸爸 / 妈妈 / 宝宝"
            autoFocus
            returnKeyType="next"
          />
          <TextField
            label="年龄"
            value={draft.age > 0 ? String(draft.age) : ''}
            onChangeText={(text) => onChange({ ...draft, age: parseAge(text) })}
            placeholder="不填也可以，先按成人 1 份算"
            keyboardType="number-pad"
          />
          <ThemedText type="caption" themeColor="textSecondary">
            食量：{portionLabel(draft)}。成人 1 份、儿童（未满 13 岁）0.5 份、长辈（60 岁起）0.8
            份；未满 6 岁的幼儿还会让重辣菜整道被排除。
          </ThemedText>

          <View style={styles.field}>
            <ThemedText type="caption" themeColor="textSecondary">
              体重方向 · 单选
            </ThemedText>
            <View style={styles.options}>
              {GOALS.map((goal) => (
                <OptionCard
                  key={goal}
                  title={GOAL_LABELS[goal]}
                  description={GOAL_DESCRIPTIONS[goal]}
                  selected={draft.goal === goal}
                  onPress={() => onChange({ ...draft, goal })}
                />
              ))}
            </View>
          </View>

          <View style={styles.field}>
            <ThemedText type="caption" themeColor="textSecondary">
              特殊状态 · 可多选
            </ThemedText>
            <TagRow>
              {SPECIAL_TAGS.map((tag) => (
                <Chip
                  key={tag}
                  label={SPECIAL_TAG_LABELS[tag]}
                  selected={draft.special.includes(tag)}
                  onPress={() => onChange(toggleSpecial(draft, tag))}
                />
              ))}
            </TagRow>
            {draft.special.length > 0 ? (
              <ThemedText type="caption" themeColor="textSecondary">
                {SPECIAL_TAGS.filter((tag) => draft.special.includes(tag))
                  .map((tag) => SPECIAL_TAG_HINTS[tag])
                  .join('；')}
              </ThemedText>
            ) : null}
          </View>

          <View style={styles.field}>
            <ThemedText type="caption" themeColor="textSecondary">
              代谢疾病 · 可多选
            </ThemedText>
            <TagRow>
              {METABOLIC_TAGS.map((tag) => (
                <Chip
                  key={tag}
                  label={METABOLIC_TAG_LABELS[tag]}
                  selected={draft.special.includes(tag)}
                  onPress={() => onChange(toggleSpecial(draft, tag))}
                />
              ))}
            </TagRow>
            {METABOLIC_TAGS.some((tag) => draft.special.includes(tag)) ? (
              <ThemedText type="caption" themeColor="textSecondary">
                {METABOLIC_TAGS.filter((tag) => draft.special.includes(tag))
                  .map((tag) => METABOLIC_TAG_HINTS[tag])
                  .join('；')}
              </ThemedText>
            ) : null}
            <ThemedText type="caption" themeColor="textSecondary">
              {DISEASE_DISCLAIMER}
            </ThemedText>
          </View>

          <TextField
            label="体检异常（可选）"
            value={draft.medical ?? ''}
            onChangeText={(medical) => onChange({ ...draft, medical })}
            placeholder="例如：尿酸偏高、轻度脂肪肝"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
          />
          <ThemedText type="caption" themeColor="textSecondary">
            这行文字只是原样交给 AI 当参考（比如「尿酸偏高但还没到痛风」这种还勾不了标签的情况）。
            要真正排除食材，请在上面勾「代谢疾病」—— 本机的禁忌校验只认那些标签，不认这段文字。
          </ThemedText>

          <PrimaryButton
            label={editing ? '保存成员' : '添加成员'}
            onPress={onSubmit}
            disabled={!canSubmit}
          />
          {editing ? (
            <PlainButton label="删除这位成员" tone="danger" onPress={onDelete} />
          ) : null}
        </>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.one,
  },
  listCard: {
    gap: 0,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  field: {
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
