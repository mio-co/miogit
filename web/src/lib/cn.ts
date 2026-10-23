import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/*
 * tailwind-merge 不认识 @theme 里自定义的阴影 / 圆角 / 字号名，会把 shadow-field 当成阴影颜色，
 * 导致 shadow-field 与 shadow-[…] 同时保留、谁生效全看 CSS 顺序。这里把自定义名告诉它。
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      shadow: [
        'hairline', 'field', 'field-strong', 'panel', 'panel-hover', 'popover', 'popover-diffuse', 'focus', 'focus-danger',
        'composer', 'composer-hover', 'composer-focus', 'segmented-thumb', 'cds-sm', 'cds-md', 'cds-lg',
      ],
      radius: ['panel', 'card', 'dialog', 'code', 'composer'],
      text: ['caption', 'footnote', 'body', 'heading', 'title', 'display'],
    },
  },
});

/** 合并类名：clsx 处理条件，tailwind-merge 解决冲突（后者覆盖前者） */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
