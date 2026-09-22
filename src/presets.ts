/**
 * Election-type presets, drawn from The A.A. Service Manual (2024–2026):
 *  - Area election assembly (Appendix D): delegate first, then alternate delegate, then officers.
 *  - Regional trustee nominating session at the Conference: delegates from the region plus an
 *    equal number of voters, half from the Conference Committee on Trustees and half from the
 *    trustees' Nominating Committee.
 *  - Trustee-at-large: regional caucus reduces the list (one per U.S. region, two per Canadian
 *    region) by Third Legacy; then all delegates from that country plus the trustees'
 *    Nominating Committee vote.
 * Roles and voting rights vary by area — everything here is editable.
 */
import type { ElectionType, VoterRole } from './engine/types';

export interface Preset {
  label: string;
  description: string;
  positions: string[];
  optionalPositions: string[];
  roles: VoterRole[];
  whoVotes: string;
}

const r = (id: string, name: string, votes: boolean, extra: Partial<VoterRole> = {}): VoterRole => ({ id, name, votes, ...extra });

export const PRESETS: Record<ElectionType, Preset> = {
  area: {
    label: 'Area election assembly',
    description: 'Elect the delegate, alternate delegate and area officers (Service Manual Appendix D).',
    positions: ['Delegate', 'Alternate Delegate', 'Area Chair', 'Alternate Chair', 'Secretary', 'Treasurer'],
    optionalPositions: ['Registrar', 'Alternate Secretary', 'Alternate Treasurer', 'Archivist'],
    roles: [
      r('gsr', 'GSR', true),
      r('altgsr', 'Alternate GSR', true, { alternateFor: 'gsr' }),
      r('dcm', 'DCM', true),
      r('altdcm', 'Alternate DCM', true, { alternateFor: 'dcm' }),
      r('officer', 'Area officer (chair, secretary, treasurer, registrar…)', true),
      r('altofficer', 'Alternate area officer', true, { alternateFor: 'officer' }),
      r('chair', 'Standing committee chair / coordinator', true),
      r('pastdel', 'Past delegate', false),
      r('visitor', 'Visitor / non-voting', false),
    ],
    whoVotes: 'GSRs, DCMs and area committee members — including area officers — per the area’s guidelines. Alternates vote only when the person they stand in for is absent.',
  },
  district: {
    label: 'District election',
    description: 'GSRs elect the DCM, alternate DCM and district officers.',
    positions: ['DCM', 'Alternate DCM'],
    optionalPositions: ['District Secretary', 'District Treasurer', 'District Registrar'],
    roles: [
      r('gsr', 'GSR', true),
      r('altgsr', 'Alternate GSR', true, { alternateFor: 'gsr' }),
      r('officer', 'District officer (secretary, treasurer…)', true),
      r('chair', 'District committee chair', true),
      r('dcm', 'Outgoing DCM', false),
      r('visitor', 'Visitor / non-voting', false),
    ],
    whoVotes: 'GSRs of the district’s groups, and district officers where the district’s guidelines give them a vote (alternate GSRs vote when their GSR is absent).',
  },
  areaTrusteeCandidate: {
    label: 'Area selection of a trustee candidate',
    description: 'The area assembly selects one candidate to submit for regional trustee or trustee-at-large.',
    positions: ['Regional Trustee Candidate'],
    optionalPositions: ['Trustee-at-Large Candidate'],
    roles: [
      r('gsr', 'GSR', true),
      r('altgsr', 'Alternate GSR', true, { alternateFor: 'gsr' }),
      r('dcm', 'DCM', true),
      r('altdcm', 'Alternate DCM', true, { alternateFor: 'dcm' }),
      r('officer', 'Area officer', true),
      r('chair', 'Standing committee chair / coordinator', true),
      r('pastdel', 'Past delegate', false),
      r('visitor', 'Visitor / non-voting', false),
    ],
    whoVotes: 'Voting members of the area assembly (GSRs, DCMs and area committee members, including officers).',
  },
  regionalTrustee: {
    label: 'Regional trustee nominating session (Conference)',
    description: 'Delegates from the region plus an equal number of voters: half Conference Committee on Trustees, half trustees’ Nominating Committee.',
    positions: ['Regional Trustee Nominee'],
    optionalPositions: [],
    roles: [
      r('regdel', 'Delegate from the region', true, { bloc: 'delegate' }),
      r('cct', 'Conference Committee on Trustees', true, { bloc: 'conferenceTrustees' }),
      r('tnc', 'Trustees’ Nominating Committee', true, { bloc: 'trusteesNominating' }),
      r('observer', 'Observer / non-voting', false),
    ],
    whoVotes:
      'Delegates from the region, plus an equal number of voters — one-half from the Conference Committee on Trustees and one-half from the trustees’ Nominating Committee.',
  },
  trusteeAtLarge: {
    label: 'Trustee-at-large nomination (Conference)',
    description: 'Regional caucuses reduce the list, then all delegates from the country and the trustees’ Nominating Committee vote.',
    positions: ['Trustee-at-Large Nominee'],
    optionalPositions: ['Regional caucus — candidate 1', 'Regional caucus — candidate 2 (Canada)'],
    roles: [
      r('del', 'Delegate (U.S. or Canada, as applicable)', true),
      r('tnc', 'Trustees’ Nominating Committee', true),
      r('observer', 'Observer / non-voting', false),
    ],
    whoVotes: 'All delegates from the nominating country (U.S. or Canada) and all members of the trustees’ Nominating Committee.',
  },
  intergroup: {
    label: 'Intergroup / central office',
    description: 'Intergroup representatives elect the steering committee.',
    positions: ['Chair', 'Vice-Chair', 'Secretary', 'Treasurer'],
    optionalPositions: ['Alternate Treasurer'],
    roles: [
      r('igr', 'Intergroup representative', true),
      r('altigr', 'Alternate representative', true, { alternateFor: 'igr' }),
      r('officer', 'Intergroup officer', true),
      r('steer', 'Steering committee member', true),
      r('visitor', 'Visitor / non-voting', false),
    ],
    whoVotes: 'Intergroup representatives and steering committee members (alternates vote when their representative is absent).',
  },
  custom: {
    label: 'Other / custom',
    description: 'Any service body using the Third Legacy Procedure.',
    positions: [],
    optionalPositions: ['Chair', 'Secretary', 'Treasurer'],
    roles: [r('member', 'Voting member', true), r('officer', 'Officer', true), r('alt', 'Alternate', true, { alternateFor: 'member' }), r('nonvoting', 'Non-voting', false)],
    whoVotes: 'Voting members as defined by the body’s guidelines.',
  },
};

/**
 * Common service titles → role id, so an imported roll with "Area Chair", "Alt. GSR",
 * "Treasurer" or "DCM" lands on the right role instead of a silent default.
 */
export const ROLE_ALIASES: { match: RegExp; role: string }[] = [
  { match: /^(alt|alternate|alt\.)\s*(gsr|g\.s\.r|general service rep)/, role: 'altgsr' },
  { match: /^(gsr|g\.s\.r|general service rep)/, role: 'gsr' },
  { match: /^(alt|alternate|alt\.)\s*(dcm|d\.c\.m|district committee)/, role: 'altdcm' },
  { match: /^(dcm|d\.c\.m|district committee member)/, role: 'dcm' },
  { match: /^(alt|alternate|alt\.)\s*(officer|chair|secretary|treasurer|registrar)/, role: 'altofficer' },
  // Standing-committee chairs before the generic "chair" so they don't land on "officer".
  { match: /(committee chair|coordinator|standing committee|chair of)/, role: 'chair' },
  { match: /(^|\s)(officer|chairperson|chair|secretary|treasurer|registrar|archivist)(\s|$)/, role: 'officer' },
  { match: /(past delegate|ex delegate)/, role: 'pastdel' },
  { match: /(alt|alternate)\s*(rep|representative|igr)/, role: 'altigr' },
  { match: /(intergroup|central office)\s*(rep|representative)|^igr/, role: 'igr' },
  { match: /(steering)/, role: 'steer' },
  { match: /(conference committee on trustees)/, role: 'cct' },
  { match: /(nominating committee)/, role: 'tnc' },
  { match: /(delegate)/, role: 'regdel' },
  { match: /(visitor|observer|guest|non voting|nonvoting)/, role: 'visitor' },
];

export const DEFAULT_BALLOT_COLORS = ['White', 'Yellow', 'Blue', 'Pink', 'Green', 'Orange', 'Purple', 'Grey'];

export const COLOR_SWATCH: Record<string, string> = {
  white: '#ffffff',
  yellow: '#fde047',
  blue: '#93c5fd',
  pink: '#f9a8d4',
  green: '#86efac',
  orange: '#fdba74',
  purple: '#c4b5fd',
  grey: '#d1d5db',
  gray: '#d1d5db',
  red: '#fca5a5',
  buff: '#f5deb3',
  goldenrod: '#fcd34d',
  salmon: '#fca5a5',
  lavender: '#ddd6fe',
  ivory: '#fffff0',
  canary: '#fef08a',
};

export function ballotColor(colors: string[], n: number): { name: string; swatch: string } | null {
  const name = colors[(n - 1) % Math.max(colors.length, 1)];
  if (!name) return null;
  return { name, swatch: COLOR_SWATCH[name.trim().toLowerCase()] ?? '#e5e7eb' };
}
