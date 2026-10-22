import { Share, SquarePlus, Smartphone, EllipsisVertical, Check } from 'lucide-react';
import { TopBar } from '../components/TopBar';
import { isAndroid, isIOS, isStandalone } from '../lib/pwa';

/** Step-by-step install instructions for iPhone and Android. */
export function InstallGuide() {
  const ios = isIOS(), android = isAndroid();
  return (
    <>
      <TopBar title="Install GHOSTLINE" />
      <div className="stack-24">
        {isStandalone() ? (
          <div className="card row"><Check size={22} color="var(--runner)" /><span><b>You're running the installed app.</b> <span className="dim">Nice. Nothing to do here.</span></span></div>
        ) : (
          <p className="dim">No App Store. It takes about 20 seconds and gives you full screen, a home-screen icon and push alerts.</p>
        )}
        {(ios || !android) && (
          <div className="card stack-16">
            <div className="row"><Smartphone size={22} /><h3>iPhone</h3></div>
            <div className="step"><span className="n">1</span><p>Open this page in <b>Safari</b> (not Chrome or an in-app browser).</p></div>
            <div className="step"><span className="n">2</span><p>Tap the <span className="kbd"><Share size={15} /> Share</span> button. It's at the bottom of the screen (or top right on iPad).</p></div>
            <div className="step"><span className="n">3</span><p>Scroll down and tap <span className="kbd"><SquarePlus size={15} /> Add to Home Screen</span>.</p></div>
            <div className="step"><span className="n">4</span><p>Make sure <b>Open as Web App</b> is on (iOS 26+), then tap <b>Add</b>.</p></div>
            <div className="step"><span className="n">5</span><p>Open GHOSTLINE from the new icon on your home screen. Always use the icon, not Safari: that's the only way alerts work on iPhone.</p></div>
          </div>
        )}
        {(android || !ios) && (
          <div className="card stack-16">
            <div className="row"><Smartphone size={22} /><h3>Android</h3></div>
            <div className="step"><span className="n">1</span><p>Open this page in <b>Chrome</b>.</p></div>
            <div className="step"><span className="n">2</span><p>Tap <span className="kbd"><EllipsisVertical size={15} /> menu</span> (top right).</p></div>
            <div className="step"><span className="n">3</span><p>Tap <b>Add to Home screen</b> or <b>Install app</b>, then <b>Install</b>.</p></div>
          </div>
        )}
        <p className="small dim center">Already installed and something's off? Settings → System check tells you what's working.</p>
      </div>
    </>
  );
}
