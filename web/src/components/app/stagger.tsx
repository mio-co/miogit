// Light first-paint stagger for list rows: opacity + 4px rise, 20 ms apart, capped at 12 rows.
import { motion, type HTMLMotionProps } from 'motion/react';
import { EASE, DUR } from '@/lib/motion';
import { useReducedMotionPref } from '@/lib/use-reduced-motion';

export function StaggerItem({ i, as = 'li', ...p }: { i: number; as?: 'li' | 'div' | 'tr' } & HTMLMotionProps<'li'>) {
  const reduce = useReducedMotionPref();
  const C = (as === 'div' ? motion.div : as === 'tr' ? motion.tr : motion.li) as typeof motion.li;
  return (
    <C
      initial={reduce ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.base, ease: EASE.enter, delay: Math.min(i, 12) * 0.02 }}
      {...p}
    />
  );
}
