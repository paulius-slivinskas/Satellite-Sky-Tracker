import { describe, expect, it } from 'vitest';
import { passProgress, pointingInstruction, shortestTurn } from '../src/domain/finder';
describe('sky finder', () => {
  it('takes the shortest turn across north and chooses a deterministic half turn', () => {
    expect(shortestTurn(359, 1)).toBe(2);
    expect(shortestTurn(1, 359)).toBe(-2);
    expect(shortestTurn(0, 180)).toBe(-180);
    expect(pointingInstruction(-30)).toBe('Turn left 30°');
  });
  it('clamps future and past passes with explicit statuses', () => {
    const pass = { start: 1000, end: 2000 };
    expect(passProgress(pass, 0)).toMatchObject({ progress: 0, status: 'upcoming', x: 40, y: 90 });
    expect(passProgress(pass, 3000)).toMatchObject({
      progress: 1,
      status: 'complete',
      x: 360,
      y: 90,
    });
    expect(passProgress(pass, 1000)?.status).toBe('active');
    expect(passProgress(pass, 2000)?.status).toBe('complete');
  });
  it('moves the live dot along the slight quadratic arc', () => {
    expect(passProgress({ start: 1000, end: 2000 }, 1500)).toEqual({
      progress: 0.5,
      status: 'active',
      x: 200,
      y: 70,
    });
    expect(passProgress({ start: 1000, end: 2000 }, 1250)?.x).toBe(120);
  });
  it('rejects invalid pass boundaries and clock values', () => {
    expect(passProgress({ start: 2000, end: 1000 }, 1500)).toBeNull();
    expect(passProgress({ start: 1000, end: 1000 }, 1000)).toBeNull();
    expect(passProgress({ start: 1000, end: 2000 }, NaN)).toBeNull();
  });
});
