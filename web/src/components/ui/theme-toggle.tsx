'use client';
import { Desktop, Globe, Moon, Sun } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { DropdownMenu, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Segmented } from '@/components/ui/segmented';

/* ==========================================================================
   ThemeToggle / LanguageSwitcher —— 纯受控展示组件，不直接改站点主题 / 语言：
   宿主在 onValueChange 里自己写 localStorage / html[data-theme] / 路由。
   ThemeToggle
   - variant="segmented"（默认）：浅色 / 深色 / 跟随系统三态分段，复用 Segmented（role=radiogroup，←→ 切换），
     图标 + 文字，窄屏可只显示图标（iconOnly），读屏仍有名称；
   - variant="icon"：单个图标按钮，点击按 浅→深→跟随系统 循环；aria-label 含当前值与下一个值
     （“主题：浅色，点击切换到深色”），图标换成当前主题的图标；
   LanguageSwitcher
   - 下拉：触发按钮 aria-label = `${label}：${当前语言}`（例如 “语言：简体中文”），菜单项是 menuitemcheckbox，当前项打勾；
     复用 DropdownMenu（↑↓ / Home / End / Esc / 焦点归还）；
   - 语言名称用各自语言写（简体中文 / English），不翻译，lang 属性写在菜单项上，读屏用对应语音念。
   ========================================================================== */

export type ThemeValue = 'light' | 'dark' | 'system';

export interface ThemeToggleProps {
  value: ThemeValue;
  onValueChange: (v: ThemeValue) => void;
  variant?: 'segmented' | 'icon';
  /** 三态文案，默认英文 */
  labels?: Record<ThemeValue, string>;
  /** 读屏名称前缀，如“主题” */
  label?: string;
  /** icon 变体的 aria-label 生成：(当前, 下一个) => string */
  iconLabel?: (current: string, next: string) => string;
  iconOnly?: boolean;
  className?: string;
}

const ORDER: ThemeValue[] = ['light', 'dark', 'system'];
const ICON: Record<ThemeValue, ReactNode> = { light: <Sun />, dark: <Moon />, system: <Desktop /> };
const DEFAULT_LABELS: Record<ThemeValue, string> = { light: 'Light', dark: 'Dark', system: 'System' };

export function ThemeToggle({
  value,
  onValueChange,
  variant = 'segmented',
  labels = DEFAULT_LABELS,
  label = 'Theme',
  iconLabel = (c, n) => `${label}: ${c}, switch to ${n}`,
  iconOnly = false,
  className,
}: ThemeToggleProps) {
  if (variant === 'icon') {
    const next = ORDER[(ORDER.indexOf(value) + 1) % ORDER.length];
    return (
      <button
        type="button"
        data-cds="ThemeToggle"
        data-variant="icon"
        aria-label={iconLabel(labels[value], labels[next])}
        onClick={() => onValueChange(next)}
        className={cn(
          'cds-focus cds-hit relative inline-flex size-8 items-center justify-center rounded-lg text-text-secondary transition-[background-color,color] duration-(--cds-dur-snap) hover:bg-ghost-hover hover:text-text-primary active:bg-ghost-selected pointer-coarse:size-11 [&_svg]:size-[18px]',
          className,
        )}
      >
        {ICON[value]}
      </button>
    );
  }
  return (
    <div data-cds="ThemeToggle" data-variant="segmented" className={className}>
      <Segmented<ThemeValue>
        ariaLabel={label}
        value={value}
        onChange={onValueChange}
        options={ORDER.map((v) => ({
          value: v,
          icon: ICON[v],
          label: iconOnly ? <span className="sr-only">{labels[v]}</span> : labels[v],
        }))}
      />
    </div>
  );
}

export interface LanguageOption {
  value: string;
  /** 用该语言自己的文字写，如 “简体中文” */
  label: string;
}

export interface LanguageSwitcherProps {
  value: string;
  onValueChange: (v: string) => void;
  options: LanguageOption[];
  /** 读屏前缀，如“语言” */
  label?: string;
  align?: 'start' | 'end';
  className?: string;
}

export function LanguageSwitcher({ value, onValueChange, options, label = 'Language', align = 'end', className }: LanguageSwitcherProps) {
  const current = options.find((o) => o.value === value) ?? options[0];
  return (
    <DropdownMenu
      align={align}
      className="w-44"
      aria-label={label}
      trigger={
        <button
          type="button"
          data-cds="LanguageSwitcher"
          aria-label={`${label}: ${current.label}`}
          className={cn(
            'cds-focus cds-hit relative inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13.5px] text-text-secondary transition-[background-color,color] duration-(--cds-dur-snap) hover:bg-ghost-hover hover:text-text-primary aria-expanded:bg-ghost-selected pointer-coarse:h-11 [&_svg]:size-4',
            className,
          )}
        >
          <Globe aria-hidden />
          <span aria-hidden>{current.label}</span>
        </button>
      }
    >
      {options.map((o) => (
        <DropdownMenuItem key={o.value} lang={o.value} checked={o.value === value} onSelect={() => onValueChange(o.value)}>
          {o.label}
        </DropdownMenuItem>
      ))}
    </DropdownMenu>
  );
}
