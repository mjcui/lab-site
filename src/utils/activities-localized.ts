import type { CollectionEntry } from 'astro:content';
import { pickI18nText } from './i18n-text';

export type ActivityEntry = CollectionEntry<'activities'>;

export type LocalizedActivity = {
  slug: string;
  date: string;
  title: { zh: string; en: string };
  category?: { zh?: string; en?: string };
  participants?: { zh?: string[]; en?: string[] };
  cover?: string;
  summary?: { zh?: string; en?: string };
  entry: ActivityEntry;
};

/**
 * 整理活动集合，按日期倒序（新的在前）。
 * 活动采用「单文件双语」结构，中英文同处一份 frontmatter，
 * 故无需像 news 那样做多文件配对。
 */
export function buildLocalizedActivities(
  entries: ActivityEntry[]
): LocalizedActivity[] {
  return entries
    .map((entry) => ({
      // type: 'content' 的 entry.id 含 .md 后缀，entry.slug 才是干净的路由参数
      slug: entry.slug,
      date: entry.data.date,
      title: {
        zh: pickI18nText(entry.data.title, 'zh'),
        en: pickI18nText(entry.data.title, 'en'),
      },
      category: entry.data.category,
      participants: entry.data.participants,
      cover: entry.data.cover,
      summary: entry.data.summary,
      entry,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * 参与人员名单合并为一行文本（中文用「、」分隔）。
 */
export function formatParticipants(
  participants: LocalizedActivity['participants'],
  lang: 'zh' | 'en'
): string {
  const list = participants?.[lang] ?? [];
  return list.join(lang === 'zh' ? '、' : ', ');
}
