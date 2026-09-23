import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './store';
import type { Assembly, Channel, MotionVoteCount } from './engine/types';
import { tallyConferenceItem } from './engine/business';

const S = () => useStore.getState();
const A = (id: string): Assembly => S().assemblies.find((a) => a.id === id)!;
const hands = (yes: number, no: number, abstain = 0): Record<Channel, MotionVoteCount> => ({
  inPerson: { yes, no, abstain },
  virtual: { yes: 0, no: 0, abstain: 0 },
});

describe('motions', () => {
  beforeEach(() => useStore.setState({ assemblies: [] }));

  it('runs a main motion through debate, an amendment, the vote and the minority opinion', () => {
    const aid = S().createAssembly('Assembly');
    const mid = S().addMotion(aid, { title: 'Fund the archives project', text: 'That the area fund $500 for archives supplies.', movedBy: 'Ann B.', secondedBy: 'Bob C.' });
    let m = A(aid).motions[0];
    expect(m.number).toBe(1);
    expect(m.threshold).toBe('twoThirds'); // matters of policy take substantial unanimity
    expect(m.status).toBe('open');

    // Debate: speakers for and against
    S().addSpeaker(aid, mid, 'for', 1);
    S().addSpeaker(aid, mid, 'against', 1);
    S().addSpeaker(aid, mid, 'for', 1);
    expect(A(aid).motions[0].speakers).toEqual({ for: 2, against: 1 });

    // An amendment carries and rewrites the motion's text.
    S().recordMotionVote(aid, mid, {
      kind: 'amend',
      label: 'Amend: change $500 to $750',
      text: 'That the area fund $750 for archives supplies.',
      movedBy: 'Cy D.',
      secondedBy: 'Dee E.',
      threshold: 'twoThirds',
      method: 'hands',
      counts: hands(24, 6),
    });
    m = A(aid).motions[0];
    expect(m.text).toContain('$750');
    expect(m.rounds[0].carried).toBe(true);
    expect(m.rounds[0].minority).toMatchObject({ side: 'against', heard: false });

    // The main vote carries with two-thirds.
    S().recordMotionVote(aid, mid, {
      kind: 'main',
      label: 'Main motion',
      movedBy: 'Ann B.',
      secondedBy: 'Bob C.',
      threshold: 'twoThirds',
      method: 'hands',
      counts: hands(22, 8, 3),
    });
    m = A(aid).motions[0];
    expect(m.status).toBe('carried');
    const mainRound = m.rounds[1];
    expect(mainRound.carried).toBe(true);
    expect(mainRound.minority?.side).toBe('against');

    // The side that did not prevail speaks, and it goes in the record.
    S().recordMinorityOpinion(aid, mid, mainRound.id, 'Concern that $750 leaves too little for translation.', true);
    expect(A(aid).motions[0].rounds[1].minority).toMatchObject({ heard: true, notes: /translation/ as unknown as string });
    expect(A(aid).log.some((l) => l.action === 'Minority opinion heard')).toBe(true);
  });

  it('gives the majority the floor when a motion falls short of two-thirds', () => {
    const aid = S().createAssembly('Assembly');
    const mid = S().addMotion(aid, { title: 'Policy change', text: 'That the area change its guidelines.' });
    S().recordMotionVote(aid, mid, { kind: 'main', label: 'Main motion', movedBy: 'A', secondedBy: 'B', threshold: 'twoThirds', method: 'hands', counts: hands(18, 12) });
    const round = A(aid).motions[0].rounds[0];
    expect(round.carried).toBe(false);
    expect(A(aid).motions[0].status).toBe('defeated');
    // 18 of 30 is a majority but not two-thirds — so the majority speaks.
    expect(round.minority?.side).toBe('for');
  });

  it('tables a motion by simple majority and reopens it later', () => {
    const aid = S().createAssembly('Assembly');
    const mid = S().addMotion(aid, { title: 'Buy a new projector' });
    S().recordMotionVote(aid, mid, { kind: 'table', label: 'Table the motion', movedBy: 'A', secondedBy: 'B', threshold: 'simpleMajority', method: 'hands', counts: hands(16, 14) });
    expect(A(aid).motions[0].status).toBe('tabled');
    S().undoMotionVote(aid, mid);
    expect(A(aid).motions[0].status).toBe('open');
  });

  it('allows a reconsideration once and never twice', () => {
    const aid = S().createAssembly('Assembly');
    const mid = S().addMotion(aid, { title: 'Something' });
    S().recordMotionVote(aid, mid, { kind: 'main', label: 'Main motion', movedBy: 'A', secondedBy: 'B', threshold: 'twoThirds', method: 'hands', counts: hands(10, 20) });
    expect(A(aid).motions[0].status).toBe('defeated');

    // A member who voted with the prevailing side moves to reconsider; simple majority carries it.
    S().recordMotionVote(aid, mid, { kind: 'reconsider', label: 'Reconsider', movedBy: 'C (voted no)', secondedBy: 'D', threshold: 'simpleMajority', method: 'hands', counts: hands(20, 10) });
    expect(A(aid).motions[0].status).toBe('open'); // debate resumes
    expect(A(aid).motions[0].reconsidered).toBe(true);

    expect(() =>
      S().recordMotionVote(aid, mid, { kind: 'reconsider', label: 'Reconsider again', movedBy: 'E', secondedBy: 'F', threshold: 'simpleMajority', method: 'hands', counts: hands(25, 1) }),
    ).toThrow(/reconsidered twice/i);
  });

  it('applies a quorum from the checked-in roll', () => {
    const aid = S().createAssembly('Assembly');
    S().setVoters(aid, 'inPerson', 90);
    S().setVoters(aid, 'virtual', 30);
    S().updateMotionSettings(aid, { quorum: { kind: 'fraction', fraction: 2 / 3 } }); // 80 of 120
    const mid = S().addMotion(aid, { title: 'Policy' });
    S().recordMotionVote(aid, mid, { kind: 'main', label: 'Main motion', movedBy: 'A', secondedBy: 'B', threshold: 'twoThirds', method: 'hands', counts: hands(40, 5) });
    const round = A(aid).motions[0].rounds[0];
    expect(round.quorumMet).toBe(false);
    expect(round.carried).toBe(false);
    expect(A(aid).motions[0].status).toBe('defeated');
    expect(A(aid).log.some((l) => (l.detail ?? '').includes('quorum not met'))).toBe(true);
  });

  it('numbers motions and refuses to delete one that has been voted on', () => {
    const aid = S().createAssembly('Assembly');
    const m1 = S().addMotion(aid, { title: 'First' });
    const m2 = S().addMotion(aid, { title: 'Second' });
    expect(A(aid).motions.map((m) => m.number)).toEqual([1, 2]);
    S().recordMotionVote(aid, m2, { kind: 'main', label: 'Main', movedBy: 'A', secondedBy: 'B', threshold: 'twoThirds', method: 'hands', counts: hands(20, 1) });
    expect(() => S().removeMotion(aid, m2)).toThrow(/undo them first/i);
    S().removeMotion(aid, m1);
    expect(A(aid).motions.map((m) => m.number)).toEqual([1]);
  });
});

describe('Conference agenda items', () => {
  beforeEach(() => useStore.setState({ assemblies: [] }));

  it('records notes, a poll, and the delegate’s note', () => {
    const aid = S().createAssembly('Pre-Conference Assembly');
    const cid = S().addConferenceItem(aid, {
      committee: 'Literature',
      reference: 'Literature — Item 3',
      title: 'Consider a new pamphlet for young people',
      background: 'Background material pp. 41–48',
      links: [{ id: 'l1', label: 'Background (PDF)', url: 'https://example.org/background.pdf' }],
    });
    S().updateConferenceItem(aid, cid, { notes: 'Six GSRs spoke; districts 3 and 7 discussed it at length.', status: 'discussed' });
    let item = A(aid).conferenceItems[0];
    expect(item.options.map((o) => o.id)).toEqual(['support', 'supportWithChanges', 'oppose', 'noAction']);
    expect(item.notes).toMatch(/Six GSRs/);

    S().recordConferencePoll(aid, cid, {
      counts: { inPerson: { support: 28, supportWithChanges: 6, oppose: 4, noAction: 2 }, virtual: { support: 9, supportWithChanges: 2, oppose: 1, noAction: 0 } },
      abstain: { inPerson: 3, virtual: 1 },
      method: 'hands',
    });
    item = A(aid).conferenceItems[0];
    expect(item.status).toBe('polled');
    const tally = tallyConferenceItem(item.rounds[0].counts, item.rounds[0].abstain, item.options);
    expect(tally.leading?.id).toBe('support');
    expect(tally.votesCast).toBe(52);
    expect(tally.abstainTotal).toBe(4);

    S().updateConferenceItem(aid, cid, { delegateNote: 'Area supports; asks that the pamphlet be reviewed by young people’s committees.' });
    expect(A(aid).conferenceItems[0].delegateNote).toMatch(/young people/);

    S().undoConferencePoll(aid, cid);
    expect(A(aid).conferenceItems[0].rounds).toHaveLength(0);
    expect(A(aid).conferenceItems[0].status).toBe('discussed');
  });

  it('imports a list of items', () => {
    const aid = S().createAssembly('Pre-Conference Assembly');
    const n = S().importConferenceItems(aid, [
      { committee: 'Corrections', reference: 'Corrections — Item 1', title: 'Review the Corrections workbook' },
      { committee: 'Finance', reference: 'Finance — Item 2', title: 'Consider the contribution limit' },
      { title: '' },
    ]);
    expect(n).toBe(2);
    expect(A(aid).conferenceItems).toHaveLength(2);
    expect(A(aid).conferenceItems[0].options).toHaveLength(4);
  });
});

describe('agenda', () => {
  beforeEach(() => useStore.setState({ assemblies: [] }));

  it('runs items one at a time and closes the previous one', () => {
    const aid = S().createAssembly('Assembly');
    const a1 = S().addAgendaItem(aid, { title: 'Opening', kind: 'segment', plannedMinutes: 10 });
    const a2 = S().addAgendaItem(aid, { title: 'Delegate report', kind: 'report', plannedMinutes: 45 });
    S().startAgendaItem(aid, a1);
    expect(A(aid).agenda[0].startedAt).toBeTruthy();
    expect(A(aid).live.agendaItemId).toBe(a1);
    S().startAgendaItem(aid, a2);
    expect(A(aid).agenda[0].endedAt).toBeTruthy(); // the first item was closed automatically
    expect(A(aid).agenda[1].startedAt).toBeTruthy();
    expect(A(aid).live.screen).toBe('agenda');
    S().moveAgendaItem(aid, a2, -1);
    expect(A(aid).agenda.map((i) => i.title)).toEqual(['Delegate report', 'Opening']);
    S().removeAgendaItem(aid, a1);
    expect(A(aid).agenda).toHaveLength(1);
  });
});

describe('badges and registration', () => {
  beforeEach(() => useStore.setState({ assemblies: [] }));

  it('keeps a badge design and registration choices with the assembly', () => {
    const aid = S().createAssembly('Assembly');
    S().updateBadge(aid, { title: 'Area 00 Fall Assembly', doubleSided: true, perPage: 6, back: { heading: 'Weekend', text: 'Dinner at 6', links: [{ id: 'l1', label: 'Schedule', url: 'https://example.org/s', qr: true }], showAgenda: true, showQrCaptions: true } });
    const badge = A(aid).badge;
    expect(badge.title).toBe('Area 00 Fall Assembly');
    expect(badge.doubleSided).toBe(true);
    expect(badge.back.links[0].qr).toBe(true);
    expect(badge.front.showCheckinQr).toBe(true); // untouched defaults survive

    S().setAttendanceOptions(aid, [
      { id: 'assembly', label: 'Assembly', showOnBadge: true },
      { id: 'convention', label: 'Convention', showOnBadge: true },
      { id: 'luncheon', label: 'Luncheon', showOnBadge: false },
    ]);
    S().setVoterFields(aid, [{ id: 'meal', label: 'Meal choice', showOnBadge: true }]);
    S().addVoter(aid, { name: 'Ann B.', roleId: 'gsr', group: 'Hope', district: '1', channel: 'inPerson', present: false });
    const vid = A(aid).voterRoll[0].id;
    S().setVoterAttending(aid, vid, 'convention', true);
    S().setVoterAttending(aid, vid, 'assembly', true);
    S().setVoterAttending(aid, vid, 'convention', false);
    S().setVoterCustom(aid, vid, 'meal', 'Vegetarian');
    expect(A(aid).voterRoll[0].attending).toEqual(['assembly']);
    expect(A(aid).voterRoll[0].custom).toEqual({ meal: 'Vegetarian' });

    // The design and registration choices survive an export/import round trip.
    const copy = JSON.parse(JSON.stringify(A(aid)));
    useStore.setState({ assemblies: [] });
    const restored = A(S().importAssembly(copy));
    expect(restored.badge.title).toBe('Area 00 Fall Assembly');
    expect(restored.attendanceOptions).toHaveLength(3);
    expect(restored.voterRoll[0].custom).toEqual({ meal: 'Vegetarian' });
  });
});
