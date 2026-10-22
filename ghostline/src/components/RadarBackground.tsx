import { useMemo } from 'react';

/** Slow radar sweep with the occasional blip, behind the home screen. */
export function RadarBackground() {
  const blips = useMemo(
    () => Array.from({ length: 5 }, (_, k) => ({ left: 18 + Math.random() * 64, top: 12 + Math.random() * 44, delay: k * 1.4 + Math.random() })),
    [],
  );
  return (
    <div className="radar-bg" aria-hidden="true">
      <div className="rings" />
      <div className="sweep" />
      {blips.map((b, i) => (
        <i key={i} className="blip" style={{ left: `${b.left}%`, top: `${b.top}%`, animationDelay: `${b.delay.toFixed(2)}s` }} />
      ))}
    </div>
  );
}
