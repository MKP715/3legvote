import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { nanoid } from 'nanoid';
import {
  AGAINST,
  CHANNELS,
  DEFAULT_BADGE_DESIGN,
  DEFAULT_CONFERENCE_OPTIONS,
  DEFAULT_MOTION_SETTINGS,
  DEFAULT_SETTINGS,
  type Assembly,
  type Channel,
  type DraftBallot,
  type ElectionType,
  type HatDraw,
  type Live,
  type LiveStatus,
  type LiveTimer,
  type LogEntry,
  type MotionVote,
  type Officials,
  type Position,
  type Settings,
  type AgendaItem,
  type AttendanceOption,
  type BadgeDesign,
  type ConferenceItem,
  type ConferenceRound,
  type ConferenceSettings,
  type Motion,
  type MotionKind,
  type MotionRound,
  type MotionSettings,
  type TellerReport,
  type Voter,
  type VoterField,
  type VoterRole,
  type VoteThreshold,
} from './engine/types';
import { computePosition, ordinal } from './engine/thirdLegacy';
import { computeEligibility } from './engine/voters';
import { MOTION_RULES, tallyMotion } from './engine/business';
import { secureShuffle } from './engine/random';
import { DEFAULT_BALLOT_COLORS, PRESETS } from './presets';

export const STORAGE_KEY = 'third-legacy-vote/v1';

const now = () => new Date().toISOString();

/** Set by the UI so a failed save (e.g. browser storage full) is visible instead of silent. */
export let onStorageError: ((message: string) => void) | null = null;
export function setStorageErrorHandler(fn: ((message: string) => void) | null) {
  onStorageError = fn;
}

/**
 * Writing the whole election to localStorage on every tally tap is slow on a tablet, so writes
 * are batched. Anything pending is flushed when the page is hidden or closed, and a failed
 * write (quota, private mode) is reported rather than swallowed.
 */
function debouncedLocalStorage() {
  let pending: { name: string; value: string } | null = null;
  let timer: number | undefined;
  const flush = () => {
    if (!pending) return;
    const { name, value } = pending;
    pending = null;
    window.clearTimeout(timer);
    try {
      localStorage.setItem(name, value);
    } catch (e) {
      onStorageError?.(
        `This device could not save the election (${(e as Error).name}). Export a backup now, and free up browser storage.`,
      );
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
  }
  return {
    getItem: (name: string) => {
      flush();
      return localStorage.getItem(name);
    },
    setItem: (name: string, value: string) => {
      pending = { name, value };
      window.clearTimeout(timer);
      timer = window.setTimeout(flush, 350);
    },
    removeItem: (name: string) => {
      pending = null;
      localStorage.removeItem(name);
    },
    flush,
  };
}

const persistentStorage = typeof window !== 'undefined' ? debouncedLocalStorage() : undefined;
/** Write any pending change immediately (before an export, for instance). */
export const flushStorage = () => persistentStorage?.flush();

export function emptyDraft(): DraftBallot {
  return {
    key: nanoid(10),
    counts: {
      inPerson: { votes: {}, invalid: 0 },
      virtual: { votes: {}, invalid: 0 },
    },
    collected: { inPerson: null, virtual: null },
    note: '',
    tallyLog: [],
    tellerReports: [],
  };
}

export function newPosition(title: string): Position {
  return {
    id: nanoid(10),
    title,
    candidates: [],
    started: false,
    ballots: [],
    motionVotes: [],
    hat: null,
    hatSecondToPositionId: null,
    appointment: null,
    draft: null,
  };
}

const emptyOfficials = (): Officials => ({ secretary: '', tellers: '', collectors: '', recorder: '', virtualTeller: '', registrar: '', techHost: '' });
const idleLive = (): Live => ({ status: 'idle', since: now(), timer: null, message: '' });

export function newAssembly(name: string, type: ElectionType = 'area'): Assembly {
  const t = now();
  return {
    id: nanoid(10),
    name,
    electionType: type,
    date: t.slice(0, 10),
    location: '',
    chair: '',
    notes: '',
    voters: { inPerson: 0, virtual: 0 },
    useRollForCounts: false,
    roles: structuredClone(PRESETS[type].roles),
    voterRoll: [],
    officials: emptyOfficials(),
    approvals: { procedure: null, order: null, whoVotes: null },
    settings: { ...DEFAULT_SETTINGS },
    positions: [],
    motions: [],
    motionSettings: { ...DEFAULT_MOTION_SETTINGS, quorum: { kind: 'none' } },
    conferenceItems: [],
    conferenceSettings: {
      session: '',
      defaultOptions: structuredClone(DEFAULT_CONFERENCE_OPTIONS),
      guidanceNote:
        'The sense of the assembly guides the delegate, who carries the area’s group conscience to the Conference and votes there with an informed conscience.',
    },
    agenda: [],
    agendaStart: '09:00',
    badge: structuredClone(DEFAULT_BADGE_DESIGN),
    attendanceOptions: [
      { id: 'assembly', label: 'Assembly', showOnBadge: true },
      { id: 'convention', label: 'Convention', showOnBadge: true },
      { id: 'banquet', label: 'Banquet', showOnBadge: true },
    ],
    voterFields: [],
    livePositionId: null,
    live: idleLive(),
    displayBreakdown: true,
    language: 'en',
    ballotColors: [...DEFAULT_BALLOT_COLORS],
    log: [{ at: t, action: 'Assembly created', detail: `${name} (${PRESETS[type].label})` }],
    createdAt: t,
    updatedAt: t,
  };
}

/** Make an imported / older object safe to use. */
export function normalizeAssembly(raw: unknown): Assembly {
  const a = raw as Partial<Assembly>;
  if (!a || typeof a !== 'object' || typeof a.name !== 'string' || !Array.isArray(a.positions)) {
    throw new Error('This file does not look like a Third Legacy assembly export.');
  }
  const type: ElectionType = a.electionType && a.electionType in PRESETS ? a.electionType : 'area';
  const base = newAssembly(a.name, type);
  return {
    ...base,
    ...a,
    electionType: type,
    id: typeof a.id === 'string' ? a.id : base.id,
    voters: { ...base.voters, ...(a.voters ?? {}) },
    voterRoll: Array.isArray(a.voterRoll) ? a.voterRoll : [],
    officials: { ...emptyOfficials(), ...(a.officials ?? {}) },
    approvals: { ...base.approvals, ...(a.approvals ?? {}) },
    // A file opened later must not put the projector back into "voting open" with a stale timer.
    live: { ...idleLive(), message: a.live?.message ?? '' },
    ballotColors: Array.isArray(a.ballotColors) ? a.ballotColors : base.ballotColors,
    motions: Array.isArray(a.motions) ? a.motions : [],
    motionSettings: { ...DEFAULT_MOTION_SETTINGS, ...(a.motionSettings ?? {}) },
    conferenceItems: Array.isArray(a.conferenceItems) ? a.conferenceItems : [],
    conferenceSettings: { ...base.conferenceSettings, ...(a.conferenceSettings ?? {}) },
    agenda: Array.isArray(a.agenda) ? a.agenda : [],
    agendaStart: a.agendaStart ?? base.agendaStart,
    badge: { ...structuredClone(DEFAULT_BADGE_DESIGN), ...(a.badge ?? {}),
      front: { ...DEFAULT_BADGE_DESIGN.front, ...(a.badge?.front ?? {}) },
      back: { ...DEFAULT_BADGE_DESIGN.back, ...(a.badge?.back ?? {}) } },
    attendanceOptions: Array.isArray(a.attendanceOptions) ? a.attendanceOptions : base.attendanceOptions,
    voterFields: Array.isArray(a.voterFields) ? a.voterFields : [],
    language: a.language ?? 'en',
    settings: { ...DEFAULT_SETTINGS, ...(a.settings ?? {}) },
    log: Array.isArray(a.log) ? a.log : [],
    ...(() => {
      // Keep every role the voter roll refers to, so imported voters never lose their role.
      const roles = Array.isArray(a.roles) && a.roles.length ? [...a.roles] : [...base.roles];
      const known = new Set(roles.map((r) => r.id));
      for (const v of Array.isArray(a.voterRoll) ? a.voterRoll : []) {
        if (v?.roleId && !known.has(v.roleId)) {
          known.add(v.roleId);
          roles.push({ id: v.roleId, name: `${v.roleId} (imported)`, votes: true });
        }
      }
      return { roles };
    })(),
    positions: a.positions.map((p) => ({
      ...newPosition(p.title ?? 'Position'),
      ...p,
      candidates: (p.candidates ?? []).map((c) => ({ ...c, withdrawnBeforeBallot: c.withdrawnBeforeBallot ?? null })),
      ballots: p.ballots ?? [],
      motionVotes: p.motionVotes ?? [],
      hat: p.hat ?? null,
      appointment: p.appointment ?? null,
      hatSecondToPositionId: p.hatSecondToPositionId ?? null,
      draft: p.draft ?? null,
    })),
  } as Assembly;
}

/**
 * One saved assembly, brought up to the shape this version of the app expects.
 *
 * Anything saved by an older version is missing whatever fields have been added since
 * (a 1.2 record has no agenda, motions or badge design), so every rehydration goes
 * through here rather than trusting the stored shape. Unlike an imported file, the
 * projector's live state is kept: the chair's own window and the display window share
 * storage, and a reload in the middle of a vote must not reset what the room is seeing.
 */
export function assemblyFromStorage(raw: unknown): Assembly {
  const a = normalizeAssembly(raw);
  const live = (raw as Partial<Assembly> | null)?.live;
  return live && typeof live === 'object' ? { ...a, live: { ...idleLive(), ...live } } : a;
}

/** Every saved assembly, skipping (and reporting) any single record that cannot be read. */
export function assembliesFromStorage(persisted: unknown): Assembly[] {
  const s = persisted as { assemblies?: unknown[] } | null;
  const out: Assembly[] = [];
  for (const a of s?.assemblies ?? []) {
    try {
      out.push(assemblyFromStorage(a));
    } catch {
      const name = (a as { name?: string })?.name;
      onStorageError?.(`One saved election (${name ?? 'unnamed'}) could not be read and was skipped.`);
    }
  }
  return out;
}

/** Eligible voters present per channel — from the roll call when enabled, else the manual counts. */
export function effectiveVoters(a: Assembly): Record<Channel, number> {
  if (a.useRollForCounts) return computeEligibility(a.voterRoll, a.roles).byChannel;
  return a.voters;
}

export const SAMPLE_POSITIONS = PRESETS.area.positions;

interface State {
  assemblies: Assembly[];
}

type AssemblyPatch = Partial<
  Pick<Assembly, 'name' | 'date' | 'location' | 'chair' | 'notes' | 'displayBreakdown' | 'language' | 'ballotColors' | 'useRollForCounts' | 'electionType'>
>;

interface Actions {
  createAssembly: (name: string, positions?: string[], type?: ElectionType) => string;
  importAssembly: (raw: unknown, asCopy?: boolean) => string;
  duplicateAssembly: (id: string) => string;
  deleteAssembly: (id: string) => void;
  updateAssembly: (id: string, patch: AssemblyPatch) => void;
  setVoters: (id: string, channel: Channel, count: number) => void;
  updateSettings: (id: string, patch: Partial<Settings>) => void;
  updateOfficials: (id: string, patch: Partial<Officials>) => void;
  setApproval: (id: string, key: keyof Assembly['approvals'], approved: boolean) => void;
  setLivePosition: (id: string, positionId: string | null) => void;
  setLiveStatus: (id: string, status: LiveStatus) => void;
  setLiveMessage: (id: string, message: string) => void;
  setTimer: (id: string, timer: LiveTimer | null) => void;

  setRoles: (id: string, roles: VoterRole[]) => void;
  addVoter: (id: string, v: Omit<Voter, 'id'>) => void;
  updateVoter: (id: string, vid: string, patch: Partial<Voter>) => void;
  removeVoter: (id: string, vid: string) => void;
  importVoters: (id: string, voters: Voter[], replace: boolean) => void;
  setPresent: (id: string, vid: string, present: boolean) => void;
  setAllAbsent: (id: string) => void;

  addPosition: (aid: string, title: string, afterPid?: string) => string;
  updatePosition: (aid: string, pid: string, patch: Partial<Pick<Position, 'title' | 'description' | 'hatSecondToPositionId'>>) => void;
  removePosition: (aid: string, pid: string) => void;
  movePosition: (aid: string, pid: string, delta: number) => void;
  addSeat: (aid: string, pid: string) => string | null;

  addCandidate: (aid: string, pid: string, name: string, district?: string) => string | null;
  renameCandidate: (aid: string, pid: string, cid: string, name: string) => void;
  updateCandidate: (aid: string, pid: string, cid: string, patch: { district?: string; note?: string }) => void;
  removeCandidate: (aid: string, pid: string, cid: string) => void;
  moveCandidate: (aid: string, pid: string, cid: string, delta: number) => void;
  sortCandidates: (aid: string, pid: string, how: 'alpha' | 'shuffle') => void;
  copyCandidates: (aid: string, pid: string, fromPid: string) => number;

  startBalloting: (aid: string, pid: string) => void;
  reopenNominations: (aid: string, pid: string) => void;
  withdrawCandidate: (aid: string, pid: string, cid: string) => void;
  reinstateCandidate: (aid: string, pid: string, cid: string) => void;

  setDraft: (aid: string, pid: string, draft: DraftBallot | null) => void;
  /** Zero the counts but keep the teller link alive and the reports listed. */
  clearDraftCounts: (aid: string, pid: string) => void;
  addTellerReport: (aid: string, pid: string, report: Omit<TellerReport, 'addedAt'>) => void;
  removeTellerReport: (aid: string, pid: string, reportId: string) => void;
  recordBallot: (aid: string, pid: string) => void;
  undoLastBallot: (aid: string, pid: string) => void;

  recordMotion: (aid: string, pid: string, vote: Omit<MotionVote, 'id' | 'recordedAt'>) => void;
  undoMotion: (aid: string, pid: string) => void;

  recordHat: (aid: string, pid: string, draw: Omit<HatDraw, 'drawnAt'>) => void;
  undoHat: (aid: string, pid: string) => void;

  resetPosition: (aid: string, pid: string) => void;
  addLog: (aid: string, entry: Omit<LogEntry, 'at'>) => void;

  // ---- motions
  updateMotionSettings: (aid: string, patch: Partial<MotionSettings>) => void;
  addMotion: (aid: string, motion: Partial<Motion>) => string;
  updateMotion: (aid: string, mid: string, patch: Partial<Pick<Motion, 'title' | 'text' | 'background' | 'movedBy' | 'secondedBy' | 'committee' | 'threshold' | 'kind' | 'notes'>>) => void;
  removeMotion: (aid: string, mid: string) => void;
  setMotionStatus: (aid: string, mid: string, status: Motion['status'], note?: string) => void;
  addSpeaker: (aid: string, mid: string, side: 'for' | 'against', delta: number) => void;
  recordMotionVote: (aid: string, mid: string, round: Omit<MotionRound, 'id' | 'at' | 'carried' | 'quorumMet' | 'eligible'>) => void;
  undoMotionVote: (aid: string, mid: string) => void;
  recordMinorityOpinion: (aid: string, mid: string, roundId: string, notes: string, heard: boolean) => void;

  // ---- Conference agenda items
  updateConferenceSettings: (aid: string, patch: Partial<ConferenceSettings>) => void;
  addConferenceItem: (aid: string, item: Partial<ConferenceItem>) => string;
  updateConferenceItem: (aid: string, cid: string, patch: Partial<Omit<ConferenceItem, 'id' | 'rounds' | 'createdAt'>>) => void;
  removeConferenceItem: (aid: string, cid: string) => void;
  recordConferencePoll: (aid: string, cid: string, round: Omit<ConferenceRound, 'id' | 'at'>) => void;
  undoConferencePoll: (aid: string, cid: string) => void;
  importConferenceItems: (aid: string, items: Partial<ConferenceItem>[]) => number;

  // ---- agenda
  setAgendaStart: (aid: string, time: string) => void;
  addAgendaItem: (aid: string, item: Partial<AgendaItem>, afterId?: string) => string;
  updateAgendaItem: (aid: string, iid: string, patch: Partial<AgendaItem>) => void;
  removeAgendaItem: (aid: string, iid: string) => void;
  moveAgendaItem: (aid: string, iid: string, delta: number) => void;
  startAgendaItem: (aid: string, iid: string) => void;
  finishAgendaItem: (aid: string, iid: string) => void;
  loadAgendaTemplate: (aid: string, template: AgendaItem[]) => void;

  // ---- projector, badges and registration
  setScreen: (aid: string, screen: NonNullable<Live['screen']>, id?: string | null) => void;
  setZoom: (aid: string, zoom: number) => void;
  setHighContrast: (aid: string, on: boolean) => void;
  updateBadge: (aid: string, patch: Partial<BadgeDesign>) => void;
  setAttendanceOptions: (aid: string, options: AttendanceOption[]) => void;
  setVoterFields: (aid: string, fields: VoterField[]) => void;
  setVoterAttending: (aid: string, vid: string, optionId: string, on: boolean) => void;
  setVoterCustom: (aid: string, vid: string, fieldId: string, value: string) => void;
}

export type Store = State & Actions;

export class ActionError extends Error {}

export const useStore = create<Store>()(
  persist(
    immer((set, get) => {
      /** Mutate one assembly inside an immer draft. */
      const mutate = (aid: string, fn: (a: Assembly) => void) =>
        set((s) => {
          const a = s.assemblies.find((x) => x.id === aid);
          if (!a) return;
          fn(a);
          a.updatedAt = now();
        });

      const mutatePos = (aid: string, pid: string, fn: (p: Position, a: Assembly) => void) =>
        mutate(aid, (a) => {
          const p = a.positions.find((x) => x.id === pid);
          if (p) fn(p, a);
        });

      const log = (a: Assembly, action: string, detail?: string, positionId?: string) => {
        a.log.push({ at: now(), action, detail, positionId });
      };

      const candName = (p: Position, cid: string) => (cid === AGAINST ? 'No' : (p.candidates.find((c) => c.id === cid)?.name ?? '?'));

      const electedNames = (a: Assembly, exceptPid: string): Map<string, string> => {
        const m = new Map<string, string>();
        for (const p of a.positions) {
          if (p.id === exceptPid) continue;
          const st = computePosition(p, a.settings);
          if (st.phase.kind === 'elected') m.set(candName(p, st.phase.candidateId).trim().toLowerCase(), p.title);
        }
        return m;
      };

      const setStatus = (a: Assembly, status: LiveStatus) => {
        if (a.live.status !== status) a.live = { ...a.live, status, since: now() };
      };

      return {
        assemblies: [],

        createAssembly: (name, positions = [], type = 'area') => {
          const a = newAssembly(name.trim() || 'Untitled assembly', type);
          for (const t of positions) a.positions.push(newPosition(t));
          set((s) => {
            s.assemblies.unshift(a);
          });
          try {
            void navigator.storage?.persist?.();
          } catch {
            /* not supported */
          }
          return a.id;
        },

        importAssembly: (raw, asCopy = false) => {
          const a = normalizeAssembly(raw);
          const exists = get().assemblies.some((x) => x.id === a.id);
          if (asCopy || exists) {
            a.id = nanoid(10);
            if (exists && !asCopy) a.name = `${a.name} (imported)`;
          }
          a.log.push({ at: now(), action: 'Imported from file' });
          set((s) => {
            s.assemblies.unshift(a);
          });
          return a.id;
        },

        duplicateAssembly: (id) => {
          const src = get().assemblies.find((x) => x.id === id);
          if (!src) return id;
          return get().importAssembly(JSON.parse(JSON.stringify({ ...src, name: `${src.name} (copy)` })), true);
        },

        deleteAssembly: (id) =>
          set((s) => {
            s.assemblies = s.assemblies.filter((a) => a.id !== id);
          }),

        updateAssembly: (id, patch) =>
          mutate(id, (a) => {
            if (patch.electionType && patch.electionType !== a.electionType) {
              log(a, 'Election type changed', PRESETS[patch.electionType].label);
            }
            if (patch.useRollForCounts !== undefined && patch.useRollForCounts !== a.useRollForCounts) {
              log(a, patch.useRollForCounts ? 'Eligible voter counts now come from the roll call' : 'Eligible voter counts entered manually');
            }
            Object.assign(a, patch);
          }),

        setVoters: (id, channel, count) =>
          mutate(id, (a) => {
            a.voters[channel] = Math.max(0, Math.floor(Number(count) || 0));
          }),

        updateSettings: (id, patch) =>
          mutate(id, (a) => {
            Object.assign(a.settings, patch);
            log(a, 'Settings changed', Object.entries(patch).map(([k, v]) => `${k} = ${String(v)}`).join(', '));
          }),

        updateOfficials: (id, patch) => mutate(id, (a) => Object.assign(a.officials, patch)),

        setApproval: (id, key, approved) =>
          mutate(id, (a) => {
            a.approvals[key] = approved ? now() : null;
            const what = { procedure: 'the election procedure (Third Legacy)', order: 'the order of election', whoVotes: 'who votes' }[key];
            log(a, approved ? 'Assembly approved' : 'Approval withdrawn', what);
          }),

        setLivePosition: (id, positionId) => mutate(id, (a) => void (a.livePositionId = positionId)),
        setLiveStatus: (id, status) => mutate(id, (a) => setStatus(a, status)),
        setLiveMessage: (id, message) => mutate(id, (a) => void (a.live.message = message)),
        setTimer: (id, timer) => mutate(id, (a) => void (a.live.timer = timer)),

        setRoles: (id, roles) => mutate(id, (a) => void (a.roles = roles)),

        addVoter: (id, v) =>
          mutate(id, (a) => {
            a.voterRoll.push({ ...v, id: nanoid(8), checkedInAt: v.present ? now() : undefined });
          }),

        updateVoter: (id, vid, patch) =>
          mutate(id, (a) => {
            const v = a.voterRoll.find((x) => x.id === vid);
            if (v) Object.assign(v, patch);
          }),

        removeVoter: (id, vid) => mutate(id, (a) => void (a.voterRoll = a.voterRoll.filter((x) => x.id !== vid))),

        importVoters: (id, voters, replace) =>
          mutate(id, (a) => {
            a.voterRoll = replace ? voters : [...a.voterRoll, ...voters];
            log(a, 'Voter roll imported', `${voters.length} name(s)${replace ? ' (replaced the roll)' : ''}`);
          }),

        setPresent: (id, vid, present) =>
          mutate(id, (a) => {
            const v = a.voterRoll.find((x) => x.id === vid);
            if (!v || v.present === present) return;
            v.present = present;
            v.checkedInAt = present ? now() : undefined;
          }),

        setAllAbsent: (id) =>
          mutate(id, (a) => {
            for (const v of a.voterRoll) {
              v.present = false;
              v.checkedInAt = undefined;
            }
            log(a, 'Roll call cleared (everyone marked absent)');
          }),

        addPosition: (aid, title, afterPid) => {
          const p = newPosition(title.trim() || 'Position');
          mutate(aid, (a) => {
            const i = afterPid ? a.positions.findIndex((x) => x.id === afterPid) : -1;
            if (i >= 0) a.positions.splice(i + 1, 0, p);
            else a.positions.push(p);
            log(a, 'Position added', p.title, p.id);
          });
          return p.id;
        },

        updatePosition: (aid, pid, patch) => mutatePos(aid, pid, (p) => Object.assign(p, patch)),

        removePosition: (aid, pid) =>
          mutate(aid, (a) => {
            const p = a.positions.find((x) => x.id === pid);
            if (!p) return;
            a.positions = a.positions.filter((x) => x.id !== pid);
            for (const o of a.positions) if (o.hatSecondToPositionId === pid) o.hatSecondToPositionId = null;
            if (a.livePositionId === pid) a.livePositionId = null;
            log(a, 'Position removed', p.title);
          }),

        movePosition: (aid, pid, delta) =>
          mutate(aid, (a) => {
            const i = a.positions.findIndex((x) => x.id === pid);
            const j = i + delta;
            if (i < 0 || j < 0 || j >= a.positions.length) return;
            const [p] = a.positions.splice(i, 1);
            a.positions.splice(j, 0, p);
          }),

        addSeat: (aid, pid) => {
          const a = get().assemblies.find((x) => x.id === aid);
          const src = a?.positions.find((x) => x.id === pid);
          if (!a || !src) return null;
          const base = src.title.replace(/\s+—\s+seat\s+\d+$/i, '');
          const family = a.positions.filter((p) => p.title === base || p.title.startsWith(`${base} — seat`));
          const highest = family.reduce((max, p) => {
            const m = p.title.match(/seat\s+(\d+)$/i);
            return Math.max(max, m ? Number(m[1]) : 1);
          }, 1);
          const last = family[family.length - 1] ?? src;
          const newId = get().addPosition(aid, `${base} — seat ${highest + 1}`, last.id);
          get().copyCandidates(aid, newId, pid);
          return newId;
        },

        addCandidate: (aid, pid, name, district) => {
          const clean = name.trim().replace(/\s+/g, ' ');
          if (!clean) throw new ActionError('Enter a name.');
          const a = get().assemblies.find((x) => x.id === aid);
          const p = a?.positions.find((x) => x.id === pid);
          if (!a || !p) return null;
          if (p.started) throw new ActionError('Nominations are closed for this position.');
          if (p.candidates.some((c) => c.name.toLowerCase() === clean.toLowerCase())) {
            throw new ActionError(`${clean} is already a candidate for ${p.title}.`);
          }
          if (a.settings.oneOfficePerPerson) {
            const office = electedNames(a, pid).get(clean.toLowerCase());
            if (office) throw new ActionError(`${clean} has already been elected ${office}.`);
          }
          const id = nanoid(8);
          mutatePos(aid, pid, (pp, aa) => {
            pp.candidates.push({ id, name: clean, district: district?.trim() || undefined, withdrawnBeforeBallot: null });
            log(aa, 'Candidate added', `${clean}${district ? ` (${district})` : ''} — ${pp.title}`, pid);
          });
          return id;
        },

        renameCandidate: (aid, pid, cid, name) =>
          mutatePos(aid, pid, (p, a) => {
            const c = p.candidates.find((x) => x.id === cid);
            const clean = name.trim().replace(/\s+/g, ' ');
            if (!c || !clean || c.name === clean) return;
            if (p.candidates.some((x) => x.id !== cid && x.name.toLowerCase() === clean.toLowerCase())) {
              throw new ActionError(`${clean} is already a candidate for ${p.title}.`);
            }
            log(a, 'Candidate renamed', `${c.name} → ${clean}`, pid);
            c.name = clean;
          }),

        updateCandidate: (aid, pid, cid, patch) =>
          mutatePos(aid, pid, (p) => {
            const c = p.candidates.find((x) => x.id === cid);
            if (c) Object.assign(c, patch);
          }),

        removeCandidate: (aid, pid, cid) =>
          mutatePos(aid, pid, (p, a) => {
            if (p.started) return;
            const c = p.candidates.find((x) => x.id === cid);
            p.candidates = p.candidates.filter((x) => x.id !== cid);
            if (c) log(a, 'Candidate removed (unable to serve / not standing)', `${c.name} — ${p.title}`, pid);
          }),

        moveCandidate: (aid, pid, cid, delta) =>
          mutatePos(aid, pid, (p) => {
            const i = p.candidates.findIndex((x) => x.id === cid);
            const j = i + delta;
            if (i < 0 || j < 0 || j >= p.candidates.length) return;
            const [c] = p.candidates.splice(i, 1);
            p.candidates.splice(j, 0, c);
          }),

        sortCandidates: (aid, pid, how) =>
          mutatePos(aid, pid, (p, a) => {
            if (p.started) return;
            p.candidates =
              how === 'alpha' ? [...p.candidates].sort((x, y) => x.name.localeCompare(y.name)) : secureShuffle(p.candidates);
            log(a, how === 'alpha' ? 'Candidates posted alphabetically' : 'Posting order drawn at random', p.candidates.map((c) => c.name).join(', '), pid);
          }),

        copyCandidates: (aid, pid, fromPid) => {
          const a = get().assemblies.find((x) => x.id === aid);
          const from = a?.positions.find((x) => x.id === fromPid);
          const to = a?.positions.find((x) => x.id === pid);
          if (!a || !from || !to || to.started) return 0;
          const elected = electedNames(a, pid);
          const have = new Set(to.candidates.map((c) => c.name.toLowerCase()));
          const picks = from.candidates
            .filter((c) => !have.has(c.name.toLowerCase()))
            .filter((c) => !(a.settings.oneOfficePerPerson && elected.has(c.name.toLowerCase())));
          mutatePos(aid, pid, (p, aa) => {
            for (const c of picks) p.candidates.push({ id: nanoid(8), name: c.name, district: c.district, withdrawnBeforeBallot: null });
            if (picks.length) log(aa, 'Candidates copied', `${picks.map((c) => c.name).join(', ')} from ${from.title}`, pid);
          });
          return picks.length;
        },

        startBalloting: (aid, pid) =>
          mutatePos(aid, pid, (p, a) => {
            if (p.started) return;
            if (p.candidates.length === 0) throw new ActionError('Add at least one candidate first.');
            p.started = true;
            p.startedAt = now();
            a.livePositionId = p.id;
            log(a, 'Nominations closed — balloting begins', `${p.title}: ${p.candidates.map((c) => c.name).join(', ')}`, pid);
          }),

        reopenNominations: (aid, pid) =>
          mutatePos(aid, pid, (p, a) => {
            if (p.ballots.length) throw new ActionError('Undo the recorded ballots first.');
            if (p.appointment) throw new ActionError('This position was filled from another position’s hat draw — undo that draw first.');
            p.started = false;
            for (const c of p.candidates) c.withdrawnBeforeBallot = null;
            log(a, 'Nominations reopened', p.title, pid);
          }),

        withdrawCandidate: (aid, pid, cid) =>
          mutatePos(aid, pid, (p, a) => {
            const c = p.candidates.find((x) => x.id === cid);
            if (!c) throw new ActionError('That candidate is no longer on the board.');
            if (c.withdrawnBeforeBallot !== null) throw new ActionError(`${c.name} has already withdrawn.`);
            if (p.hat) throw new ActionError('The choice has already gone to the hat.');
            // If the tellers have already started counting a ballot, the candidate was on the
            // board for it: their votes stay in that ballot's total and the withdrawal takes
            // effect for the ballot after it. Removing them now would shrink the total vote and
            // could elect someone on less than two-thirds of the ballots actually cast.
            const counting =
              !!p.draft && CHANNELS.some((ch) => Object.values(p.draft!.counts[ch].votes).some((n) => n > 0) || p.draft!.counts[ch].invalid > 0);
            c.withdrawnBeforeBallot = p.ballots.length + (counting ? 2 : 1);
            log(
              a,
              'Candidate withdrew voluntarily',
              `${c.name} — ${p.title}${
                p.ballots.length ? ` (after the ${ordinal(p.ballots.length)} ballot)` : ' (before the 1st ballot)'
              }${counting ? `; stays on the ${ordinal(p.ballots.length + 1)} ballot being counted` : ''}`,
              pid,
            );
          }),

        reinstateCandidate: (aid, pid, cid) =>
          mutatePos(aid, pid, (p, a) => {
            const c = p.candidates.find((x) => x.id === cid);
            if (!c) throw new ActionError('That candidate is no longer on the board.');
            // Only a withdrawal made since the last ballot can be taken back.
            if ((c.withdrawnBeforeBallot !== p.ballots.length + 1 && c.withdrawnBeforeBallot !== p.ballots.length + 2) || p.hat) {
              throw new ActionError(`${c.name}’s withdrawal was announced before the last ballot and cannot be taken back.`);
            }
            c.withdrawnBeforeBallot = null;
            log(a, 'Voluntary withdrawal taken back', `${c.name} — ${p.title}`, pid);
          }),

        setDraft: (aid, pid, draft) => mutatePos(aid, pid, (p) => void (p.draft = draft)),

        clearDraftCounts: (aid, pid) =>
          mutatePos(aid, pid, (p, a) => {
            const key = p.draft?.key;
            const reports = p.draft?.tellerReports?.length ?? 0;
            p.draft = { ...emptyDraft(), key: key ?? emptyDraft().key };
            log(a, 'Ballot counts cleared', `${p.title}${reports ? ` (${reports} teller/poll report(s) removed)` : ''}`, pid);
          }),

        addTellerReport: (aid, pid, report) =>
          mutatePos(aid, pid, (p, a) => {
            const st = computePosition(p, a.settings);
            if (st.phase.kind !== 'ballot') throw new ActionError('No ballot is being counted for this position.');
            if (!p.draft) p.draft = emptyDraft();
            const d = p.draft;
            d.tellerReports ??= [];
            const allowed = new Set(st.phase.activeIds);
            if (st.phase.isConfirmation) allowed.add(AGAINST);
            for (const k of Object.keys(report.votes)) {
              if (!allowed.has(k)) throw new ActionError('This report lists a candidate who is not on this ballot.');
            }
            const eligible = effectiveVoters(a)[report.channel];
            const reportTotal = Object.values(report.votes).reduce((x, y) => x + y, 0) + report.invalid;
            // A report with more than twice the eligible voters cannot be right; a smaller
            // over-count may just mean the roll is incomplete, and is flagged on the ballot.
            if (eligible > 0 && reportTotal > eligible * 2) {
              throw new ActionError(
                `That report has ${reportTotal} ballots but only ${eligible} ${report.channel === 'virtual' ? 'virtual' : 'in-person'} voters are eligible. Check the report — it looks like it belongs to a different ballot.`,
              );
            }
            const c = d.counts[report.channel];
            // Same report id again = the teller kept counting and re-sent it: replace the old one.
            const prev = d.tellerReports.find((r) => r.id === report.id);
            if (prev) {
              const same = prev.invalid === report.invalid && Object.keys(report.votes).every((k) => (prev.votes[k] ?? 0) === report.votes[k]);
              if (same) throw new ActionError('That report has already been added.');
              const pc = d.counts[prev.channel];
              for (const [k, n] of Object.entries(prev.votes)) pc.votes[k] = Math.max(0, (pc.votes[k] || 0) - n);
              pc.invalid = Math.max(0, (pc.invalid || 0) - prev.invalid);
              d.tellerReports = d.tellerReports.filter((r) => r.id !== report.id);
              log(a, 'Teller report replaced with an updated count', `${report.teller || 'teller'} — ${p.title}`, pid);
            }
            for (const [k, n] of Object.entries(report.votes)) c.votes[k] = (c.votes[k] || 0) + n;
            c.invalid = (c.invalid || 0) + report.invalid;
            d.tellerReports.push({ ...report, addedAt: now() });
            const total = Object.values(report.votes).reduce((x, y) => x + y, 0) + report.invalid;
            log(
              a,
              report.source === 'poll' ? 'Virtual poll results imported' : 'Teller report added',
              `${p.title}, ${ordinal(p.ballots.length + 1)} ballot — ${report.teller || 'teller'} (${report.channel === 'virtual' ? 'virtual' : 'in-person'}): ${total} ballot(s)${report.detail ? `; ${report.detail}` : ''}`,
              pid,
            );
          }),

        removeTellerReport: (aid, pid, reportId) =>
          mutatePos(aid, pid, (p, a) => {
            const d = p.draft;
            const r = d?.tellerReports?.find((x) => x.id === reportId);
            if (!d || !r) return;
            const c = d.counts[r.channel];
            for (const [k, n] of Object.entries(r.votes)) c.votes[k] = Math.max(0, (c.votes[k] || 0) - n);
            c.invalid = Math.max(0, (c.invalid || 0) - r.invalid);
            d.tellerReports = d.tellerReports!.filter((x) => x.id !== reportId);
            log(a, 'Teller report removed', `${r.teller || 'teller'} — ${p.title}`, pid);
          }),

        recordBallot: (aid, pid) =>
          mutatePos(aid, pid, (p, a) => {
            const st = computePosition(p, a.settings);
            if (st.phase.kind !== 'ballot') throw new ActionError('No ballot is due for this position right now.');
            const d = p.draft ?? emptyDraft();
            const allowed = new Set(st.phase.activeIds);
            if (st.phase.isConfirmation) allowed.add(AGAINST);
            const counts = {
              inPerson: { votes: {} as Record<string, number>, invalid: Math.max(0, Math.floor(d.counts.inPerson.invalid || 0)) },
              virtual: { votes: {} as Record<string, number>, invalid: Math.max(0, Math.floor(d.counts.virtual.invalid || 0)) },
            };
            for (const ch of CHANNELS) {
              for (const id of allowed) counts[ch].votes[id] = Math.max(0, Math.floor(d.counts[ch].votes[id] || 0));
            }
            p.ballots.push({
              id: nanoid(8),
              counts,
              eligibleVoters: { ...effectiveVoters(a) },
              collected: { ...d.collected },
              tellerReports: d.tellerReports?.length ? JSON.parse(JSON.stringify(d.tellerReports)) : undefined,
              recordedAt: now(),
              note: [d.note, d.tellerReports?.length ? `${d.tellerReports.length} teller/poll report(s) combined` : ''].filter(Boolean).join(' · ') || undefined,
            });
            p.draft = null;
            setStatus(a, 'idle');
            const after = computePosition(p, a.settings);
            const r = after.ballots[after.ballots.length - 1];
            const summary = r
              ? r.ranking.map((id) => `${candName(p, id)} ${r.votes[id].total}`).join(', ') +
                (r.isConfirmation ? `, No ${r.votes[AGAINST]?.total ?? 0}` : '') +
                `; total vote ${r.totalVote}, two-thirds = ${r.electThreshold}` +
                (r.invalid.total ? `; invalid ${r.invalid.total}` : '')
              : '';
            log(a, `${ordinal(p.ballots.length)} ballot recorded`, `${p.title}: ${summary}`, pid);
            if (after.phase.kind === 'elected') log(a, 'Elected', `${candName(p, after.phase.candidateId)} — ${p.title}`, pid);
            if (r?.autoWithdrawnIds.length) log(a, 'Automatic withdrawal', r.autoWithdrawnIds.map((id) => candName(p, id)).join(', '), pid);
          }),

        undoLastBallot: (aid, pid) =>
          mutatePos(aid, pid, (p, a) => {
            if (!p.ballots.length) throw new ActionError('No ballots have been recorded for this position.');
            if (p.hat || (p.ballots.length === 4 && p.motionVotes.length)) {
              throw new ActionError('Undo the hat draw / fifth-ballot motion first.');
            }
            const draftInProgress =
              !!p.draft && CHANNELS.some((ch) => Object.values(p.draft!.counts[ch].votes).some((n) => n > 0) || p.draft!.counts[ch].invalid > 0);
            if (draftInProgress) {
              throw new ActionError('Counts have already been entered for the next ballot. Clear those counts first, then undo.');
            }
            const removed = p.ballots.pop()!;
            const n = p.ballots.length;
            // Withdrawals announced after the removed ballot are no longer meaningful.
            for (const c of p.candidates) {
              if (c.withdrawnBeforeBallot !== null && c.withdrawnBeforeBallot > n + 1) {
                c.withdrawnBeforeBallot = null;
                log(a, 'Voluntary withdrawal cleared by undo', c.name, pid);
              }
            }
            // Put the counts back so the tellers can correct them (recount) rather than retype.
            // Teller/poll reports are kept with them, so the same file cannot be added twice.
            p.draft = {
              ...emptyDraft(),
              counts: JSON.parse(JSON.stringify(removed.counts)),
              collected: { ...removed.collected },
              note: removed.note ?? '',
              tellerReports: removed.tellerReports ? JSON.parse(JSON.stringify(removed.tellerReports)) : [],
            };
            log(a, `${ordinal(n + 1)} ballot reopened for correction`, p.title, pid);
          }),

        recordMotion: (aid, pid, vote) =>
          mutatePos(aid, pid, (p, a) => {
            const st = computePosition(p, a.settings);
            const canReconsider =
              (st.phase.kind === 'hat' && st.phase.reason === 'motionDefeated' && !p.hat) ||
              (st.phase.kind === 'ballot' && st.phase.number === 5 && p.ballots.length === 4);
            if (st.phase.kind !== 'motion' && !(vote.reconsideration && canReconsider)) {
              throw new ActionError('The fifth-ballot motion is not due right now.');
            }
            p.motionVotes.push({ ...vote, id: nanoid(8), recordedAt: now() });
            const yes = vote.hands.inPerson.yes + vote.hands.virtual.yes;
            const no = vote.hands.inPerson.no + vote.hands.virtual.no;
            log(
              a,
              vote.kind === 'noMotion'
                ? 'No motion / no second for a fifth ballot'
                : `Fifth-ballot motion ${vote.carried ? 'CARRIED' : 'DEFEATED'}${vote.reconsideration ? ' (after reconsideration)' : ''}`,
              vote.kind === 'vote' && yes + no === 0
                ? `${p.title}: by visual count of hands${vote.minorityOpinionNote ? ` — minority opinion: ${vote.minorityOpinionNote}` : ''}`
                : vote.kind === 'vote'
                  ? `${p.title}: yes ${yes} (in-person ${vote.hands.inPerson.yes}, virtual ${vote.hands.virtual.yes}), no ${no} (in-person ${vote.hands.inPerson.no}, virtual ${vote.hands.virtual.no})${vote.minorityOpinionNote ? ` — minority opinion: ${vote.minorityOpinionNote}` : ''}`
                  : p.title,
              pid,
            );
          }),

        undoMotion: (aid, pid) =>
          mutatePos(aid, pid, (p, a) => {
            if (!p.motionVotes.length) throw new ActionError('No motion has been recorded for this position.');
            if (p.hat || p.ballots.length > 4) throw new ActionError('Undo the fifth ballot / hat draw first.');
            p.motionVotes.pop();
            log(a, 'Fifth-ballot motion undone', p.title, pid);
          }),

        recordHat: (aid, pid, draw) =>
          mutate(aid, (a) => {
            const p = a.positions.find((x) => x.id === pid);
            if (!p) return;
            const st = computePosition(p, a.settings);
            if (st.phase.kind !== 'hat') throw new ActionError('This position is not going to the hat.');
            const pool = st.phase.poolIds;
            if (!draw.order.length || !pool.includes(draw.order[0])) throw new ActionError('Invalid draw.');
            if (new Set(draw.order).size !== draw.order.length || draw.order.some((id) => !pool.includes(id))) {
              throw new ActionError('The draw order does not match the names in the hat.');
            }
            if (p.hatSecondToPositionId && draw.order.length < pool.length) {
              throw new ActionError(
                'This position passes the second name drawn to another position, so every slip must be drawn and recorded in order.',
              );
            }
            p.hat = { ...draw, drawnAt: now() };
            setStatus(a, 'idle');
            log(
              a,
              `Chosen by lot (${draw.mode === 'digital' ? 'digital draw' : 'physical hat'})`,
              `${p.title}: ${draw.order.map((id, i) => `${i + 1}. ${candName(p, id)}`).join(', ')}`,
              pid,
            );
            // Optional area practice: second name out of the hat fills another position.
            if (p.hatSecondToPositionId && draw.order.length >= 2) {
              const target = a.positions.find((x) => x.id === p.hatSecondToPositionId);
              if (target && !target.started && !target.appointment) {
                const name = candName(p, draw.order[1]);
                let c = target.candidates.find((x) => x.name.toLowerCase() === name.toLowerCase());
                let created = false;
                if (!c) {
                  const src = p.candidates.find((x) => x.id === draw.order[1]);
                  c = { id: nanoid(8), name, district: src?.district, withdrawnBeforeBallot: null };
                  target.candidates.push(c);
                  created = true;
                }
                target.appointment = { candidateId: c.id, fromPositionId: p.id, fromPositionTitle: p.title, createdCandidate: created };
                target.started = true;
                target.startedAt = now();
                log(a, 'Elected by second draw from the hat', `${name} — ${target.title} (from ${p.title})`, target.id);
              }
            }
          }),

        undoHat: (aid, pid) =>
          mutate(aid, (a) => {
            const p = a.positions.find((x) => x.id === pid);
            if (!p) return;
            if (!p.hat) throw new ActionError('No hat draw has been recorded for this position.');
            p.hat = null;
            for (const t of a.positions) {
              if (t.appointment?.fromPositionId === pid) {
                const { candidateId: cid, createdCandidate } = t.appointment;
                t.appointment = null;
                t.started = false;
                // Only remove the candidate row if this draw created it.
                if (createdCandidate && !t.ballots.length) t.candidates = t.candidates.filter((c) => c.id !== cid);
                log(a, 'Second-draw appointment undone', t.title, t.id);
              }
            }
            log(a, 'Hat draw undone', p.title, pid);
          }),

        resetPosition: (aid, pid) =>
          mutate(aid, (a) => {
            const p = a.positions.find((x) => x.id === pid);
            if (!p) return;
            for (const t of a.positions) {
              if (t.appointment?.fromPositionId === pid) {
                t.appointment = null;
                t.started = false;
              }
            }
            const ballots = p.ballots.length;
            p.started = false;
            p.startedAt = undefined;
            p.ballots = [];
            p.motionVotes = [];
            p.hat = null;
            p.appointment = null;
            p.draft = null;
            for (const c of p.candidates) c.withdrawnBeforeBallot = null;
            log(a, 'Position reset — all ballots cleared', `${p.title} (${ballots} ballot(s) discarded)`, pid);
          }),

        addLog: (aid, entry) => mutate(aid, (a) => void a.log.push({ ...entry, at: now() })),

        /* ---------------- motions ---------------- */

        updateMotionSettings: (aid, patch) =>
          mutate(aid, (a) => {
            Object.assign(a.motionSettings, patch);
            log(a, 'Motion settings changed', Object.entries(patch).map(([k, v]) => `${k} = ${JSON.stringify(v)}`).join(', '));
          }),

        addMotion: (aid, motion) => {
          const id = nanoid(10);
          mutate(aid, (a) => {
            const kind = (motion.kind ?? 'main') as MotionKind;
            const number = a.motions.length + 1;
            a.motions.push({
              id,
              number,
              kind,
              title: motion.title?.trim() || `Motion ${number}`,
              text: motion.text?.trim() ?? '',
              background: motion.background ?? '',
              movedBy: motion.movedBy ?? '',
              secondedBy: motion.secondedBy ?? (MOTION_RULES[kind].second === 'automatic' ? 'Committee recommendation (automatically seconded)' : ''),
              committee: motion.committee,
              threshold: motion.threshold ?? (MOTION_RULES[kind].threshold as VoteThreshold),
              status: 'open',
              rounds: [],
              speakers: { for: 0, against: 0 },
              notes: '',
              reconsidered: false,
              createdAt: now(),
            });
            log(a, 'Motion introduced', `${number}. ${motion.title?.trim() || motion.text?.slice(0, 60) || ''}`);
          });
          return id;
        },

        updateMotion: (aid, mid, patch) =>
          mutate(aid, (a) => {
            const m = a.motions.find((x) => x.id === mid);
            if (!m) return;
            if (patch.kind && patch.kind !== m.kind) m.threshold = MOTION_RULES[patch.kind].threshold as VoteThreshold;
            Object.assign(m, patch);
          }),

        removeMotion: (aid, mid) =>
          mutate(aid, (a) => {
            const m = a.motions.find((x) => x.id === mid);
            if (!m) return;
            if (m.rounds.length) throw new ActionError('This motion has recorded votes — undo them first.');
            a.motions = a.motions.filter((x) => x.id !== mid);
            a.motions.forEach((x, i) => (x.number = i + 1));
            log(a, 'Motion removed', m.title);
          }),

        setMotionStatus: (aid, mid, status, note) =>
          mutate(aid, (a) => {
            const m = a.motions.find((x) => x.id === mid);
            if (!m) return;
            // Taken from the table: the vote that tabled it no longer governs, so undoing a
            // later vote cannot put the motion back on the table.
            if (status === 'open' && m.status === 'tabled') {
              const tabled = [...m.rounds].reverse().find((r) => r.kind === 'table' && r.carried && !r.spent);
              if (tabled) tabled.spent = true;
            }
            m.status = status;
            if (status !== 'open') m.decidedAt = now();
            if (note) m.notes = [m.notes, note].filter(Boolean).join('\n');
            log(a, `Motion ${status}`, `${m.number}. ${m.title}${note ? ` — ${note}` : ''}`);
          }),

        addSpeaker: (aid, mid, side, delta) =>
          mutate(aid, (a) => {
            const m = a.motions.find((x) => x.id === mid);
            if (!m) return;
            m.speakers[side] = Math.max(0, m.speakers[side] + delta);
          }),

        recordMotionVote: (aid, mid, round) =>
          mutate(aid, (a) => {
            const m = a.motions.find((x) => x.id === mid);
            if (!m) throw new ActionError('That motion is no longer here.');
            if (round.kind === 'reconsider' && m.reconsidered) {
              throw new ActionError('This action has already been reconsidered once — it may not be reconsidered twice.');
            }
            const eligibleCounts = effectiveVoters(a);
            const eligible = eligibleCounts.inPerson + eligibleCounts.virtual;
            const tally = tallyMotion(round.counts, round.threshold, a.motionSettings, eligible);
            const entry: MotionRound = {
              ...round,
              id: nanoid(8),
              at: now(),
              eligible,
              carried: tally.carried,
              quorumMet: tally.quorumMet,
              minority: MOTION_RULES[round.kind].minorityHeard ? { heard: false, side: tally.minoritySide, notes: '' } : undefined,
            };
            m.rounds.push(entry);

            // What the result does to the motion itself.
            if (round.kind === 'main' || round.kind === 'committee' || round.kind === 'floor') {
              m.status = tally.carried ? 'carried' : 'defeated';
              m.decidedAt = now();
            } else if (round.kind === 'table' && tally.carried) {
              m.status = 'tabled';
            } else if (round.kind === 'recommit' && tally.carried) {
              m.status = 'recommitted';
              m.decidedAt = now();
            } else if (round.kind === 'reconsider' && tally.carried) {
              // Debate resumes and the question is open again.
              m.reconsidered = true;
              m.status = 'open';
              m.decidedAt = undefined;
            } else if (round.kind === 'amend' && tally.carried && round.text) {
              entry.previousText = m.text;
              m.text = round.text;
            }
            log(
              a,
              `${MOTION_RULES[round.kind].label} ${tally.carried ? 'CARRIED' : 'DEFEATED'}`,
              `${m.number}. ${m.title} — yes ${tally.yes}, no ${tally.no}, abstain ${tally.abstain} (needed ${tally.needed} of ${tally.votesCast})${
                tally.quorumMet ? '' : '; quorum not met'
              }`,
            );
          }),

        undoMotionVote: (aid, mid) =>
          mutate(aid, (a) => {
            const m = a.motions.find((x) => x.id === mid);
            if (!m || !m.rounds.length) throw new ActionError('No vote has been recorded on this motion.');
            const removed = m.rounds.pop()!;
            if (removed.kind === 'reconsider' && removed.carried) m.reconsidered = false;
            // An amendment that carried had rewritten the motion; undoing it puts the words back.
            if (removed.kind === 'amend' && removed.carried && removed.previousText !== undefined) m.text = removed.previousText;
            // Recompute the motion's standing by replaying the votes that remain, in order.
            if (m.status !== 'withdrawn') {
              let status: Motion['status'] = 'open';
              let decidedAt: string | undefined;
              for (const r of m.rounds) {
                if (r.kind === 'main' || r.kind === 'committee' || r.kind === 'floor') {
                  status = r.carried ? 'carried' : 'defeated';
                  decidedAt = r.at;
                } else if (r.kind === 'table' && r.carried && !r.spent) {
                  status = 'tabled';
                } else if (r.kind === 'recommit' && r.carried) {
                  status = 'recommitted';
                  decidedAt = r.at;
                } else if (r.kind === 'reconsider' && r.carried) {
                  status = 'open';
                  decidedAt = undefined;
                }
              }
              m.status = status;
              m.decidedAt = decidedAt;
            }
            log(a, 'Motion vote undone', `${m.number}. ${m.title} — ${MOTION_RULES[removed.kind].label}`);
          }),

        recordMinorityOpinion: (aid, mid, roundId, notes, heard) =>
          mutate(aid, (a) => {
            const m = a.motions.find((x) => x.id === mid);
            const r = m?.rounds.find((x) => x.id === roundId);
            if (!m || !r || !r.minority) return;
            r.minority = { ...r.minority, heard, notes };
            log(
              a,
              heard ? 'Minority opinion heard' : 'Minority opinion noted',
              `${m.number}. ${m.title} — the ${r.minority.side === 'for' ? 'side in favour' : 'side against'} spoke${notes ? `: ${notes}` : ''}`,
            );
          }),

        /* ---------------- Conference agenda items ---------------- */

        updateConferenceSettings: (aid, patch) => mutate(aid, (a) => void Object.assign(a.conferenceSettings, patch)),

        addConferenceItem: (aid, item) => {
          const id = nanoid(10);
          mutate(aid, (a) => {
            a.conferenceItems.push({
              id,
              committee: item.committee ?? '',
              reference: item.reference ?? '',
              title: item.title?.trim() || 'Agenda item',
              background: item.background ?? '',
              links: item.links ?? [],
              options: item.options ?? a.conferenceSettings.defaultOptions.map((o) => ({ ...o })),
              rounds: [],
              notes: item.notes ?? '',
              delegateNote: item.delegateNote ?? '',
              presenter: item.presenter,
              status: 'toDiscuss',
              createdAt: now(),
            });
            log(a, 'Conference agenda item added', `${item.committee ? `${item.committee}: ` : ''}${item.title ?? ''}`);
          });
          return id;
        },

        updateConferenceItem: (aid, cid, patch) =>
          mutate(aid, (a) => {
            const c = a.conferenceItems.find((x) => x.id === cid);
            if (c) Object.assign(c, patch);
          }),

        removeConferenceItem: (aid, cid) =>
          mutate(aid, (a) => {
            const c = a.conferenceItems.find((x) => x.id === cid);
            if (!c) return;
            if (c.rounds.length) throw new ActionError('This item has a recorded poll — undo it first.');
            a.conferenceItems = a.conferenceItems.filter((x) => x.id !== cid);
            log(a, 'Conference agenda item removed', c.title);
          }),

        recordConferencePoll: (aid, cid, round) =>
          mutate(aid, (a) => {
            const c = a.conferenceItems.find((x) => x.id === cid);
            if (!c) throw new ActionError('That item is no longer here.');
            c.rounds.push({ ...round, id: nanoid(8), at: now() });
            c.status = 'polled';
            const totals = c.options
              .map((o) => `${o.label} ${(round.counts.inPerson?.[o.id] ?? 0) + (round.counts.virtual?.[o.id] ?? 0)}`)
              .join(', ');
            log(a, 'Conference item polled', `${c.reference || c.title}: ${totals}; abstain ${(round.abstain.inPerson ?? 0) + (round.abstain.virtual ?? 0)}`);
          }),

        undoConferencePoll: (aid, cid) =>
          mutate(aid, (a) => {
            const c = a.conferenceItems.find((x) => x.id === cid);
            if (!c || !c.rounds.length) throw new ActionError('No poll has been recorded for this item.');
            c.rounds.pop();
            if (!c.rounds.length) c.status = 'discussed';
            log(a, 'Conference item poll undone', c.reference || c.title);
          }),

        importConferenceItems: (aid, items) => {
          let added = 0;
          mutate(aid, (a) => {
            for (const item of items) {
              if (!item.title) continue;
              a.conferenceItems.push({
                id: nanoid(10),
                committee: item.committee ?? '',
                reference: item.reference ?? '',
                title: item.title,
                background: item.background ?? '',
                links: item.links ?? [],
                options: a.conferenceSettings.defaultOptions.map((o) => ({ ...o })),
                rounds: [],
                notes: '',
                delegateNote: '',
                status: 'toDiscuss',
                createdAt: now(),
              });
              added++;
            }
            if (added) log(a, 'Conference agenda items imported', `${added} item(s)`);
          });
          return added;
        },

        /* ---------------- agenda ---------------- */

        setAgendaStart: (aid, time) => mutate(aid, (a) => void (a.agendaStart = time)),

        addAgendaItem: (aid, item, afterId) => {
          const id = nanoid(10);
          mutate(aid, (a) => {
            const entry: AgendaItem = {
              id,
              title: item.title?.trim() || 'Agenda item',
              kind: item.kind ?? 'segment',
              plannedMinutes: item.plannedMinutes ?? 15,
              presenter: item.presenter ?? '',
              notes: item.notes ?? '',
              linkId: item.linkId,
              startedAt: null,
              endedAt: null,
            };
            const i = afterId ? a.agenda.findIndex((x) => x.id === afterId) : -1;
            if (i >= 0) a.agenda.splice(i + 1, 0, entry);
            else a.agenda.push(entry);
          });
          return id;
        },

        updateAgendaItem: (aid, iid, patch) =>
          mutate(aid, (a) => {
            const i = a.agenda.find((x) => x.id === iid);
            if (i) Object.assign(i, patch);
          }),

        removeAgendaItem: (aid, iid) =>
          mutate(aid, (a) => {
            a.agenda = a.agenda.filter((x) => x.id !== iid);
            if (a.live.agendaItemId === iid) a.live.agendaItemId = null;
          }),

        moveAgendaItem: (aid, iid, delta) =>
          mutate(aid, (a) => {
            const i = a.agenda.findIndex((x) => x.id === iid);
            const j = i + delta;
            if (i < 0 || j < 0 || j >= a.agenda.length) return;
            const [item] = a.agenda.splice(i, 1);
            a.agenda.splice(j, 0, item);
          }),

        startAgendaItem: (aid, iid) =>
          mutate(aid, (a) => {
            const item = a.agenda.find((x) => x.id === iid);
            if (!item) return;
            // Close whatever was running.
            for (const other of a.agenda) if (other.id !== iid && other.startedAt && !other.endedAt) other.endedAt = now();
            item.startedAt = item.startedAt ?? now();
            item.endedAt = null;
            a.live = { ...a.live, agendaItemId: iid, screen: 'agenda' };
            log(a, 'Agenda item started', item.title);
          }),

        finishAgendaItem: (aid, iid) =>
          mutate(aid, (a) => {
            const item = a.agenda.find((x) => x.id === iid);
            if (!item || !item.startedAt) return;
            item.endedAt = now();
            log(a, 'Agenda item finished', item.title);
          }),

        loadAgendaTemplate: (aid, template) =>
          mutate(aid, (a) => {
            a.agenda = template.map((t) => ({ ...t, id: nanoid(10), startedAt: null, endedAt: null }));
            log(a, 'Agenda loaded from a template', `${template.length} items`);
          }),

        /* ---------------- projector, badges, registration ---------------- */

        setScreen: (aid, screen, id) =>
          mutate(aid, (a) => {
            a.live = {
              ...a.live,
              screen,
              agendaItemId: screen === 'agenda' ? (id ?? a.live.agendaItemId ?? null) : a.live.agendaItemId,
              motionId: screen === 'motion' ? (id ?? null) : a.live.motionId,
              conferenceItemId: screen === 'conference' ? (id ?? null) : a.live.conferenceItemId,
            };
          }),

        setZoom: (aid, zoom) => mutate(aid, (a) => void (a.live.zoom = Math.min(2, Math.max(0.5, Math.round(zoom * 100) / 100)))),
        setHighContrast: (aid, on) => mutate(aid, (a) => void (a.live.highContrast = on)),

        updateBadge: (aid, patch) =>
          mutate(aid, (a) => {
            a.badge = { ...a.badge, ...patch, front: { ...a.badge.front, ...(patch.front ?? {}) }, back: { ...a.badge.back, ...(patch.back ?? {}) } };
          }),

        setAttendanceOptions: (aid, options) => mutate(aid, (a) => void (a.attendanceOptions = options)),
        setVoterFields: (aid, fields) => mutate(aid, (a) => void (a.voterFields = fields)),

        setVoterAttending: (aid, vid, optionId, on) =>
          mutate(aid, (a) => {
            const v = a.voterRoll.find((x) => x.id === vid);
            if (!v) return;
            const current = new Set(v.attending ?? []);
            if (on) current.add(optionId);
            else current.delete(optionId);
            v.attending = [...current];
          }),

        setVoterCustom: (aid, vid, fieldId, value) =>
          mutate(aid, (a) => {
            const v = a.voterRoll.find((x) => x.id === vid);
            if (!v) return;
            v.custom = { ...(v.custom ?? {}), [fieldId]: value };
          }),
      };
    }),
    {
      name: STORAGE_KEY,
      version: 3,
      storage: createJSONStorage(() => persistentStorage ?? localStorage),
      migrate: (persisted) => ({ assemblies: assembliesFromStorage(persisted) }) as unknown as Store,
      // `migrate` only runs when the version number changes, which is one release behind
      // every time a field is added. `merge` runs on every hydration — start-up and the
      // cross-window sync — so a record saved by any earlier version is filled in before
      // any screen reads it, and one unreadable record never wipes the rest.
      merge: (persisted, current) => ({ ...current, assemblies: assembliesFromStorage(persisted) }),
    },
  ),
);

/* Keep every open tab/window (e.g. the projector display) in sync. */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) void useStore.persist.rehydrate();
  });
}

export function useAssembly(id: string | undefined): Assembly | undefined {
  return useStore((s) => s.assemblies.find((a) => a.id === id));
}
