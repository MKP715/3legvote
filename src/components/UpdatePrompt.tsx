import { useEffect, useState } from 'react';

/**
 * Offline support (service worker via vite-plugin-pwa). A new version never reloads the page
 * by itself — reloading mid-election would be disruptive — so the chair chooses when to update.
 */
export function UpdatePrompt() {
  const [update, setUpdate] = useState<null | (() => void)>(null);
  const [offlineReady, setOfflineReady] = useState(false);

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    let cancelled = false;
    import('virtual:pwa-register')
      .then(({ registerSW }) => {
        if (cancelled) return;
        const updateSW = registerSW({
          onNeedRefresh: () => setUpdate(() => () => void updateSW(true)),
          onOfflineReady: () => {
            setOfflineReady(true);
            window.setTimeout(() => setOfflineReady(false), 6000);
          },
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (update) {
    return (
      <div className="update-banner no-print" role="status">
        A new version of the app is available.
        <button onClick={update}>Update now</button>
        <button className="outline secondary" onClick={() => setUpdate(null)}>
          Later
        </button>
      </div>
    );
  }
  if (offlineReady) {
    return (
      <div className="update-banner no-print" role="status">
        Ready to work offline.
      </div>
    );
  }
  return null;
}
