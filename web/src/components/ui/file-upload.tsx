'use client';
import { File as FileIcon, FolderSimple, UploadSimple, X } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'motion/react';
import { useId, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { EASE, INSTANT, SPRING_CONTENT } from '@/lib/motion';
import { useReducedMotionPref } from '@/lib/use-reduced-motion';
import { useFieldControl } from '@/components/ui/field';

/* ==========================================================================
   FileUpload —— 拖放区 + 文件列表（搬自 MioUI components/ui/file-upload.tsx）。
   原生 <input type=file> 覆盖整个拖放区，承担键盘（Tab / Enter / Space）与读屏；
   拖入高亮用 --cds-shadow-drop-glow（spec §3.5）。
   MioGit 增补（新属性全部可选，默认 = 原行为）：
   - 受控收集模式：items + onAdd / onRemove（不逐个上传，由父组件一次提交）；
   - 拖入文件夹：webkitGetAsEntry 递归读出相对路径（FileWithPath.path）；
   - 每行 trailing 插槽（显示目标路径、覆盖提示等），列表进出用 320/28 弹簧，减弱动效时瞬时。
   ========================================================================== */
export interface PickedFile {
  id: string;
  file: File;
  /** path relative to the drop (folder drops keep their structure), else the file name */
  path: string;
  error?: string;
  /** extra line under the name (e.g. "replaces an existing file") */
  note?: ReactNode;
}

export interface FileUploadProps {
  items: PickedFile[];
  onAdd: (files: { file: File; path: string }[]) => void;
  onRemove: (id: string) => void;
  multiple?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  className?: string;
  labels?: { drop?: ReactNode; hint?: ReactNode; remove?: string; list?: string };
  /** cards（默认，独立使用）：每行一张发丝边卡片；rows：放在已有边框的容器里时，行之间只有单向细线（单闭合边框） */
  listVariant?: 'cards' | 'rows';
  'aria-describedby'?: string;
}

const fmt = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);

/** read every file under a dropped directory entry (Chrome / Safari / Firefox all expose webkitGetAsEntry) */
async function readEntry(entry: FileSystemEntry, prefix: string, out: { file: File; path: string }[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
    out.push({ file, path: prefix + file.name });
    return;
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    // readEntries returns batches (100 in Chrome) until an empty one
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
      if (!batch.length) break;
      for (const e of batch) await readEntry(e, `${prefix}${entry.name}/`, out);
    }
  }
}

export function FileUpload({ items, onAdd, onRemove, multiple = true, labels = {}, listVariant = 'cards', className, ...rest }: FileUploadProps) {
  const ctl = useFieldControl(rest);
  const dropId = useId();
  const reduce = useReducedMotionPref();
  const L = { drop: 'Drag files here or click to browse', hint: undefined as ReactNode, remove: 'Remove', list: 'Selected files', ...labels };
  const [drag, setDrag] = useState(false);
  const depth = useRef(0);

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    depth.current = 0;
    setDrag(false);
    if (ctl.disabled) return;
    const dt = e.dataTransfer;
    const entries = Array.from(dt.items ?? [])
      .map((it) => (it.kind === 'file' && typeof it.webkitGetAsEntry === 'function' ? it.webkitGetAsEntry() : null))
      .filter((x): x is FileSystemEntry => !!x);
    if (entries.length && entries.some((x) => x.isDirectory)) {
      const out: { file: File; path: string }[] = [];
      for (const en of entries) await readEntry(en, '', out).catch(() => {});
      if (out.length) onAdd(multiple ? out : out.slice(0, 1));
      return;
    }
    const files = Array.from(dt.files);
    if (files.length) onAdd((multiple ? files : files.slice(0, 1)).map((file) => ({ file, path: file.name })));
  };

  return (
    <div data-cds="FileUpload" className={cn('flex w-full min-w-0 flex-col gap-3', className)}>
      <div
        onDragEnter={(e) => {
          e.preventDefault();
          depth.current++;
          if (!ctl.disabled) setDrag(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => {
          depth.current = Math.max(0, depth.current - 1);
          if (!depth.current) setDrag(false);
        }}
        onDrop={(e) => void onDrop(e)}
        data-dragging={drag || undefined}
        className={cn(
          'relative flex min-h-36 flex-col items-center justify-center gap-1.5 rounded-xl bg-surface-2 p-6 text-center shadow-field',
          'transition-[background-color,box-shadow] duration-(--cds-dur-base) ease-swift',
          'has-[input:focus-visible]:shadow-focus hover:shadow-field-strong',
          drag && 'bg-accent-soft shadow-[var(--cds-shadow-drop-glow)] hover:shadow-[var(--cds-shadow-drop-glow)]',
          ctl.invalid && 'shadow-[inset_0_0_0_1px_var(--cds-fill-danger)]',
          ctl.disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <UploadSimple aria-hidden className={cn('size-6 text-text-secondary transition-transform duration-(--cds-dur-base) ease-swift', drag && '-translate-y-0.5 text-accent-text')} />
        <span id={dropId} className="text-[14px] font-medium text-pretty text-text-primary">
          {L.drop}
        </span>
        {L.hint && <span className="text-[13px] text-pretty text-text-secondary">{L.hint}</span>}
        <input
          id={ctl.id}
          type="file"
          multiple={multiple}
          disabled={ctl.disabled}
          aria-labelledby={ctl.labelledBy ? `${ctl.labelledBy} ${dropId}` : dropId}
          aria-invalid={ctl.invalid || undefined}
          aria-describedby={ctl.describedBy}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) onAdd(files.map((file) => ({ file, path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name })));
            e.target.value = '';
          }}
          className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
      </div>
      {items.length > 0 && (
        <ul className={cn('flex flex-col', listVariant === 'cards' ? 'gap-2' : 'px-1')} aria-label={L.list}>
          <AnimatePresence initial={false}>
            {items.map((it) => {
              const inFolder = it.path.includes('/');
              return (
                <motion.li
                  key={it.id}
                  layout={reduce ? false : 'position'}
                  initial={reduce ? false : { opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? { opacity: 0, transition: INSTANT } : { opacity: 0, scale: 0.98, transition: { duration: 0.15, ease: EASE.out } }}
                  transition={reduce ? INSTANT : SPRING_CONTENT}
                  className={cn(
                    'flex min-w-0 items-center gap-3',
                    listVariant === 'cards' ? 'rounded-xl bg-surface-2 px-3 py-2.5 shadow-field' : 'py-2 shadow-[inset_0_var(--cds-ring-hairline)_0_var(--cds-border)] first:shadow-none',
                  )}
                >
                  {inFolder ? <FolderSimple aria-hidden className="size-5 shrink-0 text-text-secondary" /> : <FileIcon aria-hidden className="size-5 shrink-0 text-text-secondary" />}
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex min-w-0 items-baseline justify-between gap-2 text-[13px]">
                      <span className="min-w-0 truncate font-mono text-[12.5px] text-text-primary" title={it.path}>
                        {it.path}
                      </span>
                      <span className={cn('shrink-0 tabular-nums', it.error ? 'text-danger' : 'text-text-secondary')}>{it.error ?? fmt(it.file.size)}</span>
                    </div>
                    {it.note && <span className="text-[12px] text-text-secondary">{it.note}</span>}
                  </div>
                  <button
                    type="button"
                    aria-label={`${L.remove} ${it.path}`}
                    onClick={() => onRemove(it.id)}
                    className="cds-focus cds-hit relative inline-flex size-8 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors duration-(--cds-dur-snap) hover:bg-ghost-hover hover:text-text-primary"
                  >
                    <X aria-hidden className="size-4" />
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
