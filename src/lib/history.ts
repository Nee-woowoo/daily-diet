/**
 * 「最近几天做过哪些菜」。
 *
 * 纯模块。历史只有一个用途：在生成时把它写给模型，要求今天别再排这些菜。它**不**参与硬校验 ——
 * 模型可能因为禁忌与食库被迫复用某道菜，硬拒绝会陷入重试循环；机械可判的那一半（同一天里出现同名）
 * 是 `ai.ts` 的 `repeat` 失败，不是这里的事。
 *
 * 时间一律按 `YYYY-MM-DD` 字符串处理：字符串的字典序就是日历序，不必用 `Date` —— 一个时区参数写错
 * 就会让「3 天前」算成 2 天或 4 天，而字符串比较没有这个失败模式。
 */

/** 留几天。数字来自需求「最近 3 天」，不是调出来的。 */
export const HISTORY_DAYS = 3;

/** 单个菜名的长度上限。菜名是模型产出、存本地、又发回去的文本，截断比信任便宜。 */
const NAME_MAX_LENGTH = 30;

export interface DishHistoryEntry {
  /** `YYYY-MM-DD`。 */
  date: string;
  /** 那天生成过（并上了桌）的菜名。**同一天替换，不追加。** */
  names: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `YYYY-MM-DD` 的字面形状（只查形状，不做日历校验 —— 用来挡坏数据，不是用来算日期）。 */
function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * 名字里能进 prompt 的字符：换行 / 制表 / 控制字符压成空格、反引号删掉。与 `members.readMedical`
 * 同一套理由 —— 这段文本会原样插进 prompt，多一行就可能被读成新的一条指令。
 */
function cleanName(value: string): string {
  return value
    .replace(/\p{Cc}/gu, ' ')
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX_LENGTH);
}

/**
 * 读回存储里的历史。与 `storage.readAiRecipes` 同一个立场：把它当不可信数据，坏项丢弃。
 */
export function readHistory(value: unknown): DishHistoryEntry[] {
  if (!isRecord(value) || !Array.isArray(value.entries)) return [];
  const entries: DishHistoryEntry[] = [];
  for (const raw of value.entries) {
    if (!isRecord(raw)) continue;
    if (typeof raw.date !== 'string' || !isDateKey(raw.date)) continue;
    if (!Array.isArray(raw.names)) continue;
    const names = raw.names
      .filter((name): name is string => typeof name === 'string')
      .map(cleanName)
      .filter((name) => name.length > 0);
    entries.push({ date: raw.date, names });
  }
  return normalize(entries);
}

/** 未来的日期是坏数据（改过系统时间之类）。丢掉，免得一直占着「最近 3 天」的名额。 */
function dropFuture(entries: DishHistoryEntry[], today?: string): DishHistoryEntry[] {
  if (today === undefined) return entries;
  return entries.filter((entry) => entry.date <= today);
}

/** 同一天只留一条（后写的覆盖先写的），并按日期升序。 */
function normalize(entries: DishHistoryEntry[]): DishHistoryEntry[] {
  const byDate = new Map<string, string[]>();
  for (const entry of entries) byDate.set(entry.date, entry.names);
  return [...byDate.entries()]
    .map(([date, names]) => ({ date, names }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** 只留最近 `HISTORY_DAYS` 天（含今天）。丢掉今天之后的坏数据。 */
export function pruneHistory(entries: DishHistoryEntry[], today: string): DishHistoryEntry[] {
  return dropFuture(normalize(entries), today).slice(-HISTORY_DAYS);
}

/**
 * 记下今天这份菜单的菜名。**同一天替换，不追加** —— 同一天反复重新生成不该堆成一长串，而且替换
 * 之后的这一个正是「今天刚排过的那批」，于是「重新生成」也会避开它们，不必另写一条分支。
 */
export function recordDishes(
  entries: DishHistoryEntry[],
  date: string,
  names: string[],
): DishHistoryEntry[] {
  const cleaned = names.map(cleanName).filter((name) => name.length > 0);
  const others = entries.filter((entry) => entry.date !== date);
  return pruneHistory([...others, { date, names: cleaned }], date);
}

/**
 * 发给模型的那一行；没有可用的历史时返回空串（调用方据此不插入这一段）。
 *
 * 名字去重（同一道菜在 3 天里做过两次只报一次），顺序按天、天内的顺序不变。
 */
export function historyLine(entries: DishHistoryEntry[]): string {
  const names: string[] = [];
  for (const entry of normalize(entries).slice(-HISTORY_DAYS)) {
    for (const name of entry.names) {
      const cleaned = cleanName(name);
      if (cleaned.length > 0 && !names.includes(cleaned)) names.push(cleaned);
    }
  }
  if (names.length === 0) return '';
  return `最近 ${HISTORY_DAYS} 天已做过：${names.join('、')}（共 ${names.length} 道）`;
}
