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

  // Primaries present per (role, group) — used for alternates.
  const primaryPresent = new Set<string>();
  for (const v of present) {
    const r = roleById.get(v.roleId);
    if (r?.votes && !r.alternateFor) primaryPresent.add(`${r.id}|${groupKey(v)}`);
  }

  // Voting roles first so a person with several roles is counted under a primary role.
  const ordered = [...present].sort((a, b) => {
    const ra = roleById.get(a.roleId);
    const rb = roleById.get(b.roleId);
    return Number(!!ra?.alternateFor) - Number(!!rb?.alternateFor);
  });

  const seen = new Map<string, Voter>();
  for (const v of ordered) {
    const r = roleById.get(v.roleId);
    if (!r) {
      excluded.push({ voter: v, reason: 'Unknown role' });
      continue;
    }
    if (!r.votes) {
      excluded.push({ voter: v, reason: `${r.name} — non-voting` });
      continue;
    }
    if (r.alternateFor && groupKey(v) && primaryPresent.has(`${r.alternateFor}|${groupKey(v)}`)) {
      const pr = roleById.get(r.alternateFor);
      excluded.push({ voter: v, reason: `${pr?.name ?? 'Primary'} for ${v.group || v.district} is present` });
      continue;
    }
    const idKey = v.email ? `e:${normName(v.email)}` : `n:${normName(v.name)}`;
    const nameKey = `n:${normName(v.name)}`;
    const dup = seen.get(idKey) ?? seen.get(nameKey);
    if (dup) {
      excluded.push({ voter: v, reason: `Already voting as ${roleById.get(dup.roleId)?.name ?? 'another role'} (one person, one vote)` });
      continue;
    }
    seen.set(idKey, v);
    seen.set(nameKey, v);
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

/** Parse a voter roll from CSV rows (header row required). Unknown roles map to the first voting role. */
export function rollFromRows(rows: Record<string, string>[], roles: VoterRole[], makeId: () => string): Voter[] {
  const pick = (r: Record<string, string>, ...keys: string[]) => {
    for (const k of Object.keys(r)) {
      const nk = normName(k);
      if (keys.some((x) => nk === x || nk.includes(x))) return (r[k] ?? '').trim();
    }
    return '';
  };
  const byName = new Map(roles.map((r) => [normName(r.name), r]));
  const fallback = roles.find((r) => r.votes && !r.alternateFor) ?? roles[0];
  const out: Voter[] = [];
  for (const r of rows) {
    const name = pick(r, 'name', 'nombre', 'nom');
    if (!name) continue;
    const roleText = normName(pick(r, 'role', 'position', 'service', 'cargo', 'rol'));
    let role = byName.get(roleText);
    if (!role && roleText) role = roles.find((x) => normName(x.name).includes(roleText) || roleText.includes(normName(x.name)));
    const ch = normName(pick(r, 'channel', 'attend', 'mode', 'virtual'));
    const channel: Channel = /virt|zoom|online|remote|en linea|en ligne/.test(ch) ? 'virtual' : 'inPerson';
    const presentText = normName(pick(r, 'present', 'checked', 'attend'));
    out.push({
      id: makeId(),
      name,
      roleId: (role ?? fallback).id,
      group: pick(r, 'group', 'grupo', 'groupe'),
      district: pick(r, 'district', 'distrito'),
      email: pick(r, 'email', 'e mail', 'correo', 'courriel') || undefined,
      channel,
      present: /^(y|yes|x|1|true|present|si|oui)$/.test(presentText),
    });
  }
  return out;
}

