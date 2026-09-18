import type { Position, PositionState } from '../engine/types';

type StepState = 'done' | 'current' | 'todo' | 'skipped';

/**
 * Where we are in the Third Legacy Procedure — mirrors the flowchart in
 * The A.A. Service Manual, Appendix G.
 */
export function Stepper({ position, state }: { position: Position; state: PositionState }) {
  const n = state.ballots.length;
  const ph = state.phase;
  const decided = ph.kind === 'elected' || ph.kind === 'notElected' || ph.kind === 'noCandidates';
  const motionDone = position.motionVotes.length > 0;
  const confirmationOnly = state.ballots.some((b) => b.isConfirmation) || (ph.kind === 'ballot' && ph.isConfirmation);

  const steps: { label: string; sub?: string; st: StepState }[] = [];
  steps.push({ label: 'Nominations', st: ph.kind === 'setup' ? 'current' : 'done' });
  for (let i = 1; i <= 4; i++) {
    let st: StepState = 'todo';
    if (n >= i) st = 'done';
    else if (ph.kind === 'ballot' && ph.number === i) st = 'current';
    else if (decided) st = 'skipped';
    const sub = i === 1 ? '⅔ elects' : i === 2 ? 'then < ⅕ out' : i === 3 ? 'then < ⅓ out' : 'then lowest out';
    steps.push({ label: `Ballot ${i}`, sub, st });
  }
  if (!confirmationOnly) {
    steps.push({
      label: 'Motion',
      sub: '5th ballot?',
      st: ph.kind === 'motion' ? 'current' : motionDone ? 'done' : decided ? 'skipped' : 'todo',
    });
    steps.push({
      label: 'Ballot 5',
      sub: 'final',
      st: n >= 5 ? 'done' : ph.kind === 'ballot' && ph.number === 5 ? 'current' : decided || (ph.kind === 'hat' && n === 4) ? 'skipped' : 'todo',
    });
    steps.push({ label: 'Hat', sub: 'top two', st: ph.kind === 'hat' ? 'current' : position.hat ? 'done' : decided ? 'skipped' : 'todo' });
  }
  steps.push({ label: ph.kind === 'notElected' ? 'Not filled' : 'Elected', st: decided ? 'done' : 'todo' });

  return (
    <ol className="stepper" aria-label="Procedure progress">
      {steps.map((s, i) => (
        <li key={i} className={`step step-${s.st}`} aria-current={s.st === 'current' ? 'step' : undefined}>
          <span className="step-label">{s.label}</span>
          {s.sub && <span className="step-sub">{s.sub}</span>}
        </li>
      ))}
    </ol>
  );
}
