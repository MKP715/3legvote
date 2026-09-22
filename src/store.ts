import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { nanoid } from 'nanoid';
import {
  AGAINST,
  CHANNELS,
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
  type TellerReport,
  type Voter,
  type VoterRole,
} from './engine/types';
import { computePosition, ordinal } from './engine/thirdLegacy';
import { computeEligibility } from './engine/voters';
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
      };
    }),
    {
      name: STORAGE_KEY,
      version: 2,
      storage: createJSONStorage(() => persistentStorage ?? localStorage),
      migrate: (persisted) => {
        // One unreadable record must never wipe the rest of someone's elections.
        const s = persisted as { assemblies?: unknown[] };
        const out: Assembly[] = [];
        for (const a of s?.assemblies ?? []) {
          try {
            out.push(normalizeAssembly(a));
          } catch {
            const name = (a as { name?: string })?.name;
            onStorageError?.(`One saved election (${name ?? 'unnamed'}) could not be read and was skipped.`);
          }
        }
        return { assemblies: out } as unknown as Store;
      },
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
