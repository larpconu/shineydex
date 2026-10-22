import { describe, it, expect } from 'vitest';
import { offsetFromSample, ServerClock } from '../../src/lib/clock';

describe('server clock', () => {
  it('splits the round trip evenly', () => {
    // phone thinks it's 1000; server answered 5050 after a 100 ms round trip → phone is ~4000 ms behind
    expect(offsetFromSample({ sentAt: 1000, receivedAt: 1100, serverTime: 5050 })).toBe(4000);
  });
  it('keeps the fastest (most accurate) sample', () => {
    const c = new ServerClock();
    c.add({ sentAt: 0, receivedAt: 900, serverTime: 10_000 }); // slow, sloppy
    c.add({ sentAt: 0, receivedAt: 40, serverTime: 9_620 }); // fast
    c.add({ sentAt: 0, receivedAt: 500, serverTime: 20_000 }); // slow outlier ignored
    expect(c.offset).toBe(9_600);
    expect(c.bestRtt).toBe(40);
    expect(Math.abs(c.now() - (Date.now() + 9_600))).toBeLessThan(5);
  });
  it('ignores impossible samples', () => {
    const c = new ServerClock();
    c.add({ sentAt: 100, receivedAt: 50, serverTime: 1 });
    expect(c.samples).toBe(0);
  });
});
