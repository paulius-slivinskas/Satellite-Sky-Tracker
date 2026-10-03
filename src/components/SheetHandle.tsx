import { useRef } from 'react';

type Drag = {
  sheet: HTMLElement;
  startY: number;
  startTop: number;
  collapsedTop: number;
  top: number;
  lastY: number;
  lastTime: number;
  velocity: number;
};

export function SheetHandle({
  expanded,
  onChange,
}: {
  expanded: boolean;
  onChange: (value: boolean) => void;
}) {
  const drag = useRef<Drag | null>(null);
  const dragged = useRef(false);
  const settle = (cancelled = false) => {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    const next = cancelled
      ? expanded
      : dragged.current
        ? Math.abs(current.velocity) > 0.45
          ? current.velocity < 0
          : current.top < current.collapsedTop / 2
        : expanded;
    const target = next ? 0 : current.collapsedTop;
    current.sheet.classList.remove('sheet-dragging');
    current.sheet.style.removeProperty('--sheet-drag-top');
    onChange(next);
    if (dragged.current) {
      current.sheet.animate(
        [
          { top: `${current.top}px`, height: `calc(100dvh - ${current.top}px)` },
          { top: `${target}px`, height: `calc(100dvh - ${target}px)` },
        ],
        {
          duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220,
          easing: 'cubic-bezier(.2,.8,.2,1)',
        },
      );
    }
  };
  return (
    <button
      type="button"
      className="sheet-handle"
      aria-label={expanded ? 'Collapse sheet' : 'Expand sheet'}
      aria-expanded={expanded}
      onPointerDown={(event) => {
        const sheet = event.currentTarget.closest<HTMLElement>('.sidebar-stack, .right-stack');
        const app = sheet?.closest('.app');
        if (!sheet || !app) return;
        sheet.getAnimations().forEach((animation) => animation.cancel());
        const startTop = sheet.getBoundingClientRect().top;
        if (expanded) app.classList.remove('sheet-expanded');
        const collapsedTop = sheet.getBoundingClientRect().top;
        if (expanded) app.classList.add('sheet-expanded');
        drag.current = {
          sheet,
          startY: event.clientY,
          startTop,
          collapsedTop,
          top: startTop,
          lastY: event.clientY,
          lastTime: event.timeStamp,
          velocity: 0,
        };
        dragged.current = false;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current) return;
        const delta = event.clientY - current.startY;
        if (!dragged.current && Math.abs(delta) < 4) return;
        dragged.current = true;
        const elapsed = event.timeStamp - current.lastTime;
        if (elapsed > 0) current.velocity = (event.clientY - current.lastY) / elapsed;
        current.lastY = event.clientY;
        current.lastTime = event.timeStamp;
        current.top = Math.max(0, Math.min(current.collapsedTop, current.startTop + delta));
        current.sheet.style.setProperty('--sheet-drag-top', `${current.top}px`);
        current.sheet.classList.add('sheet-dragging');
      }}
      onPointerUp={(event) => {
        if (drag.current && event.timeStamp - drag.current.lastTime > 120)
          drag.current.velocity = 0;
        settle();
      }}
      onPointerCancel={() => settle(true)}
      onLostPointerCapture={() => settle(true)}
      onClick={() => {
        if (!dragged.current) onChange(!expanded);
        dragged.current = false;
      }}
    >
      <span />
    </button>
  );
}
