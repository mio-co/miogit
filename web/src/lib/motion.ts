import type { Transition } from 'motion/react';

/*
 * CDS 弹簧：按参数与用途命名（spec §5.3）。
 * 原仓库导出名放错（SPRING_GENTLE 反而最弹），这里不再沿用。
 * ζ = c / (2√(mk))
 */

/** 按钮点击、开关、Tab、layoutId 胶囊：利落，ζ 0.612，过冲 +8.8% */
export const SPRING_PRESS: Transition = { type: 'spring', stiffness: 600, damping: 30, mass: 1 };
/** 气泡上浮、卡片 / Popover、手风琴、复位：几乎不回弹，ζ 0.783，过冲 +1.9% */
export const SPRING_CONTENT: Transition = { type: 'spring', stiffness: 320, damping: 28, mass: 1 };
/** 点赞、复制成功、轻提示：俏皮，ζ 0.462，过冲 +19.5% */
export const SPRING_PLAYFUL: Transition = { type: 'spring', stiffness: 380, damping: 18, mass: 1 };
/** 拖拽松手、抽屉吸附：过阻尼零过冲，ζ 3.651，约 0.26s 收敛 */
export const SPRING_DOCK: Transition = { type: 'spring', stiffness: 1200, damping: 80, mass: 0.1 };

/** 时长（秒），与 CSS --cds-dur-* 一一对应 */
export const DUR = { fast: 0.06, snap: 0.12, base: 0.2, sheet: 0.3, slow: 0.45 } as const;

/** 缓动曲线（cubic-bezier 控制点），与 CSS --cds-ease-* 一一对应 */
export const EASE = {
  swift: [0.16, 1, 0.3, 1],
  expand: [0.19, 1, 0.22, 1],
  enter: [0.22, 1, 0.36, 1],
  out: [0.165, 0.84, 0.44, 1],
  snap: [0.32, 0.72, 0, 1],
  overshoot: [0.34, 1.3, 0.64, 1],
  pop: [0.34, 1.56, 0.64, 1],
} as const satisfies Record<string, [number, number, number, number]>;

/** 减弱动效时的替身：瞬时完成 */
export const INSTANT: Transition = { duration: 0 };
