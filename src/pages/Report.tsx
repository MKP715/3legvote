import { Link, useParams } from 'react-router';
import { useAssembly } from '../store';
import { computePosition, METHOD_LABEL, ordinal } from '../engine/thirdLegacy';
import { ballotAnnouncement, nameOf } from '../announce';
import { Board } from '../components/Board';
import { exportCsv, exportJson, resultsSummaryText } from '../exporters';
import { computeEligibility } from '../engine/voters';
import { PRESETS } from '../presets';
import { CHANNEL_LABEL } from '../engine/types';
import { notify } from '../components/ui';
import { NotFound } from './NotFound';

const SETTING_TEXT = {
  countInvalidInTotal: (v: boolean) => (v ? 'Total vote includes blank / invalid ballots' : 'Total vote counts valid votes only'),
  fourthBallotLowestTie: (v: string) =>
    v === 'withdrawAllTied' ? 'Ties for smallest total after 4th ballot: all withdrawn' : 'Ties for smallest total after 4th ballot: none withdrawn',
  singleCandidate: (v: string) => (v === 'confirmationVote' ? 'Single candidate: yes/no ballot, two-thirds required' : 'Single candidate: declared elected'),
};

export function Report() {
  const { aid } = useParams();
  const a = useAssembly(aid);
  if (!a) return <NotFound what="assembly" />;
  const fmt = (iso: string) => new Date(iso).toLocaleString();
  const states = a.positions.map((p) => ({ p, st: computePosition(p, a.settings) }));

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
      <div className="row-end no-print">
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
          {a.chair && ` · Chair: ${a.chair}`}
        </p>
        <p className="sub">
          {PRESETS[a.electionType]?.label} · Third Legacy Procedure · {SETTING_TEXT.countInvalidInTotal(a.settings.countInvalidInTotal)} ·{' '}
          {SETTING_TEXT.fourthBallotLowestTie(a.settings.fourthBallotLowestTie)} · {SETTING_TEXT.singleCandidate(a.settings.singleCandidate)}
        </p>
      </header>

      <ReportMeta a={a} fmt={fmt} />

      <h2>Summary</h2>
      <table>
        <thead>
          <tr>
            <th>Position</th>
            <th>Elected</th>
            <th>How</th>
            <th className="num">Ballots</th>
          </tr>
        </thead>
        <tbody>
          {states.map(({ p, st }) => (
            <tr key={p.id}>
              <td>{p.title}</td>
              <td>
                <strong>{st.phase.kind === 'elected' ? nameOf(p, st.phase.candidateId) : '—'}</strong>
              </td>
              <td>
                {st.phase.kind === 'elected'
                  ? `${METHOD_LABEL[st.phase.method]}${st.phase.ballotNumber ? ` (${ordinal(st.phase.ballotNumber)} ballot)` : ''}`
                  : st.phase.kind === 'setup'
                    ? 'Not started'
                    : 'In progress / not filled'}
              </td>
              <td className="num">{st.ballots.length}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {states.map(({ p, st }) => (
        <section key={p.id} className="report-position">
          <h2>{p.title}</h2>
          {p.description && <p className="muted">{p.description}</p>}
          <p>Candidates: {p.candidates.map((c) => c.name).join(', ') || '—'}</p>
          {st.ballots.length > 0 && <Board position={p} state={st} breakdown />}
          {st.ballots.map((r) => (
            <div key={r.number} className="report-ballot">
              <h4>
                {ordinal(r.number)} ballot <span className="sub muted">{fmt(p.ballots[r.number - 1].recordedAt)}</span>
              </h4>
              {ballotAnnouncement(p, r, a.language).map((l, i) => (
                <p key={i}>{l}</p>
              ))}
              <p className="sub muted">
                Eligible voters present: {r.eligibleVoters.inPerson || '—'} in-person, {r.eligibleVoters.virtual || '—'} virtual.
                {p.ballots[r.number - 1].note && ` Teller note: ${p.ballots[r.number - 1].note}`}
              </p>
            </div>
          ))}
          {p.motionVotes.map((m) => (
            <p key={m.id}>
              <strong>Fifth-ballot motion{m.reconsideration ? ' (re-vote after reconsideration)' : ''}:</strong>{' '}
              {m.kind === 'noMotion'
                ? 'no motion / not seconded'
                : m.hands.inPerson.yes + m.hands.virtual.yes + m.hands.inPerson.no + m.hands.virtual.no === 0
                ? `${m.carried ? 'carried' : 'defeated'} by visual count of hands`
                : `${m.carried ? 'carried' : 'defeated'} — yes ${m.hands.inPerson.yes + m.hands.virtual.yes}, no ${m.hands.inPerson.no + m.hands.virtual.no}`}
              {m.minorityOpinionNote && ` — minority opinion: ${m.minorityOpinionNote}`}
            </p>
          ))}
          {p.hat && (
            <p>
              <strong>Drawn by lot ({p.hat.mode === 'digital' ? 'digital draw' : 'physical hat'}):</strong>{' '}
              {p.hat.order.map((id, i) => `${i + 1}. ${nameOf(p, id)}`).join(' · ')}
            </p>
          )}
          {st.phase.kind === 'elected' && (
            <p className="report-elected">
              Elected: <strong>{nameOf(p, st.phase.candidateId)}</strong> — {METHOD_LABEL[st.phase.method]}
              {p.appointment ? ` of ${p.appointment.fromPositionTitle}` : ''}
            </p>
          )}
        </section>
      ))}

      <section className="report-log">
        <h2>Audit log</h2>
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
    </div>
  );
}

function ReportMeta({ a, fmt }: { a: import('../engine/types').Assembly; fmt: (iso: string) => string }) {
  const o = a.officials;
  const el = computeEligibility(a.voterRoll, a.roles);
  const roleName = new Map(a.roles.map((r) => [r.id, r.name]));
  const officials = [
    ['Secretary', o.secretary],
    ['Registrar', o.registrar],
    ['Tellers', o.tellers],
    ['Ballot collectors', o.collectors],
    ['Recorder / tally', o.recorder],
    ['Virtual teller', o.virtualTeller],
    ['Tech host', o.techHost],
  ].filter(([, v]) => v);
  const approvals = [
    ['Election procedure', a.approvals.procedure],
    ['Who votes', a.approvals.whoVotes],
    ['Order of election', a.approvals.order],
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
            <strong>{k}:</strong> {v ? `approved ${fmt(v)}` : 'approval not recorded'}
          </span>
        ))}
      </p>
      {a.voterRoll.length > 0 && (
        <details className="report-attendance" open>
          <summary>
            Attendance — {el.present} present, {el.total} voting ({el.byChannel.inPerson} in person, {el.byChannel.virtual} virtual)
          </summary>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Group / district</th>
                <th>Attending</th>
                <th>Voting</th>
              </tr>
            </thead>
            <tbody>
              {a.voterRoll
                .filter((v) => v.present)
                .map((v) => (
                  <tr key={v.id}>
                    <td>{v.name}</td>
                    <td>{roleName.get(v.roleId)}</td>
                    <td>{[v.group, v.district].filter(Boolean).join(' · ')}</td>
                    <td>{CHANNEL_LABEL[v.channel]}</td>
                    <td>{el.eligible.some((x) => x.id === v.id) ? 'yes' : 'no'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </details>
      )}
    </>
  );
}
