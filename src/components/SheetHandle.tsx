import { useRef } from 'react';
export function SheetHandle({
  expanded,
  onChange,
}: {
  expanded: boolean;
  onChange: (value: boolean) => void;
}) {
  const start = useRef<number | null>(null);
  const dragged = useRef(false);
  return (
    <button
      type="button"
      className="sheet-handle"
      aria-label={expanded ? 'Collapse sheet' : 'Expand sheet'}
      aria-expanded={expanded}
      onPointerDown={(event) => {
        start.current = event.clientY;
        dragged.current = false;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerUp={(event) => {
        if (start.current !== null) {
          const delta = event.clientY - start.current;
          if (Math.abs(delta) > 25) {
            dragged.current = true;
            onChange(delta < 0);
          }
        }
        start.current = null;
      }}
      onPointerCancel={() => {
        start.current = null;
      }}
      onClick={() => {
        if (!dragged.current) onChange(!expanded);
        dragged.current = false;
      }}
    >
      <span />
    </button>
  );
}
