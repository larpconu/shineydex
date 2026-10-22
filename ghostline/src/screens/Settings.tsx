import { Activity, Download, ChevronRight, Info } from 'lucide-react';
import { TopBar } from '../components/TopBar';
import { nav } from '../lib/router';

/** Phase 1 settings. Accounts, alerts, blocked players, Host Pass etc. arrive in later phases. */
export function Settings() {
  return (
    <>
      <TopBar title="Settings" />
      <div className="stack-16">
        <div className="card flush">
          <button className="list-item" onClick={() => nav.go({ name: 'system' })}><Activity size={22} /><div className="grow"><div className="title">System check</div><div className="meta">Install, offline, server, alerts, location</div></div><ChevronRight size={20} /></button>
          <button className="list-item" onClick={() => nav.go({ name: 'install' })}><Download size={22} /><div className="grow"><div className="title">Install guide</div><div className="meta">Add GHOSTLINE to your home screen</div></div><ChevronRight size={20} /></button>
        </div>
        <div className="card row"><Info size={22} color="var(--text-dim)" /><p className="small dim">Account, alerts, blocked players and the rest of Settings arrive in Phase 2.</p></div>
        <p className="small dim center">GHOSTLINE v{__APP_VERSION__}</p>
      </div>
    </>
  );
}
