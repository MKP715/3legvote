import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './store';
import { computePosition } from './engine/thirdLegacy';
import type { Assembly } from './engine/types';

const S = () => useStore.getState();
const A = (id: string): Assembly => S().assemblies.find((a) => a.id === id)!;

function castBallot(aid: string, pid: string, votes: Record<string, [number, number]>) {
  const d = {
    counts: { inPerson: { votes: {} as Record<string, number>, invalid: 0 }, virtual: { votes: {} as Record<string, number>, invalid: 0 } },
    collected: { inPerson: null, virtual: null },
    note: '',
    tallyLog: [],
  };
  const p = A(aid).positions.find((x) => x.id === pid)!;
  for (const [name, [ip, v]] of Object.entries(votes)) {
    const c = p.candidates.find((x) => x.name === name)!;
    d.counts.inPerson.votes[c.id] = ip;
    d.counts.virtual.votes[c.id] = v;
  }
  S().setDraft(aid, pid, d);
  S().recordBallot(aid, pid);
}

describe('store: multi-position election', () => {
  beforeEach(() => useStore.setState({ assemblies: [] }));

  it('runs delegate to the hat, fills the alternate by second draw, and undoes cleanly', () => {
    const aid = S().createAssembly('Test', ['Delegate', 'Alternate Delegate']);
    const [del, alt] = A(aid).positions;
    S().updatePosition(aid, del.id, { hatSecondToPositionId: alt.id });
    S().addCandidate(aid, del.id, 'Ann');
    S().addCandidate(aid, del.id, 'Bob');
    expect(() => S().addCandidate(aid, del.id, 'ann')).toThrow(/already a candidate/);
    S().startBalloting(aid, del.id);
    expect(() => S().addCandidate(aid, del.id, 'Cy')).toThrow(/closed/);

    for (let i = 0; i < 4; i++) castBallot(aid, del.id, { Ann: [20, 5], Bob: [12, 3] });
    expect(computePosition(A(aid).positions[0], A(aid).settings).phase.kind).toBe('motion');

    // Can't undo ballot 4 once the motion is recorded.
    S().recordMotion(aid, del.id, {
      kind: 'vote',
      hands: { inPerson: { yes: 3, no: 20 }, virtual: { yes: 1, no: 5 } },
      carried: false,
      reconsideration: false,
    });
    expect(() => S().undoLastBallot(aid, del.id)).toThrow();

    const annId = A(aid).positions[0].candidates[0].id;
    const bobId = A(aid).positions[0].candidates[1].id;
    S().recordHat(aid, del.id, { mode: 'physical', poolIds: [annId, bobId], order: [bobId, annId] });

    let a = A(aid);
    expect(computePosition(a.positions[0], a.settings).phase).toMatchObject({ kind: 'elected', candidateId: bobId, method: 'hat' });
    const altState = computePosition(a.positions[1], a.settings);
    expect(altState.phase).toMatchObject({ kind: 'elected', method: 'hatSecondDraw' });
    expect(a.positions[1].candidates.map((c) => c.name)).toEqual(['Ann']);

    // One office per person: Bob can't stand for another position.
    const chairId = S().addPosition(aid, 'Chair');
    expect(() => S().addCandidate(aid, chairId, 'Bob')).toThrow(/already been elected/);
    expect(S().copyCandidates(aid, chairId, del.id)).toBe(0); // Ann (alt) and Bob (delegate) both elected

    S().undoHat(aid, del.id);
    a = A(aid);
    expect(computePosition(a.positions[0], a.settings).phase.kind).toBe('hat');
    expect(a.positions[1].appointment).toBeNull();
    expect(a.positions[1].started).toBe(false);
    expect(a.positions[1].candidates).toEqual([]);

    S().undoMotion(aid, del.id);
    S().undoLastBallot(aid, del.id);
    expect(A(aid).positions[0].ballots.length).toBe(3);
    expect(A(aid).log.length).toBeGreaterThan(10);
  });

  it('snapshots eligible voters and clears withdrawals on undo', () => {
    const aid = S().createAssembly('Test', ['Chair']);
    const pid = A(aid).positions[0].id;
    S().setVoters(aid, 'inPerson', 30);
    S().setVoters(aid, 'virtual', 10);
    for (const n of ['A', 'B', 'C']) S().addCandidate(aid, pid, n);
    S().startBalloting(aid, pid);
    castBallot(aid, pid, { A: [10, 3], B: [9, 3], C: [8, 2] });
    expect(A(aid).positions[0].ballots[0].eligibleVoters).toEqual({ inPerson: 30, virtual: 10 });

    const cId = A(aid).positions[0].candidates[2].id;
    S().withdrawCandidate(aid, pid, cId);
    expect(A(aid).positions[0].candidates[2].withdrawnBeforeBallot).toBe(2);
    S().undoLastBallot(aid, pid);
    expect(A(aid).positions[0].candidates[2].withdrawnBeforeBallot).toBeNull();
  });

  it('combines teller reports, replaces an updated report, and reopens a ballot for recount', () => {
    const aid = S().createAssembly('Test', ['Chair']);
    const pid = A(aid).positions[0].id;
    for (const n of ['A', 'B']) S().addCandidate(aid, pid, n);
    S().startBalloting(aid, pid);
    const [a, b] = A(aid).positions[0].candidates.map((c) => c.id);
    S().addTellerReport(aid, pid, { id: 'r1', teller: 'T1', channel: 'inPerson', source: 'device', votes: { [a]: 5, [b]: 2 }, invalid: 1 });
    S().addTellerReport(aid, pid, { id: 'r2', teller: 'T2', channel: 'inPerson', source: 'device', votes: { [a]: 3, [b]: 4 }, invalid: 0 });
    S().addTellerReport(aid, pid, { id: 'p1', teller: 'Zoom', channel: 'virtual', source: 'poll', votes: { [a]: 6, [b]: 1 }, invalid: 0 });
    let d = A(aid).positions[0].draft!;
    expect(d.counts.inPerson.votes).toEqual({ [a]: 8, [b]: 6 });
    expect(d.counts.inPerson.invalid).toBe(1);
    expect(d.counts.virtual.votes).toEqual({ [a]: 6, [b]: 1 });
    // same report again → rejected; updated report → replaces
    expect(() =>
      S().addTellerReport(aid, pid, { id: 'r1', teller: 'T1', channel: 'inPerson', source: 'device', votes: { [a]: 5, [b]: 2 }, invalid: 1 }),
    ).toThrow(/already been added/);
    S().addTellerReport(aid, pid, { id: 'r1', teller: 'T1', channel: 'inPerson', source: 'device', votes: { [a]: 6, [b]: 2 }, invalid: 1 });
    d = A(aid).positions[0].draft!;
    expect(d.counts.inPerson.votes).toEqual({ [a]: 9, [b]: 6 });
    expect(d.tellerReports).toHaveLength(3);
    S().removeTellerReport(aid, pid, 'r2');
    expect(A(aid).positions[0].draft!.counts.inPerson.votes).toEqual({ [a]: 6, [b]: 2 });
    // unknown candidate id → rejected
    expect(() => S().addTellerReport(aid, pid, { id: 'x', teller: '', channel: 'inPerson', source: 'device', votes: { zzz: 1 }, invalid: 0 })).toThrow();

    S().recordBallot(aid, pid); // 12 vs 3 of 15 → A has 80% → elected
    expect(computePosition(A(aid).positions[0], A(aid).settings).phase.kind).toBe('elected');
    S().undoLastBallot(aid, pid);
    const reopened = A(aid).positions[0].draft!;
    expect(reopened.counts.inPerson.votes).toEqual({ [a]: 6, [b]: 2 });
    expect(reopened.counts.virtual.votes).toEqual({ [a]: 6, [b]: 1 });
  });

  it('adds another seat for the same office with the remaining candidates', () => {
    const aid = S().createAssembly('Test', ['At-large member']);
    const pid = A(aid).positions[0].id;
    for (const n of ['A', 'B', 'C']) S().addCandidate(aid, pid, n);
    S().startBalloting(aid, pid);
    castBallot(aid, pid, { A: [20, 0], B: [5, 0], C: [5, 0] });
    const seat2 = S().addSeat(aid, pid)!;
    const p2 = A(aid).positions.find((p) => p.id === seat2)!;
    expect(p2.title).toBe('At-large member — seat 2');
    expect(p2.candidates.map((c) => c.name)).toEqual(['B', 'C']);
    expect(A(aid).positions.map((p) => p.id)).toEqual([pid, seat2]);
  });

  it('rejects a ballot when none is due', () => {
    const aid = S().createAssembly('Test', ['Chair']);
    const pid = A(aid).positions[0].id;
    expect(() => S().recordBallot(aid, pid)).toThrow(/No ballot is due/);
  });
});
