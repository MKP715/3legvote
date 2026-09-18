import { useEffect, useState } from 'react';
import type { Assembly, LiveTimer } from '../engine/types';
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
  useTick(!!timer && timer.endsAt !== null);

  const start = () => {
    const sec = Math.max(5, (minutes ?? 3) * 60);
    s.setTimer(assembly.id, { label, durationSec: sec, endsAt: Date.now() + sec * 1000, remainingSec: sec });
  };
  const pause = () => timer && s.setTimer(assembly.id, { ...timer, endsAt: null, remainingSec: remainingSeconds(timer) });
  const resume = () => timer && s.setTimer(assembly.id, { ...timer, endsAt: Date.now() + remainingSeconds(timer) * 1000 });
  const reset = () => timer && s.setTimer(assembly.id, { ...timer, endsAt: null, remainingSec: timer.durationSec });

  return (
    <details className="panel-lite">
      <summary>Timer &amp; projector message</summary>
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
