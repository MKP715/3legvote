import { describe, expect, it } from 'vitest';
import { assembliesFromStorage, assemblyFromStorage, normalizeAssembly } from './store';
import { DEFAULT_BADGE_DESIGN } from './engine/types';

/**
 * A record saved by an earlier version of the app is missing whatever has been added
 * since. Every screen must be able to read it — this is what crashed every page of an
 * assembly saved by 1.2.0 with "Cannot read properties of undefined (reading 'length')".
 */
const oldRecord = () => ({
  id: 'old1',
  name: 'Area 99 Election Assembly',
  electionType: 'area',
  date: '2026-10-04',
  location: 'Community Hall',
  chair: 'Pat',
  notes: '',
  voters: { inPerson: 40, virtual: 12 },
  useRollForCounts: false,
  roles: [{ id: 'gsr', name: 'GSR', votes: true }],
  voterRoll: [{ id: 'v1', name: 'Sam', roleId: 'gsr', group: 'Serenity', district: '1', channel: 'inPerson', present: true }],
  officials: { secretary: 'Chris' },
  approvals: { procedure: null, order: null, whoVotes: null },
  settings: {},
  positions: [{ id: 'p1', title: 'Delegate', candidates: [], ballots: [], motionVotes: [] }],
  livePositionId: null,
  live: { status: 'voting', since: '2026-10-04T15:00:00.000Z', timer: null, message: 'Break — back at 2:15' },
  displayBreakdown: true,
  language: 'en',
  ballotColors: ['white'],
  log: [],
  createdAt: '2026-10-04T14:00:00.000Z',
  updatedAt: '2026-10-04T15:00:00.000Z',
});

describe('opening an election saved by an older version', () => {
  it('fills in every field the new screens read', () => {
    const a = assemblyFromStorage(oldRecord());
    expect(a.agenda).toEqual([]);
    expect(a.motions).toEqual([]);
    expect(a.conferenceItems).toEqual([]);
    expect(a.voterFields).toEqual([]);
    expect(a.attendanceOptions.length).toBeGreaterThan(0);
    expect(a.agendaStart).toMatch(/^\d\d:\d\d$/);
    expect(a.motionSettings.defaultThreshold).toBe('twoThirds');
    expect(a.conferenceSettings.defaultOptions.length).toBeGreaterThan(0);
    expect(a.badge.perPage).toBe(DEFAULT_BADGE_DESIGN.perPage);
    expect(a.badge.front.showCheckinQr).toBe(true);
    // and it is still the same election
    expect(a.name).toBe('Area 99 Election Assembly');
    expect(a.positions[0].title).toBe('Delegate');
    expect(a.voterRoll[0].name).toBe('Sam');
  });

  it('keeps what the projector is showing, unlike an imported file', () => {
    // A reload mid-vote, or the display window syncing, must not blank the room's screen.
    expect(assemblyFromStorage(oldRecord()).live.status).toBe('voting');
    expect(assemblyFromStorage(oldRecord()).live.message).toBe('Break — back at 2:15');
    // An imported file is a different matter: it must not restart a vote from someone else's day.
    expect(normalizeAssembly(oldRecord()).live.status).toBe('idle');
    expect(normalizeAssembly(oldRecord()).live.message).toBe('Break — back at 2:15');
  });

  it('brings a whole storage record forward, and skips one it cannot read', () => {
    const all = assembliesFromStorage({ assemblies: [{ nonsense: true }, oldRecord()] });
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('old1');
    expect(all[0].agenda).toEqual([]);
    expect(all[0].motions).toEqual([]);
    expect(all[0].badge.back.links).toEqual([]);
    expect(all[0].live.status).toBe('voting');
  });

});
