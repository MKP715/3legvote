import { describe, expect, it } from 'vitest';
import {
  computePosition,
  motionCarries,
  tallyBallot,
  topTwo,
  twoThirdsThreshold,
  reachesTwoThirds,
} from './thirdLegacy';
import { secureRandomInt, secureShuffle } from './random';
import {
  AGAINST,
  DEFAULT_SETTINGS,
  type BallotRecord,
  type MotionVote,
  type Position,
  type Settings,
} from './types';

/* ---------------- builders ---------------- */

type Votes = Record<string, number | [number, number]>; // total, or [inPerson, virtual]

function ballot(votes: Votes, invalid: number | [number, number] = 0, eligible: [number, number] = [0, 0]): BallotRecord {
  const ip: Record<string, number> = {};
  const vr: Record<string, number> = {};
  for (const [k, v] of Object.entries(votes)) {
    if (Array.isArray(v)) {
      ip[k] = v[0];
      vr[k] = v[1];
    } else {
      ip[k] = v;
    }
  }
  const [invIp, invVr] = Array.isArray(invalid) ? invalid : [invalid, 0];
  return {
    id: Math.random().toString(36).slice(2),
    counts: { inPerson: { votes: ip, invalid: invIp }, virtual: { votes: vr, invalid: invVr } },
    eligibleVoters: { inPerson: eligible[0], virtual: eligible[1] },
    collected: { inPerson: null, virtual: null },
    recordedAt: new Date().toISOString(),
  };
}

function position(names: string[], ballots: BallotRecord[] = [], extra: Partial<Position> = {}): Position {
  return {
    id: 'p1',
    title: 'Delegate',
    candidates: names.map((n) => ({ id: n, name: n, withdrawnBeforeBallot: null })),
    started: true,
    ballots,
    motionVotes: [],
    hat: null,
    hatSecondToPositionId: null,
    appointment: null,
    draft: null,
    ...extra,
  };
}

function motion(carried: boolean, kind: MotionVote['kind'] = 'vote'): MotionVote {
  return {
    id: 'm',
    kind,
    hands: { inPerson: { yes: carried ? 10 : 2, no: carried ? 2 : 10 }, virtual: { yes: 0, no: 0 } },
    carried,
    reconsideration: false,
    recordedAt: '',
  };
}

const S: Settings = { ...DEFAULT_SETTINGS };

/* ---------------- arithmetic ---------------- */

describe('thresholds', () => {
  it('computes the two-thirds threshold exactly', () => {
    expect(twoThirdsThreshold(0)).toBe(0);
    expect(twoThirdsThreshold(3)).toBe(2);
    expect(twoThirdsThreshold(30)).toBe(20);
    expect(twoThirdsThreshold(31)).toBe(21); // 20.67 → 21
    expect(twoThirdsThreshold(32)).toBe(22); // 21.33 → 22
    expect(twoThirdsThreshold(100)).toBe(67);
    for (let t = 1; t < 500; t++) {
      const th = twoThirdsThreshold(t);
      expect(reachesTwoThirds(th, t)).toBe(true);
      expect(reachesTwoThirds(th - 1, t)).toBe(false);
    }
  });

  it('two-thirds is inclusive (exactly 2/3 elects)', () => {
    expect(reachesTwoThirds(20, 30)).toBe(true);
    expect(reachesTwoThirds(19, 30)).toBe(false);
  });
});

describe('topTwo (the "top two candidates remain" protection)', () => {
  it('keeps the leader and runner-up', () => {
    expect(topTwo(['a', 'b', 'c'], { a: 10, b: 8, c: 3 }).sort()).toEqual(['a', 'b']);
  });
  it('keeps the leader and all tied for second', () => {
    expect(topTwo(['a', 'b', 'c', 'd'], { a: 10, b: 5, c: 5, d: 1 }).sort()).toEqual(['a', 'b', 'c']);
  });
  it('keeps only the tied leaders when two or more tie for first', () => {
    expect(topTwo(['a', 'b', 'c'], { a: 10, b: 10, c: 9 }).sort()).toEqual(['a', 'b']);
    expect(topTwo(['a', 'b', 'c', 'd'], { a: 7, b: 7, c: 7, d: 1 }).sort()).toEqual(['a', 'b', 'c']);
  });
});

/* ---------------- ballots ---------------- */

describe('first ballot', () => {
  it('elects a candidate with two-thirds on the first ballot', () => {
    const st = computePosition(position(['A', 'B'], [ballot({ A: 20, B: 10 })]), S);
    expect(st.phase).toMatchObject({ kind: 'elected', candidateId: 'A', method: 'ballot', ballotNumber: 1 });
    expect(st.status.B.kind).toBe('notElected');
  });

  it('never withdraws anyone after the first ballot', () => {
    const st = computePosition(position(['A', 'B', 'C'], [ballot({ A: 15, B: 14, C: 1 })]), S);
    expect(st.ballots[0].autoWithdrawnIds).toEqual([]);
    expect(st.phase).toMatchObject({ kind: 'ballot', number: 2, activeIds: ['A', 'B', 'C'] });
  });

  it('combines in-person and virtual votes', () => {
    const st = computePosition(position(['A', 'B'], [ballot({ A: [12, 8], B: [6, 4] })]), S);
    const r = st.ballots[0];
    expect(r.votes.A).toEqual({ inPerson: 12, virtual: 8, total: 20 });
    expect(r.totalVote).toBe(30);
    expect(st.phase).toMatchObject({ kind: 'elected', candidateId: 'A' });
  });

  it('needs two-thirds from the combined total, not either channel alone', () => {
    // A has 100% of virtual but only 50% overall.
    const st = computePosition(position(['A', 'B'], [ballot({ A: [5, 10], B: [10, 0] })]), S);
    expect(st.ballots[0].electedId).toBeNull();
  });
});

describe('invalid / blank ballots', () => {
  it('excludes invalid ballots from the total vote by default', () => {
    const r = computePosition(position(['A', 'B'], [ballot({ A: 20, B: 10 }, 6)]), S).ballots[0];
    expect(r.totalVote).toBe(30);
    expect(r.cast.total).toBe(36);
    expect(r.electedId).toBe('A');
  });

  it('includes invalid ballots in the total vote when configured', () => {
    const r = computePosition(position(['A', 'B'], [ballot({ A: 20, B: 10 }, 6)]), { ...S, countInvalidInTotal: true })
      .ballots[0];
    expect(r.totalVote).toBe(36);
    expect(r.electThreshold).toBe(24);
    expect(r.electedId).toBeNull();
  });

  it('treats votes for a withdrawn candidate as invalid', () => {
    const p = position(['A', 'B', 'C'], [ballot({ A: 10, B: 10, C: 5 }), ballot({ A: 10, B: 5, C: 3 })]);
    p.candidates[2].withdrawnBeforeBallot = 2;
    const r = computePosition(p, S).ballots[1];
    expect(r.activeIds).toEqual(['A', 'B']);
    expect(r.invalid.total).toBe(3);
    expect(r.totalVote).toBe(15);
    expect(r.electedId).toBe('A'); // 10/15 = 2/3
  });
});

describe('after the second ballot: one-fifth rule', () => {
  it('withdraws candidates with less than one-fifth', () => {
    // total 50, 1/5 = 10. D (9) goes, C (10) stays (not *less* than 1/5).
    const p = position(['A', 'B', 'C', 'D'], [ballot({ A: 16, B: 15, C: 10, D: 9 }), ballot({ A: 16, B: 15, C: 10, D: 9 })]);
    const st = computePosition(p, S);
    expect(st.ballots[1].withdrawalRule).toBe('oneFifth');
    expect(st.ballots[1].autoWithdrawnIds).toEqual(['D']);
    expect(st.status.D).toMatchObject({ kind: 'withdrawn', voluntary: false, afterBallot: 2, rule: 'oneFifth' });
    expect(st.phase).toMatchObject({ kind: 'ballot', number: 3, activeIds: ['A', 'B', 'C'] });
  });

  it('keeps the top two even if they are below one-fifth', () => {
    // 6 candidates, lots of invalids counted → everyone below 1/5 of 100.
    const p = position(
      ['A', 'B', 'C', 'D', 'E'],
      [ballot({ A: 19, B: 18, C: 18, D: 5, E: 1 }, 39), ballot({ A: 19, B: 18, C: 18, D: 5, E: 1 }, 39)],
    );
    const st = computePosition(p, { ...S, countInvalidInTotal: true });
    // total = 100 → 1/5 = 20; A top, B and C tied for second → protected.
    expect(st.ballots[1].protectedIds.sort()).toEqual(['A', 'B', 'C']);
    expect(st.ballots[1].autoWithdrawnIds.sort()).toEqual(['D', 'E']);
  });
});

describe('after the third ballot: one-third rule', () => {
  it('withdraws candidates with less than one-third, keeping the top two', () => {
    const b = ballot({ A: 12, B: 11, C: 10 }); // total 33, 1/3 = 11
    const p = position(['A', 'B', 'C'], [b, b, b]);
    const st = computePosition(p, S);
    expect(st.ballots[1].autoWithdrawnIds).toEqual([]); // all above 1/5 (6.6)
    expect(st.ballots[2].withdrawalRule).toBe('oneThird');
    expect(st.ballots[2].autoWithdrawnIds).toEqual(['C']);
    expect(st.phase).toMatchObject({ kind: 'ballot', number: 4, activeIds: ['A', 'B'] });
  });

  it('with a tie for second, the leader and all tied seconds remain', () => {
    const early = ballot({ A: 10, B: 9, C: 9, D: 8 }); // total 36, 1/5 = 7.2 → nobody out
    const b = ballot({ A: 14, B: 8, C: 8, D: 6 }); // total 36, 1/3 = 12
    const st = computePosition(position(['A', 'B', 'C', 'D'], [early, early, b]), S);
    expect(st.ballots[1].autoWithdrawnIds).toEqual([]);
    expect(st.ballots[2].autoWithdrawnIds).toEqual(['D']);
    expect(st.phase).toMatchObject({ kind: 'ballot', number: 4, activeIds: ['A', 'B', 'C'] });
  });
});

describe('after the fourth ballot: smallest total withdrawn, then the motion', () => {
  const b3 = ballot({ A: 14, B: 8, C: 8, D: 6 });

  it('withdraws the candidate with the smallest total and asks for the fifth-ballot motion', () => {
    const b4 = ballot({ A: 14, B: 9, C: 7 });
    const st = computePosition(position(['A', 'B', 'C', 'D'], [b3, b3, b3, b4]), S);
    expect(st.ballots[3].withdrawalRule).toBe('lowest');
    expect(st.ballots[3].autoWithdrawnIds).toEqual(['C']);
    expect(st.phase).toMatchObject({ kind: 'motion', activeIds: ['A', 'B'] });
  });

  it('does not withdraw anyone when only the top two remain', () => {
    const b = ballot({ A: 12, B: 11 });
    const st = computePosition(position(['A', 'B'], [b, b, b, b]), S);
    expect(st.ballots[3].autoWithdrawnIds).toEqual([]);
    expect(st.phase.kind).toBe('motion');
  });

  it('tie for the smallest total: withdraws all tied by default', () => {
    const b4 = ballot({ A: 14, B: 9, C: 3, D: 3 });
    const p = position(['A', 'B', 'C', 'D'], [ballot({ A: 10, B: 9, C: 8, D: 7 }), ballot({ A: 10, B: 9, C: 8, D: 7 }), ballot({ A: 10, B: 9, C: 9, D: 9 }), b4]);
    const st = computePosition(p, S);
    // Ballot 3: total 37, 1/3 = 12.33 → A protected, B,C,D tied for second → all protected.
    expect(st.ballots[2].autoWithdrawnIds).toEqual([]);
    expect(st.ballots[3].autoWithdrawnIds.sort()).toEqual(['C', 'D']);
    expect(st.phase).toMatchObject({ kind: 'motion', activeIds: ['A', 'B'] });
  });

  it('tie for the smallest total: withdraws none when configured', () => {
    const b4 = ballot({ A: 14, B: 9, C: 3, D: 3 });
    const p = position(['A', 'B', 'C', 'D'], [ballot({ A: 10, B: 9, C: 8, D: 7 }), ballot({ A: 10, B: 9, C: 8, D: 7 }), ballot({ A: 10, B: 9, C: 9, D: 9 }), b4]);
    const st = computePosition(p, { ...S, fourthBallotLowestTie: 'withdrawNone' });
    expect(st.ballots[3].autoWithdrawnIds).toEqual([]);
    expect(st.phase).toMatchObject({ kind: 'motion', activeIds: ['A', 'B', 'C', 'D'] });
  });

  it('motion carried → fifth ballot; no election → hat with the top two', () => {
    const b = ballot({ A: 12, B: 11 });
    const p = position(['A', 'B'], [b, b, b, b], { motionVotes: [motion(true)] });
    expect(computePosition(p, S).phase).toMatchObject({ kind: 'ballot', number: 5 });
    p.ballots.push(ballot({ A: 13, B: 10 }));
    const st = computePosition(p, S);
    expect(st.phase).toMatchObject({ kind: 'hat', poolIds: ['A', 'B'], reason: 'fifthBallot' });
  });

  it('motion defeated → hat immediately', () => {
    const b = ballot({ A: 12, B: 11 });
    const p = position(['A', 'B'], [b, b, b, b], { motionVotes: [motion(false)] });
    expect(computePosition(p, S).phase).toMatchObject({ kind: 'hat', reason: 'motionDefeated' });
  });

  it('no motion / no second counts as defeated', () => {
    const b = ballot({ A: 12, B: 11 });
    const p = position(['A', 'B'], [b, b, b, b], { motionVotes: [motion(false, 'noMotion')] });
    expect(computePosition(p, S).phase.kind).toBe('hat');
  });

  it('the latest motion vote (after reconsideration) is the one that counts', () => {
    const b = ballot({ A: 12, B: 11 });
    const p = position(['A', 'B'], [b, b, b, b], { motionVotes: [motion(false), { ...motion(true), reconsideration: true }] });
    expect(computePosition(p, S).phase).toMatchObject({ kind: 'ballot', number: 5 });
  });

  it('a fifth ballot can still elect by two-thirds', () => {
    const b = ballot({ A: 12, B: 11 });
    const p = position(['A', 'B'], [b, b, b, b, ballot({ A: 16, B: 8 })], { motionVotes: [motion(true)] });
    expect(computePosition(p, S).phase).toMatchObject({ kind: 'elected', candidateId: 'A', ballotNumber: 5 });
  });

  it('ignores a fifth ballot recorded without a carried motion', () => {
    const b = ballot({ A: 12, B: 11 });
    const p = position(['A', 'B'], [b, b, b, b, ballot({ A: 20, B: 1 })]);
    const st = computePosition(p, S);
    expect(st.phase.kind).toBe('motion');
    expect(st.ignoredBallots).toBe(1);
  });
});

describe('going to the hat', () => {
  const four = (v: Votes) => [ballot(v), ballot(v), ballot(v), ballot(v)];

  it('with a tie for first, all tied leaders go in the hat', () => {
    const p = position(['A', 'B', 'C'], four({ A: 10, B: 10, C: 9 }), { motionVotes: [motion(false)] });
    // After 3rd: A and B tie for first so only they are protected; C (< 1/3) withdrawn.
    const st = computePosition(p, S);
    expect(st.phase).toMatchObject({ kind: 'hat', poolIds: ['A', 'B'] });
  });

  it('with ties for second, the leader and tied seconds go in the hat', () => {
    // B and C tie for second, so they are protected after the 3rd and 4th ballots.
    const p = position(['A', 'B', 'C'], four({ A: 12, B: 9, C: 9 }), { motionVotes: [motion(false)] });
    const st = computePosition(p, S);
    expect(st.phase).toMatchObject({ kind: 'hat', poolIds: ['A', 'B', 'C'] });
  });

  it('first name out of the hat is elected', () => {
    const p = position(['A', 'B'], four({ A: 12, B: 11 }), {
      motionVotes: [motion(false)],
      hat: { mode: 'digital', poolIds: ['A', 'B'], order: ['B', 'A'], drawnAt: '' },
    });
    const st = computePosition(p, S);
    expect(st.phase).toMatchObject({ kind: 'elected', candidateId: 'B', method: 'hat' });
    expect(st.status.A.kind).toBe('notElected');
  });

  it('ignores a hat draw for someone not in the pool', () => {
    const p = position(['A', 'B', 'C'], four({ A: 12, B: 11, C: 1 }), {
      motionVotes: [motion(false)],
      hat: { mode: 'digital', poolIds: [], order: ['C'], drawnAt: '' },
    });
    expect(computePosition(p, S).phase.kind).toBe('hat');
  });
});

describe('voluntary withdrawals', () => {
  it('removes a candidate from the next ballot', () => {
    const p = position(['A', 'B', 'C'], [ballot({ A: 10, B: 9, C: 8 })]);
    p.candidates[1].withdrawnBeforeBallot = 2;
    const st = computePosition(p, S);
    expect(st.phase).toMatchObject({ kind: 'ballot', number: 2, activeIds: ['A', 'C'] });
    expect(st.status.B).toMatchObject({ kind: 'withdrawn', voluntary: true, afterBallot: 1 });
  });

  it('a candidate may withdraw before the first ballot', () => {
    const p = position(['A', 'B', 'C']);
    p.candidates[2].withdrawnBeforeBallot = 1;
    expect(computePosition(p, S).phase).toMatchObject({ kind: 'ballot', number: 1, activeIds: ['A', 'B'] });
  });

  it('everyone withdraws → no candidates', () => {
    const p = position(['A']);
    p.candidates[0].withdrawnBeforeBallot = 1;
    expect(computePosition(p, S).phase.kind).toBe('noCandidates');
  });
});

describe('single candidate', () => {
  it('holds a confirmation (yes/no) ballot by default', () => {
    const p = position(['A']);
    expect(computePosition(p, S).phase).toMatchObject({ kind: 'ballot', number: 1, isConfirmation: true });
    p.ballots.push(ballot({ A: 20, [AGAINST]: 10 }));
    expect(computePosition(p, S).phase).toMatchObject({ kind: 'elected', candidateId: 'A', method: 'confirmation' });
  });

  it('fails confirmation below two-thirds', () => {
    const p = position(['A'], [ballot({ A: 19, [AGAINST]: 11 })]);
    const st = computePosition(p, S);
    expect(st.phase.kind).toBe('notElected');
    expect(st.status.A.kind).toBe('notElected');
  });

  it('auto-elects when configured', () => {
    expect(computePosition(position(['A']), { ...S, singleCandidate: 'autoElect' }).phase).toMatchObject({
      kind: 'elected',
      method: 'unopposed',
    });
  });

  it('when all others withdraw mid-election, the remaining candidate gets a confirmation ballot', () => {
    const p = position(['A', 'B'], [ballot({ A: 10, B: 9 })]);
    p.candidates[1].withdrawnBeforeBallot = 2;
    expect(computePosition(p, S).phase).toMatchObject({ kind: 'ballot', number: 2, isConfirmation: true, activeIds: ['A'] });
  });

  it('does not elect before balloting starts', () => {
    expect(computePosition(position(['A'], [], { started: false }), { ...S, singleCandidate: 'autoElect' }).phase.kind).toBe(
      'setup',
    );
  });
});

describe('full five-ballot walk-through', () => {
  it('follows the whole procedure', () => {
    const p = position(['Ann', 'Bob', 'Cal', 'Dee', 'Eve']);
    // Ballot 1: 60 votes, nobody near 40.
    p.ballots.push(ballot({ Ann: [15, 5], Bob: [10, 5], Cal: [8, 4], Dee: [5, 3], Eve: [3, 2] }));
    let st = computePosition(p, S);
    expect(st.ballots[0].totalVote).toBe(60);
    expect(st.ballots[0].electThreshold).toBe(40);
    expect(st.phase).toMatchObject({ kind: 'ballot', number: 2 });

    // Ballot 2: 1/5 of 60 = 12. Eve (5) and Dee (11) withdrawn.
    p.ballots.push(ballot({ Ann: 22, Bob: 15, Cal: 12, Dee: 11, Eve: 0 }));
    st = computePosition(p, S);
    expect(st.ballots[1].autoWithdrawnIds.sort()).toEqual(['Dee', 'Eve']);
    expect(st.phase).toMatchObject({ kind: 'ballot', number: 3, activeIds: ['Ann', 'Bob', 'Cal'] });

    // Ballot 3: 1/3 of 60 = 20. Cal (18) goes; Bob (19) is protected as runner-up.
    p.ballots.push(ballot({ Ann: 23, Bob: 19, Cal: 18 }));
    st = computePosition(p, S);
    expect(st.ballots[2].autoWithdrawnIds).toEqual(['Cal']);
    expect(st.ballots[2].protectedIds.sort()).toEqual(['Ann', 'Bob']);

    // Ballot 4: no two-thirds; only top two left → motion.
    p.ballots.push(ballot({ Ann: 35, Bob: 25 }));
    st = computePosition(p, S);
    expect(st.phase.kind).toBe('motion');

    // Motion carries (simple majority of hands across both channels).
    const hands = { inPerson: { yes: 20, no: 15 }, virtual: { yes: 5, no: 12 } }; // 25 vs 27 → defeated
    expect(motionCarries(hands)).toBe(false);
    const hands2 = { inPerson: { yes: 20, no: 15 }, virtual: { yes: 10, no: 5 } }; // 30 vs 20 → carried
    expect(motionCarries(hands2)).toBe(true);
    p.motionVotes.push({ ...motion(true), hands: hands2 });

    // Ballot 5: Ann 39/60 → not two-thirds (needs 40). Hat.
    p.ballots.push(ballot({ Ann: 39, Bob: 21 }));
    st = computePosition(p, S);
    expect(st.phase).toMatchObject({ kind: 'hat', poolIds: ['Ann', 'Bob'] });

    p.hat = { mode: 'digital', poolIds: ['Ann', 'Bob'], order: ['Bob', 'Ann'], drawnAt: '' };
    st = computePosition(p, S);
    expect(st.phase).toMatchObject({ kind: 'elected', candidateId: 'Bob', method: 'hat' });
  });
});

describe('integrity checks', () => {
  it('flags more ballots than eligible voters per channel', () => {
    const r = tallyBallot(ballot({ A: [10, 5], B: [5, 6] }, 0, [12, 20]), 1, ['A', 'B'], S);
    expect(r.overVote).toEqual(['inPerson']);
  });

  it('flags a mismatch with ballots collected', () => {
    const b = ballot({ A: 10, B: 5 });
    b.collected = { inPerson: 16, virtual: null };
    expect(tallyBallot(b, 1, ['A', 'B'], S).collectedMismatch).toEqual(['inPerson']);
  });

  it('ignores negative or junk counts', () => {
    const b = ballot({ A: -5, B: 3 });
    expect(tallyBallot(b, 1, ['A', 'B'], S).valid.total).toBe(3);
  });

  it('zero votes cast never elects anyone', () => {
    const st = computePosition(position(['A', 'B'], [ballot({})]), S);
    expect(st.ballots[0].electedId).toBeNull();
  });
});

describe('secure random', () => {
  it('returns in range and shuffles every element', () => {
    for (let i = 0; i < 200; i++) {
      const x = secureRandomInt(3);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(3);
    }
    expect(secureShuffle(['a', 'b', 'c', 'd']).sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('is roughly uniform', () => {
    const counts = [0, 0, 0];
    for (let i = 0; i < 30000; i++) counts[secureRandomInt(3)]++;
    for (const c of counts) expect(Math.abs(c - 10000)).toBeLessThan(600);
  });
});
