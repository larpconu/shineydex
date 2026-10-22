import { useMemo } from 'react';
import { Radar, LogIn, Bot, Settings, CircleHelp, History, Download } from 'lucide-react';
import { Button, IconButton } from '../components/Button';
import { RadarBackground } from '../components/RadarBackground';
import { nav } from '../lib/router';
import { isIOS, isStandalone } from '../lib/pwa';

const TAGLINES = ['Hide and seek, but with satellites.', 'Run. Hide. Get pinged anyway.', 'Your neighborhood is the game board.'];

export function Home() {
  const tagline = useMemo(() => TAGLINES[Math.floor(Math.random() * TAGLINES.length)], []);
  const installed = isStandalone();
  return (
    <>
      <RadarBackground />
      <div className="gear"><IconButton label="Settings" onClick={() => nav.go({ name: 'settings' })}><Settings size={22} /></IconButton></div>
      <div className="hero">
        <img className="mark" src="/icons/mark.svg" alt="" />
        <img className="wordmark" src="/icons/wordmark.svg" alt="GHOSTLINE" />
        <p className="tagline">{tagline}</p>
      </div>
      <div className="actions">
        {!installed && (
          <button className="card row" style={{ textAlign: 'left' }} onClick={() => nav.go({ name: 'install' })}>
            <Download size={22} color="var(--zone)" />
            <span className="small"><b>Install it for real.</b>{' '}
              <span className="dim">{isIOS() ? 'Safari → Share → Add to Home Screen. Tap for the 20-second guide.' : 'Add GHOSTLINE to your home screen. Tap for how.'}</span></span>
          </button>
        )}
        <Button tall icon={<Radar size={26} />} sub="Drop a zone, share a code" onClick={() => nav.go({ name: 'soon', feature: 'Hosting', phase: 3 })}>Host a game</Button>
        <Button tall variant="secondary" icon={<LogIn size={26} />} sub="Got a code? Get in" onClick={() => nav.go({ name: 'join' })}>Join a game</Button>
        <Button tall variant="secondary" icon={<Bot size={26} />} sub="Solo vs. bots" onClick={() => nav.go({ name: 'soon', feature: 'Demo rounds', phase: 4 })}>Try a demo round</Button>
        <div className="secondary-row">
          <button className="link-btn" onClick={() => nav.go({ name: 'soon', feature: 'How to Play', phase: 4 })}><CircleHelp size={18} /> How to play</button>
          <button className="link-btn" onClick={() => nav.go({ name: 'soon', feature: 'History', phase: 8 })}><History size={18} /> History</button>
          <button className="link-btn" onClick={() => nav.go({ name: 'settings' })}><Settings size={18} /> Settings</button>
        </div>
      </div>
    </>
  );
}
