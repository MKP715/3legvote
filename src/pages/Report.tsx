import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useAssembly, effectiveVoters } from '../store';
import { computePosition, METHOD_LABEL } from '../engine/thirdLegacy';
import { ballotAnnouncement, nameOf } from '../announce';
import { Board } from '../components/Board';
import { exportCsv, exportJson, resultsSummaryText } from '../exporters';
import { computeEligibility } from '../engine/voters';
import { PRESETS } from '../presets';
import { CHANNEL_LABEL, type Assembly, type Language } from '../engine/types';
import { addMinutes, elapsedMinutes, scheduleAgenda, tallyConferenceItem, tallyMotion } from '../engine/business';
import { LANGUAGES, ordinalL } from '../i18n';
import { r as reportDict, senseText, type ReportDict } from '../reportI18n';
import { notify } from '../components/ui';
import { NotFound } from './NotFound';

export function Report() {
  const { aid } = useParams();
  const a = useAssembly(aid);
  const [lang, setLang] = useState<Language | null>(null);
  if (!a) return <NotFound what="assembly" />;
  const L: Language = lang ?? a.language;
  const d = reportDict(L);
  const fmt = (iso: string) => new Date(iso).toLocaleString(d.locale);
  const states = a.positions.map((p) => ({ p, st: computePosition(p, a.settings) }));
  const settingsLine = [
    PRESETS[a.electionType]?.label,
    d.procedure,
    a.settings.countInvalidInTotal ? d.invalidIn : d.invalidOut,
    a.settings.fourthBallotLowestTie === 'withdrawAllTied' ? d.tieAll : d.tieNone,
    a.settings.singleCandidate === 'confirmationVote' ? d.singleConfirm : d.singleDeclared,
  ].join(' · ');

  return (
    <div className="report">
      <nav aria-label="breadcrumb" className="no-print">
        <ul>
          <li>
            <Link to={`/a/${a.id}`}>{a.name}</Link>
          </li>
          <li>Report</li>
        </ul>
      </nav>
      <div className="row-end no-print wrap">
        <label className="inline-field">
          Language of the printed report
          <select value={L} onChange={(e) => setLang(e.target.value as Language)} aria-label="Language of the printed report">
            {(Object.keys(LANGUAGES) as Language[]).map((k) => (
              <option key={k} value={k}>
                {LANGUAGES[k]}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => window.print()}>Print / save as PDF</button>
        <button className="outline" onClick={() => exportCsv(a)}>
          Export CSV
        </button>
        <button className="outline" onClick={() => exportJson(a)}>
          Export JSON
        </button>
        <button
          className="outline secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(resultsSummaryText(a));
              notify('Summary copied.', 'success');
            } catch {
              notify('Could not copy automatically.', 'error');
            }
          }}
        >
          Copy text summary
        </button>
      </div>

      <header>
        <h1 style={{ marginBottom: 0 }}>{a.name}</h1>
        <p className="muted">
          {a.date}
          {a.location && ` · ${a.location}`}
          {a.chair && ` · ${d.chairLabel}: ${a.chair}`}
        </p>
        <p className="sub">{settingsLine}</p>
      </header>

      <ReportMeta a={a} fmt={fmt} d={d} />

      <section className="report-section">
        <h2>{d.summary}</h2>
        <table>
          <thead>
            <tr>
              <th>{d.colPosition}</th>
              <th>{d.colElected}</th>
              <th>{d.colHow}</th>
              <th className="num">{d.colBallots}</th>
            </tr>
          </thead>
          <tbody>
            {states.map(({ p, st }) => (
              <tr key={p.id}>
                <td>{p.title}</td>
                <td>
                  <strong>{st.phase.kind === 'elected' ? nameOf(p, st.phase.candidateId, L) : '—'}</strong>
                </td>
                <td>
                  {st.phase.kind === 'elected'
                    ? `${METHOD_LABEL[st.phase.method]}${st.phase.ballotNumber ? ` (${d.ballotHeading(ordinalL(st.phase.ballotNumber, L))})` : ''}`
                    : st.phase.kind === 'setup'
                      ? d.notStarted
                      : d.inProgress}
                </td>
                <td className="num">{st.ballots.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {states.map(({ p, st }) => (
        <section key={p.id} className="report-position report-section">
          <h2>
            {p.title}
            {st.phase.kind === 'elected' && <span className="report-elected-inline"> — {nameOf(p, st.phase.candidateId, L)}</span>}
          </h2>
          {p.description && <p className="muted">{p.description}</p>}
          <p>
            {d.candidates}: {p.candidates.map((c) => c.name).join(', ') || '—'}
          </p>
          {st.ballots.length > 0 && <Board position={p} state={st} breakdown lang={L} />}
          {st.ballots.map((b) => (
            <div key={b.number} className="report-ballot">
              <h4>
                {d.ballotHeading(ordinalL(b.number, L))} <span className="sub muted">{fmt(p.ballots[b.number - 1].recordedAt)}</span>
              </h4>
              {ballotAnnouncement(p, b, L).map((line, i) => (
                <p key={i}>{line}</p>
              ))}
              <p className="sub muted">
                {d.eligiblePresent(String(b.eligibleVoters.inPerson || '—'), String(b.eligibleVoters.virtual || '—'))}
                {p.ballots[b.number - 1].note && d.tellerNote(p.ballots[b.number - 1].note ?? '')}
              </p>
            </div>
          ))}
          {p.motionVotes.map((m) => {
            const yes = m.hands.inPerson.yes + m.hands.virtual.yes;
            const no = m.hands.inPerson.no + m.hands.virtual.no;
            const outcome = m.carried ? d.carried : d.defeated;
            return (
              <p key={m.id}>
                <strong>
                  {d.fifthMotion}
                  {m.reconsideration ? ` (${d.reconsideration})` : ''}:
                </strong>{' '}
                {m.kind === 'noMotion' ? d.noMotion : yes + no === 0 ? d.byHands(outcome) : d.withCounts(outcome, yes, no)}
                {m.minorityOpinionNote && ` — ${d.minorityOpinion}: ${m.minorityOpinionNote}`}
              </p>
            );
          })}
          {p.hat && (
            <p>
              <strong>{d.drawnByLot(p.hat.mode === 'digital' ? d.digitalDraw : d.physicalHat)}:</strong>{' '}
              {p.hat.order.map((id, i) => `${i + 1}. ${nameOf(p, id, L)}`).join(' · ')}
            </p>
          )}
          {st.phase.kind === 'elected' && (
            <p className="report-elected">
              {d.electedIs}: <strong>{nameOf(p, st.phase.candidateId, L)}</strong> — {METHOD_LABEL[st.phase.method]}
              {p.appointment ? ` of ${p.appointment.fromPositionTitle}` : ''}
            </p>
          )}
        </section>
      ))}

      <Motions a={a} d={d} fmt={fmt} />
      <ConferenceItems a={a} d={d} />
      <AgendaRecord a={a} d={d} />
      <Attendance a={a} d={d} />

      <section className="report-section report-log">
        <h2>{d.auditLog}</h2>
        <p className="sub">{d.auditNote}</p>
        <table>
          <tbody>
            {a.log.map((l, i) => (
              <tr key={i}>
                <td className="sub nowrap">{fmt(l.at)}</td>
                <td>{l.action}</td>
                <td className="sub">{l.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <Signatures a={a} d={d} />

      <p className="sub muted report-foot">{d.producedBy(__APP_VERSION__, new Date().toLocaleString(d.locale))}</p>
    </div>
  );
}

function ReportMeta({ a, fmt, d }: { a: Assembly; fmt: (iso: string) => string; d: ReportDict }) {
  const o = a.officials;
  const officials = [
    [d.officials.secretary, o.secretary],
    [d.officials.registrar, o.registrar],
    [d.officials.tellers, o.tellers],
    [d.officials.collectors, o.collectors],
    [d.officials.recorder, o.recorder],
    [d.officials.virtualTeller, o.virtualTeller],
    [d.officials.techHost, o.techHost],
  ].filter(([, v]) => v);
  const approvals = [
    [d.approvals.procedure, a.approvals.procedure],
    [d.approvals.whoVotes, a.approvals.whoVotes],
    [d.approvals.order, a.approvals.order],
  ] as const;
  return (
    <>
      {officials.length > 0 && (
        <p className="sub">
          {officials.map(([k, v]) => (
            <span key={k} className="meta-item">
              <strong>{k}:</strong> {v}
            </span>
          ))}
        </p>
      )}
      <p className="sub">
        {approvals.map(([k, v]) => (
          <span key={k} className="meta-item">
            <strong>{k}:</strong> {v ? d.approvedAt(fmt(v)) : d.notRecorded}
          </span>
        ))}
      </p>
    </>
  );
}

/** Every motion put to the assembly, with the vote that decided it. */
function Motions({ a, d, fmt }: { a: Assembly; d: ReportDict; fmt: (iso: string) => string }) {
  if (!a.motions.length) return null;
  const eligible = effectiveVoters(a);
  const eligibleTotal = eligible.inPerson + eligible.virtual;
  return (
    <section className="report-section report-motions">
      <h2>{d.motions}</h2>
      <p className="sub">{d.motionsNote}</p>
      {a.motions.map((m) => (
        <div key={m.id} className="report-motion">
          <h4>
            {m.number}. {m.title} <span className="sub muted">— {d.motionStatus[m.status]}</span>
          </h4>
          {m.text && <p className="motion-text">{m.text}</p>}
          <p className="sub muted">
            {d.motionKinds[m.kind]}
            {m.committee ? ` · ${m.committee}` : ''} · {d.colMoved}: {m.movedBy || '—'} / {m.secondedBy || '—'} · {d.thresholds[m.threshold]}
          </p>
          {m.rounds.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>{d.colMotion}</th>
                  <th className="num">{d.colVotes}</th>
                  <th className="num">{d.colThreshold}</th>
                  <th>{d.colResult}</th>
                </tr>
              </thead>
              <tbody>
                {m.rounds.map((round) => {
                  const t = tallyMotion(round.counts, round.threshold, a.motionSettings, round.eligible || eligibleTotal);
                  return (
                    <tr key={round.id}>
                      <td>
                        {d.motionKinds[round.kind]}
                        <div className="sub muted">{fmt(round.at)}</div>
                      </td>
                      <td className="num">
                        {t.yes} / {t.no} / {t.abstain}
                      </td>
                      <td className="num">
                        {t.needed}
                        {!t.quorumMet && <div className="sub">{d.quorumNotMet}</div>}
                      </td>
                      <td>{round.carried ? d.carried : d.defeated}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {m.rounds
            .filter((round) => round.minority?.heard)
            .map((round) => (
              <p key={`min-${round.id}`} className="sub">
                {d.minorityHeard(round.minority!.side === 'for' ? d.sideFor : d.sideAgainst, round.minority!.notes)}
              </p>
            ))}
          {m.notes && (
            <p className="sub">
              <strong>{d.notesLabel}:</strong> {m.notes}
            </p>
          )}
        </div>
      ))}
    </section>
  );
}

/** The sense of the assembly on each Conference agenda item, for the delegate. */
function ConferenceItems({ a, d }: { a: Assembly; d: ReportDict }) {
  if (!a.conferenceItems.length) return null;
  return (
    <section className="report-section report-conference">
      <h2>
        {d.conference}
        {a.conferenceSettings.session ? ` — ${a.conferenceSettings.session}` : ''}
      </h2>
      <p className="sub">{d.conferenceNote}</p>
      {a.conferenceItems.map((item) => {
        const last = item.rounds[item.rounds.length - 1];
        const t = last ? tallyConferenceItem(last.counts, last.abstain, item.options) : null;
        return (
          <div key={item.id} className="report-conf-item">
            <h4>
              {item.reference ? `${item.reference}. ` : ''}
              {item.title}
            </h4>
            <p className="sub muted">
              {d.colCommittee}: {item.committee || '—'}
              {item.presenter ? ` · ${item.presenter}` : ''}
            </p>
            {item.background && <p className="sub">{item.background}</p>}
            {t ? (
              <table>
                <thead>
                  <tr>
                    <th>{d.colChoice}</th>
                    <th className="num">{CHANNEL_LABEL.inPerson}</th>
                    <th className="num">{CHANNEL_LABEL.virtual}</th>
                    <th className="num">%</th>
                  </tr>
                </thead>
                <tbody>
                  {t.options.map((o) => (
                    <tr key={o.id}>
                      <td>{o.label}</td>
                      <td className="num">{o.byChannel.inPerson}</td>
                      <td className="num">{o.byChannel.virtual}</td>
                      <td className="num">{Math.round(o.pct)}%</td>
                    </tr>
                  ))}
                  <tr>
                    <td>{d.abstain}</td>
                    <td className="num">{t.abstain.inPerson}</td>
                    <td className="num">{t.abstain.virtual}</td>
                    <td className="num" />
                  </tr>
                </tbody>
              </table>
            ) : (
              <p className="sub muted">{d.senseNone}</p>
            )}
            {t && senseText(t, d) && (
              <p>
                <strong>{d.colSense}:</strong> {senseText(t, d)}
              </p>
            )}
            {item.notes && (
              <p className="sub">
                <strong>{d.notesLabel}:</strong> {item.notes}
              </p>
            )}
            {item.delegateNote && (
              <p className="sub">
                <strong>{d.delegateNote}:</strong> {item.delegateNote}
              </p>
            )}
          </div>
        );
      })}
    </section>
  );
}

/** How the day actually ran against the plan. */
function AgendaRecord({ a, d }: { a: Assembly; d: ReportDict }) {
  const started = a.agenda.filter((i) => i.startedAt);
  if (!started.length) return null;
  const plan = scheduleAgenda(a.agenda);
  return (
    <section className="report-section report-agenda">
      <h2>{d.agenda}</h2>
      <table>
        <thead>
          <tr>
            <th>{d.colClock}</th>
            <th>{d.colItem}</th>
            <th className="num">{d.colPlanned}</th>
            <th className="num">{d.colActual}</th>
          </tr>
        </thead>
        <tbody>
          {a.agenda.map((item, i) => {
            const used = elapsedMinutes(item.startedAt, item.endedAt);
            return (
              <tr key={item.id}>
                <td className="nowrap sub">
                  {addMinutes(a.agendaStart, plan[i].plannedStartMin)}–{addMinutes(a.agendaStart, plan[i].plannedEndMin)}
                </td>
                <td>
                  {item.title}
                  <div className="sub muted">
                    {d.agendaKinds[item.kind]}
                    {item.presenter ? ` · ${item.presenter}` : ''}
                  </div>
                </td>
                <td className="num">
                  {item.plannedMinutes} {d.minutes}
                </td>
                <td className="num">{used === null ? '—' : `${used} ${d.minutes}`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

/** Who was in the room (and online), and who had a vote. */
function Attendance({ a, d }: { a: Assembly; d: ReportDict }) {
  const el = computeEligibility(a.voterRoll, a.roles);
  const roleName = new Map(a.roles.map((role) => [role.id, role.name]));
  const present = a.voterRoll.filter((v) => v.present);
  if (!present.length) return null;
  const badgeOptions = a.attendanceOptions;
  return (
    <section className="report-section">
      <h2>{d.attendance}</h2>
      <p className="sub">{d.attendanceNote(el.present, el.total, el.byChannel.inPerson, el.byChannel.virtual)}</p>
      <table>
        <thead>
          <tr>
            <th>{d.colName}</th>
            <th>{d.colRole}</th>
            <th>{d.colGroup}</th>
            <th>{d.colAttending}</th>
            <th>{d.colVoting}</th>
          </tr>
        </thead>
        <tbody>
          {present.map((v) => (
            <tr key={v.id}>
              <td>{v.name}</td>
              <td>{roleName.get(v.roleId)}</td>
              <td>{[v.group, v.district].filter(Boolean).join(' · ')}</td>
              <td>
                {CHANNEL_LABEL[v.channel]}
                {badgeOptions.length > 0 && (v.attending ?? []).length > 0 && (
                  <div className="sub muted">
                    {badgeOptions
                      .filter((o) => (v.attending ?? []).includes(o.id))
                      .map((o) => o.label)
                      .join(' · ')}
                  </div>
                )}
              </td>
              <td>{el.eligible.some((x) => x.id === v.id) ? d.yes : d.no}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Space for the signatures that make this the assembly's record. */
function Signatures({ a, d }: { a: Assembly; d: ReportDict }) {
  const lines = [
    [d.roles.chair, a.chair],
    [d.roles.secretary, a.officials.secretary],
    [d.roles.teller, a.officials.tellers.split(/[,;]/)[0]?.trim() ?? ''],
    [d.roles.teller, a.officials.tellers.split(/[,;]/)[1]?.trim() ?? ''],
  ];
  return (
    <section className="report-section signatures">
      <h2>{d.certifiedBy}</h2>
      <div className="sign-grid">
        {lines.map(([role, who], i) => (
          <div key={i} className="sign-line">
            <div className="sign-rule" />
            <div className="sub">
              {role}
              {who ? ` — ${who}` : ''}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
