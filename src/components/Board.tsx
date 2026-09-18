import { AGAINST, type CandidateStatus, type Language, type Position, type PositionState } from '../engine/types';
import { fmtLimit, pct } from '../engine/thirdLegacy';
import { ordinalL, t } from '../i18n';

function statusText(s: CandidateStatus | undefined, lang: Language): { text: string; cls: string } {
  const d = t(lang);
  if (!s) return { text: '', cls: '' };
  switch (s.kind) {
    case 'standing':
      return { text: d.standing, cls: 'st-standing' };
    case 'elected':
      return { text: d.electedStatus, cls: 'st-elected' };
    case 'notElected':
      return { text: d.notElected, cls: 'st-lost' };
    case 'withdrawn':
      if (s.voluntary) return { text: s.afterBallot === 0 ? d.withdrewBefore : d.withdrewAfter(d.ballot(s.afterBallot)), cls: 'st-out' };
      return {
        text: d.withdrawnAfter(d.ballot(s.afterBallot), s.rule === 'oneFifth' ? '< ⅕' : s.rule === 'oneThird' ? '< ⅓' : '↓'),
        cls: 'st-out',
      };
  }
}

/**
 * The "chalkboard": candidates down the side, one column per ballot — exactly how the
 * tally is posted in the room under the Third Legacy Procedure.
 */
export function Board({
  position,
  state,
  breakdown = true,
  large = false,
  lang = 'en',
}: {
  position: Position;
  state: PositionState;
  breakdown?: boolean;
  large?: boolean;
  lang?: Language;
}) {
  const d = t(lang);
  const ballots = state.ballots;
  const hasConfirmation = ballots.some((b) => b.isConfirmation);
  const rows = [
    ...position.candidates.map((c) => ({ id: c.id, name: c.name, district: c.district })),
    ...(hasConfirmation ? [{ id: AGAINST, name: d.no, district: undefined }] : []),
  ];

  if (!rows.length) return <p className="muted">—</p>;

  return (
    <div className="board-wrap">
      <table className={`board ${large ? 'board-large' : ''}`}>
        <thead>
          <tr>
            <th scope="col">{d.candidate}</th>
            {ballots.map((b) => (
              <th scope="col" key={b.number} className="num">
                {ordinalL(b.number, lang)}
                {b.isConfirmation ? ' ✓/✗' : ''}
              </th>
            ))}
            <th scope="col">{d.status}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const st = statusText(state.status[row.id], lang);
            return (
              <tr key={row.id} className={st.cls}>
                <th scope="row">
                  <span className="cand-name">{row.name}</span>
                  {row.district && <div className="sub cand-district">{row.district}</div>}
                </th>
                {ballots.map((b) => {
                  const v = b.votes[row.id];
                  if (!v) return <td key={b.number} className="num empty" />;
                  const elected = b.electedId === row.id;
                  const out = b.autoWithdrawnIds.includes(row.id);
                  // Only flag "top two" when that protection actually kept the candidate on the board.
                  const prot = b.withdrawalLimit !== null && b.protectedIds.includes(row.id) && v.total < b.withdrawalLimit;
                  return (
                    <td key={b.number} className={`num ${elected ? 'cell-elected' : ''} ${out ? 'cell-out' : ''}`}>
                      <div className="votes">{v.total}</div>
                      <div className="sub">{pct(v.total, b.totalVote)}</div>
                      {breakdown && (
                        <div className="sub split" title="In-person / virtual">
                          {v.inPerson} / {v.virtual}
                        </div>
                      )}
                      {elected && <div className="tag">{d.electedTag}</div>}
                      {out && <div className="tag">{d.withdrawnTag}</div>}
                      {prot && !elected && <div className="tag tag-soft">{d.topTwo}</div>}
                    </td>
                  );
                })}
                <td className={`status ${st.cls}`}>{st.text}</td>
              </tr>
            );
          })}
        </tbody>
        {ballots.length > 0 && (
          <tfoot>
            <tr>
              <th scope="row">{d.blankInvalid}</th>
              {ballots.map((b) => (
                <td key={b.number} className="num">
                  {b.invalid.total}
                  {breakdown && (
                    <div className="sub split">
                      {b.invalid.inPerson} / {b.invalid.virtual}
                    </div>
                  )}
                </td>
              ))}
              <td />
            </tr>
            <tr>
              <th scope="row">{d.totalVoteLabel}</th>
              {ballots.map((b) => (
                <td key={b.number} className="num strong">
                  {b.totalVote}
                </td>
              ))}
              <td />
            </tr>
            <tr>
              <th scope="row">{d.neededToElect}</th>
              {ballots.map((b) => (
                <td key={b.number} className="num strong">
                  {b.electThreshold}
                </td>
              ))}
              <td />
            </tr>
            <tr>
              <th scope="row">{d.withdrawalRule}</th>
              {ballots.map((b) => (
                <td key={b.number} className="num sub">
                  {b.withdrawalRule === 'oneFifth' && `< ${fmtLimit(b.withdrawalLimit)} (⅕)`}
                  {b.withdrawalRule === 'oneThird' && `< ${fmtLimit(b.withdrawalLimit)} (⅓)`}
                  {b.withdrawalRule === 'lowest' && '↓'}
                  {!b.withdrawalRule && '—'}
                </td>
              ))}
              <td />
            </tr>
          </tfoot>
        )}
      </table>
      {breakdown && ballots.length > 0 && <p className="sub muted">{d.splitNote}</p>}
    </div>
  );
}
