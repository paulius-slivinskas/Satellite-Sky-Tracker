import { predictWatchlistPasses } from './passes';
import type { Observer, PassRange, Satellite } from './types';
self.onmessage = (
  event: MessageEvent<{
    satellites: Satellite[];
    observer: Observer;
    time: number;
    range: PassRange;
  }>,
) => {
  try {
    const { satellites, observer, time, range } = event.data;
    self.postMessage({ passes: predictWatchlistPasses(satellites, observer, time, range) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Pass calculation failed' });
  }
};
