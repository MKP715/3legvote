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
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ name: 'Jane', roleId: 'gsr', channel: 'virtual', present: true, group: 'Hope' });
    expect(out[1]).toMatchObject({ roleId: 'altgsr', channel: 'inPerson', present: false });
  });
});

describe('virtual poll import', () => {
  const opts = [
    { id: 'a', name: 'Pat M.' },
    { id: 'b', name: 'Chris R.' },
  ];

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
