import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useAssembly, useStore } from '../store';
import { computePosition } from '../engine/thirdLegacy';
import type { ElectionType, Language, Officials, Settings } from '../engine/types';
import { PhaseBadge, VotersBar } from '../components/common';
import { confirmAction, notify } from '../components/ui';
import { OpeningScript } from '../components/OpeningScript';
import { BackupPanel } from '../components/BackupPanel';
import { LiveControls } from '../components/LiveControls';
import { exportCsv, exportJson, resultsSummaryText } from '../exporters';
import { DEFAULT_BALLOT_COLORS, PRESETS, ballotColor } from '../presets';
import { LANGUAGES } from '../i18n';
import { NotFound } from './NotFound';
import { displayUrl, openDisplay } from './Display';

export function AssemblyPage() {
  const { aid } = useParams();
  const assembly = useAssembly(aid);
  const s = useStore();
  const [newPos, setNewPos] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  if (!assembly) return <NotFound what="assembly" />;
  const a = assembly;
  const set = (patch: Partial<Settings>) => s.updateSettings(a.id, patch);
  const anyBallots = a.positions.some((p) => p.ballots.length > 0);
  const locked = anyBallots && !unlocked;
  const off = (patch: Partial<Officials>) => s.updateOfficials(a.id, patch);
  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(resultsSummaryText(a));
      notify('Results summary copied — paste it into minutes, a newsletter or an email.', 'success');
    } catch {
      notify('Could not copy automatically.', 'error');
    }
  };

  return (
    <>
      <nav aria-label="breadcrumb">
        <ul>
          <li>
            <Link to="/">Assemblies</Link>
          </li>
          <li>{a.name}</li>
        </ul>
      </nav>

      <div className="row-between wrap">
        <h2 style={{ margin: 0 }}>{a.name}</h2>
        <div className="row wrap">
          <button
            className="outline"
            onClick={async () => {
              if (!openDisplay(a.id)) {
                await confirmAction({
                  title: 'The projector window was blocked',
                  body: (
                    <p>
                      Allow pop-ups for this site, or open this address in a second window:
                      <br />
                      <code>{displayUrl(a.id)}</code>
                    </p>
                  ),
                  confirmLabel: 'OK',
                });
              }
            }}
          >
            📽 Projector display
          </button>
          <Link role="button" className="outline" to={`/a/${a.id}/report`}>
            Report
          </Link>
          <Link role="button" className="outline" to={`/a/${a.id}/voters`}>
            Roll call ({a.voterRoll.filter((v) => v.present).length}/{a.voterRoll.length})
          </Link>
          <Link role="button" className="outline" to={`/a/${a.id}/checkin`}>
            Check-in desk
          </Link>
          <Link role="button" className="outline" to={`/a/${a.id}/badges`}>
            Name badges
          </Link>
          <Link role="button" className="outline" to={`/a/${a.id}/agenda`}>
            Agenda{a.agenda.length ? ` (${a.agenda.length})` : ''}
          </Link>
          <Link role="button" className="outline" to={`/a/${a.id}/motions`}>
            Motions{a.motions.length ? ` (${a.motions.length})` : ''}
          </Link>
          <Link role="button" className="outline" to={`/a/${a.id}/conference`}>
            Conference items{a.conferenceItems.length ? ` (${a.conferenceItems.length})` : ''}
          </Link>
          <Link role="button" className="outline" to={`/a/${a.id}/ballots`}>
            Print
          </Link>
          <button className="outline secondary" onClick={copySummary}>
            Copy summary
          </button>
          <button className="outline secondary" onClick={() => exportJson(a)} title="Save a complete backup you can import later">
            Export (.json)
          </button>
          <button className="outline secondary" onClick={() => exportCsv(a)}>
            Export (.csv)
          </button>
        </div>
      </div>

      <p className="muted">
        {PRESETS[a.electionType].label} · {PRESETS[a.electionType].description}
      </p>

      <VotersBar assembly={a} />

      <OpeningScript assembly={a} title={a.positions.map((p) => p.title).join(', ') || 'trusted servants'} open={!a.approvals.procedure && !anyBallots} />

      <LiveControls assembly={a} />

      <article>
        <header className="row-between">
          <h3 style={{ margin: 0 }}>Positions</h3>
          <small className="muted">Elected in this order. Click a position to run its election.</small>
        </header>
        {a.positions.length === 0 && <p className="muted">Add the first position below.</p>}
        <table className="positions-table">
          <tbody>
            {a.positions.map((p, i) => {
              const st = computePosition(p, a.settings);
              return (
                <tr key={p.id}>
                  <td className="num muted">{i + 1}</td>
                  <td>
                    <Link to={`/a/${a.id}/p/${p.id}`}>
                      <strong>{p.title}</strong>
                    </Link>
                    <div className="sub muted">
                      {p.candidates.length} candidate{p.candidates.length === 1 ? '' : 's'} · {p.ballots.length} ballot{p.ballots.length === 1 ? '' : 's'}
                    </div>
                  </td>
                  <td>
                    <PhaseBadge phase={st.phase} position={p} />
                  </td>
                  <td className="row-end">
                    <div role="group" className="mini-group">
                      <button className="outline secondary" disabled={i === 0} onClick={() => s.movePosition(a.id, p.id, -1)} aria-label="Move up">
                        ↑
                      </button>
                      <button
                        className="outline secondary"
                        disabled={i === a.positions.length - 1}
                        onClick={() => s.movePosition(a.id, p.id, 1)}
                        aria-label="Move down"
                      >
                        ↓
                      </button>
                      <button
                        className="outline secondary"
                        onClick={() => {
                          const t = window.prompt('Rename position', p.title);
                          if (t && t.trim()) s.updatePosition(a.id, p.id, { title: t.trim() });
                        }}
                      >
                        Rename
                      </button>
                      <button
                        className="outline danger"
                        onClick={async () => {
                          if (
                            await confirmAction({
                              title: `Remove ${p.title}?`,
                              body: p.ballots.length ? <p>This position has {p.ballots.length} recorded ballot(s) which will be lost.</p> : undefined,
                              danger: true,
                              confirmLabel: 'Remove',
                            })
                          )
                            s.removePosition(a.id, p.id);
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (newPos.trim()) {
              s.addPosition(a.id, newPos);
              setNewPos('');
            }
          }}
        >
          <input type="text" placeholder="Add a position (e.g. Treasurer)" value={newPos} onChange={(e) => setNewPos(e.target.value)} />
          <button type="submit" disabled={!newPos.trim()}>
            Add position
          </button>
        </form>
      </article>

      <div className="grid-2">
        <article>
          <header>
            <h3 style={{ margin: 0 }}>Assembly details</h3>
          </header>
          <label>
            Name
            <input type="text" value={a.name} onChange={(e) => s.updateAssembly(a.id, { name: e.target.value })} />
          </label>
          <div className="grid">
            <label>
              Date
              <input type="date" value={a.date} onChange={(e) => s.updateAssembly(a.id, { date: e.target.value })} />
            </label>
            <label>
              Chair / facilitator
              <input type="text" value={a.chair} onChange={(e) => s.updateAssembly(a.id, { chair: e.target.value })} />
            </label>
          </div>
          <label>
            Type of election
            <select value={a.electionType} onChange={(e) => s.updateAssembly(a.id, { electionType: e.target.value as ElectionType })}>
              {(Object.keys(PRESETS) as ElectionType[]).map((k) => (
                <option key={k} value={k}>
                  {PRESETS[k].label}
                </option>
              ))}
            </select>
            <small className="muted">Changes the “who votes” wording. Voting roles are edited on the roll call page.</small>
          </label>
          <div className="grid">
            <label>
              Announcements &amp; projector language
              <select value={a.language} onChange={(e) => s.updateAssembly(a.id, { language: e.target.value as Language })}>
                {(Object.keys(LANGUAGES) as Language[]).map((k) => (
                  <option key={k} value={k}>
                    {LANGUAGES[k]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Ballot colours, in order
              <input
                key={a.ballotColors.join(',')}
                type="text"
                defaultValue={a.ballotColors.join(', ')}
                onBlur={(e) => {
                  const colors = e.target.value
                    .split(',')
                    .map((x) => x.trim())
                    .filter(Boolean);
                  // An empty list would leave every round without a colour — keep the defaults.
                  s.updateAssembly(a.id, { ballotColors: colors.length ? colors : [...DEFAULT_BALLOT_COLORS] });
                }}
              />
            </label>
          </div>
          <div className="row wrap swatches">
            {[1, 2, 3, 4, 5].map((n) => {
              const c = ballotColor(a.ballotColors, n);
              return c ? (
                <span key={n} className="ballot-color">
                  <span className="swatch" style={{ background: c.swatch }} /> {n}: {c.name}
                </span>
              ) : null;
            })}
          </div>
          <label>
            Location / platform
            <input type="text" value={a.location} placeholder="e.g. Community Hall + Zoom" onChange={(e) => s.updateAssembly(a.id, { location: e.target.value })} />
          </label>
          <label>
            Notes
            <textarea rows={3} value={a.notes} onChange={(e) => s.updateAssembly(a.id, { notes: e.target.value })} />
          </label>
        </article>

        <article>
          <header>
            <h3 style={{ margin: 0 }}>Procedure settings</h3>
          </header>
          {locked ? (
            <div className="warn-box">
              <strong>Locked — ballots have been recorded.</strong> The rules must be settled before an election is conducted. Changing them now would
              recalculate every position.{' '}
              <button
                className="outline mini"
                onClick={async () => {
                  const decided = a.positions.filter((p) => computePosition(p, a.settings).phase.kind === 'elected').length;
                  if (
                    await confirmAction({
                      title: 'Unlock the procedure settings?',
                      body: (
                        <p>
                          Every position is recalculated from its recorded ballots. {decided > 0 && `${decided} position(s) already show a result and could change.`}{' '}
                          The Service Manual asks that rule changes be made before an election is conducted — use this only to correct a mistake.
                        </p>
                      ),
                      confirmLabel: 'Unlock',
                      danger: true,
                    })
                  )
                    setUnlocked(true);
                }}
              >
                Unlock to correct a mistake
              </button>
            </div>
          ) : (
            anyBallots && <p className="warn-box">Unlocked — changes recalculate every position and are recorded in the log.</p>
          )}
          <fieldset disabled={locked}>
            <legend>
              <strong>“Total vote”</strong> for ⅔, ⅕ and ⅓
            </legend>
            <label>
              <input type="radio" name="inv" checked={!a.settings.countInvalidInTotal} onChange={() => set({ countInvalidInTotal: false })} />
              Valid votes only — blank / invalid ballots are not counted (most common)
            </label>
            <label>
              <input type="radio" name="inv" checked={a.settings.countInvalidInTotal} onChange={() => set({ countInvalidInTotal: true })} />
              All ballots cast, including blank / invalid
            </label>
          </fieldset>
          <fieldset disabled={locked}>
            <legend>
              <strong>After the 4th ballot</strong>, if candidates tie for the smallest total
            </legend>
            <label>
              <input
                type="radio"
                name="tie4"
                checked={a.settings.fourthBallotLowestTie === 'withdrawAllTied'}
                onChange={() => set({ fourthBallotLowestTie: 'withdrawAllTied' })}
              />
              Withdraw all of them (the top two always remain)
            </label>
            <label>
              <input
                type="radio"
                name="tie4"
                checked={a.settings.fourthBallotLowestTie === 'withdrawNone'}
                onChange={() => set({ fourthBallotLowestTie: 'withdrawNone' })}
              />
              Withdraw none of them
            </label>
          </fieldset>
          <fieldset disabled={locked}>
            <legend>
              <strong>Only one candidate</strong> standing (or left after withdrawals)
            </legend>
            <label>
              <input
                type="radio"
                name="single"
                checked={a.settings.singleCandidate === 'confirmationVote'}
                onChange={() => set({ singleCandidate: 'confirmationVote' })}
              />
              Hold a yes / no ballot — two-thirds “yes” required
            </label>
            <label>
              <input type="radio" name="single" checked={a.settings.singleCandidate === 'autoElect'} onChange={() => set({ singleCandidate: 'autoElect' })} />
              Declare the candidate elected
            </label>
          </fieldset>
          <fieldset disabled={locked}>
            <label>
              <input
                type="checkbox"
                role="switch"
                checked={a.settings.allowMinorityOpinion}
                onChange={(e) => set({ allowMinorityOpinion: e.target.checked })}
              />
              Offer minority opinion / motion to reconsider after the fifth-ballot motion
            </label>
            <label>
              <input type="checkbox" role="switch" checked={a.settings.oneOfficePerPerson} onChange={(e) => set({ oneOfficePerPerson: e.target.checked })} />
              A person already elected cannot stand for another position
            </label>
            <label>
              <input
                type="checkbox"
                role="switch"
                checked={a.displayBreakdown}
                onChange={(e) => s.updateAssembly(a.id, { displayBreakdown: e.target.checked })}
              />
              Show the in-person / virtual split on the projector display
            </label>
          </fieldset>
        </article>
      </div>

      <BackupPanel assembly={a} />

      <article>
        <header>
          <h3 style={{ margin: 0 }}>Election officials</h3>
        </header>
        <p className="muted small">
          Appendix D suggests two non-voting tellers, two ballot collectors and one person to record and tally. For hybrid assemblies add a virtual
          teller who runs the online poll.
        </p>
        <div className="grid">
          <label>
            Secretary (calls the roll)
            <input type="text" value={a.officials.secretary} onChange={(e) => off({ secretary: e.target.value })} />
          </label>
          <label>
            Registrar
            <input type="text" value={a.officials.registrar} onChange={(e) => off({ registrar: e.target.value })} />
          </label>
          <label>
            Recorder / tally keeper
            <input type="text" value={a.officials.recorder} onChange={(e) => off({ recorder: e.target.value })} />
          </label>
        </div>
        <div className="grid">
          <label>
            Tellers (non-voting)
            <input type="text" placeholder="e.g. Maria S., Tom K." value={a.officials.tellers} onChange={(e) => off({ tellers: e.target.value })} />
          </label>
          <label>
            Ballot collectors
            <input type="text" value={a.officials.collectors} onChange={(e) => off({ collectors: e.target.value })} />
          </label>
          <label>
            Virtual teller
            <input type="text" value={a.officials.virtualTeller} onChange={(e) => off({ virtualTeller: e.target.value })} />
          </label>
          <label>
            Tech host
            <input type="text" value={a.officials.techHost} onChange={(e) => off({ techHost: e.target.value })} />
          </label>
        </div>
        <OfficialVoterWarning
          names={[a.officials.tellers, a.officials.collectors, a.officials.recorder, a.officials.virtualTeller].join(',')}
          roll={a.voterRoll}
        />
      </article>
    </>
  );
}

/** Tellers are meant to be non-voting members — flag anyone who is also a checked-in voter. */
function OfficialVoterWarning({ names, roll }: { names: string; roll: { name: string; present: boolean }[] }) {
  const list = names
    .split(/[,;]+/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  const clash = roll.filter((v) => v.present && list.includes(v.name.trim().toLowerCase())).map((v) => v.name);
  if (!clash.length) return null;
  return <p className="warn-box">Also checked in as voters: {clash.join(', ')}. Tellers are usually non-voting members.</p>;
}
