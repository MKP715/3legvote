import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { effectiveVoters, useAssembly, useStore } from '../store';
import { computePosition, fmtLimit } from '../engine/thirdLegacy';
import type { Assembly, ConferenceItem, Language, Motion, Position } from '../engine/types';
import { addMinutes, elapsedMinutes, scheduleAgenda, tallyConferenceItem, tallyMotion } from '../engine/business';
import { AGENDA_KIND_ICON } from '../agendaTemplates';
import { ballotAnnouncement, nameOf } from '../announce';
import { Board } from '../components/Board';
import { BallotChart } from '../components/BallotChart';
import { TimerFace } from '../components/LiveControls';
import { ballotColor } from '../presets';
import { listL, t } from '../i18n';
import { r as reportDict } from '../reportI18n';

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

/** Re-renders on an interval, so elapsed times on the projector stay honest. */
function useMinuteTick(active: boolean) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => tick((n) => n + 1), 15000);
    return () => window.clearInterval(id);
  }, [active]);
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
 * Projector / shared-screen view. Opens in its own window and follows whichever screen the
 * chair puts up — an election, the agenda, a motion or a Conference agenda item. Updates
 * automatically from the chair's window.
 */
export function Display() {
  const { aid } = useParams();
  const assembly = useAssembly(aid);
  const setZoom = useStore((s) => s.setZoom);
  const position = assembly?.positions.find((p) => p.id === assembly.livePositionId) ?? assembly?.positions.find((p) => p.started);
  const state = useMemo(() => (assembly && position ? computePosition(position, assembly.settings) : null), [assembly, position]);

  useEffect(() => {
    document.body.classList.add('display-mode');
    return () => document.body.classList.remove('display-mode');
  }, []);

  // The projector window has its own keyboard: + and − size the screen for the room, 0 resets.
  const zoom = assembly?.live.zoom ?? 1;
  useEffect(() => {
    if (!assembly) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '+' || e.key === '=') setZoom(assembly.id, zoom + 0.05);
      else if (e.key === '-' || e.key === '_') setZoom(assembly.id, zoom - 0.05);
      else if (e.key === '0') setZoom(assembly.id, 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [assembly, zoom, setZoom]);

  const fit = useFitToScreen();
  const screen = assembly?.live.screen ?? 'election';
  useMinuteTick(screen === 'agenda');

  if (!assembly)
    return (
      <main className="display">
        <h1>—</h1>
      </main>
    );

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

  const frame = (children: ReactNode, centred = false) => (
    <main className={`display ${live.highContrast ? 'display-hc' : ''} ${centred ? 'display-centred' : ''}`}>
      <div className="display-fitbox" style={{ height: fit.boxHeight ? fit.boxHeight * zoom : undefined }}>
        <div
          ref={fit.ref}
          className="display-fit"
          // Laid out in a canvas 1/zoom as wide and scaled back up, kept centred on the wall.
          style={{ width: `${100 / zoom}%`, marginLeft: `${(100 - 100 / zoom) / 2}%`, transform: `scale(${fit.scale * zoom})` }}
        >
          {children}
        </div>
      </div>
    </main>
  );

  const head = (line: string, title: string) => (
    <header className="display-head">
      <div>
        <div className="display-assembly">{line}</div>
        <h1>{title}</h1>
      </div>
      <Clock locale={d.locale} />
    </header>
  );

  /* ---------------- agenda ---------------- */
  if (screen === 'agenda') {
    const current = assembly.agenda.find((i) => i.id === live.agendaItemId && !i.endedAt) ?? assembly.agenda.find((i) => i.startedAt && !i.endedAt) ?? null;
    const index = current ? assembly.agenda.findIndex((i) => i.id === current.id) : -1;
    const next = index >= 0 ? assembly.agenda[index + 1] : assembly.agenda.find((i) => !i.startedAt);
    const plan = scheduleAgenda(assembly.agenda);
    const used = current ? elapsedMinutes(current.startedAt, current.endedAt) : null;
    const drift = current && used !== null ? used - current.plannedMinutes : null;
    return frame(
      <>
        {head([assembly.name, assembly.date].filter(Boolean).join(' · '), d.screens.agendaTitle)}
        {extras}
        {current && (
          <div className="display-now">
            <div className="now-label">{d.screens.now}</div>
            <div className="now-title">
              {AGENDA_KIND_ICON[current.kind]} {current.title}
            </div>
            {current.presenter && <div className="display-sub">{current.presenter}</div>}
            <div className="now-times">
              <span>
                {used ?? 0} / {current.plannedMinutes} {d.screens.planned}
              </span>
              {drift !== null && (
                <span className={drift > 2 ? 'over' : ''}>
                  {drift > 2 ? d.screens.behind(drift) : drift < -2 ? d.screens.left(-drift) : d.screens.onTime}
                </span>
              )}
            </div>
          </div>
        )}
        {next && (
          <div className="display-next">
            <span className="next-label">{d.screens.upNext}</span> {AGENDA_KIND_ICON[next.kind]} {next.title}
          </div>
        )}
        <ol className="display-agenda">
          {assembly.agenda.map((item, i) => (
            <li key={item.id} className={`${item.id === current?.id ? 'current' : ''} ${item.endedAt ? 'done' : ''}`}>
              <span className="t">
                {addMinutes(assembly.agendaStart, plan[i].plannedStartMin)}
              </span>
              <span className="k">{AGENDA_KIND_ICON[item.kind]}</span>
              <span className="n">{item.title}</span>
              <span className="m">{item.plannedMinutes}′</span>
            </li>
          ))}
        </ol>
      </>,
    );
  }

  /* ---------------- a motion on the floor ---------------- */
  if (screen === 'motion') {
    const motion = assembly.motions.find((m) => m.id === live.motionId) ?? assembly.motions[assembly.motions.length - 1] ?? null;
    if (motion)
      return frame(<MotionScreen assembly={assembly} motion={motion} lang={lang} head={head} extras={extras} eligible={eligibleTotal} />, true);
  }

  /* ---------------- a Conference agenda item ---------------- */
  if (screen === 'conference') {
    const item = assembly.conferenceItems.find((c) => c.id === live.conferenceItemId) ?? assembly.conferenceItems[0] ?? null;
    if (item) return frame(<ConferenceScreen assembly={assembly} item={item} lang={lang} head={head} extras={extras} />, true);
  }

  /* ---------------- elections ---------------- */
  if (!position || !state) {
    return frame(
      <>
        {head(assembly.name, assembly.date)}
        {extras}
        <p className="display-msg">{d.waiting}</p>
      </>,
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

  return frame(
    <>
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
    </>,
  );
}

type Head = (line: string, title: string) => ReactNode;

/** The motion as the room needs to see it: the wording, the threshold, and the result. */
function MotionScreen({
  assembly,
  motion,
  lang,
  head,
  extras,
  eligible,
}: {
  assembly: Assembly;
  motion: Motion;
  lang: Language;
  head: Head;
  extras: ReactNode;
  eligible: number;
}) {
  const d = t(lang);
  const rd = reportDict(lang);
  const round = motion.rounds[motion.rounds.length - 1] ?? null;
  const result = round ? tallyMotion(round.counts, round.threshold, assembly.motionSettings, round.eligible || eligible) : null;
  const pending = round?.minority && !round.minority.heard ? round.minority : null;
  return (
    <>
      {head(`${assembly.name} · ${d.screens.motionOnFloor}`, motion.title || `#${motion.number}`)}
      {extras}
      <div className="display-motion-text">{motion.text}</div>
      <div className="display-sub">
        {rd.motionKinds[motion.kind]} · {rd.thresholds[motion.threshold]}
        {motion.movedBy && ` · ${d.screens.moved} ${motion.movedBy}`}
        {motion.secondedBy && ` · ${d.screens.seconded} ${motion.secondedBy}`}
        {motion.status !== 'open' && ` · ${rd.motionStatus[motion.status]}`}
      </div>
      {!result && (
        <div className="display-hint">
          {d.screens.speakers}: {d.screens.yes} {motion.speakers.for} · {d.screens.no} {motion.speakers.against}
        </div>
      )}
      {result && (
        <>
          <div className="display-roundlabel">{rd.motionKinds[round!.kind]}</div>
          <div className={`display-verdict ${result.carried ? 'carried' : 'defeated'}`}>{result.carried ? d.screens.carried : d.screens.defeated}</div>
          <div className="display-tally">
            <div>
              <span>{d.screens.yes}</span>
              <strong>{result.yes}</strong>
            </div>
            <div>
              <span>{d.screens.no}</span>
              <strong>{result.no}</strong>
            </div>
            <div>
              <span>{d.screens.abstain}</span>
              <strong>{result.abstain}</strong>
            </div>
            <div>
              <span>{d.screens.needed}</span>
              <strong>{result.needed}</strong>
            </div>
            <div>
              <span>{d.screens.votesCast}</span>
              <strong>{result.votesCast}</strong>
            </div>
          </div>
          <div className="display-bar">
            <div className="bar-yes" style={{ width: `${result.votesCast ? (result.yes / result.votesCast) * 100 : 0}%` }} />
            <div className="bar-mark" style={{ left: `${result.votesCast ? (result.needed / result.votesCast) * 100 : 0}%` }} />
          </div>
          <div className="display-hint">
            {round!.threshold === 'twoThirds' ? d.screens.substantialUnanimity : rd.thresholds[round!.threshold]}
            {!result.quorumMet && ` · ${d.screens.quorumNotMet}`}
          </div>
          {pending && (
            <div className="display-status status-counting">
              {d.screens.minorityInvited(pending.side === 'for' ? d.screens.forSide : d.screens.againstSide)}
            </div>
          )}
        </>
      )}
    </>
  );
}

/** A Conference agenda item: what is being asked, and where the assembly stands. */
function ConferenceScreen({
  assembly,
  item,
  lang,
  head,
  extras,
}: {
  assembly: Assembly;
  item: ConferenceItem;
  lang: Language;
  head: Head;
  extras: ReactNode;
}) {
  const d = t(lang);
  const round = item.rounds[item.rounds.length - 1] ?? null;
  const result = round ? tallyConferenceItem(round.counts, round.abstain, item.options) : null;
  const title = [item.committee, item.reference].filter(Boolean).join(' · ');
  return (
    <>
      {head(`${assembly.name} · ${d.screens.conferenceItem}${title ? ` · ${title}` : ''}`, item.title)}
      {extras}
      {item.background && <div className="display-background">{item.background}</div>}
      {!result ? (
        <>
          <div className="display-hint">{d.screens.choices}</div>
          <ul className="display-choices">
            {item.options.map((o) => (
              <li key={o.id}>{o.label}</li>
            ))}
          </ul>
          <div className="display-msg small">{d.screens.notPolled}</div>
        </>
      ) : (
        <>
          <ul className="display-results">
            {result.options.map((o) => (
              <li key={o.id} className={result.leading?.id === o.id ? 'lead' : ''}>
                <span className="label">{o.label}</span>
                <span className="track">
                  <span className="fill" style={{ width: `${o.pct}%` }} />
                </span>
                <span className="votes">
                  {o.votes} · {Math.round(o.pct)}%
                </span>
              </li>
            ))}
            <li className="abstain">
              <span className="label">{d.screens.abstain}</span>
              <span className="track" />
              <span className="votes">{result.abstainTotal}</span>
            </li>
          </ul>
          <div className="display-sense">
            <span>{d.screens.senseLabel}</span>
            <strong>{senseLine(result, lang)}</strong>
          </div>
          <div className="display-hint">
            {d.screens.totalVoteShort}: {result.totalVote}
          </div>
        </>
      )}
      {assembly.conferenceSettings.guidanceNote && <div className="display-guidance">{assembly.conferenceSettings.guidanceNote}</div>}
    </>
  );
}


/** The sense of the assembly in the room's language. */
function senseLine(result: ReturnType<typeof tallyConferenceItem>, lang: Language): string {
  const d = t(lang);
  const pct = Math.round(result.leading?.pct ?? 0);
  const label = result.leading?.label ?? '';
  switch (result.senseKind) {
    case 'unanimity':
      return d.screens.senseUnanimity(label, pct);
    case 'majority':
      return d.screens.senseMajority(label, pct);
    case 'plurality':
      return d.screens.sensePlurality(label, pct);
    case 'tied':
      return d.screens.senseTied;
    default:
      return '';
  }
}
