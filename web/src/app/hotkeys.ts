// Single-key page shortcuts (GitHub style: t, /, ., y). Never fire while the user
// is typing (input, textarea, select, contenteditable), while an IME is composing,
// with a modifier held, or while a modal dialog is open.
import { useEffect, useRef } from 'react';

export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return true;
  return !!el.closest('[contenteditable=""],[contenteditable="true"]');
}

export function hotkeyAllowed(e: KeyboardEvent): boolean {
  if (e.defaultPrevented || e.repeat) return false;
  if (e.isComposing || e.keyCode === 229) return false;
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) return false;
  if (document.querySelector('[aria-modal="true"]')) return false;
  return true;
}

/** map of key (e.key) -> handler; return false from a handler to let the key through */
export function useHotkeys(map: Record<string, (() => void | boolean) | null | undefined>) {
  const ref = useRef(map);
  useEffect(() => {
    ref.current = map;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!hotkeyAllowed(e)) return;
      const fn = ref.current[e.key];
      if (!fn) return;
      if (fn() === false) return;
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}
