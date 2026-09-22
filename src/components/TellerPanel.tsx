import { useCallback, useMemo, useState } from 'react';
import { AGAINST, CHANNEL_LABEL, CHANNELS, type Assembly, type Channel, type DraftBallot, type Position } from '../engine/types';
import { decodeResult, tellerUrl, type TellerSetup } from '../engine/tellerCodes';
import { parsePoll, type PollImportResult } from '../engine/pollImport';
import { ballotColor } from '../presets';
import { pollExample, saveCsv } from '../templates';
import { useStore } from '../store';
import { nameOf } from '../announce';
import { ordinal } from '../engine/thirdLegacy';
import { QrCode, QrScanner } from './Qr';
import { attempt, confirmAction, notify } from './ui';

/**
 * Counting with several tellers: each teller counts a stack of ballots (or the virtual poll)
 * on their own device and sends back a report code that is added here.
 */
export function TellerPanel({
  assembly,
  position,
  number,
  options,
  isConfirmation,
  draft,
  ensureKey,
}: {
  assembly: Assembly;
  position: Position;
  number: number;
  options: string[];
  isConfirmation: boolean;
  draft: DraftBallot;
  ensureKey: () => string;
}) {
  const s = useStore();
  const [channel, setChannel] = useState<Channel>('inPerson');
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const reports = draft.tellerReports ?? [];

  const label = (id: string) => (id === AGAINST ? 'No' : isConfirmation ? `Yes — ${nameOf(position, id)}` : nameOf(position, id));
  const color = ballotColor(assembly.ballotColors, number);

  const url = useMemo(() => {
    if (!showQr) return '';
    const setup: TellerSetup = {
      v: 1,
      k: draft.key ?? '',
      a: assembly.name,
      p: position.title,
      n: number,
      ch: channel,
      conf: isConfirmation,
      o: options.map((o) => [o, label(o)]),
      col: color?.name,
    };
    return tellerUrl(setup);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showQr, draft.key, assembly.name, position.title, number, channel, isConfirmation, options.join('|'), color?.name]);

  const addCode = useCallback(
    (text: string) => {
      try {
        const r = decodeResult(text);
        const key = ensureKey();
        if (r.k !== key) throw new Error('This report was counted for a different ballot (or before the counts were cleared). Ask the teller to open the current link.');
        if (r.c.length !== options.length) throw new Error('This report does not match the candidates on this ballot.');
        const votes: Record<string, number> = {};
        options.forEach((o, i) => (votes[o] = r.c[i]));
        const total = r.c.reduce((a, b) => a + b, 0) + r.i;
        attempt(
          () => s.addTellerReport(assembly.id, position.id, { id: r.r, teller: r.t, channel: r.ch, source: 'device', votes, invalid: r.i }),
          `Added ${total} ballot(s) from ${r.t || 'teller'} (${CHANNEL_LABEL[r.ch]}).`,
        );
        setCode('');
      } catch (e) {
        notify((e as Error).message, 'error');
      }
    },
    [assembly.id, position.id, options, s, ensureKey],
  );

  return (
    <details className="panel-lite">
      <summary>
        Teller devices &amp; virtual poll import {reports.length > 0 && <span className="badge badge-info">{reports.length} report(s)</span>}
      </summary>

      <div className="grid-2">
        <section>
          <h6>1 · Tellers count on their own phones</h6>
          <p className="muted small">
            Each teller scans this code (or opens the link), taps once per ballot in their stack, then shows you their report code. Use one link per
            channel. Nothing is sent over the internet — the report is just a code.
          </p>
          <div role="group" className="channel-toggle">
            {CHANNELS.map((ch) => (
              <button
                key={ch}
                className={channel === ch ? '' : 'outline secondary'}
                aria-pressed={channel === ch}
                onClick={() => setChannel(ch)}
              >
                {CHANNEL_LABEL[ch]}
              </button>
            ))}
          </div>
          {!showQr ? (
            <button
              className="outline"
              onClick={() => {
                ensureKey();
                setShowQr(true);
              }}
            >
              Show teller QR code
            </button>
          ) : (
            <div className="stack">
              <QrCode text={url} label="Teller link QR code" />
              <div className="row">
                <button
                  className="outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(url);
                      notify('Teller link copied.', 'success');
                    } catch {
                      notify('Copy failed — long-press the QR code or share the page instead.', 'error');
                    }
                  }}
                >
                  Copy teller link
                </button>
                <button className="outline secondary" onClick={() => setShowQr(false)}>
                  Hide
                </button>
              </div>
            </div>
          )}
        </section>

        <section>
          <h6>2 · Add a teller’s report</h6>
          <textarea rows={2} placeholder="Paste the report code (starts with TLR1.)" value={code} onChange={(e) => setCode(e.target.value)} />
          <div className="row">
            <button disabled={!code.trim()} onClick={() => addCode(code)}>
              Add report
            </button>
            <button className="outline" onClick={() => setScanning((x) => !x)}>
              {scanning ? 'Stop scanning' : 'Scan QR with camera'}
            </button>
          </div>
          {scanning && (
            <QrScanner
              onResult={(text) => {
                setScanning(false);
                addCode(text);
              }}
              onClose={() => setScanning(false)}
            />
          )}
        </section>
      </div>

      <PollImport assembly={assembly} position={position} number={number} options={options} label={label} />

      {reports.length > 0 && (
        <div className="table-scroll">
          <table className="entry-table">
            <thead>
              <tr>
                <th>Report</th>
                <th>Channel</th>
                {options.map((o) => (
                  <th key={o} className="num">
                    {label(o)}
                  </th>
                ))}
                <th className="num">Invalid</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.source === 'poll' ? '📊 ' : '📱 '}
                    {r.teller || 'Teller'}
                    {r.detail && <div className="sub muted">{r.detail}</div>}
                  </td>
                  <td>{CHANNEL_LABEL[r.channel]}</td>
                  {options.map((o) => (
                    <td key={o} className="num">
                      {r.votes[o] ?? 0}
                    </td>
                  ))}
                  <td className="num">{r.invalid}</td>
                  <td>
                    <button
                      className="outline danger mini"
                      onClick={async () => {
                        if (await confirmAction({ title: 'Remove this report?', body: <p>Its counts are subtracted from this ballot.</p>, danger: true, confirmLabel: 'Remove' }))
                          s.removeTellerReport(assembly.id, position.id, r.id);
                      }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="sub muted">Reports are added into the counts above. You can still adjust the counts by hand.</p>
        </div>
      )}
    </details>
  );
}

function PollImport({
  assembly,
  position,
  number,
  options,
  label,
}: {
  assembly: Assembly;
  position: Position;
  number: number;
  options: string[];
  label: (id: string) => string;
}) {
  const s = useStore();
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [column, setColumn] = useState<number | undefined>(undefined);
  const [question, setQuestion] = useState<string | null>(null);

  const result: PollImportResult | { error: string } | null = useMemo(() => {
    if (!text.trim()) return null;
    try {
      return parsePoll(
        text,
        options.map((o) => ({ id: o, name: o === AGAINST ? 'No' : nameOf(position, o) })),
        { column, question },
      );
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [text, options, position, column, question]);

  const apply = () => {
    if (!result || 'error' in result) return;
    const ok = attempt(
      () =>
        s.addTellerReport(assembly.id, position.id, {
          // Derived from the contents, so re-importing the same file replaces rather than doubles.
          id: `poll-${result.signature}`,
          teller: fileName || 'Virtual poll',
          channel: 'virtual',
          source: 'poll',
          votes: result.votes,
          invalid: result.invalid,
          detail: `${result.responses} response(s)${result.duplicatesRemoved ? `, ${result.duplicatesRemoved} repeat(s) not counted` : ''}${result.question ? `; question “${result.question}”` : ''}`,
        }),
      'Virtual poll results added.',
    );
    if (ok) {
      setText('');
      setFileName('');
      setColumn(undefined);
      setQuestion(null);
    }
  };

  return (
    <section className="poll-import">
      <h6>3 · Import virtual poll results (CSV)</h6>
      <p className="muted small">
        Download the poll report from your meeting platform (e.g. Zoom <em>Reports → Poll report</em>, Google Forms or Microsoft Forms responses) and
        load it here. The answer column is found automatically; each participant is counted once (their latest answer). Answers with more than one name
        or an unknown name count as invalid.
      </p>
      <div className="row wrap">
        <input
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setFileName(f.name);
            setColumn(undefined);
            setQuestion(null);
            setText((await f.text()).replace(/^﻿/, ''));
            e.target.value = '';
          }}
        />
        <button
          className="outline secondary mini"
          onClick={() =>
            saveCsv(
              pollExample(
                position,
                number,
                options.filter((o) => o !== AGAINST).map((o) => nameOf(position, o)),
              ),
              'example-poll-export.csv',
            )
          }
          title="See the format a meeting-platform poll export should have"
        >
          Example file
        </button>
      </div>
      {result && 'error' in result && <p className="warn-box">{result.error}</p>}
      {result && !('error' in result) && (
        <div className="poll-preview">
          <div className="grid">
            {result.columns.length > 1 && (
              <label>
                Answer column
                <select value={result.answerColumnIndex} onChange={(e) => setColumn(Number(e.target.value))}>
                  {result.columns.map((c) => (
                    <option key={c.index} value={c.index}>
                      {c.header} ({c.hits})
                    </option>
                  ))}
                </select>
              </label>
            )}
            {result.questions.length > 1 && (
              <label>
                Poll question (the report has several)
                <select value={question ?? result.question ?? ''} onChange={(e) => setQuestion(e.target.value)}>
                  {result.questions.map((q) => (
                    <option key={q} value={q}>
                      {q}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <ul>
            {options.map((o) => (
              <li key={o}>
                <strong>{label(o)}</strong>: {result.votes[o] ?? 0}
              </li>
            ))}
            <li>
              Invalid / unrecognised: {result.invalid}
              {result.unmatched.length > 0 && <span className="sub muted"> — {result.unmatched.join(', ')}</span>}
            </li>
            <li>
              <strong>Total counted: {Object.values(result.votes).reduce((x, y) => x + y, 0) + result.invalid}</strong> of {result.responses} response(s)
            </li>
          </ul>
          {result.dedupeNote && <div className={result.dedupeDisabled ? 'warn-box' : 'ok-box'}>{result.dedupeNote}</div>}
          {result.questionAmbiguous && (
            <div className="warn-box">
              This file contains {result.questions.length} polls. Choose the one for the {ordinal(number)} ballot of {position.title} above before adding
              it.
            </div>
          )}
          <p className="sub muted">
            Answers read from “{result.answerColumn}”
            {result.identityColumn ? `; participants identified by “${result.identityColumn}”` : ''}
            {result.question ? `; question “${result.question}”` : ''}.
          </p>
          <div className="row">
            <button onClick={apply} disabled={result.questionAmbiguous}>
              Add to Virtual counts
            </button>
            <button
              className="outline secondary"
              onClick={() => {
                setText('');
                setFileName('');
              }}
            >
              Discard
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
