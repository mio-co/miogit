'use client';
/**
 * 浮层基础设施（Dialog / Sheet / DropdownMenu / Tooltip 共用）：
 * Portal、分层 Esc 栈、轻量焦点陷阱、滚动锁。不依赖 Radix。
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

export const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** 挂载后才渲染到 document.body，避免 SSR 不一致 */
export function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? createPortal(children, document.body) : null;
}

/* ---------- 分层 Esc 栈：只有最上层浮层响应 Esc ---------- */
type Layer = { id: number; onEscape: () => void };
const layers: Layer[] = [];
let layerSeq = 0;
let listening = false;
function onDocKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.isComposing || e.keyCode === 229) return;
  const top = layers[layers.length - 1];
  if (!top) return;
  e.preventDefault();
  e.stopPropagation();
  top.onEscape();
}

/** 浮层打开期间注册到 Esc 栈；返回是否为最上层的判断函数 */
export function useLayer(active: boolean, onEscape: () => void) {
  const cb = useRef(onEscape);
  cb.current = onEscape;
  const idRef = useRef(0);
  useEffect(() => {
    if (!active) return;
    const id = ++layerSeq;
    idRef.current = id;
    layers.push({ id, onEscape: () => cb.current() });
    if (!listening) {
      document.addEventListener('keydown', onDocKey, true);
      listening = true;
    }
    return () => {
      const i = layers.findIndex((l) => l.id === id);
      if (i >= 0) layers.splice(i, 1);
      if (!layers.length && listening) {
        document.removeEventListener('keydown', onDocKey, true);
        listening = false;
      }
    };
  }, [active]);
  return () => layers[layers.length - 1]?.id === idRef.current;
}

/* ---------- 滚动锁（引用计数） ---------- */
let lockCount = 0;
let prevOverflow = '';
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const html = document.documentElement;
    if (lockCount++ === 0) {
      prevOverflow = html.style.overflow;
      html.style.overflow = 'hidden';
    }
    return () => {
      if (--lockCount === 0) html.style.overflow = prevOverflow;
    };
  }, [active]);
}

/* ---------- 焦点陷阱（轻量）：打开时聚焦首个元素、Tab 循环、关闭时还原焦点 ---------- */
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';

/** 可聚焦元素；initial=true 时跳过 [data-focus-skip]（如右上角 ×，不作为初始焦点但仍可 Tab 到） */
export function getFocusable(root: HTMLElement, initial = false) {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => (!initial || !el.hasAttribute('data-focus-skip')) && el.getClientRects().length > 0,
  );
}

export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  opts: { initialFocus?: RefObject<HTMLElement | null>; isTop?: () => boolean } = {},
) {
  // opts 常为内联对象 / 函数：读最新值，只在 active 变化时重新聚焦
  const optsRef = useRef(opts);
  optsRef.current = opts;
  useEffect(() => {
    if (!active) return;
    const { initialFocus, isTop } = optsRef.current;
    const prev = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() => {
      const root = ref.current;
      if (!root) return;
      const target =
        initialFocus?.current ??
        root.querySelector<HTMLElement>('[data-autofocus]') ??
        getFocusable(root, true)[0] ??
        root;
      target.focus({ preventScroll: true });
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const root = ref.current;
      if (!root || (isTop && !isTop())) return;
      if (!root.contains(document.activeElement)) return;
      const items = getFocusable(root);
      if (!items.length) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      if (prev && document.contains(prev)) prev.focus({ preventScroll: true });
    };
  }, [active, ref]);
}
