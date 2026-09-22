import { describe, expect, it } from 'vitest';
import { computeEligibility, regionalTrusteeBalance, rollFromRows } from './voters';
import { parsePoll } from './pollImport';
import { decodeResult, decodeSetup, encodeResult, encodeSetup } from './tellerCodes';
import { AGAINST, type Voter } from './types';
import { PRESETS } from '../presets';
import { ballotAnnouncement, nextStepAnnouncement, openingScript } from '../announce';
import { computePosition } from './thirdLegacy';
import { DEFAULT_SETTINGS, type Position } from './types';

const roles = PRESETS.area.roles;
let seq = 0;
const v = (name: string, roleId: string, extra: Partial<Voter> = {}): Voter => ({
  id: `v${seq++}`,
  name,
  roleId,
  group: '',
  district: '',
  channel: 'inPerson',
  present: true,
  ...extra,
});

describe('voter eligibility', () => {
  it('counts present voting members per channel', () => {
    const el = computeEligibility(
      [v('A', 'gsr'), v('B', 'gsr', { channel: 'virtual' }), v('C', 'dcm'), v('D', 'gsr', { present: false }), v('E', 'visitor')],
      roles,
    );
    expect(el.byChannel).toEqual({ inPerson: 2, virtual: 1 });
    expect(el.total).toBe(3);
    expect(el.present).toBe(4);
    expect(el.excluded.map((x) => x.voter.name)).toEqual(['E']);
  });

  it('an alternate GSR votes only when the GSR of the same group is absent', () => {
    const roll = [v('GSR', 'gsr', { group: 'Hope' }), v('Alt', 'altgsr', { group: 'Hope' }), v('Alt2', 'altgsr', { group: 'Serenity' })];
    const el = computeEligibility(roll, roles);
    expect(el.eligible.map((x) => x.name).sort()).toEqual(['Alt2', 'GSR']);
    expect(el.excluded[0].reason).toMatch(/present/);
    roll[0].present = false;
    expect(computeEligibility(roll, roles).eligible.map((x) => x.name).sort()).toEqual(['Alt', 'Alt2']);
  });

  it('one person, one vote even with two roles', () => {
    const el = computeEligibility([v('Pat Q.', 'dcm'), v('pat q.', 'gsr', { channel: 'virtual' })], roles);
    expect(el.total).toBe(1);
    expect(el.excluded[0].reason).toMatch(/one person, one vote/);
  });

  it('regional trustee session needs an equal number of other voters, half and half', () => {
    const r = PRESETS.regionalTrustee.roles;
    const dels = ['a', 'b', 'c', 'd'].map((n) => v(n, 'regdel'));
    let bal = regionalTrusteeBalance([...dels, v('x', 'cct'), v('y', 'cct'), v('z', 'tnc'), v('w', 'tnc')], r);
    expect(bal.ok).toBe(true);
    bal = regionalTrusteeBalance([...dels, v('x', 'cct'), v('y', 'cct'), v('z', 'cct'), v('w', 'tnc')], r);
    expect(bal.ok).toBe(false);
    bal = regionalTrusteeBalance([...dels, v('x', 'cct')], r);
    expect(bal.ok).toBe(false);
    // odd number of delegates: halves may differ by one
    bal = regionalTrusteeBalance([...dels.slice(0, 3), v('x', 'cct'), v('y', 'cct'), v('z', 'tnc')], r);
    expect(bal.ok).toBe(true);
  });

  it('reads a roll from CSV rows', () => {
    let n = 0;
    const out = rollFromRows(
      [
        { Name: 'Jane', Role: 'GSR', Group: 'Hope', District: '5', Channel: 'Zoom', Present: 'yes' },
        { Name: 'Sam', Role: 'Alternate GSR', Group: 'Hope', District: '5', Channel: 'In person', Present: '' },
        { Name: '', Role: 'GSR' },
      ],
      roles,
      () => `id${n++}`,
    );
    expect(out.voters).toHaveLength(2);
    expect(out.skipped).toBe(1);
    expect(out.voters[0]).toMatchObject({ name: 'Jane', roleId: 'gsr', channel: 'virtual', present: true, group: 'Hope' });
    expect(out.voters[1]).toMatchObject({ roleId: 'altgsr', channel: 'inPerson', present: false });
  });

  it('matches common service titles to roles, including officers', () => {
    let n = 0;
    const rows = [
      { Name: 'A', 'Service position': 'Area Chair' },
      { Name: 'B', 'Service position': 'Treasurer' },
      { Name: 'C', 'Service position': 'Alt. GSR' },
      { Name: 'D', 'Service position': 'District Committee Member' },
      { Name: 'E', 'Service position': 'Officer' },
      { Name: 'F', 'Service position': 'Corrections Committee Chair' },
      { Name: 'G', 'Service position': 'Past Delegate' },
      { Name: 'H', 'Service position': 'Trusted Servant of Everything' },
    ];
    const out = rollFromRows(rows, roles, () => `id${n++}`);
    expect(out.voters.map((v) => v.roleId)).toEqual(['officer', 'officer', 'altgsr', 'dcm', 'officer', 'chair', 'pastdel', 'gsr']);
    expect(out.unmatchedRoles).toEqual(['Trusted Servant of Everything']);
    expect(out.usedColumns).toContain('Service position');
  });

  it('officers are voting members in every election type that has them', () => {
    for (const key of ['area', 'district', 'areaTrusteeCandidate', 'intergroup', 'custom'] as const) {
      const officer = PRESETS[key].roles.find((r) => r.id === 'officer');
      expect(officer, `${key} has an officer role`).toBeTruthy();
      expect(officer!.votes, `${key} officer votes`).toBe(true);
    }
    // An officer who is present is counted as a voter.
    const el = computeEligibility([v('Chair person', 'officer')], roles);
    expect(el.total).toBe(1);
  });

  it('lets two members with the same name vote when their emails differ', () => {
    const el = computeEligibility(
      [v('John S.', 'gsr', { group: 'Hope', email: 'john1@example.org' }), v('John S', 'gsr', { group: 'Serenity', email: 'john2@example.org' })],
      roles,
    );
    expect(el.total).toBe(2);
  });

  it('still counts one vote for the same person listed twice, and says how to fix a clash', () => {
    const el = computeEligibility([v('John S.', 'gsr', { group: 'Hope' }), v('John S', 'dcm', { group: 'District 2' })], roles);
    expect(el.total).toBe(1);
    expect(el.excluded[0].reason).toMatch(/add an email address/i);
  });

  it('an alternate with no group cannot be paired, so is not given a vote by default', () => {
    const el = computeEligibility([v('A GSR', 'gsr', { group: '' }), v('An alternate', 'altgsr', { group: '' })], roles);
    expect(el.total).toBe(1);
    expect(el.excluded[0].reason).toMatch(/no group or district/i);
  });

  it('a member voting under a primary role does not block their group’s alternate', () => {
    // Pat is listed as both DCM and GSR for the same group; they vote once (as DCM),
    // so the group's alternate GSR still votes in place of the GSR.
    const el = computeEligibility(
      [v('Pat M.', 'dcm', { group: 'Hope' }), v('Pat M.', 'gsr', { group: 'Hope' }), v('Chris B.', 'altgsr', { group: 'Hope' })],
      roles,
    );
    expect(el.eligible.map((x) => `${x.name}/${x.roleId}`).sort()).toEqual(['Chris B./altgsr', 'Pat M./dcm']);
  });

  it('flags people listed twice in an imported file', () => {
    let n = 0;
    const out = rollFromRows([{ Name: 'Ann B.' }, { Name: 'ann b.' }], roles, () => `id${n++}`);
    expect(out.duplicateNames).toEqual(['ann b.']);
  });
});

describe('virtual poll import', () => {
  const opts = [
    { id: 'a', name: 'Pat M.' },
    { id: 'b', name: 'Chris R.' },
  ];

  it('counts an unrecognised first answer as invalid instead of dropping it', () => {
    const csv = ['Name,Email,Answer', 'Ann,a@x,Someone Else', 'Bob,b@x,Pat M.', 'Cy,c@x,Chris R.'].join('\n');
    const r = parsePoll(csv, opts);
    expect(r.answerColumn).toBe('Answer'); // the header is still identified correctly
    expect(r.responses).toBe(3);
    expect(r.votes).toEqual({ a: 1, b: 1 });
    expect(r.invalid).toBe(1);
    expect(r.unmatched).toEqual(['Someone Else']);
  });

  it('does not collapse votes when the poll is anonymous', () => {
    const rows = Array.from({ length: 12 }, (_, i) => `${i + 1},Anonymous Attendee,,10:0${i},${i % 2 ? 'Pat M.' : 'Chris R.'}`);
    const csv = ['#,User Name,User Email,Submitted Date/Time,Delegate — 1st ballot', ...rows].join('\n');
    const r = parsePoll(csv, opts);
    expect(r.votes).toEqual({ a: 6, b: 6 });
    expect(r.dedupeDisabled).toBe(true);
    expect(r.duplicatesRemoved).toBe(0);
    expect(r.dedupeNote).toMatch(/anonymous/i);
  });

  it('warns when the file cannot identify participants at all', () => {
    const r = parsePoll('Answer\nPat M.\nPat M.\nChris R.', opts);
    expect(r.votes).toEqual({ a: 2, b: 1 });
    expect(r.dedupeDisabled).toBe(true);
    expect(r.identityColumn).toBeNull();
  });

  it('picks the question whose answers match this ballot, and flags the choice', () => {
    const csv = [
      'Name,Email,Question,Answer',
      'Ann,a@x,Area Chair — 1st ballot,Taylor B.',
      'Bob,b@x,Area Chair — 1st ballot,Morgan L.',
      'Ann,a@x,Delegate — 2nd ballot,Pat M.',
      'Bob,b@x,Delegate — 2nd ballot,Chris R.',
    ].join('\n');
    const r = parsePoll(csv, opts);
    expect(r.question).toBe('Delegate — 2nd ballot');
    expect(r.votes).toEqual({ a: 1, b: 1 });
    expect(r.questionAmbiguous).toBe(true);
    const chosen = parsePoll(csv, opts, { question: 'Area Chair — 1st ballot' });
    expect(chosen.questionAmbiguous).toBe(false);
    expect(chosen.invalid).toBe(2); // neither name is on this ballot
  });

  it('gives the same signature for the same file and a different one when the votes differ', () => {
    const a1 = parsePoll('Name,Answer\nAnn,Pat M.\nBob,Chris R.', opts);
    const a2 = parsePoll('Name,Answer\nAnn,Pat M.\nBob,Chris R.', opts);
    const b = parsePoll('Name,Answer\nAnn,Pat M.\nBob,Pat M.', opts);
    expect(a1.signature).toBe(a2.signature);
    expect(a1.signature).not.toBe(b.signature);
  });

  it('reads a Zoom-style poll report with header junk and counts one response per participant', () => {
    const csv = [
      'Poll Report',
      'Report Generated:,"Sep 18, 2026"',
      'Topic,Webinar ID,Actual Start Time',
      'Area Assembly,123,2026-09-18',
      '',
      '#,User Name,User Email,Submitted Date/Time,Delegate — 1st ballot',
      '1,Ann,ann@x.org,10:01,Pat M.',
      '2,Bob,bob@x.org,10:01,chris r',
      '3,Cy,cy@x.org,10:02,Pat M.',
      '4,Ann,ann@x.org,10:03,Chris R.',
      '5,Dee,dee@x.org,10:03,Pat M.;Chris R.',
      '6,Eve,eve@x.org,10:04,Someone Else',
    ].join('\n');
    const r = parsePoll(csv, opts);
    expect(r.votes).toEqual({ a: 1, b: 2 });
    expect(r.invalid).toBe(2);
    expect(r.duplicatesRemoved).toBe(1);
    expect(r.identityColumn).toBe('User Email');
    expect(r.answerColumn).toBe('Delegate — 1st ballot');
  });

  it('filters long-format reports by question', () => {
    const csv = [
      'Name,Email,Question,Answer',
      'Ann,a@x,Delegate — 1st ballot,Pat M.',
      'Bob,b@x,Delegate — 1st ballot,Pat M.',
      'Ann,a@x,Delegate — 2nd ballot,Chris R.',
      'Bob,b@x,Delegate — 2nd ballot,Pat M.',
    ].join('\n');
    const latest = parsePoll(csv, opts);
    expect(latest.questions).toEqual(['Delegate — 1st ballot', 'Delegate — 2nd ballot']);
    expect(latest.question).toBe('Delegate — 2nd ballot');
    expect(latest.votes).toEqual({ a: 1, b: 1 });
    const first = parsePoll(csv, opts, { question: 'Delegate — 1st ballot' });
    expect(first.votes).toEqual({ a: 2, b: 0 });
    expect(first.duplicatesRemoved).toBe(0);
  });

  it('handles yes/no confirmation polls', () => {
    const csv = 'Name,Answer\nA,Yes\nB,Yes\nC,No\nD,yes - Pat M.';
    const r = parsePoll(csv, [
      { id: 'a', name: 'Pat M.' },
      { id: AGAINST, name: 'No' },
    ]);
    expect(r.votes).toEqual({ a: 3, [AGAINST]: 1 });
  });

  it('does not read a comment as a "yes" vote on a confirmation ballot', () => {
    const csv = 'Name,Answer\nA,Yes\nB,No\nC,Comfortable with the candidate\nD,Before we vote I want to say something';
    const r = parsePoll(csv, [
      { id: 'a', name: 'Pat M.' },
      { id: AGAINST, name: 'No' },
    ]);
    expect(r.votes).toEqual({ a: 1, [AGAINST]: 1 });
    expect(r.invalid).toBe(2);
  });

  it('prefers the answer column over a participant-name column that happens to match', () => {
    // Candidates are voting members, so their names also appear in the "User Name" column —
    // both columns match the same number of times and the answer column must win.
    const csv = ['#,User Name,Answer', '1,Pat M.,Chris R.', '2,Chris R.,Pat M.'].join('\n');
    const r = parsePoll(csv, opts);
    expect(r.columns.map((c) => c.hits)).toEqual([2, 2]);
    expect(r.answerColumn).toBe('Answer');
    expect(r.votes).toEqual({ a: 1, b: 1 });
  });

  it('errors when no candidate names are found', () => {
    expect(() => parsePoll('x,y\n1,2', opts)).toThrow(/candidate names/);
  });
});

describe('teller codes', () => {
  it('round-trips setup and result codes, including non-ASCII names', () => {
    const setup = { v: 1 as const, k: 'key1', a: 'Área 00', p: 'Délégué', n: 2, ch: 'inPerson' as const, conf: false, o: [['a', 'José Ñ.'], ['b', 'Zoë']] as [string, string][] };
    expect(decodeSetup(encodeSetup(setup))).toEqual(setup);
    const res = { v: 1 as const, k: 'key1', r: 'r1', t: 'Teller 1', ch: 'virtual' as const, c: [5, 3], i: 1 };
    const code = encodeResult(res);
    expect(decodeResult(code)).toEqual(res);
    expect(decodeResult(`  ${code}\n`)).toEqual(res); // tolerant of whitespace when pasted
  });

  it('rejects damaged or foreign codes', () => {
    const code = encodeResult({ v: 1, k: 'k', r: 'r', t: 't', ch: 'inPerson', c: [1], i: 0 });
    expect(() => decodeResult(code.slice(0, -6) + 'AAAAAA')).toThrow();
    expect(() => decodeResult('hello')).toThrow(/not a Third Legacy/);
    expect(() => decodeResult(encodeResult({ v: 1, k: 'k', r: 'r', t: 't', ch: 'inPerson', c: [-1], i: 0 }))).toThrow(/invalid numbers/);
  });
});

describe('announcements in three languages', () => {
  const p: Position = {
    id: 'p',
    title: 'Delegate',
    candidates: [
      { id: 'a', name: 'Pat M.', withdrawnBeforeBallot: null },
      { id: 'b', name: 'Chris R.', withdrawnBeforeBallot: null },
      { id: 'c', name: 'Jo T.', withdrawnBeforeBallot: null },
    ],
    started: true,
    ballots: [0, 1].map((i) => ({
      id: `b${i}`,
      counts: { inPerson: { votes: { a: 20, b: 15, c: 4 }, invalid: 0 }, virtual: { votes: {}, invalid: 0 } },
      eligibleVoters: { inPerson: 0, virtual: 0 },
      collected: { inPerson: null, virtual: null },
      recordedAt: '',
    })),
    motionVotes: [],
    hat: null,
    hatSecondToPositionId: null,
    appointment: null,
    draft: null,
  };
  const st = computePosition(p, DEFAULT_SETTINGS);
  it.each(['en', 'es', 'fr'] as const)('%s produces complete sentences', (lang) => {
    const lines = [...ballotAnnouncement(p, st.ballots[1], lang), ...nextStepAnnouncement(p, st, lang), ...openingScript('Delegate', 'GSRs', ['White'], lang)];
    for (const l of lines) {
      expect(l).not.toMatch(/undefined|NaN|\.\.$/);
      expect(l.length).toBeGreaterThan(3);
    }
    expect(lines.join(' ')).toContain('Jo T.'); // withdrawn under the one-fifth rule
  });
});
