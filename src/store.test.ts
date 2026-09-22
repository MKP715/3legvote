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

  it('survives a JSON export and re-import with everything intact', () => {
    const aid = S().createAssembly('Area 00 Assembly', ['Delegate', 'Alternate Delegate'], 'area');
    const [del, alt] = A(aid).positions;
    S().updateAssembly(aid, { location: 'Hall + Zoom', chair: 'Chair A.', language: 'es', ballotColors: ['White', 'Canary'] });
    S().updateOfficials(aid, { tellers: 'Maria S., Tom K.', virtualTeller: 'Dana P.' });
    S().setApproval(aid, 'procedure', true);
    S().updateSettings(aid, { countInvalidInTotal: true });
    S().updatePosition(aid, del.id, { hatSecondToPositionId: alt.id, description: 'Two-year term' });
    S().importVoters(
      aid,
      [
        ...Array.from({ length: 6 }, (_, i) => ({
          id: `r${i}`,
          name: `Voter ${i}`,
          roleId: 'gsr',
          group: `Group ${i}`,
          district: '1',
          channel: 'inPerson' as const,
          present: true,
        })),
        { id: 'r7', name: 'Bob C.', roleId: 'officer', group: 'Area', district: '', channel: 'virtual', present: true },
      ],
      true,
    );
    S().updateAssembly(aid, { useRollForCounts: true });
    for (const n of ['Ann B.', 'Bob C.', 'Cy D.']) S().addCandidate(aid, del.id, n, 'District 1');
    S().startBalloting(aid, del.id);
    const ids = A(aid).positions[0].candidates.map((c) => c.id);
    S().addTellerReport(aid, del.id, { id: 't1', teller: 'Maria', channel: 'inPerson', source: 'device', votes: { [ids[0]]: 4 }, invalid: 1 });
    castBallot(aid, del.id, { 'Ann B.': [4, 1], 'Bob C.': [3, 0], 'Cy D.': [2, 0] });
    S().withdrawCandidate(aid, del.id, ids[2]);

    const exported = JSON.parse(JSON.stringify(A(aid)));
    useStore.setState({ assemblies: [] });
    const newId = S().importAssembly(exported);
    const back = A(newId);

    expect(back.name).toBe('Area 00 Assembly');
    expect(back.electionType).toBe('area');
    expect(back.language).toBe('es');
    expect(back.ballotColors).toEqual(['White', 'Canary']);
    expect(back.officials.tellers).toBe('Maria S., Tom K.');
    expect(back.approvals.procedure).toBeTruthy();
    expect(back.settings.countInvalidInTotal).toBe(true);
    expect(back.useRollForCounts).toBe(true);
    expect(back.voterRoll).toHaveLength(7);
    expect(back.voterRoll[6]).toMatchObject({ name: 'Bob C.', roleId: 'officer', channel: 'virtual' });
    expect(back.roles.map((r) => r.id)).toContain('officer');
    expect(back.positions[0].description).toBe('Two-year term');
    expect(back.positions[0].hatSecondToPositionId).toBe(back.positions[1].id);
    expect(back.positions[0].ballots).toHaveLength(1);
    expect(back.positions[0].ballots[0].eligibleVoters).toEqual({ inPerson: 6, virtual: 1 });
    expect(back.positions[0].candidates[0]).toMatchObject({ name: 'Ann B.', district: 'District 1' });
    expect(back.positions[0].candidates[2].withdrawnBeforeBallot).toBe(2);
    // the recomputed result is identical
    const before = computePosition(exported.positions[0], exported.settings);
    const after = computePosition(back.positions[0], back.settings);
    expect(after.phase).toEqual(before.phase);
    expect(after.ballots[0].totalVote).toBe(before.ballots[0].totalVote);
    expect(back.log.length).toBeGreaterThan(exported.log.length - 1);
  });

  it('restores an assembly saved by an older version that lacks the newer fields', () => {
    const old = {
      id: 'old1',
      name: 'Old Assembly',
      date: '2026-01-01',
      location: '',
      chair: '',
      notes: '',
      voters: { inPerson: 12, virtual: 3 },
      settings: { countInvalidInTotal: false },
      positions: [
        {
          id: 'p1',
          title: 'Delegate',
          candidates: [{ id: 'c1', name: 'Ann' }, { id: 'c2', name: 'Bob' }],
          started: true,
          ballots: [
            {
              id: 'b1',
              counts: { inPerson: { votes: { c1: 8, c2: 4 }, invalid: 0 }, virtual: { votes: {}, invalid: 0 } },
              eligibleVoters: { inPerson: 12, virtual: 3 },
              collected: { inPerson: null, virtual: null },
              recordedAt: '2026-01-01T10:00:00.000Z',
            },
          ],
          motionVotes: [],
          hat: null,
        },
      ],
      log: [],
    };
    const id = S().importAssembly(old);
    const a = A(id);
    expect(a.electionType).toBe('area');
    expect(a.roles.length).toBeGreaterThan(0);
    expect(a.voterRoll).toEqual([]);
    expect(a.live.status).toBe('idle');
    expect(a.ballotColors[0]).toBe('White');
    expect(a.positions[0].candidates[0].withdrawnBeforeBallot).toBeNull();
    const st = computePosition(a.positions[0], a.settings);
    expect(st.phase).toMatchObject({ kind: 'elected', candidateId: 'c1' }); // 8 of 12 = exactly two-thirds
  });

  it('keeps a candidate on the ballot being counted when they withdraw mid-count', () => {
    const aid = S().createAssembly('Test', ['Delegate']);
    const pid = A(aid).positions[0].id;
    for (const n of ['A', 'B', 'C']) S().addCandidate(aid, pid, n);
    S().startBalloting(aid, pid);
    const [a, b, c] = A(aid).positions[0].candidates.map((x) => x.id);
    // Tellers have counted 100 ballots: A 60, B 25, C 15.
    S().setDraft(aid, pid, {
      counts: { inPerson: { votes: { [a]: 60, [b]: 25, [c]: 15 }, invalid: 0 }, virtual: { votes: {}, invalid: 0 } },
      collected: { inPerson: null, virtual: null },
      note: '',
      tallyLog: [],
    });
    S().withdrawCandidate(aid, pid, c);
    // C stays on this ballot, so the total vote is still 100 and nobody reaches two-thirds.
    expect(A(aid).positions[0].candidates[2].withdrawnBeforeBallot).toBe(2);
    S().recordBallot(aid, pid);
    const st = computePosition(A(aid).positions[0], A(aid).settings);
    expect(st.ballots[0].totalVote).toBe(100);
    expect(st.ballots[0].electThreshold).toBe(67);
    expect(st.ballots[0].electedId).toBeNull();
    expect(st.phase).toMatchObject({ kind: 'ballot', number: 2, activeIds: [a, b] });
  });

  it('requires the full draw order when the second name fills another position', () => {
    const aid = S().createAssembly('Test', ['Delegate', 'Alternate Delegate']);
    const [del, alt] = A(aid).positions;
    S().updatePosition(aid, del.id, { hatSecondToPositionId: alt.id });
    // The alternate position already has its own nominee.
    S().addCandidate(aid, alt.id, 'Ann');
    for (const n of ['Ann', 'Bob']) S().addCandidate(aid, del.id, n);
    S().startBalloting(aid, del.id);
    const [ann, bob] = A(aid).positions[0].candidates.map((c) => c.id);
    for (let i = 0; i < 4; i++) castBallot(aid, del.id, { Ann: [12, 0], Bob: [11, 0] });
    S().recordMotion(aid, del.id, { kind: 'vote', hands: { inPerson: { yes: 1, no: 9 }, virtual: { yes: 0, no: 0 } }, carried: false, reconsideration: false });
    // Only one slip recorded → refused, because the second name elects the alternate.
    expect(() => S().recordHat(aid, del.id, { mode: 'physical', poolIds: [ann, bob], order: [bob] })).toThrow(/every slip/i);
    expect(() => S().recordHat(aid, del.id, { mode: 'physical', poolIds: [ann, bob], order: [bob, bob] })).toThrow(/does not match/i);
    S().recordHat(aid, del.id, { mode: 'physical', poolIds: [ann, bob], order: [bob, ann] });
    expect(A(aid).positions[1].appointment).toMatchObject({ createdCandidate: false });
    // Undoing must not delete the nominee the position already had.
    S().undoHat(aid, del.id);
    expect(A(aid).positions[1].candidates.map((c) => c.name)).toEqual(['Ann']);
  });

  it('refuses to undo a ballot when the next one is already being counted', () => {
    const aid = S().createAssembly('Test', ['Chair']);
    const pid = A(aid).positions[0].id;
    for (const n of ['A', 'B']) S().addCandidate(aid, pid, n);
    S().startBalloting(aid, pid);
    castBallot(aid, pid, { A: [5, 0], B: [4, 0] });
    const [a] = A(aid).positions[0].candidates.map((c) => c.id);
    S().setDraft(aid, pid, {
      counts: { inPerson: { votes: { [a]: 3 }, invalid: 0 }, virtual: { votes: {}, invalid: 0 } },
      collected: { inPerson: null, virtual: null },
      note: '',
      tallyLog: [],
    });
    expect(() => S().undoLastBallot(aid, pid)).toThrow(/Clear those counts first/);
    S().clearDraftCounts(aid, pid);
    S().undoLastBallot(aid, pid);
    expect(A(aid).positions[0].ballots).toHaveLength(0);
  });

  it('keeps the teller link and reports usable when counts are cleared', () => {
    const aid = S().createAssembly('Test', ['Chair']);
    const pid = A(aid).positions[0].id;
    S().setVoters(aid, 'inPerson', 50);
    for (const n of ['A', 'B']) S().addCandidate(aid, pid, n);
    S().startBalloting(aid, pid);
    const [a] = A(aid).positions[0].candidates.map((c) => c.id);
    S().addTellerReport(aid, pid, { id: 't1', teller: 'T', channel: 'inPerson', source: 'device', votes: { [a]: 4 }, invalid: 0 });
    const key = A(aid).positions[0].draft!.key;
    S().clearDraftCounts(aid, pid);
    const d = A(aid).positions[0].draft!;
    expect(d.key).toBe(key); // teller devices keep working
    expect(d.counts.inPerson.votes[a] ?? 0).toBe(0);
    expect(d.tellerReports).toEqual([]);
  });

  it('rejects a teller report bigger than the eligible voters for that channel', () => {
    const aid = S().createAssembly('Test', ['Chair']);
    const pid = A(aid).positions[0].id;
    S().setVoters(aid, 'inPerson', 10);
    for (const n of ['A', 'B']) S().addCandidate(aid, pid, n);
    S().startBalloting(aid, pid);
    const [a] = A(aid).positions[0].candidates.map((c) => c.id);
    // A small over-count is allowed (the roll may be incomplete) and warned about on the ballot;
    // an impossible one is refused.
    S().addTellerReport(aid, pid, { id: 'slightly-over', teller: 'T', channel: 'inPerson', source: 'device', votes: { [a]: 12 }, invalid: 0 });
    expect(() =>
      S().addTellerReport(aid, pid, { id: 'big', teller: 'T', channel: 'inPerson', source: 'device', votes: { [a]: 40 }, invalid: 0 }),
    ).toThrow(/different ballot/);
  });

  it('rejects a ballot when none is due', () => {
    const aid = S().createAssembly('Test', ['Chair']);
    const pid = A(aid).positions[0].id;
    expect(() => S().recordBallot(aid, pid)).toThrow(/No ballot is due/);
  });
});
