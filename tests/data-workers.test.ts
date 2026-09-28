import { afterEach, describe, expect, it, vi } from 'vitest';
import { startPassCalculation } from '../src/state/hooks';
import type { Satellite } from '../src/domain/types';
const sat = {} as Satellite;
const observer = { lat: 54, lon: 25, alt: 0, name: 'Test' };
afterEach(() => vi.unstubAllGlobals());

describe('pass worker lifetime', () => {
  it('surfaces worker creation errors through the result instead of crashing the effect', () => {
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          throw new Error('Worker unavailable');
        }
      },
    );
    const receive = vi.fn();
    const dispose = startPassCalculation([sat], observer, 0, '1', receive);
    expect(receive).toHaveBeenCalledWith({
      passes: [],
      loading: false,
      error: expect.stringContaining('Could not calculate'),
    });
    expect(dispose).not.toThrow();
  });
  it('terminates workers after completion and ignores results after cleanup', () => {
    const workers: FakeWorker[] = [];
    class FakeWorker {
      onmessage: ((event: { data: unknown }) => void) | null = null;
      terminate = vi.fn();
      postMessage = vi.fn();
      constructor() {
        workers.push(this);
      }
    }
    vi.stubGlobal('Worker', FakeWorker);
    const receive = vi.fn();
    startPassCalculation([sat], observer, 0, '1', receive);
    expect(workers[0].postMessage).toHaveBeenCalledWith({
      satellites: [sat],
      observer,
      time: 0,
      range: '1',
    });
    workers[0].onmessage!({ data: { passes: [] } });
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(receive).toHaveBeenCalledOnce();
    const dispose = startPassCalculation([sat], observer, 0, '1', receive);
    dispose();
    workers[1].onmessage!({ data: { passes: [] } });
    expect(receive).toHaveBeenCalledOnce();
    expect(workers[1].terminate).toHaveBeenCalledOnce();
  });
  it('terminates the worker and reports structured clone failures', () => {
    const terminate = vi.fn();
    vi.stubGlobal(
      'Worker',
      class {
        terminate = terminate;
        postMessage() {
          throw new Error('DataCloneError');
        }
      },
    );
    const receive = vi.fn();
    startPassCalculation([sat], observer, 0, '1', receive);
    expect(terminate).toHaveBeenCalledOnce();
    expect(receive).toHaveBeenCalledWith({ passes: [], loading: false, error: expect.any(String) });
  });
});
