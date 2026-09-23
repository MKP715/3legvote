import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { effectiveVoters, useAssembly, useStore } from '../store';
import {
  CHANNEL_LABEL,
  CHANNELS,
  type Channel,
  type Motion,
  type MotionKind,
  type MotionVoteCount,
  type VoteMethod,
  type VoteThreshold,
} from '../engine/types';
import { MOTION_RULES, THRESHOLD_LABEL, tallyMotion } from '../engine/business';
import { attempt, Badge, confirmAction, NumberField } from '../components/ui';
import { openDisplay } from './Display';
import { NotFound } from './NotFound';

const zero = (): Record<Channel, MotionVoteCount> => ({ inPerson: { yes: 0, no: 0, abstain: 0 }, virtual: { yes: 0, no: 0, abstain: 0 } });
const METHODS: { id: VoteMethod; label: string }[] = [
  { id: 'hands', label: 'Show of hands' },
  { id: 'ballot', label: 'Written ballot' },
  { id: 'poll', label: 'Online poll' },
  { id: 'voice', label: 'Voice vote' },
];

const STATUS_BADGE: Record<Motion['status'], { kind: 'ok' | 'bad' | 'warn' | 'info' | 'muted'; label: string }> = {
  open: { kind: 'info', label: 'On the floor' },
  carried: { kind: 'ok', label: 'Carried' },
  defeated: { kind: 'bad', label: 'Defeated' },
  tabled: { kind: 'warn', label: 'Tabled' },
  withdrawn: { kind: 'muted', label: 'Withdrawn' },
  recommitted: { kind: 'warn', label: 'Recommitted' },
};

/**
 * Motions and substantial unanimity, following The A.A. Service Manual, Appendix W:
 * matters of policy need a two-thirds majority of those voting, the side that did not
 * prevail is always invited to speak, and an action may be reconsidered only once.
 */
export function MotionsPage() {
  const { aid } = useParams();
  const a = useAssembly(aid);
  const s = useStore();
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState({ kind: 'main' as MotionKind, title: '', text: '', movedBy: '', secondedBy: '', committee: '' });

  if (!a) return <NotFound what="assembly" />;
  const eligibleCounts = effectiveVoters(a);
  const eligible = eligibleCounts.inPerson + eligibleCounts.virtual;
  const selected = a.motions.find((m) => m.id === openId) ?? null;

  const create = () => {
    if (!form.text.trim() && !form.title.trim()) return;
    const id = s.addMotion(a.id, form);
    setOpenId(id);
    setForm({ kind: 'main', title: '', text: '', movedBy: '', secondedBy: '', committee: '' });
  };

  return (
    <>
      <nav aria-label="breadcrumb">
        <ul>
          <li>
            <Link to={`/a/${a.id}`}>{a.name}</Link>
          </li>
          <li>Motions</li>
        </ul>
      </nav>

      <div className="row-between wrap">
        <h2 style={{ margin: 0 }}>Motions &amp; substantial unanimity</h2>
        <div className="row wrap">
          <span className="muted small">
            {eligible > 0 ? `${eligible} voting members present` : 'Set the voters present on the assembly page'}
          </span>
          <button className="outline" onClick={() => { if (selected) s.setScreen(a.id, 'motion', selected.id); openDisplay(a.id); }}>
            📽 Projector
          </button>
        </div>
      </div>

      <MotionSettingsPanel assembly={a} />

      <div className="grid-2">
        <article className="panel">
          <header>
            <h3 style={{ margin: 0 }}>Bring a motion to the floor</h3>
          </header>
          <label>
            Kind
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as MotionKind })}>
              {(['main', 'committee', 'floor'] as MotionKind[]).map((k) => (
                <option key={k} value={k}>
                  {MOTION_RULES[k].label}
                </option>
              ))}
            </select>
            <small className="muted">{MOTION_RULES[form.kind].note}</small>
          </label>
          {form.kind === 'committee' && (
            <label>
              Committee
              <input type="text" value={form.committee} onChange={(e) => setForm({ ...form, committee: e.target.value })} placeholder="e.g. Finance" />
            </label>
          )}
          <label>
            Short title
            <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Archives budget" />
          </label>
          <label>
            The motion, as moved
            <textarea
              rows={3}
              value={form.text}
              onChange={(e) => setForm({ ...form, text: e.target.value })}
              placeholder="That the area…"
            />
          </label>
          <div className="grid">
            <label>
              Moved by
              <input type="text" value={form.movedBy} onChange={(e) => setForm({ ...form, movedBy: e.target.value })} />
            </label>
            <label>
              Seconded by
              <input
                type="text"
                value={form.secondedBy}
                onChange={(e) => setForm({ ...form, secondedBy: e.target.value })}
                placeholder={MOTION_RULES[form.kind].second === 'automatic' ? 'Automatically seconded' : ''}
                disabled={MOTION_RULES[form.kind].second === 'automatic'}
              />
            </label>
          </div>
          <button onClick={create} disabled={!form.text.trim() && !form.title.trim()}>
            Put it on the floor
          </button>
        </article>

        <article className="panel">
          <header>
            <h3 style={{ margin: 0 }}>Business so far</h3>
          </header>
          {a.motions.length === 0 && <p className="muted">No motions yet.</p>}
          <ul className="motion-list">
            {a.motions.map((m) => (
              <li key={m.id} className={m.id === openId ? 'current' : ''}>
                <button className="link-btn" onClick={() => setOpenId(m.id === openId ? null : m.id)}>
                  <strong>
                    {m.number}. {m.title}
                  </strong>
                  <div className="sub muted">{m.text.slice(0, 90)}</div>
                </button>
                <Badge kind={STATUS_BADGE[m.status].kind}>{STATUS_BADGE[m.status].label}</Badge>
              </li>
            ))}
          </ul>
        </article>
      </div>

      {selected && <MotionDetail key={selected.id} assembly={a} motion={selected} eligible={eligible} />}
    </>
  );
}

function MotionSettingsPanel({ assembly }: { assembly: NonNullable<ReturnType<typeof useAssembly>> }) {
  const s = useStore();
  const a = assembly;
  const m = a.motionSettings;
  return (
    <details className="panel-lite">
      <summary>How this body votes</summary>
      <p className="muted small">
        The Service Manual: “All matters of policy … require substantial unanimity, that is, a two-thirds majority … taken to mean two-thirds vote of
        the members voting, as long as the total vote constitutes a quorum.” Simple majority is “one-half of votes cast plus one”, for routine matters.
      </p>
      <div className="grid">
        <label>
          Default for a new motion
          <select value={m.defaultThreshold} onChange={(e) => s.updateMotionSettings(a.id, { defaultThreshold: e.target.value as VoteThreshold })}>
            {(['twoThirds', 'simpleMajority', 'threeQuarters'] as VoteThreshold[]).map((t) => (
              <option key={t} value={t}>
                {THRESHOLD_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Quorum to do business
          <select
            value={m.quorum.kind}
            onChange={(e) =>
              s.updateMotionSettings(a.id, {
                quorum:
                  e.target.value === 'fraction'
                    ? { kind: 'fraction', fraction: m.quorum.fraction ?? 2 / 3 }
                    : e.target.value === 'count'
                      ? { kind: 'count', count: m.quorum.count ?? 10 }
                      : { kind: 'none' },
              })
            }
          >
            <option value="none">Not tracked</option>
            <option value="fraction">A share of the voters present</option>
            <option value="count">A fixed number of votes</option>
          </select>
        </label>
        {m.quorum.kind === 'fraction' && (
          <label>
            Share needed
            <select
              value={String(m.quorum.fraction ?? 2 / 3)}
              onChange={(e) => s.updateMotionSettings(a.id, { quorum: { kind: 'fraction', fraction: Number(e.target.value) } })}
            >
              <option value={String(1 / 2)}>One-half</option>
              <option value={String(2 / 3)}>Two-thirds (the Conference standard)</option>
              <option value={String(3 / 4)}>Three-quarters</option>
            </select>
          </label>
        )}
        {m.quorum.kind === 'count' && (
          <label>
            Votes needed
            <NumberField value={m.quorum.count ?? 0} onChange={(v) => s.updateMotionSettings(a.id, { quorum: { kind: 'count', count: v ?? 0 } })} />
          </label>
        )}
        <label>
          Each speaker may speak for
          <select value={m.speakerSeconds} onChange={(e) => s.updateMotionSettings(a.id, { speakerSeconds: Number(e.target.value) })}>
            <option value={60}>1 minute</option>
            <option value={120}>2 minutes (the Conference practice)</option>
            <option value={180}>3 minutes</option>
            <option value={300}>5 minutes</option>
          </select>
        </label>
      </div>
      <label>
        <input
          type="checkbox"
          role="switch"
          checked={m.countAbstentions}
          onChange={(e) => s.updateMotionSettings(a.id, { countAbstentions: e.target.checked })}
        />
        Count abstentions in the total the threshold is measured against
        <small className="muted">Most bodies do not: an abstention is not a vote cast.</small>
      </label>
    </details>
  );
}

function MotionDetail({ assembly, motion, eligible }: { assembly: NonNullable<ReturnType<typeof useAssembly>>; motion: Motion; eligible: number }) {
  const s = useStore();
  const a = assembly;
  const [voteKind, setVoteKind] = useState<MotionKind | null>(null);
  const [counts, setCounts] = useState(zero);
  const [method, setMethod] = useState<VoteMethod>('hands');
  const [amendText, setAmendText] = useState(motion.text);
  const [movedBy, setMovedBy] = useState('');
  const [secondedBy, setSecondedBy] = useState('');
  const [minorityNotes, setMinorityNotes] = useState('');

  const rule = voteKind ? MOTION_RULES[voteKind] : null;
  const threshold: VoteThreshold = voteKind === 'main' || voteKind === 'committee' || voteKind === 'floor' ? motion.threshold : (rule?.threshold ?? 'twoThirds');
  const preview = useMemo(() => tallyMotion(counts, threshold, a.motionSettings, eligible), [counts, threshold, a.motionSettings, eligible]);
  const lastRound = motion.rounds[motion.rounds.length - 1] ?? null;
  const awaitingMinority = lastRound?.minority && !lastRound.minority.heard;

  const setCount = (ch: Channel, key: keyof MotionVoteCount, v: number) =>
    setCounts((c) => ({ ...c, [ch]: { ...c[ch], [key]: v } }));

  const record = async () => {
    if (!voteKind) return;
    const ok = await confirmAction({
      title: `Record: ${MOTION_RULES[voteKind].label} ${preview.carried ? 'CARRIED' : 'DEFEATED'}?`,
      body: (
        <>
          <p>
            Yes {preview.yes} · No {preview.no} · Abstain {preview.abstain} — {preview.needed} of {preview.votesCast} needed (
            {THRESHOLD_LABEL[threshold].toLowerCase()}).
          </p>
          {!preview.quorumMet && <p className="warn-box">The total vote ({preview.totalVote}) is below the quorum of {preview.quorumRequired}.</p>}
        </>
      ),
      confirmLabel: 'Record the vote',
    });
    if (!ok) return;
    const saved = attempt(() =>
      s.recordMotionVote(a.id, motion.id, {
        kind: voteKind,
        label: MOTION_RULES[voteKind].label,
        text: voteKind === 'amend' ? amendText : undefined,
        movedBy,
        secondedBy,
        threshold,
        method,
        counts,
      }),
    );
    if (saved) {
      setCounts(zero());
      setVoteKind(null);
      setMovedBy('');
      setSecondedBy('');
    }
  };

  return (
    <article className="panel motion-detail">
      <header className="row-between wrap">
        <h3 style={{ margin: 0 }}>
          {motion.number}. {motion.title} <Badge kind={STATUS_BADGE[motion.status].kind}>{STATUS_BADGE[motion.status].label}</Badge>
        </h3>
        <div className="row wrap">
          <button className="outline secondary mini" onClick={() => { s.setScreen(a.id, 'motion', motion.id); openDisplay(a.id); }}>
            Show on projector
          </button>
          <button
            className="outline secondary mini"
            onClick={() =>
              s.setTimer(a.id, {
                label: 'Speaker',
                durationSec: a.motionSettings.speakerSeconds,
                endsAt: Date.now() + a.motionSettings.speakerSeconds * 1000,
                remainingSec: a.motionSettings.speakerSeconds,
              })
            }
          >
            ⏱ Start speaker timer
          </button>
        </div>
      </header>

      <blockquote className="motion-text">{motion.text || <em className="muted">No wording recorded yet.</em>}</blockquote>
      <p className="sub muted">
        {MOTION_RULES[motion.kind].label}
        {motion.committee ? ` · ${motion.committee}` : ''} · moved by {motion.movedBy || '—'} · seconded by {motion.secondedBy || '—'} ·{' '}
        {THRESHOLD_LABEL[motion.threshold]} to carry
      </p>

      {/* ---- debate ---- */}
      {motion.status === 'open' && (
        <div className="debate">
          <strong>Debate</strong>
          <p className="sub muted">
            Full discussion before the vote. Each person speaks for {Math.round(a.motionSettings.speakerSeconds / 60)} minute(s); nobody speaks a
            second time until everyone who wishes has spoken once.
          </p>
          <div className="row wrap">
            {(['for', 'against'] as const).map((side) => (
              <span key={side} className="speaker-counter">
                Spoke {side === 'for' ? 'for' : 'against'}: <strong>{motion.speakers[side]}</strong>
                <button className="outline mini" onClick={() => s.addSpeaker(a.id, motion.id, side, 1)} aria-label={`Add a speaker ${side}`}>
                  +
                </button>
                <button className="outline secondary mini" onClick={() => s.addSpeaker(a.id, motion.id, side, -1)} aria-label={`Remove a speaker ${side}`}>
                  −
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ---- the minority is heard ---- */}
      {awaitingMinority && lastRound?.minority && (
        <div className="panel-lite minority">
          <strong>
            The side that did not prevail may speak — {lastRound.minority.side === 'for' ? 'those in favour' : 'those against'}.
          </strong>
          <p className="sub muted">
            “After each vote on a matter of policy, the side that did not prevail will always be given an opportunity to speak to their position.” A
            well-reasoned minority opinion can lead the body to vote again.
          </p>
          <label>
            What the minority said (for the record)
            <input type="text" value={minorityNotes} onChange={(e) => setMinorityNotes(e.target.value)} />
          </label>
          <div className="row wrap">
            <button
              onClick={() => {
                if (attempt(() => s.recordMinorityOpinion(a.id, motion.id, lastRound.id, minorityNotes, true), 'Noted.')) setMinorityNotes('');
              }}
            >
              Minority heard
            </button>
            <button
              className="outline secondary"
              onClick={() => attempt(() => s.recordMinorityOpinion(a.id, motion.id, lastRound.id, 'No one wished to speak', true))}
            >
              Nobody wished to speak
            </button>
            {!motion.reconsidered && (
              <button className="outline" onClick={() => setVoteKind('reconsider')}>
                Motion to reconsider →
              </button>
            )}
          </div>
        </div>
      )}

      {/* ---- votes taken ---- */}
      {motion.rounds.length > 0 && (
        <div className="table-scroll">
          <table className="entry-table">
            <thead>
              <tr>
                <th>Vote</th>
                <th className="num">Yes</th>
                <th className="num">No</th>
                <th className="num">Abstain</th>
                <th>Needed</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {motion.rounds.map((r) => {
                const t = tallyMotion(r.counts, r.threshold, a.motionSettings, r.eligible);
                return (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.label}</strong>
                      <div className="sub muted">
                        {METHODS.find((m) => m.id === r.method)?.label} · {new Date(r.at).toLocaleTimeString()}
                        {r.movedBy ? ` · moved by ${r.movedBy}` : ''}
                        {r.minority?.heard ? ` · minority heard${r.minority.notes ? `: ${r.minority.notes}` : ''}` : ''}
                      </div>
                    </td>
                    <td className="num">{t.yes}</td>
                    <td className="num">{t.no}</td>
                    <td className="num">{t.abstain}</td>
                    <td className="sub">
                      {t.needed} of {t.votesCast}
                      {!t.quorumMet && <div className="badge badge-bad">quorum not met</div>}
                    </td>
                    <td>{r.carried ? <Badge kind="ok">Carried</Badge> : <Badge kind="bad">Defeated</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ---- what can be done now ---- */}
      {!voteKind && (
        <div className="row wrap">
          {motion.status === 'open' && (
            <>
              <button onClick={() => setVoteKind(motion.kind)}>Vote on the motion</button>
              <button className="outline" onClick={() => setVoteKind('amend')}>
                Amend
              </button>
              <button className="outline secondary" onClick={() => setVoteKind('callQuestion')}>
                Call the question
              </button>
              <button className="outline secondary" onClick={() => setVoteKind('table')}>
                Table
              </button>
              <button className="outline secondary" onClick={() => setVoteKind('recommit')}>
                Recommit
              </button>
              {motion.kind === 'floor' && (
                <button className="outline secondary" onClick={() => setVoteKind('decline')}>
                  Decline to consider
                </button>
              )}
              <button
                className="outline danger"
                onClick={async () => {
                  if (await confirmAction({ title: 'Withdraw this motion?', confirmLabel: 'Withdraw', danger: true }))
                    attempt(() => s.setMotionStatus(a.id, motion.id, 'withdrawn'));
                }}
              >
                Withdrawn by the maker
              </button>
            </>
          )}
          {(motion.status === 'carried' || motion.status === 'defeated') && !motion.reconsidered && (
            <button className="outline" onClick={() => setVoteKind('reconsider')}>
              Motion to reconsider
            </button>
          )}
          {motion.status === 'tabled' && (
            <button className="outline" onClick={() => attempt(() => s.setMotionStatus(a.id, motion.id, 'open', 'Taken from the table'))}>
              Take from the table
            </button>
          )}
          {motion.rounds.length > 0 && (
            <button className="outline danger" onClick={() => attempt(() => s.undoMotionVote(a.id, motion.id), 'Last vote undone.')}>
              Undo last vote
            </button>
          )}
        </div>
      )}

      {/* ---- vote panel ---- */}
      {voteKind && rule && (
        <div className="panel-lite vote-panel">
          <header className="row-between wrap">
            <strong>{rule.label}</strong>
            <span className="sub muted">
              {rule.second === 'automatic' ? 'Automatically seconded' : 'Needs a second'} · {rule.debatable ? 'Debatable' : 'Not debatable'} ·{' '}
              {THRESHOLD_LABEL[threshold]} · {rule.minorityHeard ? 'minority voice heard' : 'no minority voice'}
            </span>
          </header>
          <p className="sub muted">{rule.note}</p>

          {voteKind === 'amend' && (
            <label>
              The motion as it would read if amended
              <textarea rows={3} value={amendText} onChange={(e) => setAmendText(e.target.value)} />
            </label>
          )}
          {voteKind === 'reconsider' && (
            <p className="warn-box sub">
              A motion to reconsider may be made only by someone who <strong>voted with the prevailing side</strong>; anyone may second it. If it
              carries by simple majority, debate resumes. No action may be reconsidered twice.
            </p>
          )}

          <div className="grid">
            <label>
              Moved by
              <input type="text" value={movedBy} onChange={(e) => setMovedBy(e.target.value)} />
            </label>
            <label>
              Seconded by
              <input type="text" value={secondedBy} onChange={(e) => setSecondedBy(e.target.value)} />
            </label>
            <label>
              How the vote was taken
              <select value={method} onChange={(e) => setMethod(e.target.value as VoteMethod)}>
                {METHODS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="table-scroll">
            <table className="entry-table">
              <thead>
                <tr>
                  <th>Votes</th>
                  <th className="num">Yes</th>
                  <th className="num">No</th>
                  <th className="num">Abstain</th>
                </tr>
              </thead>
              <tbody>
                {CHANNELS.map((ch) => (
                  <tr key={ch}>
                    <th scope="row">{CHANNEL_LABEL[ch]}</th>
                    {(['yes', 'no', 'abstain'] as const).map((k) => (
                      <td key={k} className="num">
                        <NumberField
                          value={counts[ch][k]}
                          onChange={(v) => setCount(ch, k, v ?? 0)}
                          label={`${CHANNEL_LABEL[ch]} ${k}`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Total</th>
                  <td className="num strong">{preview.yes}</td>
                  <td className="num strong">{preview.no}</td>
                  <td className="num strong">{preview.abstain}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="preview-line">
            <span>
              {preview.votesCast} votes cast · <strong>{preview.needed}</strong> needed ({THRESHOLD_LABEL[threshold].toLowerCase()}) ·{' '}
              {Math.round(preview.yesPct)}% in favour
              {a.motionSettings.quorum.kind !== 'none' && ` · quorum ${preview.quorumRequired} (total vote ${preview.totalVote})`}
            </span>
            {preview.votesCast > 0 &&
              (preview.carried ? (
                <Badge kind="ok">Would carry</Badge>
              ) : (
                <Badge kind="bad">Would be defeated{!preview.quorumMet ? ' — no quorum' : ''}</Badge>
              ))}
          </div>

          <div className="row wrap">
            <button onClick={record} disabled={preview.totalVote === 0}>
              Record this vote
            </button>
            <button className="outline secondary" onClick={() => { setVoteKind(null); setCounts(zero()); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <label>
        Notes for the minutes
        <textarea rows={2} defaultValue={motion.notes} key={motion.notes} onBlur={(e) => s.updateMotion(a.id, motion.id, { notes: e.target.value })} />
      </label>
    </article>
  );
}
