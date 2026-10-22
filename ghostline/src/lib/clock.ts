// Server-authoritative time. Every game timer is a server timestamp; phones show countdowns
// using their own clock plus an offset measured against the server.

export interface ClockSample { serverTime: number; sentAt: number; receivedAt: number }

/** Offset (ms) to add to Date.now() to get server time, assuming symmetric network delay. */
export function offsetFromSample({ serverTime, sentAt, receivedAt }: ClockSample): number {
  return serverTime - (sentAt + receivedAt) / 2;
}

/** Keeps the sample with the shortest round trip (the most trustworthy one). */
export class ServerClock {
  offset = 0;
  bestRtt = Infinity;
  samples = 0;

  add(sample: ClockSample): void {
    const rtt = sample.receivedAt - sample.sentAt;
    if (rtt < 0) return;
    this.samples++;
    if (rtt <= this.bestRtt) {
      this.bestRtt = rtt;
      this.offset = offsetFromSample(sample);
    }
  }

  now(): number {
    return Date.now() + this.offset;
  }
}

export const serverClock = new ServerClock();

/** Measure the server clock a few times via the health function. */
export async function syncClock(times = 3): Promise<{ offset: number; rtt: number }> {
  for (let i = 0; i < times; i++) {
    const sentAt = Date.now();
    const r = await fetch('/api/health', { cache: 'no-store' });
    const receivedAt = Date.now();
    if (!r.ok) throw new Error(`Server said ${r.status}`);
    const { serverTime } = (await r.json()) as { serverTime: number };
    serverClock.add({ serverTime, sentAt, receivedAt });
  }
  return { offset: serverClock.offset, rtt: serverClock.bestRtt };
}
