// Console storage card: four equal metrics (DO / R2 / writes today / reads today),
// each a MioUI ProgressRing, with the "?" details in a MioUI Popover.
import { Question } from '@phosphor-icons/react';
import { Card } from '@/components/ui/card';
import { IconButton } from '@/components/ui/button';
import { Popover } from '@/components/ui/popover';
import { ProgressRing } from '@/components/ui/progress-ring';
import type { Storage } from '@/app/types';
import { useI18n } from '@/app/i18n';
import { fmtBytes, fmtRows, pctText, repoPath } from '@/app/format';
import { AppLink } from '@/app/link';
import { cn } from '@/lib/cn';

function Metric({ label, used, cap, sub, full }: { label: string; used: number; cap: number; sub: string; full: string }) {
  const pct = Math.min(100, (used / cap) * 100);
  const arc = used > 0 ? Math.max(pct, 1.5) : 0;
  const tone = used >= cap ? 'text-danger' : pct >= 80 ? 'text-warning' : 'text-text-primary';
  return (
    <li className="flex min-w-0 flex-col gap-1 px-4 py-3.5 sm:px-5" title={full} data-ring>
      <span className="truncate text-footnote text-text-secondary">{label}</span>
      <span className="flex items-center justify-between gap-2">
        <span className={cn('text-title font-medium tabular-nums', tone)}>{pctText(pct)}</span>
        <ProgressRing rings={[{ name: label, value: Math.round(arc * 10) / 10 }]} label={full} size={36} strokeWidth={4} />
      </span>
      <span className="truncate font-mono text-[11.5px] text-text-secondary tabular-nums">{sub}</span>
    </li>
  );
}

export function StorageCard({ s }: { s: Storage }) {
  const { t } = useI18n();
  const L = s.limits;
  return (
    <Card aria-label="storage" className="overflow-hidden p-0">
      <div className="flex items-center gap-2 px-4 pt-3.5 sm:px-5">
        <h2 className="text-heading font-semibold">{t('Storage', '存储')}</h2>
        <Popover
          align="start"
          aria-label={t('Details', '详情')}
          className="w-[min(22rem,calc(100vw-2rem))]"
          trigger={
            <IconButton size="xs" variant="ghost" aria-label={t('Details', '详情')}>
              <Question />
            </IconButton>
          }
        >
          <div className="flex flex-col gap-3 p-1 text-footnote">
            <section>
              <b className="text-text-primary">{t('Usage', '用量')}</b>
              <ul className="mt-1 flex flex-col gap-0.5 text-text-secondary">
                <Fact k={t('Total', '合计')} v={fmtBytes(s.total)} />
                <Fact k="Durable Objects" v={`${fmtBytes(s.db)} / 5 GB`} />
                <Fact k="R2" v={`${fmtBytes(s.r2)} / 10 GB`} />
                {s.usage && <Fact k={t('Rows written today', '今日写入行数')} v={`${fmtRows(s.usage.written)} / 10 万`} />}
                {s.usage && <Fact k={t('Rows read today', '今日读取行数')} v={`${fmtRows(s.usage.read)} / 500 万`} />}
                <Fact k={t('Repositories', '仓库')} v={`${s.repos}（${t('private', '私有')} ${s.private}）`} />
              </ul>
            </section>
            {s.top.length > 0 && (
              <section>
                <b className="text-text-primary">{t('Largest repositories', '占用最多')}</b>
                <ul className="mt-1 flex flex-col gap-0.5 text-text-secondary">
                  {s.top.map((r) => (
                    <li key={r.name} className="flex justify-between gap-3">
                      <AppLink href={`/~mio/r/${repoPath(r.name)}/`} className="truncate text-accent-text hover:underline">
                        {r.name}
                      </AppLink>
                      <span className="tabular-nums">{fmtBytes(r.bytes)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section>
              <b className="text-text-primary">{t('Free plan limits', '免费版额度')}</b>
              <ul className="mt-1 list-disc ps-4 text-text-secondary">
                <li>{t('Durable Objects: 5M rows read and 100K rows written per day.', 'Durable Objects 每天最多读 500 万行、写 10 万行。')}</li>
                <li>{t('Resets daily at 00:00 UTC (08:00 Beijing).', '每天 UTC 0 点（北京时间 8 点）重置。')}</li>
                <li>{t('Over the limit, pushes, pulls, clones and pages all fail until the reset. No data is lost.', '超额后推送、拉取、clone 和页面都会报错，直到重置，数据不会丢。')}</li>
                <li>{t('Writes count per git object, so first imports of large histories may need several days.', '写入按 git 对象计，大仓库首次导入完整历史可能要分几天推。')}</li>
                <li>{t('Each push is capped at 100 MB; push big repos branch by branch.', '单次推送上限 100 MB，大仓库按分支分批推。')}</li>
                <li>{t('Storage: 5 GB in Durable Objects, 10 GB in R2.', '存储：Durable Objects 5 GB，R2 10 GB。')}</li>
              </ul>
            </section>
          </div>
        </Popover>
        <span className="ms-auto text-footnote text-text-secondary">
          {t('Total used', '已用合计')} <b className="font-semibold text-text-primary tabular-nums">{fmtBytes(s.total)}</b>
        </span>
      </div>
      <ul className="grid grid-cols-2 lg:grid-cols-4 [&>li:nth-child(n+3)]:max-lg:shadow-[inset_0_var(--cds-ring-hairline)_0_var(--cds-border)]">
        <Metric label={t('DO storage', 'DO 存储')} used={s.db} cap={L.doBytes} sub={`${fmtBytes(s.db)} / 5 GB`} full={`Durable Objects ${fmtBytes(s.db)} / 5 GB`} />
        <Metric label={t('R2 storage', 'R2 存储')} used={s.r2} cap={L.r2Bytes} sub={`${fmtBytes(s.r2)} / 10 GB`} full={`R2 ${fmtBytes(s.r2)} / 10 GB`} />
        <Metric
          label={t('Writes today', '今日写入')}
          used={s.usage?.written ?? 0}
          cap={L.rowsWritten}
          sub={s.usage ? `${fmtRows(s.usage.written)} / 10 万` : '— / 10 万'}
          full={`DO rows written today ${s.usage?.written ?? '—'} / 100000`}
        />
        <Metric
          label={t('Reads today', '今日读取')}
          used={s.usage?.read ?? 0}
          cap={L.rowsRead}
          sub={s.usage ? `${fmtRows(s.usage.read)} / 500 万` : '— / 500 万'}
          full={`DO rows read today ${s.usage?.read ?? '—'} / 5000000`}
        />
      </ul>
    </Card>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <li className="flex justify-between gap-3">
      <span>{k}</span>
      <span className="text-text-primary tabular-nums">{v}</span>
    </li>
  );
}
