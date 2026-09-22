import { useState } from 'react';
import type { Assembly } from '../engine/types';
import { openingScript } from '../announce';
import { PRESETS } from '../presets';
import { useStore } from '../store';
import { LANGUAGES, whoVotesL } from '../i18n';

/**
 * Service Manual Appendix D, step 5: "Chairperson reviews the election procedure and the area's
 * guidelines for who votes in the assembly and asks approval of it, and of the order of election."
 * Changes to the rules must be made before an election is conducted.
 */
export function OpeningScript({ assembly, title, open = false }: { assembly: Assembly; title: string; open?: boolean }) {
  const s = useStore();
  // Only the initial state comes from the prop, so ticking an approval doesn't collapse the panel.
  const [isOpen, setIsOpen] = useState(open);
  const whoVotes = whoVotesL(assembly.electionType, assembly.language, PRESETS[assembly.electionType].whoVotes);
  const lines = openingScript(title, whoVotes, assembly.ballotColors, assembly.language);
  const ap = assembly.approvals;
  const check = (key: keyof Assembly['approvals'], label: string) => (
    <label>
      <input type="checkbox" checked={!!ap[key]} onChange={(e) => s.setApproval(assembly.id, key, e.target.checked)} />
      {label}
      {ap[key] && <small className="muted"> — {new Date(ap[key]!).toLocaleTimeString()}</small>}
    </label>
  );
  return (
    <details className="panel-lite opening" open={isOpen} onToggle={(e) => setIsOpen(e.currentTarget.open)}>
      <summary>
        Chair’s opening explanation &amp; approvals{' '}
        {ap.procedure && ap.order && ap.whoVotes ? <span className="badge badge-ok">approved</span> : <span className="badge badge-warn">to do</span>}
      </summary>
      <div className="announce">
        <h4>Read to the assembly ({LANGUAGES[assembly.language]})</h4>
        {lines.map((l, i) => (
          <p key={i}>{l}</p>
        ))}
      </div>
      <fieldset>
        <legend>The assembly has approved (Service Manual, Appendix D):</legend>
        {check('procedure', 'The election procedure — Third Legacy, with this assembly’s settings')}
        {check('whoVotes', 'Who votes in this assembly')}
        {check('order', `The order of election: ${assembly.positions.map((p) => p.title).join(' → ') || '—'}`)}
      </fieldset>
      <p className="sub muted">
        “If members want to make a change in the rules, it should be done before a vote is taken, or before an election is conducted.” — The A.A.
        Service Manual
      </p>
    </details>
  );
}
