import { Button } from '@heroui/react';
import { useRef } from 'react';
import type { ViewState } from '../domain/types';
import { Choice } from './Controls';
export function TimePanel({
  state,
  time,
  readTime,
  patch,
}: {
  state: ViewState;
  time: number;
  readTime: () => number;
  patch: (value: Partial<ViewState>) => void;
}) {
  const drag = useRef<{ x: number; time: number; pointerId: number } | null>(null);
  const setTime = (value: number) =>
    patch({
      simulatedTimeMs: Math.max(-8640000000000000, Math.min(8640000000000000, value)),
      playing: false,
    });
  const jog = (delta: number) => setTime(readTime() + delta);
  return (
    <div className="panel-content">
      <h2>Time Control</h2>
      <Button
        onPress={() => patch({ playing: !state.playing, simulatedTimeMs: readTime() })}
        fullWidth
      >
        {state.playing ? 'Pause' : 'Play'}
      </Button>
      <Choice
        label="Speed"
        value={String(state.speed)}
        options={[1, 10, 60, 300, 900].map((speed) => [String(speed), `${speed}×`])}
        onChange={(value) => patch({ speed: Number(value), simulatedTimeMs: readTime() })}
      />
      <div className="section-heading">
        <h3>Time</h3>
        <Button
          size="sm"
          variant="ghost"
          onPress={() => patch({ simulatedTimeMs: Date.now(), playing: true })}
        >
          Reset
        </Button>
      </div>
      <div
        className="time-jog"
        role="slider"
        aria-label="Time jog control"
        tabIndex={0}
        aria-valuemin={-8640000000000}
        aria-valuemax={8640000000000}
        aria-valuenow={Math.round(time / 1000)}
        aria-valuetext={new Date(time).toLocaleString()}
        onPointerDown={(event) => {
          if (event.button !== 0 || drag.current) return;
          const currentTime = readTime();
          drag.current = { x: event.clientX, time: currentTime, pointerId: event.pointerId };
          event.currentTarget.setPointerCapture(event.pointerId);
          event.currentTarget.focus();
          setTime(currentTime);
        }}
        onPointerMove={(event) => {
          if (drag.current?.pointerId === event.pointerId)
            setTime(drag.current.time + (event.clientX - drag.current.x) * 75 * state.speed);
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            jog((event.key === 'ArrowLeft' ? -1 : 1) * 60000 * state.speed);
          }
        }}
        onWheel={(event) => jog(-event.deltaY * 75 * state.speed)}
      >
        <span />
      </div>
      <p className="time-readout">
        {new Date(time).toLocaleString([], { hour12: state.timeFormat === '12h' })}
      </p>
      <p className="muted">Drag the timeline or use the arrow keys to explore an orbit.</p>
    </div>
  );
}
