import { useCallback, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useAssembly, useStore } from '../store';
import { CHANNEL_LABEL, CHANNELS, type Voter } from '../engine/types';
import { computeEligibility, personKey } from '../engine/voters';
import { decodeCheckin } from '../engine/tellerCodes';
import { QrScanner } from '../components/Qr';
import { Badge } from '../components/ui';
import { NotFound } from './NotFound';

type Outcome =
  | { kind: 'ok'; voter: Voter; role: string; votes: boolean; reason?: string; mode: 'in' | 'out' }
  | { kind: 'already'; voter: Voter; at?: string }
  | { kind: 'error'; message: string };

/** Two short tones: one for a good scan, a lower double for a problem. */
function beep(ok: boolean) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const play = (freq: number, at: number, len = 0.12) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.value = 0.05;
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + len);
    };
    if (ok) play(880, 0);
    else {
      play(300, 0);
      play(300, 0.18);
    }
    window.setTimeout(() => void ctx.close(), 600);
  } catch {
    /* sound is optional */
  }
}

/**
 * Registration desk. Members bring the voting card printed for them (Print → Voting cards);
 * the desk scans it and they are checked in. Everything also works by searching for a name,
 * so a lost card is never a problem.
 */
export function CheckinPage() {
  const { aid } = useParams();
  const a = useAssembly(aid);
  const s = useStore();
  const [scanning, setScanning] = useState(false);
  const [mode, setMode] = useState<'in' | 'out'>('in');
  const [q, setQ] = useState('');
  const [last, setLast] = useState<Outcome | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  const el = useMemo(() => (a ? computeEligibility(a.voterRoll, a.roles) : null), [a]);

  const check = useCallback(
    (voter: Voter, how: 'in' | 'out') => {
      if (!a) return;
      const role = a.roles.find((r) => r.id === voter.roleId);
      if (how === 'in' && voter.present) {
        setLast({ kind: 'already', voter, at: voter.checkedInAt });
        beep(false);
        return;
      }
      s.setPresent(a.id, voter.id, how === 'in');
      // Recompute after the change so the card says whether this person actually votes.
      const after = computeEligibility(
        useStore.getState().assemblies.find((x) => x.id === a.id)?.voterRoll ?? [],
        a.roles,
      );
      const votes = after.eligible.some((v) => v.id === voter.id);
      const reason = after.excluded.find((x) => x.voter.id === voter.id)?.reason;
      setLast({ kind: 'ok', voter, role: role?.name ?? '', votes, reason, mode: how });
      setHistory((h) => [`${how === 'in' ? '✓' : '←'} ${voter.name}`, ...h].slice(0, 8));
      beep(true);
    },
    [a, s],
  );

  const onScan = useCallback(
    (text: string) => {
      if (!a) return;
      try {
        const code = decodeCheckin(text);
        if (code.a !== a.id) throw new Error('That card belongs to a different election.');
        const voter = a.voterRoll.find((v) => v.id === code.i);
        if (!voter) throw new Error('That card is not on this roll — it may be from an earlier assembly.');
        check(voter, mode);
      } catch (e) {
        setLast({ kind: 'error', message: (e as Error).message });
        beep(false);
      }
    },
    [a, check, mode],
  );

  if (!a || !el) return <NotFound what="assembly" />;

  const matches = q.trim()
    ? a.voterRoll
        .filter((v) => personKey(`${v.name} ${v.group} ${v.district}`).includes(personKey(q)))
        .slice(0, 8)
    : [];

  return (
    <div className="checkin-page">
      <nav aria-label="breadcrumb" className="no-print">
        <ul>
          <li>
            <Link to={`/a/${a.id}`}>{a.name}</Link>
          </li>
          <li>Check-in desk</li>
        </ul>
      </nav>

      <div className="row-between wrap">
        <h2 style={{ margin: 0 }}>Check-in desk</h2>
        <div className="row wrap">
          <div role="group" aria-label="Mode">
            <button className={mode === 'in' ? '' : 'outline secondary'} aria-pressed={mode === 'in'} onClick={() => setMode('in')}>
              Checking in
            </button>
            <button className={mode === 'out' ? '' : 'outline secondary'} aria-pressed={mode === 'out'} onClick={() => setMode('out')}>
              Checking out
            </button>
          </div>
          <Link role="button" className="outline secondary" to={`/a/${a.id}/voters`}>
            Roll call
          </Link>
          <Link role="button" className="outline secondary" to={`/a/${a.id}/ballots`}>
            Print cards
          </Link>
        </div>
      </div>

      <div className="stat-row">
        <div className="stat">
          <span>Checked in</span>
          <strong>{el.present}</strong>
        </div>
        {CHANNELS.map((ch) => (
          <div className="stat" key={ch}>
            <span>Voting — {CHANNEL_LABEL[ch]}</span>
            <strong>{el.byChannel[ch]}</strong>
          </div>
        ))}
        <div className="stat">
          <span>Voting total</span>
          <strong>{el.total}</strong>
        </div>
        <div className="stat">
          <span>Still to arrive</span>
          <strong>{a.voterRoll.length - el.present}</strong>
        </div>
      </div>

      <div className="grid-2">
        <article className="panel">
          <header>
            <h3 style={{ margin: 0 }}>Scan a voting card</h3>
          </header>
          {scanning ? (
            <QrScanner continuous onResult={onScan} onClose={() => setScanning(false)} closeLabel="Stop scanning" />
          ) : (
            <>
              <p className="muted">
                Hold the card up to the camera. The desk keeps scanning, so people can file past one after another. Cards are printed from{' '}
                <Link to={`/a/${a.id}/ballots`}>Print → Voting cards</Link>.
              </p>
              <button onClick={() => setScanning(true)}>📷 Start scanning</button>
            </>
          )}

          <hr />
          <label>
            …or find the name
            <input
              ref={searchRef}
              type="search"
              placeholder="Type a name, group or district"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoComplete="off"
            />
          </label>
          {matches.length > 0 && (
            <ul className="checkin-matches">
              {matches.map((v) => (
                <li key={v.id}>
                  <button
                    className={v.present && mode === 'in' ? 'outline secondary' : ''}
                    onClick={() => {
                      check(v, mode);
                      setQ('');
                      searchRef.current?.focus();
                    }}
                  >
                    {v.name}
                    <span className="sub muted">
                      {' '}
                      {[a.roles.find((r) => r.id === v.roleId)?.name, v.group || v.district].filter(Boolean).join(' · ')}
                      {v.present ? ' · already here' : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {q.trim() && matches.length === 0 && (
            <p className="muted">
              Nobody on the roll matches. Add them on the <Link to={`/a/${a.id}/voters`}>roll call page</Link>.
            </p>
          )}
        </article>

        <article className={`panel checkin-result ${last?.kind === 'ok' ? 'good' : last ? 'bad' : ''}`}>
          {!last && <p className="muted">Scans and check-ins appear here.</p>}
          {last?.kind === 'ok' && (
            <>
              <div className="checkin-name">{last.voter.name}</div>
              <div className="checkin-role">
                {last.role}
                {last.voter.group || last.voter.district ? ` · ${last.voter.group || last.voter.district}` : ''} ·{' '}
                {CHANNEL_LABEL[last.voter.channel]}
              </div>
              {last.mode === 'in' ? (
                last.votes ? (
                  <Badge kind="ok">Checked in — has a vote</Badge>
                ) : (
                  <>
                    <Badge kind="warn">Checked in — does not vote</Badge>
                    {last.reason && <p className="sub muted">{last.reason}</p>}
                  </>
                )
              ) : (
                <Badge kind="info">Checked out</Badge>
              )}
              <button className="outline secondary" onClick={() => check(last.voter, last.mode === 'in' ? 'out' : 'in')}>
                Undo
              </button>
            </>
          )}
          {last?.kind === 'already' && (
            <>
              <div className="checkin-name">{last.voter.name}</div>
              <Badge kind="info">Already checked in{last.at ? ` at ${new Date(last.at).toLocaleTimeString()}` : ''}</Badge>
              <button className="outline secondary" onClick={() => check(last.voter, 'out')}>
                Check out instead
              </button>
            </>
          )}
          {last?.kind === 'error' && (
            <>
              <div className="checkin-name">Card not recognised</div>
              <p className="warn-box">{last.message}</p>
            </>
          )}
          {history.length > 0 && (
            <ul className="checkin-history">
              {history.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          )}
        </article>
      </div>
    </div>
  );
}
