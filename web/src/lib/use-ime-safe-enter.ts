'use client';
import { useLayoutEffect, useRef, type CompositionEvent, type KeyboardEvent } from 'react';

/*
 * CJK 输入法两层守卫（spec §6.1 / spec/02 §B12 参考实现）。
 * 第一层：isComposing || keyCode === 229；
 * 第二层：WebKit 在 compositionend 之后会补发一个 isComposing=false 的 Enter，
 *        只对合成结束后紧接着的第一个纯 Enter 在 500ms 内忽略，其它任何键立即解除窗口；
 *        ⌘/Ctrl+Enter 视为明确发送；被拦截的 Enter 再挂 capture 阶段 beforeinput 陷阱，
 *        拦掉 insertParagraph / insertLineBreak。合成期间绝不 preventDefault。
 * 合成中按 Escape 只关候选框，并阻止冒泡关掉外层弹窗。
 */
const SENTINEL = -Infinity;
const isWebKit = () => typeof window !== 'undefined' && /Apple Computer/.test(window.navigator.vendor);

export interface ImeSafeEnterOptions {
  /** 允许 Shift+Enter 换行（默认 true）；false 时 Shift+Enter 也不提交，交给元素默认行为 */
  multiline?: boolean;
}

export function useImeSafeEnter<T extends HTMLElement = HTMLElement>(onSubmit: (e: KeyboardEvent<T>) => void) {
  const composing = useRef(false);
  const lastEnd = useRef<number>(SENTINEL);
  const blocked = useRef(new WeakSet<Event>());
  const submit = useRef(onSubmit);
  // 渲染期不写 ref（react-hooks/refs）：提交后同步更新，keydown 总拿到最新回调
  useLayoutEffect(() => {
    submit.current = onSubmit;
  });

  const armTrap = (orig: Event, target: EventTarget) => {
    const types = ['beforeinput', 'keydown', 'keyup', 'compositionstart', 'focusout'] as const;
    const h = (ev: Event) => {
      if (ev === orig) return;
      types.forEach((t) => target.removeEventListener(t, h, { capture: true }));
      if (ev.type === 'beforeinput' && ['insertParagraph', 'insertLineBreak'].includes((ev as InputEvent).inputType))
        ev.preventDefault();
    };
    types.forEach((t) => target.addEventListener(t, h, { capture: true }));
  };

  /** true = 这是 IME 的确认 Enter，必须忽略 */
  const isImeEnter = (e: KeyboardEvent<T>) => {
    const ne = e.nativeEvent;
    if (composing.current || ne.isComposing || e.keyCode === 229) {
      lastEnd.current = SENTINEL;
      return true;
    }
    if (blocked.current.has(ne)) return true;
    if (isWebKit() && Math.abs(ne.timeStamp - lastEnd.current) < 500) {
      lastEnd.current = SENTINEL;
      if (e.metaKey || e.ctrlKey) return false;
      blocked.current.add(ne);
      return true;
    }
    return false;
  };

  return {
    onCompositionStart: () => {
      composing.current = true;
    },
    onCompositionEnd: (e: CompositionEvent<T>) => {
      composing.current = false;
      lastEnd.current = e.nativeEvent.timeStamp;
    },
    onKeyDown: (e: KeyboardEvent<T>) => {
      if (e.key === 'Escape' && (composing.current || e.nativeEvent.isComposing)) {
        e.stopPropagation();
        return;
      }
      if (e.key !== 'Enter') {
        lastEnd.current = SENTINEL;
        return;
      }
      const plain = !e.shiftKey && !e.altKey && e.keyCode !== 229 && !e.nativeEvent.isComposing;
      if (!plain) {
        if (!(composing.current || e.nativeEvent.isComposing || e.keyCode === 229)) lastEnd.current = SENTINEL;
        return;
      }
      if (isImeEnter(e)) {
        e.preventDefault();
        armTrap(e.nativeEvent, e.currentTarget);
        return;
      }
      e.preventDefault();
      submit.current(e);
    },
  };
}

/** 是否处于输入法合成中（用于 ↑↓ 等非 Enter 键的轻量判断） */
export function isComposingEvent(e: { nativeEvent: { isComposing: boolean }; keyCode: number }) {
  return e.nativeEvent.isComposing || e.keyCode === 229;
}
