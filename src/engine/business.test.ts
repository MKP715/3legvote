import { describe, expect, it } from 'vitest';
import {
  addMinutes,
  CONFERENCE_COMMITTEES,
  elapsedMinutes,
  meetsThreshold,
  MOTION_RULES,
  scheduleAgenda,
  tallyConferenceItem,
  tallyMotion,
  votesNeeded,
} from './business';
import { DEFAULT_MOTION_SETTINGS, type Channel, type MotionSettings, type MotionVoteCount } from './types';

const counts = (ipYes: number, ipNo: number, ipAb = 0, vYes = 0, vNo = 0, vAb = 0): Record<Channel, MotionVoteCount> => ({
  inPerson: { yes: ipYes, no: ipNo, abstain: ipAb },
  virtual: { yes: vYes, no: vNo, abstain: vAb },
});

const S = (patch: Partial<MotionSettings> = {}): MotionSettings => ({ ...DEFAULT_MOTION_SETTINGS, ...patch });

describe('thresholds', () => {
  it('two-thirds is substantial unanimity, and exactly two-thirds carries', () => {
    expect(votesNeeded('twoThirds', 30)).toBe(20);
    expect(meetsThreshold('twoThirds', 20, 30)).toBe(true);
    expect(meetsThreshold('twoThirds', 19, 30)).toBe(false);
    for (let cast = 1; cast < 300; cast++) {
      const need = votesNeeded('twoThirds', cast);
      expect(meetsThreshold('twoThirds', need, cast)).toBe(true);
      expect(meetsThreshold('twoThirds', need - 1, cast)).toBe(false);
    }
  });

  it('simple majority is one-half of votes cast plus one', () => {
    expect(votesNeeded('simpleMajority', 10)).toBe(6);
    expect(votesNeeded('simpleMajority', 11)).toBe(6);
    expect(meetsThreshold('simpleMajority', 6, 11)).toBe(true);
    expect(meetsThreshold('simpleMajority', 5, 10)).toBe(false); // a tie is not a majority
    for (let cast = 1; cast < 300; cast++) {
      const need = votesNeeded('simpleMajority', cast);
      expect(meetsThreshold('simpleMajority', need, cast)).toBe(true);
      expect(meetsThreshold('simpleMajority', need - 1, cast)).toBe(false);
    }
  });

  it('supports the three-quarters standard some bodies use', () => {
    expect(votesNeeded('threeQuarters', 40)).toBe(30);
    expect(meetsThreshold('threeQuarters', 30, 40)).toBe(true);
    expect(meetsThreshold('threeQuarters', 29, 40)).toBe(false);
  });
});

describe('motion rules follow Appendix W', () => {
  it('matches the Service Manual summary table', () => {
    expect(MOTION_RULES.committee).toMatchObject({ second: 'automatic', debatable: true, threshold: 'twoThirds', minorityHeard: true });
    expect(MOTION_RULES.amend).toMatchObject({ second: 'required', debatable: true, threshold: 'twoThirds', minorityHeard: true });
    expect(MOTION_RULES.table).toMatchObject({ debatable: false, threshold: 'simpleMajority', minorityHeard: false });
    expect(MOTION_RULES.recommit).toMatchObject({ debatable: true, threshold: 'twoThirds', minorityHeard: false });
    expect(MOTION_RULES.callQuestion).toMatchObject({ debatable: false, threshold: 'twoThirds', minorityHeard: false });
    expect(MOTION_RULES.reconsider).toMatchObject({ debatable: false, threshold: 'simpleMajority', minorityHeard: false });
    expect(MOTION_RULES.floor).toMatchObject({ debatable: true, threshold: 'twoThirds', minorityHeard: true });
    expect(MOTION_RULES.decline).toMatchObject({ debatable: false, threshold: 'twoThirds', minorityHeard: false });
  });
});

describe('tallying a motion', () => {
  it('leaves abstentions out of the votes cast by default', () => {
    const t = tallyMotion(counts(20, 10, 5), 'twoThirds', S(), 0);
    expect(t.votesCast).toBe(30);
    expect(t.totalVote).toBe(35);
    expect(t.needed).toBe(20);
    expect(t.carried).toBe(true);
  });

  it('counts abstentions when the body decides to', () => {
    const t = tallyMotion(counts(20, 10, 5), 'twoThirds', S({ countAbstentions: true }), 0);
    expect(t.votesCast).toBe(35);
    expect(t.needed).toBe(24);
    expect(t.carried).toBe(false);
  });

  it('adds in-person and virtual votes together', () => {
    const t = tallyMotion(counts(12, 4, 1, 8, 6, 2), 'twoThirds', S(), 0);
    expect(t.yes).toBe(20);
    expect(t.no).toBe(10);
    expect(t.abstain).toBe(3);
    expect(t.byChannel.virtual).toEqual({ yes: 8, no: 6, abstain: 2 });
  });

  it('fails a motion that lacks a quorum even with two-thirds', () => {
    // Conference practice: two-thirds of registered members must be voting.
    const settings = S({ quorum: { kind: 'fraction', fraction: 2 / 3 } });
    const short = tallyMotion(counts(20, 5, 0), 'twoThirds', settings, 60); // 25 of 60 present
    expect(short.thresholdMet).toBe(true);
    expect(short.quorumRequired).toBe(40);
    expect(short.quorumMet).toBe(false);
    expect(short.carried).toBe(false);
    const ok = tallyMotion(counts(35, 6, 2), 'twoThirds', settings, 60);
    expect(ok.quorumMet).toBe(true);
    expect(ok.carried).toBe(true);
  });

  it('supports a fixed-number quorum', () => {
    const t = tallyMotion(counts(9, 1, 0), 'simpleMajority', S({ quorum: { kind: 'count', count: 15 } }), 100);
    expect(t.quorumMet).toBe(false);
    expect(t.carried).toBe(false);
  });

  it('names the side that did not prevail, which is invited to speak', () => {
    // Carried on two-thirds → the minority against speaks.
    expect(tallyMotion(counts(20, 10), 'twoThirds', S(), 0).minoritySide).toBe('against');
    // A majority in favour that falls short of two-thirds → the majority in favour speaks.
    const short = tallyMotion(counts(18, 12), 'twoThirds', S(), 0);
    expect(short.carried).toBe(false);
    expect(short.yes).toBeGreaterThan(short.no);
    expect(short.minoritySide).toBe('for');
  });

  it('never carries on no votes at all', () => {
    const t = tallyMotion(counts(0, 0, 0), 'twoThirds', S(), 0);
    expect(t.carried).toBe(false);
    expect(t.needed).toBe(0);
  });
});

describe('Conference agenda items', () => {
  const options = [
    { id: 'support', label: 'Support as written' },
    { id: 'changes', label: 'Support with changes' },
    { id: 'oppose', label: 'Do not support' },
  ];

  it('gives the sense of the assembly and flags substantial unanimity', () => {
    const t = tallyConferenceItem(
      { inPerson: { support: 30, changes: 5, oppose: 5 }, virtual: { support: 10, changes: 2, oppose: 3 } },
      { inPerson: 4, virtual: 1 },
      options,
    );
    expect(t.votesCast).toBe(55);
    expect(t.abstainTotal).toBe(5);
    expect(t.totalVote).toBe(60);
    expect(t.leading?.id).toBe('support');
    expect(t.leading?.votes).toBe(40);
    expect(t.leading?.substantialUnanimity).toBe(true);
    expect(t.sense).toMatch(/substantial unanimity/i);
  });

  it('says when a choice leads with only a simple majority', () => {
    const t = tallyConferenceItem({ inPerson: { support: 16, changes: 8, oppose: 6 }, virtual: {} }, { inPerson: 0, virtual: 0 }, options);
    expect(t.leading?.majority).toBe(true);
    expect(t.leading?.substantialUnanimity).toBe(false);
    expect(t.sense).toMatch(/short of two-thirds/i);
  });

  it('reports a tie as no clear sense', () => {
    const t = tallyConferenceItem({ inPerson: { support: 10, changes: 10, oppose: 2 }, virtual: {} }, { inPerson: 0, virtual: 0 }, options);
    expect(t.tied).toBe(true);
    expect(t.leading).toBeNull();
    expect(t.sense).toMatch(/no clear sense/i);
  });

  it('handles an item nobody has voted on yet', () => {
    const t = tallyConferenceItem({ inPerson: {}, virtual: {} }, { inPerson: 0, virtual: 0 }, options);
    expect(t.votesCast).toBe(0);
    expect(t.sense).toBeNull();
  });

  it('classifies the sense so each language can word it itself', () => {
    const unanimous = tallyConferenceItem({ inPerson: { support: 30, changes: 5, oppose: 5 }, virtual: {} }, { inPerson: 0, virtual: 0 }, options);
    expect(unanimous.senseKind).toBe('unanimity');
    const majority = tallyConferenceItem({ inPerson: { support: 16, changes: 8, oppose: 6 }, virtual: {} }, { inPerson: 0, virtual: 0 }, options);
    expect(majority.senseKind).toBe('majority');
    const plurality = tallyConferenceItem({ inPerson: { support: 12, changes: 10, oppose: 9 }, virtual: {} }, { inPerson: 0, virtual: 0 }, options);
    expect(plurality.senseKind).toBe('plurality');
    expect(plurality.leading?.id).toBe('support');
    const tied = tallyConferenceItem({ inPerson: { support: 10, changes: 10, oppose: 2 }, virtual: {} }, { inPerson: 0, virtual: 0 }, options);
    expect(tied.senseKind).toBe('tied');
    const none = tallyConferenceItem({ inPerson: {}, virtual: {} }, { inPerson: 0, virtual: 0 }, options);
    expect(none.senseKind).toBeNull();
  });

  it('knows the thirteen standing committees', () => {
    expect(CONFERENCE_COMMITTEES).toHaveLength(13);
    expect(CONFERENCE_COMMITTEES).toContain('Literature');
    expect(CONFERENCE_COMMITTEES).toContain('Policy / Admissions');
  });
});

describe('agenda timing', () => {
  it('lays out planned start and end times', () => {
    const plan = scheduleAgenda([
      { id: 'a', plannedMinutes: 15 },
      { id: 'b', plannedMinutes: 45 },
      { id: 'c', plannedMinutes: 30 },
    ]);
    expect(plan).toEqual([
      { id: 'a', plannedStartMin: 0, plannedEndMin: 15 },
      { id: 'b', plannedStartMin: 15, plannedEndMin: 60 },
      { id: 'c', plannedStartMin: 60, plannedEndMin: 90 },
    ]);
    expect(addMinutes('09:00', 75)).toBe('10:15');
    expect(addMinutes('23:30', 45)).toBe('00:15');
  });

  it('measures how long an item has taken', () => {
    const start = new Date('2026-10-04T09:00:00Z').toISOString();
    const end = new Date('2026-10-04T09:22:00Z').toISOString();
    expect(elapsedMinutes(start, end)).toBe(22);
    expect(elapsedMinutes(start, null, new Date('2026-10-04T09:10:00Z').getTime())).toBe(10);
    expect(elapsedMinutes(null)).toBeNull();
  });
});
