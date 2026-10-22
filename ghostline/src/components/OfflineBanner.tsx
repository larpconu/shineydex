import { WifiOff } from 'lucide-react';
import { useOnline } from '../lib/online';

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="banner offline" role="status">
      <WifiOff className="ic" size={22} />
      <span>You're offline. The app still opens; games need a signal.</span>
    </div>
  );
}
