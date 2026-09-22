import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { effectiveVoters, useAssembly } from '../store';
import { computePosition, ordinal } from '../engine/thirdLegacy';
import { ballotColor } from '../presets';
import { NumberField } from '../components/ui';
import { NotFound } from './NotFound';

type Kind = 'slips' | 'tally' | 'board';

/**
 * Printables: paper ballot slips (8 per page), teller tally sheets, and a large
 * candidate list for posting on the wall ("the board").
 */
export function PrintBallots() {
  const { aid } = useParams();
  const a = useAssembly(aid);
  const [kind, setKind] = useState<Kind>('slips');
  const [pid, setPid] = useState('');
  const [count, setCount] = useState<number | null>(null);
  const [ballotNo, setBallotNo] = useState<number | null>(null);
  const [showNames, setShowNames] = useState(false);
  if (!a) return <NotFound what="assembly" />;
  const position = a.positions.find((p) => p.id === pid);
  const state = position ? computePosition(position, a.settings) : null;
  const standing = position ? position.candidates.filter((c) => state?.status[c.id]?.kind === 'standing' || !position.started) : [];
  const voters = effectiveVoters(a);
  const n = Math.min(1000, Math.max(1, count ?? (voters.inPerson > 0 ? voters.inPerson : 40)));
  const rounded = Math.max(8, Math.ceil(n / 8) * 8);
  const color = ballotNo ? ballotColor(a.ballotColors, ballotNo) : null;

  return (
    <>
      <nav aria-label="breadcrumb" className="no-print">
        <ul>
          <li>
            <Link to={`/a/${a.id}`}>{a.name}</Link>
          </li>
          <li>Print</li>
        </ul>
      </nav>
      <article className="no-print">
        <header>
          <div role="group">
            <button className={kind === 'slips' ? '' : 'outline secondary'} onClick={() => setKind('slips')}>
              Ballot slips
            </button>
            <button className={kind === 'tally' ? '' : 'outline secondary'} onClick={() => setKind('tally')}>
              Teller tally sheet
            </button>
            <button className={kind === 'board' ? '' : 'outline secondary'} onClick={() => setKind('board')}>
              Candidate board
            </button>
          </div>
        </header>
        <div className="grid">
          <label>
            Position
            <select value={pid} onChange={(e) => setPid(e.target.value)}>
              <option value="">{kind === 'slips' ? '(leave blank — write in)' : 'Choose…'}</option>
              {a.positions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
          {kind !== 'board' && (
            <label>
              Ballot number
              <NumberField value={ballotNo} allowNull onChange={setBallotNo} placeholder="blank" />
            </label>
          )}
          {kind === 'slips' && (
            <label>
              How many
              <NumberField value={count ?? n} onChange={(v) => setCount(v)} />
            </label>
          )}
        </div>
        {kind === 'slips' && (
          <>
            <label>
              <input type="checkbox" checked={showNames} disabled={!position} onChange={(e) => setShowNames(e.target.checked)} />
              List the candidates’ names on the slip (for reference — voters still write one name)
            </label>
            <p className="muted">
              Prints {rounded} slips ({rounded / 8} page{rounded / 8 === 1 ? '' : 's'}).
              {color ? ` Print on ${color.name.toLowerCase()} paper for the ${ordinal(ballotNo!)} ballot.` : ' Colour-coded paper for each ballot round speeds up counting.'}
            </p>
          </>
        )}
        {kind === 'tally' && <p className="muted">One sheet per teller. Mark a stroke per ballot in groups of five, then total each line and sign.</p>}
        {kind === 'board' && <p className="muted">Large list of the candidates for posting on the wall; fill in each ballot’s tally by hand if you are not projecting.</p>}
        <button onClick={() => window.print()} disabled={kind !== 'slips' && !position}>
          Print
        </button>
      </article>

      {kind === 'slips' && (
        <div className="slips">
          {Array.from({ length: rounded }, (_, i) => (
            <div className="slip" key={i}>
              <div className="slip-head">{a.name}</div>
              <div className="slip-title">{position?.title ?? 'Position: ____________________'}</div>
              <div className="slip-no">
                {ballotNo ? `${ordinal(ballotNo)} ballot` : 'Ballot # ____'}
                {color && <span className="slip-color"> · {color.name.toUpperCase()}</span>}
              </div>
              {showNames && position && <div className="slip-names">{standing.map((c) => c.name).join(' · ')}</div>}
              <div className="slip-instr">Write ONE name:</div>
              <div className="slip-line" />
            </div>
          ))}
        </div>
      )}

      {kind === 'tally' && position && (
        <div className="print-sheet">
          {[0, 1].map((copy) => (
            <section key={copy} className="tally-sheet">
              <h2>
                Teller tally — {position.title} — {ballotNo ? `${ordinal(ballotNo)} ballot` : 'ballot # ____'}
                {color ? ` (${color.name})` : ''}
              </h2>
              <p>
                {a.name} · {a.date} · Teller: ________________________ · Channel: ☐ In-person ☐ Virtual
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th>Tally (groups of five)</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {[...standing.map((c) => c.name), 'Blank / invalid'].map((name) => (
                    <tr key={name}>
                      <td className="tally-name">{name}</td>
                      <td className="tally-boxes">
                        {Array.from({ length: 12 }, (_, i) => (
                          <span key={i} className="tally-box" />
                        ))}
                      </td>
                      <td className="tally-total" />
                    </tr>
                  ))}
                  <tr>
                    <td className="tally-name">
                      <strong>Ballots counted</strong>
                    </td>
                    <td />
                    <td className="tally-total" />
                  </tr>
                </tbody>
              </table>
              <p>Checked by second teller: ________________________</p>
            </section>
          ))}
        </div>
      )}

      {kind === 'board' && position && (
        <div className="print-sheet board-sign">
          <h1>{position.title}</h1>
          <table>
            <thead>
              <tr>
                <th>Candidate</th>
                {[1, 2, 3, 4, 5].map((b) => (
                  <th key={b}>{ordinal(b)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {standing.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.name}</strong>
                    {c.district && <div>{c.district}</div>}
                  </td>
                  {[1, 2, 3, 4, 5].map((b) => (
                    <td key={b} />
                  ))}
                </tr>
              ))}
              <tr>
                <td>Total vote / ⅔ needed</td>
                {[1, 2, 3, 4, 5].map((b) => (
                  <td key={b} />
                ))}
              </tr>
            </tbody>
          </table>
          <p>⅔ of the total vote elects · after 2nd: &lt; ⅕ withdrawn · after 3rd: &lt; ⅓ withdrawn · after 4th: lowest withdrawn · top two always remain</p>
        </div>
      )}
    </>
  );
}
