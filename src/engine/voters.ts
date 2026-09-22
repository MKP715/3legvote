/**
 * Voter roll & eligibility.
 *
 * - Only members present and holding a voting role may vote (no proxies or absentee ballots).
 * - One person, one vote — someone listed under two roles (e.g. a DCM who is also a GSR)
 *   still has a single vote.
 * - An alternate (e.g. alternate GSR) votes only when the primary for the same
 *   group / district is not present.
 * - Regional trustee nominating session (Service Manual, "Selecting Nominees"): voting members
 *   are the delegates from the region plus an EQUAL number of voters — one-half from the
 *   Conference Committee on Trustees and one-half from the trustees' Nominating Committee.
 */
import type { Channel, Voter, VoterRole } from './types';
import { ROLE_ALIASES } from '../presets';

export interface Exclusion {
  voter: Voter;
  reason: string;
}

export interface Eligibility {
  eligible: Voter[];
  byChannel: Record<Channel, number>;
  total: number;
  excluded: Exclusion[];
  present: number;
}

/** Key used to decide whether two rows are the same person (ignores punctuation and case). */
export function personKey(s: string): string {
  return normName(s).replace(/\./g, '').replace(/\s+/g, ' ').trim();
}

export function normName(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '') // strip accents after NFKD decomposition
    .toLowerCase()
    .replace(/[^a-z0-9@.]+/g, ' ')
    .trim();
}

function groupKey(v: Voter): string {
  return normName(v.group || v.district || '');
}

export function computeEligibility(roll: Voter[], roles: VoterRole[]): Eligibility {
  const roleById = new Map(roles.map((r) => [r.id, r]));
  const present = roll.filter((v) => v.present);
  const excluded: Exclusion[] = [];
  const eligible: Voter[] = [];

  // Voting roles first, so someone holding a primary and an alternate role keeps the primary one.
  const ordered = [...present].sort((a, b) => {
    const ra = roleById.get(a.roleId);
    const rb = roleById.get(b.roleId);
    return Number(!!ra?.alternateFor) - Number(!!rb?.alternateFor);
  });

  // Pass 1: everyone with a voting primary role, one vote per person.
  // An email address identifies a person; without one, the name does. Two different people
  // with the same name and no email cannot be told apart, so the second is held back and the
  // registrar is told how to fix it.
  const seen = new Map<string, Voter>();
  const identity = (v: Voter) => (v.email ? `e:${personKey(v.email)}` : `n:${personKey(v.name)}`);
  const alternates: Voter[] = [];
  for (const v of ordered) {
    const r = roleById.get(v.roleId);
    if (!r) {
      excluded.push({ voter: v, reason: 'Unknown role — set one in the table' });
      continue;
    }
    if (!r.votes) {
      excluded.push({ voter: v, reason: `${r.name} — non-voting` });
      continue;
    }
    const dup = seen.get(identity(v));
    if (dup) {
      const sameName = personKey(dup.name) === personKey(v.name);
      excluded.push({
        voter: v,
        reason: sameName
          ? `Already voting as ${roleById.get(dup.roleId)?.name ?? 'another role'} (one person, one vote). If this is a different member with the same name, add an email address to tell them apart.`
          : 'Already voting under another entry (one person, one vote)',
      });
      continue;
    }
    if (r.alternateFor) {
      alternates.push(v);
      continue;
    }
    seen.set(identity(v), v);
    eligible.push(v);
  }

  // Pass 2: alternates vote only when the primary for their group is not already voting.
  const primaryVoting = new Set<string>();
  for (const v of eligible) {
    const r = roleById.get(v.roleId);
    if (r && !r.alternateFor) primaryVoting.add(`${r.id}|${groupKey(v)}`);
  }
  for (const v of alternates) {
    const r = roleById.get(v.roleId)!;
    const key = groupKey(v);
    const primaryName = roleById.get(r.alternateFor!)?.name ?? 'the primary';
    if (!key) {
      excluded.push({ voter: v, reason: `No group or district listed, so this alternate cannot be paired with ${primaryName} — fill in the group` });
      continue;
    }
    if (primaryVoting.has(`${r.alternateFor}|${key}`)) {
      excluded.push({ voter: v, reason: `${primaryName} for ${v.group || v.district} is present` });
      continue;
    }
    const dup = seen.get(identity(v));
    if (dup) {
      excluded.push({ voter: v, reason: 'Already voting under another entry (one person, one vote)' });
      continue;
    }
    seen.set(identity(v), v);
    primaryVoting.add(`${r.alternateFor}|${key}`);
    eligible.push(v);
  }

  const byChannel = { inPerson: 0, virtual: 0 } as Record<Channel, number>;
  for (const v of eligible) byChannel[v.channel]++;
  return { eligible, byChannel, total: eligible.length, excluded, present: present.length };
}

export interface TrusteeBalance {
  delegates: number;
  conferenceTrustees: number;
  trusteesNominating: number;
  ok: boolean;
  message: string;
}

/** Regional trustee nominating session: delegates = CCT + TNC voters, split half and half. */
export function regionalTrusteeBalance(eligible: Voter[], roles: VoterRole[]): TrusteeBalance {
  const roleById = new Map(roles.map((r) => [r.id, r]));
  let delegates = 0;
  let conferenceTrustees = 0;
  let trusteesNominating = 0;
  for (const v of eligible) {
    const bloc = roleById.get(v.roleId)?.bloc;
    if (bloc === 'delegate') delegates++;
    else if (bloc === 'conferenceTrustees') conferenceTrustees++;
    else if (bloc === 'trusteesNominating') trusteesNominating++;
  }
  const others = conferenceTrustees + trusteesNominating;
  const halves = Math.abs(conferenceTrustees - trusteesNominating) <= (delegates % 2);
  const ok = delegates > 0 && others === delegates && halves;
  let message: string;
  if (ok) message = `Balanced: ${delegates} region delegates and ${others} other voters (${conferenceTrustees} Conference Committee on Trustees + ${trusteesNominating} trustees’ Nominating Committee).`;
  else if (delegates === 0) message = 'No region delegates are checked in yet.';
  else
    message = `Needs ${delegates} non-delegate voters split half and half (about ${Math.floor(delegates / 2)}–${Math.ceil(delegates / 2)} each); currently ${conferenceTrustees} Conference Committee on Trustees + ${trusteesNominating} trustees’ Nominating Committee.`;
  return { delegates, conferenceTrustees, trusteesNominating, ok, message };
}

export interface RollImport {
  voters: Voter[];
  /** Role names in the file that could not be matched (those rows got the fallback role). */
  unmatchedRoles: string[];
  /** Rows skipped because they had no name. */
  skipped: number;
  /** Names that appear more than once in the file. */
  duplicateNames: string[];
  fallbackRole: string;
  usedColumns: string[];
}

const COLUMN_KEYS = {
  name: ['name', 'nombre', 'nom', 'member', 'full name'],
  role: ['role', 'position', 'service', 'cargo', 'rol', 'title', 'fonction'],
  group: ['group', 'grupo', 'groupe', 'home group'],
  district: ['district', 'distrito'],
  email: ['email', 'e mail', 'correo', 'courriel'],
  channel: ['channel', 'attending', 'mode', 'location', 'virtual', 'in person', 'asistencia'],
  present: ['present', 'checked in', 'check in', 'here', 'attendance', 'presente'],
} as const;

/**
 * Parse a voter roll from CSV rows (a header row is required). Column names are matched
 * loosely, and service titles are matched through ROLE_ALIASES, so a registrar's export
 * usually imports without editing. Anything not understood is reported, not silently guessed.
 */
export function rollFromRows(rows: Record<string, string>[], roles: VoterRole[], makeId: () => string): RollImport {
  const usedColumns = new Set<string>();
  const pick = (r: Record<string, string>, keys: readonly string[]) => {
    for (const k of Object.keys(r)) {
      const nk = normName(k);
      if (keys.some((x) => nk === x)) {
        usedColumns.add(k);
        return (r[k] ?? '').trim();
      }
    }
    for (const k of Object.keys(r)) {
      const nk = normName(k);
      if (keys.some((x) => nk.includes(x))) {
        usedColumns.add(k);
        return (r[k] ?? '').trim();
      }
    }
    return '';
  };

  const byName = new Map(roles.map((r) => [normName(r.name), r]));
  const byId = new Map(roles.map((r) => [r.id, r]));
  const fallback = roles.find((r) => r.votes && !r.alternateFor) ?? roles[0];
  const out: Voter[] = [];
  const unmatched = new Set<string>();
  const seen = new Set<string>();
  const dups = new Set<string>();
  let skipped = 0;

  for (const r of rows) {
    const name = pick(r, COLUMN_KEYS.name);
    if (!name) {
      skipped++;
      continue;
    }
    const rawRole = pick(r, COLUMN_KEYS.role);
    const roleText = normName(rawRole);
    let role = byName.get(roleText);
    if (!role && roleText) {
      // exact-ish name match, then the alias table, then a loose contains match
      role = roles.find((x) => normName(x.name).startsWith(roleText) || roleText.startsWith(normName(x.name)));
      if (!role) {
        const alias = ROLE_ALIASES.find((a) => a.match.test(roleText));
        if (alias) role = byId.get(alias.role);
      }
      if (!role) role = roles.find((x) => normName(x.name).includes(roleText) || roleText.includes(normName(x.name)));
      if (!role) unmatched.add(rawRole);
    }
    const key = normName(name);
    if (seen.has(key)) dups.add(name);
    seen.add(key);

    const ch = normName(pick(r, COLUMN_KEYS.channel));
    const presentText = normName(pick(r, COLUMN_KEYS.present));
    out.push({
      id: makeId(),
      name,
      roleId: (role ?? fallback).id,
      group: pick(r, COLUMN_KEYS.group),
      district: pick(r, COLUMN_KEYS.district),
      email: pick(r, COLUMN_KEYS.email) || undefined,
      channel: /virt|zoom|online|remote|en linea|en ligne|hybrid/.test(ch) ? 'virtual' : 'inPerson',
      present: /^(y|yes|x|1|true|present|si|sí|oui|here)$/.test(presentText),
    });
  }
  return {
    voters: out,
    unmatchedRoles: [...unmatched],
    skipped,
    duplicateNames: [...dups],
    fallbackRole: fallback?.name ?? '',
    usedColumns: [...usedColumns],
  };
}

