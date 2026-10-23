import type { Lang } from './i18n';

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

/** relative age, like the old pages (min. / hours / days / weeks / months / years) */
export function age(unixSecs: number, lang: Lang): string {
  if (!unixSecs) return '';
  const s = Math.max(0, Math.floor(Date.now() / 1000) - unixSecs);
  const pick = (n: number, en: string, zh: string) => (lang === 'zh' ? `${n} ${zh}前` : `${n} ${en}${n === 1 || en.endsWith('.') ? '' : 's'} ago`);
  if (s < 3600) return pick(Math.max(1, Math.floor(s / 60)), 'min.', '分钟');
  if (s < 86400) return pick(Math.floor(s / 3600), 'hour', '小时');
  if (s < 7 * 86400) return pick(Math.floor(s / 86400), 'day', '天');
  if (s < 31 * 86400) return pick(Math.floor(s / (7 * 86400)), 'week', '周');
  if (s < 365 * 86400) return pick(Math.floor(s / (30 * 86400)), 'month', '个月');
  return pick(Math.floor(s / (365 * 86400)), 'year', '年');
}

export const isoUtc = (unixSecs: number) => new Date(unixSecs * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
export const day = (unixSecs: number) => new Date(unixSecs * 1000).toISOString().slice(0, 10);
export const fmtTime = (ms: number) => (ms ? new Date(ms).toISOString().slice(0, 16).replace('T', ' ') : '—');

export function fmtRows(n: number): string {
  return n >= 10_000 ? `${(n / 10_000).toFixed(n >= 1_000_000 ? 0 : 1)} 万` : String(n);
}
export function pctText(p: number): string {
  if (p <= 0) return '0%';
  if (p < 1) return `${p < 0.1 ? '<0.1' : p.toFixed(1)}%`;
  return `${Math.round(p)}%`;
}

/** URL path for a repository name (namespaced names keep their slash) */
export const repoPath = (repo: string) => repo.split('/').map(encodeURIComponent).join('/');
export const encPath = (segs: string[]) => segs.map(encodeURIComponent).join('/');

/** GitHub language colours for the index (subset; matches src/ui/langs.ts names) */
