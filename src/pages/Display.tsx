import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { effectiveVoters, useAssembly } from '../store';
import { computePosition, fmtLimit } from '../engine/thirdLegacy';
import type { Assembly, Language, Position } from '../engine/types';
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
  return (
    <div className="hat-spin display-spin" aria-hidden>
      {names[i % Math.max(names.length, 1)]}
    </div>
  );
}

/**
 * A projector cannot scroll. Measure what we drew and shrink it just enough to fit the
 * screen, so nothing is ever cut off at the bottom whatever the room's resolution.
 */
function useFitToScreen() {
  const ref = useRef<HTMLDivElement>(null);
  const [{ scale, natural }, setFit] = useState({ scale: 1, natural: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // A CSS transform does not change layout, so scrollHeight is always the unscaled height —
    // the wrapper is then given the scaled height so the page itself never scrolls.
    const fit = () => {
      const height = el.scrollHeight;
      // Leave room for the page's own padding above and below the content.
      const top = el.getBoundingClientRect().top + window.scrollY;
      const main = el.closest('main');
      const below = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0;
      const available = window.innerHeight - top - below - 4;
      const next = Math.max(0.45, Math.min(1, available / Math.max(height, 1)));
      setFit((prev) => (Math.abs(prev.scale - next) > 0.005 || prev.natural !== height ? { scale: next, natural: height } : prev));
    };
    fit();
    const observer = new ResizeObserver(() => fit());
    observer.observe(el);
    window.addEventListener('resize', fit);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, []);
  return { ref, scale, boxHeight: natural ? natural * scale : undefined };
}

function Clock({ locale }: { locale: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(id);
  }, []);
  return <span className="display-clock">{now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</span>;
}

/** The whole assembly at a glance: what is filled, what is happening, what is left. */
function PositionStrip({ assembly, current, lang }: { assembly: Assembly; current: Position; lang: Language }) {
  const d = t(lang);
  return (
    <ol className="display-strip">
      {assembly.positions.map((p) => {
        const st = computePosition(p, assembly.settings);
        const elected = st.phase.kind === 'elected' ? nameOf(p, st.phase.candidateId, lang) : null;
        const isCurrent = p.id === current.id;
        return (
          <li key={p.id} className={`strip-item ${elected ? 'done' : ''} ${isCurrent ? 'current' : ''}`}>
            <span className="strip-title">{p.title}</span>
            <span className="strip-name">{elected ?? (isCurrent ? '…' : d.notYetHeld)}</span>
          </li>
        );
      })}
    </ol>
  );
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

  const fit = useFitToScreen();

  if (!assembly) return <main className="display"><h1>—</h1></main>;
  const lang = assembly.language;
  const d = t(lang);
  const live = assembly.live;
  const eligible = effectiveVoters(assembly);
  const eligibleTotal = eligible.inPerson + eligible.virtual;
  const extras = (
    <>
      {live.message && <div className="display-message">{live.message}</div>}
      {live.timer && <TimerFace timer={live.timer} large />}
    </>
  );

  if (!position || !state) {
    return (
      <main className="display">
        <div className="display-fitbox" style={{ height: fit.boxHeight }}>
        <div ref={fit.ref} className="display-fit" style={{ transform: `scale(${fit.scale})` }}>
          <header className="display-head">
            <div>
              <div className="display-assembly">{assembly.name}</div>
              <h1>{assembly.date}</h1>
            </div>
            <Clock locale={d.locale} />
          </header>
          {extras}
          <p className="display-msg">{d.waiting}</p>
        </div>
        </div>
      </main>
    );
  }

  const phase = state.phase;
  const last = state.ballots[state.ballots.length - 1];
  const breakdown = assembly.displayBreakdown;
  const names = (ids: string[]) => listL(ids.map((id) => nameOf(position, id, lang)), lang);
  const nextNumber = phase.kind === 'ballot' ? phase.number : null;
  const color = nextNumber ? ballotColor(assembly.ballotColors, nextNumber) : null;
  const index = assembly.positions.findIndex((p) => p.id === position.id) + 1;

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
  let statusLine: string | null = null;
  if (liveHere && live.status === 'voting' && phase.kind === 'ballot') statusLine = d.votingOpen(d.ballot(phase.number), color?.name ?? null);
  if (liveHere && live.status === 'counting' && phase.kind === 'ballot') statusLine = d.counting;
  const drawing = phase.kind === 'hat' && liveHere && live.status === 'drawing' && Date.now() - new Date(live.since).getTime() < 20000;
  // With many candidates or many ballots the board alone fills a 1080p screen.
  const tallBoard = position.candidates.length + state.ballots.length > 9;
  const turnout = last && eligibleTotal > 0 ? Math.round((last.cast.total / eligibleTotal) * 100) : null;

  return (
    <main className="display">
      <div className="display-fitbox" style={{ height: fit.boxHeight }}>
      <div ref={fit.ref} className="display-fit" style={{ transform: `scale(${fit.scale})` }}>
      <header className="display-head">
        <div>
          <div className="display-assembly">
            {assembly.name} · {d.positionOf(index, assembly.positions.length)}
          </div>
          <h1>{position.title}</h1>
        </div>
        <div className="display-stats">
          {last ? (
            <>
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
              {turnout !== null && (
                <div>
                  <span>{d.turnoutLabel}</span>
                  <strong>{turnout}%</strong>
                  <small>
                    {d.eligibleLabel}: {eligibleTotal}
                  </small>
                </div>
              )}
            </>
          ) : (
            eligibleTotal > 0 && (
              <div>
                <span>{d.eligibleLabel}</span>
                <strong>{eligibleTotal}</strong>
                {breakdown && (
                  <small>
                    {eligible.inPerson} {d.inPerson} · {eligible.virtual} {d.virtual}
                  </small>
                )}
              </div>
            )
          )}
          <Clock locale={d.locale} />
        </div>
      </header>

      {extras}

      {drawing ? (
        <div className="display-elected">
          <div className="elected-label">{d.drawing}</div>
          <HatSpin names={phase.kind === 'hat' ? phase.poolIds.map((id) => nameOf(position, id, lang)) : []} />
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
          {/* What it takes to be elected, and what the next withdrawal rule will do. */}
          {phase.kind === 'ballot' && last && (
            <div className="display-hint">
              {d.needToElect(last.electThreshold, last.totalVote)}
              {last.withdrawalLimit !== null &&
                ` · ${d.withdrawHint(last.withdrawalRule === 'oneFifth' ? '⅕' : '⅓', fmtLimit(last.withdrawalLimit))}`}
            </div>
          )}
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

      {assembly.positions.length > 1 && <PositionStrip assembly={assembly} current={position} lang={lang} />}
      </div>
      </div>
    </main>
  );
}
