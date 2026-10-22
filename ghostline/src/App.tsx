import { useRoute } from './lib/router';
import { OfflineBanner } from './components/OfflineBanner';
import { Home } from './screens/Home';
import { InstallGuide } from './screens/InstallGuide';
import { SystemCheck } from './screens/SystemCheck';
import { Settings } from './screens/Settings';
import { ComingSoon } from './screens/ComingSoon';

export function App() {
  const { route, depth, direction } = useRoute();
  let screen;
  switch (route.name) {
    case 'home': screen = <Home />; break;
    case 'install': screen = <InstallGuide />; break;
    case 'system': screen = <SystemCheck />; break;
    case 'settings': screen = <Settings />; break;
    case 'join': screen = <ComingSoon feature="Joining" phase={3} code={route.code} />; break;
    case 'soon': screen = <ComingSoon feature={route.feature} phase={route.phase} />; break;
  }
  return (
    <>
      <OfflineBanner />
      <section key={`${depth}:${route.name}`} className={`screen ${route.name}${direction === 'back' ? ' back' : ''}`} data-screen={route.name}>
        {screen}
      </section>
    </>
  );
}
