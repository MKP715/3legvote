import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useAssembly, useStore } from '../store';
import { computePosition, effectiveMotion, METHOD_LABEL, ordinal } from '../engine/thirdLegacy';
import { ballotAnnouncement, nameOf, nextStepAnnouncement } from '../announce';
import { Board } from '../components/Board';
import { BallotChart } from '../components/BallotChart';
import { BallotEntry } from '../components/BallotEntry';
import { MotionPanel } from '../components/MotionPanel';
import { HatPanel } from '../components/HatPanel';
import { CandidateSetup } from '../components/CandidateSetup';
import { PhaseBadge, VotersBar } from '../components/common';
import { attempt, Badge, confirmAction, notify } from '../components/ui';
import { NotFound } from './NotFound';
import { displayUrl, openDisplay } from './Display';
import { Stepper } from '../components/Stepper';
import { OpeningScript } from '../components/OpeningScript';
import { LiveControls } from '../components/LiveControls';
import { LANGUAGES } from '../i18n';

export function PositionPage() {
  const { aid, pid } = useParams();
  const assembly = useAssembly(aid);
  const s = useStore();
  const nav = useNavigate();
  const position = assembly?.positions.find((p) => p.id === pid);
  const state = useMemo(() => (assembly && position ? computePosition(position, assembly.settings) : null), [assembly, position]);

  if (!assembly || !position || !state) return <NotFound what="position" />;

  const idx = assembly.positions.indexOf(position);
  const prev = assembly.positions[idx - 1];
  const next = assembly.positions[idx + 1];
  const phase = state.phase;
  const lastResult = state.ballots[state.ballots.length - 1];
  const lastMotion = effectiveMotion(position);
  const isLive = assembly.livePositionId === position.id;

  const canWithdraw = phase.kind === 'ballot' || phase.kind === 'motion';
  const standing = position.candidates.filter((c) => state.status[c.id]?.kind === 'standing');
  const withdrawnSinceLast = position.candidates.filter((c) => c.withdrawnBeforeBallot === position.ballots.length + 1);

  const withdraw = async (cid: string) => {
    const name = nameOf(position, cid);
    const d = position.draft;
    const countingNow =
      !!d && (['inPerson', 'virtual'] as const).some((ch) => Object.values(d.counts[ch].votes).some((n) => n > 0) || d.counts[ch].invalid > 0);
    if (
      await confirmAction({
        title: `${name} withdraws voluntarily?`,
        body: (
          <>
            <p>{name} comes off the board from the next ballot.</p>
            {countingNow && (
              <p className="sub muted">
                The tellers are already counting the {ordinal(position.ballots.length + 1)} ballot, so {name}’s votes on that ballot still count towards
                the total vote — they come off the board for the ballot after it.
              </p>
            )}
          </>
        ),
        confirmLabel: 'Withdraw',
        danger: true,
      })
    ) {
      attempt(() => s.withdrawCandidate(assembly.id, position.id, cid), `${name} has withdrawn.`);
    }
  };

  const undoBallot = async () => {
    if (
      await confirmAction({
        title: `Undo the ${ordinal(position.ballots.length)} ballot?`,
        body: <p>The ballot’s counts are removed so they can be re-entered. This is recorded in the log.</p>,
        confirmLabel: 'Undo ballot',
        danger: true,
      })
    ) {
      attempt(() => s.undoLastBallot(assembly.id, position.id), 'Ballot removed.');
    }
  };

  const reset = async () => {
    if (
      await confirmAction({
        title: `Reset ${position.title}?`,
        body: <p>All ballots, motions and draws for this position are discarded and nominations reopen. The audit log keeps a record.</p>,
        confirmLabel: 'Reset position',
        danger: true,
      })
    ) {
      attempt(() => s.resetPosition(assembly.id, position.id), 'Position reset.');
    }
  };

  const showReconsider =
    assembly.settings.allowMinorityOpinion &&
    !!lastMotion &&
    lastMotion.kind === 'vote' &&
    ((phase.kind === 'hat' && phase.reason === 'motionDefeated') || (phase.kind === 'ballot' && phase.number === 5 && position.ballots.length === 4));

  return (
    <div className="position-page">
      <nav aria-label="breadcrumb">
        <ul>
          <li>
            <Link to={`/a/${assembly.id}`}>{assembly.name}</Link>
          </li>
          <li>{position.title}</li>
        </ul>
      </nav>

      <div className="row-between wrap">
        <h2 style={{ margin: 0 }}>
          {position.title} <PhaseBadge phase={phase} position={position} />
        </h2>
        <div className="row wrap">
          {prev && (
            <Link role="button" className="outline secondary" to={`/a/${assembly.id}/p/${prev.id}`}>
              ← {prev.title}
            </Link>
          )}
          {next && (
            <Link role="button" className="outline secondary" to={`/a/${assembly.id}/p/${next.id}`}>
              {next.title} →
            </Link>
          )}
          <button
            className={isLive ? '' : 'outline'}
            onClick={async () => {
              s.setLivePosition(assembly.id, position.id);
              if (!openDisplay(assembly.id)) {
                await confirmAction({
                  title: 'The projector window was blocked',
                  body: (
                    <p>
                      Allow pop-ups for this site, or open this address in a second window:
                      <br />
                      <code>{displayUrl(assembly.id)}</code>
                    </p>
                  ),
                  confirmLabel: 'OK',
                });
              }
            }}
            title="Show this position on the projector / shared-screen display"
          >
            📽 {isLive ? 'On display' : 'Show on display'}
          </button>
        </div>
      </div>
      {position.description && <p className="muted">{position.description}</p>}

      <Stepper position={position} state={state} />

      <VotersBar assembly={assembly} />

      {phase.kind === 'setup' && (
        <>
          <OpeningScript assembly={assembly} title={position.title} open={idx === 0 && !assembly.approvals.procedure} />
          <CandidateSetup assembly={assembly} position={position} />
        </>
      )}

      {phase.kind !== 'setup' && (
        <section className="announce">
          <h4>
            Chair’s announcement{assembly.language !== 'en' && ` (${LANGUAGES[assembly.language]})`}
          </h4>
          {lastResult && (
            <div className="announce-block">
              {ballotAnnouncement(position, lastResult, assembly.language).map((l, i) => (
                <p key={i}>{l}</p>
              ))}
            </div>
          )}
          <div className="announce-block next">
            {nextStepAnnouncement(position, state, assembly.language).map((l, i) => (
              <p key={i}>{l}</p>
            ))}
          </div>
        </section>
      )}

      <LiveControls assembly={assembly} />

      {state.ignoredBallots > 0 && (
        <div className="warn-box">
          {state.ignoredBallots} recorded ballot(s) were not used because the election was already decided or the procedure did not allow them. Open
          <strong> Corrections</strong> below and undo in reverse order — the hat draw first, then the fifth-ballot motion, then the ballots.
        </div>
      )}

      {phase.kind === 'elected' && (
        <article className="panel elected-panel">
          <p className="elected-label">Elected {position.title}</p>
          <p className="elected-name">{nameOf(position, phase.candidateId)}</p>
          <p className="muted">
            {METHOD_LABEL[phase.method]}
            {phase.ballotNumber ? ` on the ${ordinal(phase.ballotNumber)} ballot` : ''}
            {phase.method === 'hatSecondDraw' && position.appointment ? ` of ${position.appointment.fromPositionTitle}` : ''}.
            {position.hat && ` Draw order: ${position.hat.order.map((id, i) => `${i + 1}. ${nameOf(position, id)}`).join(' · ')} (${position.hat.mode} draw).`}
          </p>
          <div className="row wrap center">
            {next && (
              <Link role="button" to={`/a/${assembly.id}/p/${next.id}`}>
                Continue to {next.title} →
              </Link>
            )}
            <button
              className="outline secondary"
              title="For bodies that elect several people to the same office (e.g. at-large members): runs another Third Legacy election with the remaining candidates"
              onClick={() => {
                const id = s.addSeat(assembly.id, position.id);
                if (id) nav(`/a/${assembly.id}/p/${id}`);
                else notify('Could not add another seat for this office.', 'error');
              }}
            >
              Elect another seat for this office
            </button>
          </div>
        </article>
      )}

      {phase.kind === 'notElected' && (
        <article className="panel">
          <p>
            <Badge kind="bad">Not elected</Badge> {phase.reason}
          </p>
        </article>
      )}

      {phase.kind === 'noCandidates' && (
        <article className="panel">
          <p>All candidates have withdrawn. Reset the position to reopen nominations.</p>
        </article>
      )}

      {phase.kind === 'ballot' && (
        <BallotEntry
          key={`${position.id}-${phase.number}`}
          assembly={assembly}
          position={position}
          number={phase.number}
          activeIds={phase.activeIds}
          isConfirmation={phase.isConfirmation}
        />
      )}

      {phase.kind === 'motion' && <MotionPanel assembly={assembly} position={position} mode="vote" />}

      {showReconsider && <MotionPanel assembly={assembly} position={position} mode="reconsider" />}

      {phase.kind === 'hat' && <HatPanel assembly={assembly} position={position} poolIds={phase.poolIds} reason={phase.reason} />}

      {canWithdraw && standing.length > 0 && (
        <details className="panel-lite">
          <summary>Voluntary withdrawals</summary>
          <p className="muted">A candidate may withdraw at any time before the next ballot. Withdrawn names are removed from the board.</p>
          <div className="row wrap">
            {standing.map((c) => (
              <button key={c.id} className="outline secondary" onClick={() => withdraw(c.id)}>
                {c.name} withdraws
              </button>
            ))}
          </div>
          {withdrawnSinceLast.length > 0 && (
            <div className="row wrap">
              <span className="muted">Take back a withdrawal made since the last ballot:</span>
              {withdrawnSinceLast.map((c) => (
                <button
                  key={c.id}
                  className="outline"
                  onClick={() => attempt(() => s.reinstateCandidate(assembly.id, position.id, c.id), `${c.name} is back on the board.`)}
                >
                  Reinstate {c.name}
                </button>
              ))}
            </div>
          )}
        </details>
      )}

      {phase.kind !== 'setup' && (
        <section>
          <h3>The board</h3>
          <Board position={position} state={state} breakdown />
          {lastResult && (
            <>
              <h4>{ordinal(lastResult.number)} ballot</h4>
              <BallotChart position={position} result={lastResult} />
            </>
          )}
          {state.ballots.some((b) => b.overVote.length || b.collectedMismatch.length) && (
            <div className="warn-box">
              {state.ballots.map((b) =>
                [
                  ...b.overVote.map((ch) => `${ordinal(b.number)} ballot: more ${ch === 'inPerson' ? 'in-person' : 'virtual'} ballots (${b.cast[ch]}) than eligible voters present (${b.eligibleVoters[ch]}).`),
                  ...b.collectedMismatch.map((ch) => `${ordinal(b.number)} ballot: ${ch === 'inPerson' ? 'in-person' : 'virtual'} ballots collected did not match the count.`),
                ].map((t) => <div key={t}>⚠ {t}</div>),
              )}
            </div>
          )}
          {position.motionVotes.length > 0 && (
            <>
              <h4>Fifth-ballot motion</h4>
              <ul>
                {position.motionVotes.map((m) => (
                  <li key={m.id}>
                    {m.reconsideration ? 'Re-vote after reconsideration: ' : ''}
                    {m.kind === 'noMotion'
                      ? 'No motion / no second'
                      : m.hands.inPerson.yes + m.hands.virtual.yes + m.hands.inPerson.no + m.hands.virtual.no === 0
                      ? `${m.carried ? 'Carried' : 'Defeated'} — by visual count of hands`
                      : `${m.carried ? 'Carried' : 'Defeated'} — yes ${m.hands.inPerson.yes + m.hands.virtual.yes} (in-person ${m.hands.inPerson.yes}, virtual ${m.hands.virtual.yes}), no ${m.hands.inPerson.no + m.hands.virtual.no} (in-person ${m.hands.inPerson.no}, virtual ${m.hands.virtual.no})`}
                    {m.minorityOpinionNote ? ` — minority opinion: ${m.minorityOpinionNote}` : ''}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {phase.kind !== 'setup' && !position.appointment && (
        <details className="panel-lite corrections">
          <summary>Corrections</summary>
          <div className="row wrap">
            {position.hat && (
              <button className="outline danger" onClick={() => attempt(() => s.undoHat(assembly.id, position.id), 'Hat draw undone.')}>
                Undo hat draw
              </button>
            )}
            {!position.hat && position.motionVotes.length > 0 && position.ballots.length === 4 && (
              <button className="outline danger" onClick={() => attempt(() => s.undoMotion(assembly.id, position.id), 'Motion vote undone.')}>
                Undo last motion vote
              </button>
            )}
            {position.ballots.length > 0 && !position.hat && !(position.ballots.length === 4 && position.motionVotes.length) && (
              <button className="outline danger" onClick={undoBallot}>
                Undo last ballot ({ordinal(position.ballots.length)})
              </button>
            )}
            {position.ballots.length === 0 && (
              <button className="outline" onClick={() => attempt(() => s.reopenNominations(assembly.id, position.id), 'Nominations reopened.')}>
                Reopen nominations
              </button>
            )}
            <button className="outline danger" onClick={reset}>
              Reset position
            </button>
          </div>
        </details>
      )}
      {position.appointment && (
        <p className="muted">
          This position was filled by the second draw from the {position.appointment.fromPositionTitle} hat. To change it, undo that hat draw.
        </p>
      )}
    </div>
  );
}
