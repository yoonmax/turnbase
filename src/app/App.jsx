import { Suspense, useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import gsap from 'gsap';
import { Navigation } from '../components/Navigation.jsx';
import { Toasts } from '../components/Toasts.jsx';
import { ErrorBoundary } from '../components/ErrorBoundary.jsx';
import { useApp } from './store.js';
import { AppRoutes } from './routes.jsx';
import { prefersReducedMotion } from './appearance.js';
import { startThumbs } from '../components/thumbs.js';

const PageFallback = () => <div className="h-full" />;

export default function App() {
  const ready = useApp((s) => s.ready);
  const init = useApp((s) => s.init);
  const location = useLocation();
  const page = useRef(null);
  const first = useRef(true);

  useEffect(() => {
    startThumbs();
    init().catch((error) => {
      useApp.setState({ initError: error?.message ?? 'Storage is unavailable.' });
    });
  }, [init]);

  // A quick settle on navigation, skipped on first load so the timer is simply there.
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (page.current && !prefersReducedMotion()) {
      gsap.fromTo(page.current, { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.2, ease: 'power2.out', force3D: true, clearProps: 'transform,opacity' });
    }
  }, [location.pathname]);

  const initError = useApp((s) => s.initError);

  return (
    <div className="h-full relative">
      <div className="backdrop-blooms" aria-hidden="true" />
      <Navigation />
      <div ref={page} className="relative h-full overflow-hidden">
        {initError ? (
          <div className="p-8 pt-24 text-center">
            <p className="font-medium m-0">turnbase cannot open its storage on this device.</p>
            <p className="text-graphite m-0 mt-1 text-[0.8125rem]">{initError} Private browsing can block storage, so try a regular window.</p>
          </div>
        ) : ready ? (
          <ErrorBoundary key={location.pathname}>
            <Suspense fallback={<PageFallback />}>
              <AppRoutes />
            </Suspense>
          </ErrorBoundary>
        ) : null}
      </div>
      <Toasts />
    </div>
  );
}
