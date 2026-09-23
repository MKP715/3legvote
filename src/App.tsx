import { useEffect, useState } from 'react';
import { HashRouter, Link, Route, Routes, useLocation } from 'react-router';
import { Home } from './pages/Home';
import { AssemblyPage } from './pages/AssemblyPage';
import { PositionPage } from './pages/PositionPage';
import { Report } from './pages/Report';
import { Display } from './pages/Display';
import { PrintBallots } from './pages/PrintBallots';
import { Guide } from './pages/Guide';
import { VotersPage } from './pages/VotersPage';
import { CheckinPage } from './pages/CheckinPage';
import { TellerPage } from './pages/TellerPage';
import { NotFound } from './pages/NotFound';
import { ConfirmHost, ErrorBoundary, notify, ToastHost } from './components/ui';
import { UpdatePrompt } from './components/UpdatePrompt';
import { TabWarning } from './components/TabWarning';
import { AutoBackup } from './components/BackupPanel';
import { setStorageErrorHandler } from './store';

type Theme = 'auto' | 'light' | 'dark';

function readPref(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

function Prefs() {
  const [theme, setTheme] = useState<Theme>(() => readPref('tlv-theme', 'auto') as Theme);
  const [large, setLarge] = useState(() => readPref('tlv-large-text', '0') === '1');
  useEffect(() => {
    const el = document.documentElement;
    if (theme === 'auto') el.removeAttribute('data-theme');
    else el.setAttribute('data-theme', theme);
    writePref('tlv-theme', theme);
  }, [theme]);
  useEffect(() => {
    document.documentElement.classList.toggle('large-text', large);
    writePref('tlv-large-text', large ? '1' : '0');
  }, [large]);
  const next: Record<Theme, Theme> = { auto: 'light', light: 'dark', dark: 'auto' };
  const icon: Record<Theme, string> = { auto: '◐', light: '☀', dark: '☾' };
  return (
    <>
      <li>
        <button className="icon-btn" onClick={() => setTheme(next[theme])} title={`Theme: ${theme} (click to change)`} aria-label={`Theme: ${theme}`}>
          {icon[theme]}
        </button>
      </li>
      <li>
        <button
          className={`icon-btn ${large ? 'on' : ''}`}
          onClick={() => setLarge(!large)}
          title="Larger text"
          aria-pressed={large}
          aria-label="Larger text"
        >
          A+
        </button>
      </li>
    </>
  );
}

/** Screens shown to the room must not display operator chrome (toasts, dialogs, update banner). */
function OperatorChrome() {
  const loc = useLocation();
  if (loc.pathname.startsWith('/display/')) return null;
  return (
    <>
      <ToastHost />
      <ConfirmHost />
      <UpdatePrompt />
    </>
  );
}

function Shell() {
  const loc = useLocation();
  if (loc.pathname.startsWith('/display/')) {
    return (
      <Routes>
        <Route path="/display/:aid" element={<Display />} />
      </Routes>
    );
  }
  if (loc.pathname.startsWith('/teller/')) {
    return (
      <Routes>
        <Route path="/teller/:code" element={<TellerPage />} />
      </Routes>
    );
  }
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="app-header no-print">
        <nav className="container">
          <ul>
            <li>
              <Link to="/" className="brand">
                <img src="./favicon.png" alt="" width={24} height={24} /> Third Legacy Vote
              </Link>
            </li>
          </ul>
          <ul>
            <li>
              <Link to="/">Elections</Link>
            </li>
            <li>
              <Link to="/guide">How it works</Link>
            </li>
            <Prefs />
          </ul>
        </nav>
      </header>
      <main className="container" id="main">
        <TabWarning />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/guide" element={<Guide />} />
          <Route path="/a/:aid" element={<AssemblyPage />} />
          <Route path="/a/:aid/p/:pid" element={<PositionPage />} />
          <Route path="/a/:aid/voters" element={<VotersPage />} />
          <Route path="/a/:aid/checkin" element={<CheckinPage />} />
          <Route path="/a/:aid/report" element={<Report />} />
          <Route path="/a/:aid/ballots" element={<PrintBallots />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <footer className="container app-footer no-print">
        <small>
          Works offline · data stays in this browser · not affiliated with Alcoholics Anonymous World Services, Inc. ·{' '}
          <a href="https://github.com/MKP715/3legvote" target="_blank" rel="noreferrer">
            Source (GPL-3.0)
          </a>{' '}
          · version {__APP_VERSION__}
        </small>
      </footer>
    </>
  );
}

export function App() {
  useEffect(() => {
    // A failed save must be visible — the chair may need to export a backup immediately.
    setStorageErrorHandler((message) => notify(message, 'error'));
    try {
      const probe = '__tlv_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
    } catch {
      notify(
        'This browser will not let the app save anything (private window or blocked storage). Your election would be lost on refresh — use a normal window.',
        'error',
      );
    }
    return () => setStorageErrorHandler(null);
  }, []);
  return (
    <HashRouter>
      <ErrorBoundary>
        <Shell />
      </ErrorBoundary>
      <AutoBackup />
      <OperatorChrome />
    </HashRouter>
  );
}
