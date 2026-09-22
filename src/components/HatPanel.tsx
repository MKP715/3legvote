import { useEffect, useRef, useState } from 'react';
import type { Assembly, Position } from '../engine/types';
import { secureShuffle } from '../engine/random';
import { useStore } from '../store';
import { listNames, nameOf } from '../announce';
import { attempt, confirmAction, notify } from './ui';

/**
 * Going to the hat. Either the app draws (cryptographically secure and unbiased), or the
 * teller draws physical slips and the chair records the order they came out.
 */
export function HatPanel({ assembly, position, poolIds, reason }: { assembly: Assembly; position: Position; poolIds: string[]; reason: 'motionDefeated' | 'fifthBallot' }) {
  const recordHat = useStore((s) => s.recordHat);
  const [spinning, setSpinning] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [physicalOrder, setPhysicalOrder] = useState<string[]>([]);
  const timer = useRef<number | undefined>(undefined);
  const timeouts = useRef<number[]>([]);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      window.clearInterval(timer.current);
      timeouts.current.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  const secondTarget = position.hatSecondToPositionId ? assembly.positions.find((p) => p.id === position.hatSecondToPositionId) : undefined;

  const digitalDraw = async () => {
    const ok = await confirmAction({
      title: 'Draw from the hat now?',
      body: (
        <p>
          The app will draw at random between <strong>{listNames(poolIds.map((id) => nameOf(position, id)))}</strong> using your browser’s secure random
          number generator. The first name drawn is elected {position.title}. This is recorded in the log.
        </p>
      ),
      confirmLabel: 'Draw',
    });
    if (!ok) return;
    const order = secureShuffle(poolIds);
    useStore.getState().setLivePosition(assembly.id, position.id);
    useStore.getState().setLiveStatus(assembly.id, 'drawing');
    setSpinning(true);
    let i = 0;
    timer.current = window.setInterval(() => {
      setFlash(nameOf(position, poolIds[i++ % poolIds.length]));
    }, 110);
    timeouts.current.push(
      window.setTimeout(() => {
        window.clearInterval(timer.current);
        if (!alive.current) return;
        setFlash(nameOf(position, order[0]));
        timeouts.current.push(
          window.setTimeout(() => {
            if (!alive.current) return;
            setSpinning(false);
            setFlash(null);
            const ok = attempt(() => recordHat(assembly.id, position.id, { mode: 'digital', poolIds, order }));
            // If the position moved on meanwhile, don't leave the projector spinning.
            if (!ok) useStore.getState().setLiveStatus(assembly.id, 'idle');
          }, 900),
        );
      }, 2400),
    );
  };

  const recordPhysical = async () => {
    const remaining = poolIds.filter((id) => !physicalOrder.includes(id));
    if (secondTarget && !secondTarget.started && remaining.length) {
      notify(`Click the names in the order they came out of the hat — the second name is elected ${secondTarget.title}.`, 'error');
      return;
    }
    const order = [...physicalOrder, ...remaining];
    const ok = await confirmAction({
      title: `Record ${nameOf(position, order[0])} as first out of the hat?`,
      body: <p>Draw order: {order.map((id, i) => `${i + 1}. ${nameOf(position, id)}`).join(' · ')}</p>,
      confirmLabel: 'Record draw',
    });
    if (ok) attempt(() => recordHat(assembly.id, position.id, { mode: 'physical', poolIds, order }));
  };

  return (
    <article className="panel hat-panel">
      <header>
        <h3 style={{ margin: 0 }}>Going to the hat</h3>
      </header>
      <p>
        {reason === 'motionDefeated' ? 'The motion for a fifth ballot was defeated.' : 'No candidate received two-thirds on the fifth ballot.'} The top two
        candidates remain (all tied leaders, or the leader and anyone tied for second). <strong>The first name out of the hat is elected.</strong>
      </p>
      {assembly.live.status === 'drawing' && !spinning && (
        <div className="warn-box row-between wrap">
          <span>The projector is showing “drawing from the hat”.</span>
          <button className="outline mini" onClick={() => useStore.getState().setLiveStatus(assembly.id, 'idle')}>
            Stop the animation
          </button>
        </div>
      )}
      <div className="hat-names">
        {poolIds.map((id) => (
          <span key={id} className="hat-name">
            {nameOf(position, id)}
          </span>
        ))}
      </div>
      {secondTarget && (
        <p className="muted">
          Area practice for this position: the <strong>second</strong> name drawn will be elected <strong>{secondTarget.title}</strong>
          {secondTarget.started ? ' (skipped — that position has already started balloting).' : '.'}
        </p>
      )}

      {spinning ? (
        <div className="hat-spin" aria-live="assertive">
          {flash}
        </div>
      ) : (
        <div className="grid">
          <section>
            <h5>Digital draw</h5>
            <p className="muted">Unbiased, cryptographically secure random choice. Good for projecting to the room and the virtual attendees.</p>
            <button onClick={digitalDraw}>🎩 Draw from the hat</button>
          </section>
          <section>
            <h5>Physical hat</h5>
            <p className="muted">Teller draws paper slips. Click names in the order they come out.</p>
            <div className="row wrap">
              {poolIds.map((id) => {
                const idx = physicalOrder.indexOf(id);
                return (
                  <button
                    key={id}
                    className={idx >= 0 ? '' : 'outline'}
                    onClick={() => setPhysicalOrder((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]))}
                  >
                    {idx >= 0 ? `${idx + 1}. ` : ''}
                    {nameOf(position, id)}
                  </button>
                );
              })}
            </div>
            <button className="secondary" disabled={!physicalOrder.length} onClick={recordPhysical}>
              Record physical draw
            </button>
          </section>
        </div>
      )}
    </article>
  );
}
