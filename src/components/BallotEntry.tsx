import { useCallback, useEffect, useMemo, useState } from 'react';
import { AGAINST, CHANNEL_LABEL, CHANNELS, type Assembly, type BallotRecord, type Channel, type DraftBallot, type Position } from '../engine/types';
import { ordinal, pct, RULE_LABEL, tallyBallot } from '../engine/thirdLegacy';
import { effectiveVoters, emptyDraft, useStore } from '../store';
import { listNames, nameOf } from '../announce';
import { ballotColor } from '../presets';
import { attempt, Badge, confirmAction, notify, NumberField } from './ui';
import { TellerPanel } from './TellerPanel';

type Mode = 'totals' | 'tally';
const INVALID = '__invalid__';

function readMode(): Mode {
  try {
    return localStorage.getItem('tlv-entry-mode') === 'tally' ? 'tally' : 'totals';
  } catch {
    return 'totals';
  }
}

export function BallotEntry({
  assembly,
  position,
  number,
  activeIds,
  isConfirmation,
}: {
  assembly: Assembly;
  position: Position;
  number: number;
  activeIds: string[];
  isConfirmation: boolean;
}) {
  const setDraft = useStore((s) => s.setDraft);
  const recordBallot = useStore((s) => s.recordBallot);
  const setLiveStatus = useStore((s) => s.setLiveStatus);
  const voters = effectiveVoters(assembly);
  const color = ballotColor(assembly.ballotColors, number);
  const liveHere = assembly.livePositionId === position.id;
  const draft: DraftBallot = position.draft ?? emptyDraft();
  const options = useMemo(() => (isConfirmation ? [...activeIds, AGAINST] : activeIds), [activeIds, isConfirmation]);
  const [mode, setModeState] = useState<Mode>(readMode);
  const [tallyChannel, setTallyChannel] = useState<Channel>('inPerson');

  const setMode = (m: Mode) => {
    setModeState(m);
    try {
      localStorage.setItem('tlv-entry-mode', m);
    } catch {
      /* private mode */
    }
  };

  const update = useCallback(
    (fn: (d: DraftBallot) => void) => {
      // Read the latest draft from the store (not props) so rapid taps never race a re-render.
      const current = useStore
        .getState()
        .assemblies.find((a) => a.id === assembly.id)
        ?.positions.find((p) => p.id === position.id)?.draft;
      const d: DraftBallot = current ? structuredClone(current) : emptyDraft();
      d.key ??= emptyDraft().key;
      fn(d);
      setDraft(assembly.id, position.id, d);
    },
    [assembly.id, position.id, setDraft],
  );

  /** The random key teller devices use to make sure their report belongs to this ballot. */
  const ensureKey = useCallback((): string => {
    const current = useStore
      .getState()
      .assemblies.find((a) => a.id === assembly.id)
      ?.positions.find((p) => p.id === position.id)?.draft;
    if (current?.key) return current.key;
    let key = '';
    update((d) => void (key = d.key!));
    return key;
  }, [assembly.id, position.id, update]);

  const setCount = (ch: Channel, key: string, v: number) =>
    update((d) => {
      if (key === INVALID) d.counts[ch].invalid = v;
      else d.counts[ch].votes[key] = v;
    });

  const tap = useCallback(
    (ch: Channel, key: string) =>
      update((d) => {
        if (key === INVALID) d.counts[ch].invalid = (d.counts[ch].invalid || 0) + 1;
        else d.counts[ch].votes[key] = (d.counts[ch].votes[key] || 0) + 1;
        d.tallyLog.push({ channel: ch, key });
      }),
    [update],
  );

  const undoTap = useCallback(
    () =>
      update((d) => {
        const last = d.tallyLog.pop();
        if (!last) return;
        if (last.key === INVALID) d.counts[last.channel].invalid = Math.max(0, d.counts[last.channel].invalid - 1);
        else d.counts[last.channel].votes[last.key] = Math.max(0, (d.counts[last.channel].votes[last.key] || 0) - 1);
      }),
    [update],
  );

  // Keyboard shortcuts for tellers in click-tally mode.
  useEffect(() => {
    if (mode !== 'tally') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^[1-9]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        if (idx < options.length) {
          e.preventDefault();
          tap(tallyChannel, options[idx]);
        }
      } else if (e.key === '0') {
        e.preventDefault();
        tap(tallyChannel, INVALID);
      } else if (e.key === 'Backspace' || e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undoTap();
      } else if (e.key.toLowerCase() === 'i') {
        setTallyChannel('inPerson');
      } else if (e.key.toLowerCase() === 'v') {
        setTallyChannel('virtual');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, options, tallyChannel, tap, undoTap]);

  // Live preview using the same engine that will record the ballot.
  const preview = useMemo(() => {
    const rec: BallotRecord = {
      id: 'draft',
      counts: {
        inPerson: { votes: Object.fromEntries(options.map((o) => [o, draft.counts.inPerson.votes[o] || 0])), invalid: draft.counts.inPerson.invalid || 0 },
        virtual: { votes: Object.fromEntries(options.map((o) => [o, draft.counts.virtual.votes[o] || 0])), invalid: draft.counts.virtual.invalid || 0 },
      },
      eligibleVoters: { ...voters },
      collected: draft.collected,
      recordedAt: '',
    };
    return tallyBallot(rec, number, activeIds, assembly.settings);
  }, [draft, options, number, activeIds, voters, assembly.settings]);

  const label = (id: string) => (id === AGAINST ? 'No (against)' : isConfirmation ? `Yes — ${nameOf(position, id)}` : nameOf(position, id));

  const onRecord = async () => {
    if (preview.cast.total === 0) {
      notify('No votes entered for this ballot yet.', 'error');
      return;
    }
    const warnings: string[] = [];
    for (const ch of preview.overVote) {
      warnings.push(`${CHANNEL_LABEL[ch]}: ${preview.cast[ch]} ballots but only ${voters[ch]} eligible voters present.`);
    }
    for (const ch of preview.collectedMismatch) {
      warnings.push(`${CHANNEL_LABEL[ch]}: tellers collected ${draft.collected[ch]} ballots but the counts add up to ${preview.cast[ch]}.`);
    }
    const ok = await confirmAction({
      title: `Record the ${ordinal(number)} ballot?`,
      confirmLabel: 'Record ballot',
      body: (
        <>
          <ul>
            {options.map((o) => (
              <li key={o}>
                <strong>{label(o)}</strong>: {preview.votes[o].total} ({preview.votes[o].inPerson} in-person + {preview.votes[o].virtual} virtual)
              </li>
            ))}
            <li>
              Blank / invalid: {preview.invalid.total}
              {!assembly.settings.countInvalidInTotal && ' (not counted in the total vote)'}
            </li>
          </ul>
          <p>
            Total vote <strong>{preview.totalVote}</strong> · two-thirds = <strong>{preview.electThreshold}</strong>
          </p>
          {warnings.length > 0 && (
            <div className="warn-box">
              <strong>Please check:</strong>
              <ul>
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      ),
    });
    if (ok) attempt(() => recordBallot(assembly.id, position.id), `${ordinal(number)} ballot recorded.`);
  };

  const onClear = async () => {
    if (await confirmAction({ title: 'Clear all counts for this ballot?', danger: true, confirmLabel: 'Clear' })) {
      setDraft(assembly.id, position.id, null);
    }
  };

  const pollText = [
    `${position.title} — ${ordinal(number)} ballot${isConfirmation ? ' (confirmation)' : ''}`,
    isConfirmation ? `Do you vote to elect ${nameOf(position, activeIds[0])}?` : 'Vote for ONE candidate:',
    ...(isConfirmation ? ['Yes', 'No'] : activeIds.map((id) => nameOf(position, id))),
  ].join('\n');

  const copyPoll = async () => {
    try {
      await navigator.clipboard.writeText(pollText);
      notify('Poll question copied — paste it into your meeting platform’s poll.', 'success');
    } catch {
      notify('Could not copy automatically. Select the text and copy it manually.', 'error');
    }
  };

  const outcome = (() => {
    if (preview.cast.total === 0) return null;
    if (preview.electedId) return <Badge kind="ok">Would elect {nameOf(position, preview.electedId)}</Badge>;
    if (isConfirmation) return <Badge kind="bad">Would not confirm</Badge>;
    if (preview.autoWithdrawnIds.length && preview.withdrawalRule) {
      return (
        <Badge kind="warn">
          No election · would withdraw {listNames(preview.autoWithdrawnIds.map((id) => nameOf(position, id)))} ({RULE_LABEL[preview.withdrawalRule]})
        </Badge>
      );
    }
    return <Badge kind="info">No election on this count</Badge>;
  })();

  return (
    <article className="panel ballot-entry">
      <header className="row-between wrap">
        <h3 style={{ margin: 0 }}>
          {ordinal(number)} ballot{isConfirmation ? ' — confirmation (yes / no)' : ''}
          {color && (
            <span className="ballot-color" title="Colour-coded paper ballot for this round">
              <span className="swatch" style={{ background: color.swatch }} /> {color.name} ballots
            </span>
          )}
        </h3>
        <div role="group" className="mode-toggle">
          <button className={mode === 'totals' ? '' : 'outline secondary'} onClick={() => setMode('totals')}>
            Enter totals
          </button>
          <button className={mode === 'tally' ? '' : 'outline secondary'} onClick={() => setMode('tally')}>
            Click tally
          </button>
        </div>
      </header>

      <div className="voting-status row wrap">
        <span className="muted">Projector:</span>
        {assembly.live.status === 'voting' && liveHere ? (
          <>
            <Badge kind="ok">Voting open</Badge>
            <button className="secondary" onClick={() => setLiveStatus(assembly.id, 'counting')}>
              Close voting — tellers counting
            </button>
          </>
        ) : assembly.live.status === 'counting' && liveHere ? (
          <>
            <Badge kind="warn">Counting</Badge>
            <button className="outline secondary" onClick={() => setLiveStatus(assembly.id, 'voting')}>
              Reopen voting
            </button>
          </>
        ) : (
          <button
            className="outline"
            onClick={() => {
              useStore.getState().setLivePosition(assembly.id, position.id);
              setLiveStatus(assembly.id, 'voting');
            }}
          >
            Open voting for this ballot
          </button>
        )}
      </div>

      {mode === 'tally' && (
        <section className="tally">
          <div role="group" className="channel-toggle">
            {CHANNELS.map((ch) => (
              <button key={ch} className={tallyChannel === ch ? '' : 'outline secondary'} onClick={() => setTallyChannel(ch)}>
                Counting: {CHANNEL_LABEL[ch]} ({preview.cast[ch]})
              </button>
            ))}
          </div>
          <div className="tally-grid">
            {options.map((o, i) => (
              <button key={o} className={`tally-btn ${o === AGAINST ? 'secondary' : ''}`} onClick={() => tap(tallyChannel, o)}>
                <span className="key">{i + 1}</span>
                <span className="name">{label(o)}</span>
                <span className="count">{(draft.counts[tallyChannel].votes[o] || 0).toString()}</span>
              </button>
            ))}
            <button className="tally-btn contrast outline" onClick={() => tap(tallyChannel, INVALID)}>
              <span className="key">0</span>
              <span className="name">Blank / invalid</span>
              <span className="count">{draft.counts[tallyChannel].invalid || 0}</span>
            </button>
          </div>
          <div className="row-between">
            <small className="muted">
              Keys: 1–{Math.min(9, options.length)} vote · 0 invalid · Backspace/Z undo · I / V switch channel
            </small>
            <button className="outline secondary" onClick={undoTap} disabled={!draft.tallyLog.length}>
              Undo last tap
            </button>
          </div>
        </section>
      )}

      <div className="table-scroll">
        <table className="entry-table">
          <thead>
            <tr>
              <th>{isConfirmation ? 'Choice' : 'Candidate'}</th>
              <th className="num">In-person</th>
              <th className="num">Virtual</th>
              <th className="num">Total</th>
              <th className="num">% of total vote</th>
            </tr>
          </thead>
          <tbody>
            {options.map((o) => (
              <tr key={o} className={preview.electedId === o ? 'row-elected' : preview.autoWithdrawnIds.includes(o) ? 'row-out' : ''}>
                <th scope="row">{label(o)}</th>
                {CHANNELS.map((ch) => (
                  <td key={ch} className="num">
                    <NumberField
                      label={`${label(o)} ${CHANNEL_LABEL[ch]}`}
                      value={draft.counts[ch].votes[o] || 0}
                      onChange={(v) => setCount(ch, o, v ?? 0)}
                    />
                  </td>
                ))}
                <td className="num strong">{preview.votes[o].total}</td>
                <td className="num">{pct(preview.votes[o].total, preview.totalVote)}</td>
              </tr>
            ))}
            <tr className="row-invalid">
              <th scope="row">
                Blank / invalid
                <div className="sub muted">{assembly.settings.countInvalidInTotal ? 'counted in total vote' : 'not counted in total vote'}</div>
              </th>
              {CHANNELS.map((ch) => (
                <td key={ch} className="num">
                  <NumberField label={`Invalid ${CHANNEL_LABEL[ch]}`} value={draft.counts[ch].invalid || 0} onChange={(v) => setCount(ch, INVALID, v ?? 0)} />
                </td>
              ))}
              <td className="num">{preview.invalid.total}</td>
              <td />
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Ballots cast</th>
              {CHANNELS.map((ch) => (
                <td key={ch} className="num">
                  <strong>{preview.cast[ch]}</strong>
                  {voters[ch] > 0 && <span className="sub muted"> / {voters[ch]} present</span>}
                  {preview.overVote.includes(ch) && <div><Badge kind="bad">more than eligible</Badge></div>}
                </td>
              ))}
              <td className="num strong">{preview.cast.total}</td>
              <td />
            </tr>
            <tr>
              <th scope="row">
                Ballots collected <span className="sub muted">(optional cross-check)</span>
              </th>
              {CHANNELS.map((ch) => (
                <td key={ch} className="num">
                  <NumberField
                    allowNull
                    label={`Ballots collected ${CHANNEL_LABEL[ch]}`}
                    value={draft.collected[ch]}
                    onChange={(v) => update((d) => void (d.collected[ch] = v))}
                  />
                  {preview.collectedMismatch.includes(ch) && <Badge kind="bad">≠ counted</Badge>}
                </td>
              ))}
              <td />
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="preview-line">
        <span>
          Total vote <strong>{preview.totalVote}</strong> · two-thirds = <strong>{preview.electThreshold}</strong>
          {preview.withdrawalLimit !== null && (
            <>
              {' '}
              · {preview.withdrawalRule === 'oneFifth' ? 'one-fifth' : 'one-third'} = <strong>{preview.withdrawalLimit.toFixed(2).replace(/\.00$/, '')}</strong>
            </>
          )}
        </span>
        {outcome}
      </div>

      <TellerPanel
        assembly={assembly}
        position={position}
        number={number}
        options={options}
        isConfirmation={isConfirmation}
        draft={draft}
        ensureKey={ensureKey}
      />

      <label>
        Teller note (optional)
        <input type="text" value={draft.note} placeholder="e.g. 2 ballots with two names ruled invalid" onChange={(e) => update((d) => void (d.note = e.target.value))} />
      </label>

      <details>
        <summary>Virtual voting — poll text for your meeting platform</summary>
        <p className="muted">
          Create a single-choice, anonymous poll with these options. When the poll closes, enter its results in the <em>Virtual</em> column.
        </p>
        <pre className="poll-text">{pollText}</pre>
        <button className="outline" onClick={copyPoll}>
          Copy poll text
        </button>
      </details>

      <footer className="row-end">
        <button className="outline secondary" onClick={onClear}>
          Clear counts
        </button>
        <button onClick={onRecord}>Record {ordinal(number)} ballot</button>
      </footer>
    </article>
  );
}
