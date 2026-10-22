import { Hammer } from 'lucide-react';
import { TopBar } from '../components/TopBar';
import { Button } from '../components/Button';
import { nav } from '../lib/router';

export function ComingSoon({ feature, phase, code }: { feature: string; phase: number; code?: string }) {
  return (
    <>
      <TopBar title={feature} />
      <div className="empty-state grow" style={{ justifyContent: 'center' }}>
        <Hammer size={40} color="var(--border)" />
        <b>{feature} lands in Phase {phase}.</b>
        <p>The ghosts are still building this part.{code ? ' ' : ''}</p>
        {code && <p>Your link worked though: code <span className="mono" style={{ color: 'var(--accent)', letterSpacing: '.12em' }} data-testid="deep-code">{code}</span> is ready to use once joining is live.</p>}
      </div>
      <Button variant="secondary" onClick={() => nav.home()}>Back home</Button>
    </>
  );
}
