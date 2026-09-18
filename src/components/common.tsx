import { Link } from 'react-router';
import type { Assembly, Phase, Position } from '../engine/types';
import { CHANNEL_LABEL, CHANNELS } from '../engine/types';
import { ordinal } from '../engine/thirdLegacy';
import { computeEligibility, regionalTrusteeBalance } from '../engine/voters';
import { useStore } from '../store';
import { nameOf } from '../announce';
import { Badge, NumberField } from './ui';

export function PhaseBadge({ phase, position }: { phase: Phase; position: Position }) {
  switch (phase.kind) {
    case 'setup':
      return <Badge kind="muted">Nominations</Badge>;
    case 'ballot':
      return <Badge kind="info">{phase.isConfirmation ? 'Confirmation ballot' : `${ordinal(phase.number)} ballot due`}</Badge>;
    case 'motion':
      return <Badge kind="warn">Fifth-ballot motion</Badge>;
    case 'hat':
      return <Badge kind="warn">Going to the hat</Badge>;
    case 'elected':
      return <Badge kind="ok">Elected: {nameOf(position, phase.candidateId)}</Badge>;
    case 'notElected':
      return <Badge kind="bad">Not filled</Badge>;
    case 'noCandidates':
      return <Badge kind="bad">No candidates</Badge>;
  }
}

/** Eligible voters present right now, per channel. Snapshotted onto every ballot. */
export function VotersBar({ assembly }: { assembly: Assembly }) {
  const setVoters = useStore((s) => s.setVoters);
  if (assembly.useRollForCounts) {
    const el = computeEligibility(assembly.voterRoll, assembly.roles);
    const bal = assembly.electionType === 'regionalTrustee' ? regionalTrusteeBalance(el.eligible, assembly.roles) : null;
    return (
      <div className="voters-bar">
        <strong>Eligible voters (roll call):</strong>
        {CHANNELS.map((ch) => (
          <span key={ch}>
            {CHANNEL_LABEL[ch]} <strong>{el.byChannel[ch]}</strong>
          </span>
        ))}
        <span>
          Total <strong>{el.total}</strong>
        </span>
        <Link to={`/a/${assembly.id}/voters`}>Roll call →</Link>
        {el.excluded.length > 0 && (
          <small className="muted">
            {el.present} present, {el.excluded.length} not voting (non-voting roles, alternates whose primary is present, duplicates).
          </small>
        )}
        {bal && <div className={bal.ok ? 'ok-box' : 'warn-box'}>{bal.message}</div>}
      </div>
    );
  }
  const total = assembly.voters.inPerson + assembly.voters.virtual;
  return (
    <div className="voters-bar">
      <strong>Eligible voters present:</strong>
      {CHANNELS.map((ch) => (
        <label key={ch} className="inline-field">
          {CHANNEL_LABEL[ch]}
          <NumberField label={`${CHANNEL_LABEL[ch]} eligible voters`} value={assembly.voters[ch]} onChange={(v) => setVoters(assembly.id, ch, v ?? 0)} />
        </label>
      ))}
      <span>
        Total <strong>{total}</strong>
      </span>
      <small className="muted">
        Update as voters arrive or leave; each ballot records the count at that moment. 0 = not tracked. Or use the{' '}
        <Link to={`/a/${assembly.id}/voters`}>roll call</Link>.
      </small>
    </div>
  );
}
