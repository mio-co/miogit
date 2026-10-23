import { cn } from '@/lib/cn';

export const SWATCH = ['bg-accent-brand', 'bg-success', 'bg-warning', 'bg-danger'];
export const FILL = ['fill-accent-brand', 'fill-success', 'fill-warning', 'fill-danger'];

/** 图例：色块 + 文字，供各图表复用 */
export function Legend({ items, className }: { items: string[]; className?: string }) {
  return (
    <ul className={cn('mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-secondary', className)}>
      {items.map((name, k) => (
        <li key={name} className="flex items-center gap-2">
          <span aria-hidden className={cn('size-2.5 rounded-sm', SWATCH[k % 4])} />
          {name}
        </li>
      ))}
    </ul>
  );
}

/** 数据表回退（屏幕阅读器） */
export function DataFallback({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>))}</tr>)}</tbody>
    </table>
  );
}
