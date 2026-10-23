'use client';
import { useEffect, useState } from 'react';

/**
 * 是否应减弱动效：系统 prefers-reduced-motion 或站点设置（html[data-motion="reduce"]）任一为真。
 * 监听两者变化。SSR 时返回 false。
 */
export function useReducedMotionPref() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const el = document.documentElement;
    const read = () => setReduce(mq.matches || el.dataset.motion === 'reduce');
    read();
    mq.addEventListener('change', read);
    const mo = new MutationObserver(read);
    mo.observe(el, { attributes: true, attributeFilter: ['data-motion'] });
    return () => {
      mq.removeEventListener('change', read);
      mo.disconnect();
    };
  }, []);
  return reduce;
}
