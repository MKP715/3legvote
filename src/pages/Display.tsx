import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { useAssembly } from '../store';
import { computePosition } from '../engine/thirdLegacy';
import { ballotAnnouncement, nameOf } from '../announce';
import { Board } from '../components/Board';
import { BallotChart } from '../components/BallotChart';
import { TimerFace } from '../components/LiveControls';
import { ballotColor } from '../presets';
import { listL, t } from '../i18n';

export function displayUrl(aid: string): string {
  return `${window.location.href.split('#')[0]}#/display/${aid}`;
}

/** Opens the projector window; returns false if the browser blocked the pop-up. */
export function openDisplay(aid: string): boolean {
  const w = window.open(displayUrl(aid), 'third-legacy-display', 'popup=yes,width=1280,height=800');
  if (w) {
    w.focus();
    return true;
  }
  return false;
}

/** Cycles through names while the chair is drawing from the hat. */
function HatSpin({ names }: { names: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setI((x) => x + 1), 120);
    return () => window.clearInterval(id);
  }, []);
  return <div className="hat-spin display-spin">{names[i % Math.max(names.length, 1)]}</div>;
}

/**
 * Projector / shared-screen view. Opens in its own window and follows whichever
 * position the chair marks as live. Updates automatically from the chair's window.
 */
export function Display() {
  const { aid } = useParams();
  const assembly = useAssembly(aid);
  const position = assembly?.positions.find((p) => p.id === assembly.livePositionId) ?? assembly?.positions.find((p) => p.started);
  const state = useMemo(() => (assembly && position ? computePosition(position, assembly.settings) : null), [assembly, position]);

  useEffect(() => {
    document.body.classList.add('display-mode');
    return () => document.body.classList.remove('display-mode');
  }, []);

  if (!assembly) return <main className="display"><h1>—</h1></main>;
  const lang = assembly.language;
  const d = t(lang);
  const live = assembly.live;
  const extras = (
    <>
      {live.message && <div className="display-message">{live.message}</div>}
      {live.timer && <TimerFace timer={live.timer} large />}
    </>
  );

  if (!position || !state) {
    return (
      <main className="display">
        <h1>{assembly.name}</h1>
        {extras}
        <p className="display-msg">{d.waiting}</p>
      </main>
    );
  }

  const phase = state.phase;
  const last = state.ballots[state.ballots.length - 1];
  const breakdown = assembly.displayBreakdown;
  const names = (ids: string[]) => listL(ids.map((id) => nameOf(position, id, lang)), lang);
  const nextNumber = phase.kind === 'ballot' ? phase.number : null;
  const color = nextNumber ? ballotColor(assembly.ballotColors, nextNumber) : null;

  let banner = '';
  switch (phase.kind) {
    case 'setup':
      banner = d.nominationsBanner(listL(position.candidates.map((c) => c.name), lang));
      break;
    case 'ballot':
      banner = phase.isConfirmation
        ? d.confirmationBanner(nameOf(position, phase.activeIds[0], lang))
        : d.writeOneBanner(`${d.ballot(phase.number)}${phase.number === 5 ? ` (${d.finalBallot})` : ''}`, names(phase.activeIds));
      break;
    case 'motion':
      banner = d.motionBanner;
      break;
    case 'hat':
      banner = d.hatBanner(names(phase.poolIds));
      break;
    case 'notElected':
      banner = d.notFilled;
      break;
    case 'noCandidates':
      banner = d.noCandidates;
      break;
  }

  const liveHere = assembly.livePositionId === position.id;
  // With many candidates or many ballots the board alone fills a 1080p screen; the chart
  // would push the last rows off the bottom, so it is dropped.
  const tallBoard = position.candidates.length + state.ballots.length > 9;
  let statusLine: string | null = null;
  if (liveHere && live.status === 'voting' && phase.kind === 'ballot') statusLine = d.votingOpen(d.ballot(phase.number), color?.name ?? null);
  if (liveHere && live.status === 'counting' && phase.kind === 'ballot') statusLine = d.counting;

  return (
    <main className="display">
      <header className="display-head">
        <div>
          <div className="display-assembly">{assembly.name}</div>
          <h1>{position.title}</h1>
        </div>
        {last && (
          <div className="display-stats">
            <div>
              <span>{d.totalVoteLabel}</span>
              <strong>{last.totalVote}</strong>
            </div>
            <div>
              <span>{d.twoThirdsLabel}</span>
              <strong>{last.electThreshold}</strong>
            </div>
            <div>
              <span>{d.ballotsCastLabel}</span>
              <strong>{last.cast.total}</strong>
              {breakdown && (
                <small>
                  {last.cast.inPerson} {d.inPerson} · {last.cast.virtual} {d.virtual}
                </small>
              )}
            </div>
          </div>
        )}
      </header>

      {extras}

      {phase.kind === 'hat' && liveHere && live.status === 'drawing' && Date.now() - new Date(live.since).getTime() < 20000 ? (
        <div className="display-elected">
          <div className="elected-label">{d.drawing}</div>
          <HatSpin names={phase.poolIds.map((id) => nameOf(position, id, lang))} />
        </div>
      ) : phase.kind === 'elected' ? (
        <div className="display-elected">
          <div className="elected-label">{d.electedLabel(position.title)}</div>
          <div className="elected-name">{nameOf(position, phase.candidateId, lang)}</div>
          <div className="display-sub">
            {d.methods[phase.method]}
            {phase.ballotNumber ? ` — ${d.ballot(phase.ballotNumber)}` : ''}
          </div>
        </div>
      ) : (
        <>
          {statusLine && (
            <div className={`display-status status-${live.status}`}>
              {color && live.status === 'voting' && <span className="swatch big" style={{ background: color.swatch }} />}
              {statusLine}
            </div>
          )}
          <div className="display-msg">{banner}</div>
        </>
      )}

      {last && (
        <div className={`display-grid ${tallBoard ? 'one-col' : ''}`}>
          <section>
            <Board position={position} state={state} breakdown={breakdown} large lang={lang} />
          </section>
          <section>
            {!tallBoard && <BallotChart position={position} result={last} large lang={lang} />}
            {phase.kind !== 'elected' && (
              <div className="display-announce">
                {ballotAnnouncement(position, last, lang)
                  .slice(-2)
                  .map((l, i) => (
                    <p key={i}>{l}</p>
                  ))}
              </div>
            )}
          </section>
        </div>
      )}
      {!last && phase.kind !== 'elected' && position.candidates.length > 0 && (
        <ul className="display-candidates">
          {position.candidates
            .filter((c) => state.status[c.id]?.kind === 'standing')
            .map((c) => (
              <li key={c.id}>
                {c.name}
                {c.district && <span className="muted"> · {c.district}</span>}
              </li>
            ))}
        </ul>
      )}
    </main>
  );
}
