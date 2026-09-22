import { useState } from 'react';
import { CHANNEL_LABEL, CHANNELS, type Assembly, type Channel, type HandCount, type Position } from '../engine/types';
import { effectiveMotion, motionCarries } from '../engine/thirdLegacy';
import { useStore } from '../store';
import { attempt, Badge, confirmAction, NumberField } from './ui';

const zero = (): Record<Channel, HandCount> => ({ inPerson: { yes: 0, no: 0 }, virtual: { yes: 0, no: 0 } });

/**
 * After the 4th ballot: motion, second, and a simple majority of hands for a
 * fifth and final ballot. Hands are counted in the room and on the virtual platform.
 */
export function MotionPanel({ assembly, position, mode }: { assembly: Assembly; position: Position; mode: 'vote' | 'reconsider' }) {
  const recordMotion = useStore((s) => s.recordMotion);
  const addLog = useStore((s) => s.addLog);
  const [hands, setHands] = useState(zero);
  const [minority, setMinority] = useState('');
  const [showReconsider, setShowReconsider] = useState(false);

  const yes = hands.inPerson.yes + hands.virtual.yes;
  const no = hands.inPerson.no + hands.virtual.no;
  const counted = yes + no > 0;
  const carried = motionCarries(hands);
  const reconsideration = mode === 'reconsider';
  const last = effectiveMotion(position);

  const setHand = (ch: Channel, k: keyof HandCount, v: number) => setHands((h) => ({ ...h, [ch]: { ...h[ch], [k]: v } }));

  const submit = async (result: boolean, kind: 'vote' | 'noMotion' = 'vote') => {
    const ok = await confirmAction({
      title:
        kind === 'noMotion'
          ? 'No motion or no second — go to the hat?'
          : `Record: fifth-ballot motion ${result ? 'CARRIED' : 'DEFEATED'}?`,
      body:
        kind === 'noMotion' ? (
          <p>Balloting is over and the choice will be made by lot immediately.</p>
        ) : (
          <p>
            {counted ? (
              <>
                Yes {yes} · No {no} (in-person {hands.inPerson.yes}–{hands.inPerson.no}, virtual {hands.virtual.yes}–{hands.virtual.no}).{' '}
              </>
            ) : (
              'Recorded by visual count of hands. '
            )}
            {result ? 'A fifth and final ballot will be held.' : 'Balloting is over; the choice is made by lot immediately.'}
          </p>
        ),
      confirmLabel: 'Record',
    });
    if (!ok) return;
    const saved = attempt(
      () =>
        recordMotion(assembly.id, position.id, {
          kind,
          hands: kind === 'noMotion' ? zero() : hands,
          carried: kind === 'noMotion' ? false : result,
          reconsideration,
          minorityOpinionNote: reconsideration ? minority || undefined : undefined,
        }),
      kind === 'noMotion' ? 'Recorded — the choice goes to the hat.' : `Motion ${result ? 'carried' : 'defeated'}.`,
    );
    // Keep the hand counts on screen if it could not be recorded, so nobody has to count again.
    if (!saved) return;
    setHands(zero());
    setMinority('');
    setShowReconsider(false);
  };

  if (mode === 'reconsider') {
    if (!assembly.settings.allowMinorityOpinion || !last) return null;
    return (
      <article className="panel">
        <header>
          <h4 style={{ margin: 0 }}>Minority opinion &amp; reconsideration</h4>
        </header>
        <p className="muted">
          The motion for a fifth ballot was <strong>{last.carried ? 'carried' : 'defeated'}</strong>
          {last.kind === 'noMotion' ? ' (no motion / no second)' : ''}. If your area practices it, the chair may ask to hear from the minority. A
          motion to reconsider must be made by someone who voted with the majority, and carries by a simple majority.
        </p>
        {!showReconsider ? (
          <div className="row">
            <button className="outline" onClick={() => setShowReconsider(true)}>
              Motion to reconsider carried — re-vote
            </button>
            <button
              className="outline secondary"
              onClick={() => attempt(() => addLog(assembly.id, { action: 'Minority opinion heard; no reconsideration', positionId: position.id }), 'Noted in the log.')}
            >
              Minority heard, no reconsideration
            </button>
          </div>
        ) : (
          <>
            <label>
              Minority opinion (summary for the record)
              <input type="text" value={minority} onChange={(e) => setMinority(e.target.value)} />
            </label>
            <HandsTable hands={hands} setHand={setHand} />
            <VoteButtons counted={counted} carried={carried} yes={yes} no={no} onSubmit={submit} allowNoMotion={false} />
            <button className="outline secondary" onClick={() => setShowReconsider(false)}>
              Cancel
            </button>
          </>
        )}
      </article>
    );
  }

  return (
    <article className="panel">
      <header>
        <h3 style={{ margin: 0 }}>Motion for a fifth and final ballot</h3>
      </header>
      <p>
        No one has been elected after four ballots. The chair asks for a <strong>motion</strong>, a <strong>second</strong>, and a{' '}
        <strong>simple majority of hands</strong> on conducting a fifth and final ballot. If defeated, the choice is made by lot immediately.
      </p>
      <HandsTable hands={hands} setHand={setHand} />
      <VoteButtons counted={counted} carried={carried} yes={yes} no={no} onSubmit={submit} allowNoMotion />
    </article>
  );
}

function HandsTable({ hands, setHand }: { hands: Record<Channel, HandCount>; setHand: (ch: Channel, k: keyof HandCount, v: number) => void }) {
  return (
    <div className="table-scroll">
      <table className="entry-table">
        <thead>
          <tr>
            <th>Show of hands</th>
            <th className="num">Yes (for 5th ballot)</th>
            <th className="num">No</th>
          </tr>
        </thead>
        <tbody>
          {CHANNELS.map((ch) => (
            <tr key={ch}>
              <th scope="row">
                {CHANNEL_LABEL[ch]}
                {ch === 'virtual' && <div className="sub muted">raised hands / poll</div>}
              </th>
              <td className="num">
                <NumberField label={`${CHANNEL_LABEL[ch]} yes`} value={hands[ch].yes} onChange={(v) => setHand(ch, 'yes', v ?? 0)} />
              </td>
              <td className="num">
                <NumberField label={`${CHANNEL_LABEL[ch]} no`} value={hands[ch].no} onChange={(v) => setHand(ch, 'no', v ?? 0)} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            <td className="num strong">{hands.inPerson.yes + hands.virtual.yes}</td>
            <td className="num strong">{hands.inPerson.no + hands.virtual.no}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function VoteButtons({
  counted,
  carried,
  yes,
  no,
  onSubmit,
  allowNoMotion,
}: {
  counted: boolean;
  carried: boolean;
  yes: number;
  no: number;
  onSubmit: (result: boolean, kind?: 'vote' | 'noMotion') => void;
  allowNoMotion: boolean;
}) {
  return (
    <div className="stack">
      {counted ? (
        <div className="row-between">
          <span>
            Result: {carried ? <Badge kind="ok">Carried ({yes}–{no})</Badge> : <Badge kind="bad">Defeated ({yes}–{no}){yes === no ? ' — a tie is not a majority' : ''}</Badge>}
          </span>
          <button onClick={() => onSubmit(carried)}>Record result</button>
        </div>
      ) : (
        <div className="row">
          <span className="muted">No counts entered — record by clear visual majority:</span>
          <button onClick={() => onSubmit(true)}>Carried</button>
          <button className="secondary" onClick={() => onSubmit(false)}>
            Defeated
          </button>
        </div>
      )}
      {allowNoMotion && (
        <button className="outline secondary" onClick={() => onSubmit(false, 'noMotion')}>
          No motion made / not seconded → go to the hat
        </button>
      )}
    </div>
  );
}
