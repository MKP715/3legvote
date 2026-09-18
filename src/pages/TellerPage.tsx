import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { nanoid } from 'nanoid';
import { decodeSetup, encodeResult, type TellerSetup } from '../engine/tellerCodes';
import { CHANNEL_LABEL } from '../engine/types';
import { ordinal } from '../engine/thirdLegacy';
import { COLOR_SWATCH } from '../presets';
import { QrCode } from '../components/Qr';
import { confirmAction, notify } from '../components/ui';

interface Saved {
  counts: number[];
  invalid: number;
  log: number[]; // -1 = invalid
  teller: string;
  reportId: string;
  finished: boolean;
}

const storeKey = (k: string) => `tlv-teller-${k}`;

/**
 * Counting screen for a teller's own phone/laptop. Opened from the QR code on the chair's
 * screen; works offline; produces a report code for the chair.
 */
export function TellerPage() {
  const { code } = useParams();
  const setup: TellerSetup | { error: string } = useMemo(() => {
    try {
      return decodeSetup(code ?? '');
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [code]);

  const [st, setSt] = useState<Saved | null>(null);

  useEffect(() => {
    if ('error' in setup) return;
    let saved: Saved | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(storeKey(setup.k + setup.ch)) ?? 'null');
    } catch {
      saved = null;
    }
    if (!saved || saved.counts.length !== setup.o.length) {
      saved = { counts: setup.o.map(() => 0), invalid: 0, log: [], teller: localStorage.getItem('tlv-teller-name') ?? '', reportId: nanoid(10), finished: false };
    }
    setSt(saved);
  }, [setup]);

  useEffect(() => {
    if (!st || 'error' in setup) return;
    try {
      localStorage.setItem(storeKey(setup.k + setup.ch), JSON.stringify(st));
      localStorage.setItem('tlv-teller-name', st.teller);
    } catch {
      /* private mode */
    }
  }, [st, setup]);

  if ('error' in setup) {
    return (
      <main className="container teller">
        <h2>Teller link problem</h2>
        <p>{setup.error}</p>
        <p>Ask the chair to show the teller QR code again.</p>
      </main>
    );
  }
  if (!st) return null;

  const total = st.counts.reduce((a, b) => a + b, 0) + st.invalid;
  const tap = (i: number) => {
    if (st.finished) return;
    navigator.vibrate?.(15);
    setSt({
      ...st,
      counts: i >= 0 ? st.counts.map((c, j) => (j === i ? c + 1 : c)) : st.counts,
      invalid: i < 0 ? st.invalid + 1 : st.invalid,
      log: [...st.log, i],
    });
  };
  const undo = () => {
    if (st.finished || !st.log.length) return;
    const i = st.log[st.log.length - 1];
    setSt({
      ...st,
      counts: i >= 0 ? st.counts.map((c, j) => (j === i ? Math.max(0, c - 1) : c)) : st.counts,
      invalid: i < 0 ? Math.max(0, st.invalid - 1) : st.invalid,
      log: st.log.slice(0, -1),
    });
  };

  const result = encodeResult({ v: 1, k: setup.k, r: st.reportId, t: st.teller.trim(), ch: setup.ch, c: st.counts, i: st.invalid });
  const swatch = setup.col ? COLOR_SWATCH[setup.col.toLowerCase()] : undefined;

  return (
    <main className="container teller">
      <header className="teller-head">
        <div className="muted small">{setup.a}</div>
        <h2 style={{ margin: 0 }}>
          {setup.p} — {ordinal(setup.n)} ballot{setup.conf ? ' (yes/no)' : ''}
        </h2>
        <div className="row wrap">
          <span className="badge badge-info">Counting: {CHANNEL_LABEL[setup.ch]}</span>
          {setup.col && (
            <span className="ballot-color">
              <span className="swatch" style={{ background: swatch ?? '#e5e7eb' }} /> {setup.col} ballots
            </span>
          )}
        </div>
      </header>

      <label>
        Your name (teller)
        <input type="text" value={st.teller} disabled={st.finished} onChange={(e) => setSt({ ...st, teller: e.target.value })} placeholder="e.g. Teller 1 — Maria" />
      </label>

      {!st.finished ? (
        <>
          <div className="teller-grid">
            {setup.o.map(([, label], i) => (
              <button key={i} className="tally-btn" onClick={() => tap(i)}>
                <span className="name">{label}</span>
                <span className="count">{st.counts[i]}</span>
              </button>
            ))}
            <button className="tally-btn contrast outline" onClick={() => tap(-1)}>
              <span className="name">Blank / invalid</span>
              <span className="count">{st.invalid}</span>
            </button>
          </div>
          <p className="muted small">Tap once for each ballot. Two names, illegible, or a name not on the board = invalid.</p>
          <div className="row-between">
            <strong>Ballots counted: {total}</strong>
            <button className="outline secondary" onClick={undo} disabled={!st.log.length}>
              Undo last
            </button>
          </div>
          <button
            className="finish"
            disabled={!st.teller.trim() || total === 0}
            onClick={async () => {
              if (await confirmAction({ title: `Finish with ${total} ballot(s)?`, body: <p>You’ll get a report code to give the chair.</p>, confirmLabel: 'Finish' }))
                setSt({ ...st, finished: true });
            }}
          >
            Finish &amp; show report
          </button>
          {!st.teller.trim() && <p className="sub muted">Enter your name to finish.</p>}
        </>
      ) : (
        <section className="stack">
          <h3>Report for the chair</h3>
          <ul>
            {setup.o.map(([, label], i) => (
              <li key={i}>
                <strong>{label}</strong>: {st.counts[i]}
              </li>
            ))}
            <li>Blank / invalid: {st.invalid}</li>
            <li>
              <strong>Total: {total}</strong>
            </li>
          </ul>
          <p>Let the chair scan this code, or copy the text and send it to them.</p>
          <QrCode text={result} size={260} label="Report QR code" />
          <textarea readOnly rows={3} value={result} onFocus={(e) => e.currentTarget.select()} />
          <div className="row wrap">
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(result);
                  notify('Report code copied.', 'success');
                } catch {
                  notify('Select the text and copy it manually.', 'error');
                }
              }}
            >
              Copy report code
            </button>
            {'share' in navigator && (
              <button className="outline" onClick={() => navigator.share({ text: result }).catch(() => undefined)}>
                Share…
              </button>
            )}
            <button className="outline secondary" onClick={() => setSt({ ...st, finished: false })}>
              Keep counting
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
