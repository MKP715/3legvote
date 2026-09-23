import { useEffect, useState } from 'react';
import type { Assembly, Live, LiveTimer } from '../engine/types';
import { useStore } from '../store';
import { NumberField } from './ui';

export function remainingSeconds(timer: LiveTimer | null, nowMs = Date.now()): number {
  if (!timer) return 0;
  if (timer.endsAt === null) return Math.max(0, Math.round(timer.remainingSec));
  return Math.max(0, Math.ceil((timer.endsAt - nowMs) / 1000));
}

export function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Re-render every half second while a timer is running. */
export function useTick(active: boolean) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setN((n) => n + 1), 500);
    return () => window.clearInterval(id);
  }, [active]);
}

export function TimerFace({ timer, large = false }: { timer: LiveTimer; large?: boolean }) {
  useTick(timer.endsAt !== null);
  const left = remainingSeconds(timer);
  const warn = left <= 30 && left > 0;
  return (
    <div className={`timer-face ${large ? 'timer-large' : ''} ${left === 0 ? 'timer-done' : warn ? 'timer-warn' : ''}`} role="timer" aria-live="off">
      {timer.label && <span className="timer-label">{timer.label}</span>}
      <span className="timer-clock">{fmtClock(left)}</span>
    </div>
  );
}

/**
 * Chair controls for what the room sees: a speaking timer (e.g. each candidate shares
 * their service history) and a free-text message on the projector.
 */
export function LiveControls({ assembly }: { assembly: Assembly }) {
  const s = useStore();
  const timer = assembly.live.timer;
  const [minutes, setMinutes] = useState<number | null>(3);
  const [label, setLabel] = useState('Candidate sharing');
  const [msg, setMsg] = useState(assembly.live.message);
  // The message can also be changed from another window.
  useEffect(() => setMsg(assembly.live.message), [assembly.live.message]);
  useTick(!!timer && timer.endsAt !== null);

  const start = () => {
    const sec = Math.max(30, (minutes && minutes > 0 ? minutes : 3) * 60);
    s.setTimer(assembly.id, { label, durationSec: sec, endsAt: Date.now() + sec * 1000, remainingSec: sec });
  };
  const pause = () => timer && s.setTimer(assembly.id, { ...timer, endsAt: null, remainingSec: remainingSeconds(timer) });
  const resume = () => timer && s.setTimer(assembly.id, { ...timer, endsAt: Date.now() + remainingSeconds(timer) * 1000 });
  const reset = () => timer && s.setTimer(assembly.id, { ...timer, endsAt: null, remainingSec: timer.durationSec });

  return (
    <details className="panel-lite">
      <summary>Timer, projector message &amp; screen</summary>
      <ProjectorControls assembly={assembly} />
      <div className="grid-2">
        <div>
          <div className="row wrap">
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Timer label" />
            <label className="inline-field">
              Minutes
              <NumberField value={minutes} onChange={setMinutes} label="Minutes" />
            </label>
          </div>
          <div className="row wrap">
            <button onClick={start}>Start</button>
            {timer && timer.endsAt !== null && (
              <button className="secondary" onClick={pause}>
                Pause
              </button>
            )}
            {timer && timer.endsAt === null && remainingSeconds(timer) > 0 && (
              <button className="secondary" onClick={resume}>
                Resume
              </button>
            )}
            {timer && (
              <>
                <button className="outline secondary" onClick={reset}>
                  Reset
                </button>
                <button className="outline secondary" onClick={() => s.setTimer(assembly.id, null)}>
                  Hide
                </button>
              </>
            )}
          </div>
          {timer && <TimerFace timer={timer} />}
        </div>
        <div>
          <label>
            Message on the projector
            <input type="text" value={msg} placeholder="e.g. Break — we resume at 2:15" onChange={(e) => setMsg(e.target.value)} />
          </label>
          <div className="row">
            <button className="outline" onClick={() => s.setLiveMessage(assembly.id, msg)}>
              Show message
            </button>
            {assembly.live.message && (
              <button
                className="outline secondary"
                onClick={() => {
                  setMsg('');
                  s.setLiveMessage(assembly.id, '');
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>
    </details>
  );
}


const SCREENS: { id: NonNullable<Live['screen']>; label: string }[] = [
  { id: 'election', label: 'Election' },
  { id: 'agenda', label: 'Agenda' },
  { id: 'motion', label: 'Motion' },
  { id: 'conference', label: 'Conference item' },
];

/**
 * What the room sees, how big it is, and whether it is in the high-contrast theme
 * for a washed-out screen or a bright hall.
 */
export function ProjectorControls({ assembly }: { assembly: Assembly }) {
  const s = useStore();
  const live = assembly.live;
  const screen = live.screen ?? 'election';
  const zoom = live.zoom ?? 1;
  const available: Record<NonNullable<Live['screen']>, boolean> = {
    election: assembly.positions.length > 0,
    agenda: assembly.agenda.length > 0,
    motion: assembly.motions.length > 0,
    conference: assembly.conferenceItems.length > 0,
  };
  return (
    <div className="projector-controls">
      <div className="row wrap">
        <span className="small muted">Projector shows</span>
        <div role="group">
          {SCREENS.map((sc) => (
            <button
              key={sc.id}
              className={screen === sc.id ? '' : 'outline secondary'}
              disabled={!available[sc.id]}
              title={available[sc.id] ? undefined : 'Nothing to show on this screen yet'}
              onClick={() => s.setScreen(assembly.id, sc.id)}
            >
              {sc.label}
            </button>
          ))}
        </div>
      </div>
      <div className="row wrap">
        <span className="small muted">Size</span>
        <div role="group">
          <button className="outline secondary" onClick={() => s.setZoom(assembly.id, zoom - 0.05)} aria-label="Smaller">
            −
          </button>
          <button className="outline secondary" onClick={() => s.setZoom(assembly.id, 1)}>
            {Math.round(zoom * 100)}%
          </button>
          <button className="outline secondary" onClick={() => s.setZoom(assembly.id, zoom + 0.05)} aria-label="Bigger">
            +
          </button>
        </div>
        <label className="inline-field">
          <input
            type="checkbox"
            role="switch"
            checked={!!live.highContrast}
            onChange={(e) => s.setHighContrast(assembly.id, e.target.checked)}
          />
          High contrast
        </label>
        <small className="muted">The projector window also answers + and − on its own keyboard; 0 resets.</small>
      </div>
    </div>
  );
}
