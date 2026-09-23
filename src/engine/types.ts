/**
 * Data model for a Third Legacy election.
 *
 * Everything the chair does is stored as a raw record (ballot counts, withdrawals,
 * motion votes, hat draws). All results — who is elected, who is withdrawn, what
 * happens next — are *derived* from those records by the pure functions in
 * `thirdLegacy.ts`. This keeps the math auditable and makes "undo" trivial.
 */

export type Channel = 'inPerson' | 'virtual';
export const CHANNELS: Channel[] = ['inPerson', 'virtual'];
export const CHANNEL_LABEL: Record<Channel, string> = {
  inPerson: 'In-person',
  virtual: 'Virtual',
};

/** Pseudo-candidate id used for "No" votes on a single-candidate confirmation ballot. */
export const AGAINST = '__against__';

export interface Settings {
  /**
   * Whether blank / spoiled / invalid ballots count toward the "total vote" used for
   * the 2/3, 1/5 and 1/3 calculations. The Service Manual says "total vote" without
   * defining it; most areas count only valid votes cast for eligible candidates.
   */
  countInvalidInTotal: boolean;
  /**
   * After the 4th ballot "the candidate with the smallest total is automatically
   * withdrawn". When several unprotected candidates tie for the smallest total:
   * withdraw all of them, or none of them.
   */
  fourthBallotLowestTie: 'withdrawAllTied' | 'withdrawNone';
  /** What happens when only one candidate stands (or remains after withdrawals). */
  singleCandidate: 'confirmationVote' | 'autoElect';
  /** Offer the "minority opinion / motion to reconsider" step on the fifth-ballot motion. */
  allowMinorityOpinion: boolean;
  /** Prevent a person already elected to one position from standing for another. */
  oneOfficePerPerson: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  countInvalidInTotal: false,
  fourthBallotLowestTie: 'withdrawAllTied',
  singleCandidate: 'confirmationVote',
  allowMinorityOpinion: true,
  oneOfficePerPerson: true,
};

export interface Candidate {
  id: string;
  name: string;
  /** District / area / region shown next to the name on the board (Service Manual, Appendix D). */
  district?: string;
  note?: string;
  /**
   * Voluntary withdrawal: the candidate is off the board starting with this ballot
   * number (e.g. 3 = withdrew after the 2nd ballot's results). null = still standing.
   */
  withdrawnBeforeBallot: number | null;
}

export interface ChannelCounts {
  /** candidateId (or AGAINST) → votes */
  votes: Record<string, number>;
  /** blank, spoiled, illegible, or votes for someone not on the board */
  invalid: number;
}

export interface BallotRecord {
  id: string;
  counts: Record<Channel, ChannelCounts>;
  /** Teller/poll reports that made up these counts (kept so an undo can restore them). */
  tellerReports?: TellerReport[];
  /** Eligible voters present per channel when the ballot was recorded (0 = not tracked). */
  eligibleVoters: Record<Channel, number>;
  /** Ballot papers / poll responses the tellers physically collected, if tracked. */
  collected: Record<Channel, number | null>;
  recordedAt: string;
  note?: string;
}

export interface DraftBallot {
  /** Random key that ties teller-device reports to this particular ballot. */
  key?: string;
  counts: Record<Channel, ChannelCounts>;
  collected: Record<Channel, number | null>;
  note: string;
  /** Click-tally history, so a teller can undo individual taps. */
  tallyLog: { channel: Channel; key: string }[];
  /** Sub-totals added from teller devices or an imported virtual poll. */
  tellerReports?: TellerReport[];
}

export interface TellerReport {
  id: string;
  teller: string;
  channel: Channel;
  source: 'device' | 'poll';
  /** candidateId (or AGAINST) → votes */
  votes: Record<string, number>;
  invalid: number;
  addedAt: string;
  detail?: string;
}

export interface HandCount {
  yes: number;
  no: number;
}

export interface MotionVote {
  id: string;
  /** 'vote' = motion made, seconded and voted; 'noMotion' = no motion or no second. */
  kind: 'vote' | 'noMotion';
  hands: Record<Channel, HandCount>;
  carried: boolean;
  /** True when this vote is a re-vote after a minority opinion and motion to reconsider. */
  reconsideration: boolean;
  minorityOpinionNote?: string;
  recordedAt: string;
}

export interface HatDraw {
  mode: 'digital' | 'physical';
  /** Candidates that went into the hat. */
  poolIds: string[];
  /** Order drawn out of the hat; order[0] is elected. */
  order: string[];
  drawnAt: string;
}

export interface Appointment {
  candidateId: string;
  fromPositionId: string;
  fromPositionTitle: string;
  /** True when the draw created this candidate row (so undoing the draw may remove it again). */
  createdCandidate?: boolean;
}

export interface Position {
  id: string;
  title: string;
  description?: string;
  candidates: Candidate[];
  /** Nominations closed and balloting begun. The candidate list is locked. */
  started: boolean;
  startedAt?: string;
  ballots: BallotRecord[];
  motionVotes: MotionVote[];
  hat: HatDraw | null;
  /**
   * Optional area practice: when this position is decided by lot, the second name out
   * of the hat is elected to another position (commonly delegate → alternate delegate).
   */
  hatSecondToPositionId: string | null;
  /** Set when this position was filled by the second draw from another position's hat. */
  appointment: Appointment | null;
  draft: DraftBallot | null;
}

export interface LogEntry {
  at: string;
  positionId?: string;
  action: string;
  detail?: string;
}

export type ElectionType = 'area' | 'district' | 'areaTrusteeCandidate' | 'regionalTrustee' | 'trusteeAtLarge' | 'intergroup' | 'custom';

export type Language = 'en' | 'es' | 'fr';

export interface VoterRole {
  id: string;
  name: string;
  /** Has a vote when present. */
  votes: boolean;
  /**
   * Alternate role: votes only when no one holding this other role is present for the
   * same group/district (e.g. alternate GSR votes only if the group's GSR is absent).
   */
  alternateFor?: string;
  /** For the regional trustee balance check. */
  bloc?: 'delegate' | 'conferenceTrustees' | 'trusteesNominating';
}

export interface Voter {
  id: string;
  name: string;
  roleId: string;
  /** Registration options this member is signed up for (see Assembly.attendanceOptions). */
  attending?: string[];
  /** Values for the assembly's own extra fields (see Assembly.voterFields). */
  custom?: Record<string, string>;
  /** Group, district or area the voter represents — used to pair alternates with primaries. */
  group: string;
  district: string;
  channel: Channel;
  present: boolean;
  checkedInAt?: string;
  email?: string;
}

export interface Officials {
  secretary: string;
  tellers: string;
  collectors: string;
  recorder: string;
  virtualTeller: string;
  registrar: string;
  techHost: string;
}

export type LiveStatus = 'idle' | 'voting' | 'counting' | 'drawing';

export interface LiveTimer {
  label: string;
  durationSec: number;
  /** Epoch ms when a running timer ends; null when paused / stopped. */
  endsAt: number | null;
  /** Seconds left while paused. */
  remainingSec: number;
}

export interface Live {
  status: LiveStatus;
  since: string;
  timer: LiveTimer | null;
  /** Free-text message shown large on the projector (e.g. "Break — back at 2:15"). */
  message: string;
  /** What the projector is showing. */
  screen?: 'election' | 'agenda' | 'motion' | 'conference';
  agendaItemId?: string | null;
  motionId?: string | null;
  conferenceItemId?: string | null;
  /** Manual zoom on top of the automatic fit (1 = as calculated). */
  zoom?: number;
  /** High-contrast projector theme for washed-out screens. */
  highContrast?: boolean;
}


/* ------------------------------------------------------------------ */
/* Assembly business: motions, Conference agenda items, agenda          */
/* ------------------------------------------------------------------ */

/** Motion types from The A.A. Service Manual, Appendix W. */
export type MotionKind = 'main' | 'committee' | 'amend' | 'table' | 'recommit' | 'callQuestion' | 'reconsider' | 'floor' | 'decline';

export type VoteThreshold = 'twoThirds' | 'simpleMajority' | 'threeQuarters';

export type VoteMethod = 'hands' | 'ballot' | 'poll' | 'voice';

export interface MotionVoteCount {
  yes: number;
  no: number;
  abstain: number;
}

export interface MotionSettings {
  /** Default for a new main motion. Matters of policy take substantial unanimity. */
  defaultThreshold: VoteThreshold;
  /** Whether abstentions count toward the total the threshold is measured against. */
  countAbstentions: boolean;
  /** Quorum needed to do business (the Conference uses two-thirds of registered members). */
  quorum: { kind: 'none' | 'fraction' | 'count'; fraction?: number; count?: number };
  /** Seconds each person may speak (the Conference allows two minutes). */
  speakerSeconds: number;
}

export const DEFAULT_MOTION_SETTINGS: MotionSettings = {
  defaultThreshold: 'twoThirds',
  countAbstentions: false,
  quorum: { kind: 'none' },
  speakerSeconds: 120,
};

/** One recorded vote: the main question, an amendment, or a procedural motion. */
export interface MotionRound {
  id: string;
  kind: MotionKind;
  /** What was voted on, in words (the amendment's text, for instance). */
  label: string;
  text?: string;
  movedBy: string;
  secondedBy: string;
  threshold: VoteThreshold;
  method: VoteMethod;
  counts: Record<Channel, MotionVoteCount>;
  carried: boolean;
  quorumMet: boolean;
  /** Voting members present when the vote was taken. */
  eligible: number;
  at: string;
  note?: string;
  /** The side that did not prevail is invited to speak (Appendix W). */
  minority?: { heard: boolean; side: 'for' | 'against'; notes: string };
}

export interface Motion {
  id: string;
  number: number;
  kind: MotionKind;
  title: string;
  text: string;
  background: string;
  movedBy: string;
  secondedBy: string;
  committee?: string;
  threshold: VoteThreshold;
  status: 'open' | 'carried' | 'defeated' | 'tabled' | 'withdrawn' | 'recommitted';
  /** Amendments and procedural votes, in the order they happened, then the main vote(s). */
  rounds: MotionRound[];
  /** Speakers heard for and against, so the chair can balance debate. */
  speakers: { for: number; against: number };
  notes: string;
  /** An action may not be reconsidered twice (Appendix W). */
  reconsidered: boolean;
  createdAt: string;
  decidedAt?: string;
}

export interface ConferenceOption {
  id: string;
  label: string;
}

export interface ConferenceRound {
  id: string;
  /** optionId → votes, per channel. */
  counts: Record<Channel, Record<string, number>>;
  abstain: Record<Channel, number>;
  method: VoteMethod;
  at: string;
  note?: string;
}

/** An item on the General Service Conference agenda, brought to the area for its sense. */
export interface ConferenceItem {
  id: string;
  committee: string;
  /** e.g. "Literature — Item 3". */
  reference: string;
  title: string;
  /** Background material summary, and links to it. */
  background: string;
  links: { id: string; label: string; url: string }[];
  options: ConferenceOption[];
  rounds: ConferenceRound[];
  /** Notes taken while the assembly discusses the item. */
  notes: string;
  /** What the delegate will carry to the Conference. */
  delegateNote: string;
  presenter?: string;
  status: 'toDiscuss' | 'discussed' | 'polled';
  createdAt: string;
}

export interface ConferenceSettings {
  /** Which Conference this is for, e.g. "76th (2026)". */
  session: string;
  defaultOptions: ConferenceOption[];
  /** Shown on every item: the area's sense guides the delegate, who votes their conscience. */
  guidanceNote: string;
}

export const DEFAULT_CONFERENCE_OPTIONS: ConferenceOption[] = [
  { id: 'support', label: 'Support as written' },
  { id: 'supportWithChanges', label: 'Support with changes' },
  { id: 'oppose', label: 'Do not support' },
  { id: 'noAction', label: 'No action / more information needed' },
];

export type AgendaKind = 'segment' | 'report' | 'break' | 'meal' | 'election' | 'motion' | 'conference' | 'workshop';

export interface AgendaItem {
  id: string;
  title: string;
  kind: AgendaKind;
  plannedMinutes: number;
  presenter: string;
  notes: string;
  /** Position, motion or Conference item this segment runs. */
  linkId?: string;
  startedAt?: string | null;
  endedAt?: string | null;
}

/* ------------------------------------------------------------------ */
/* Name badges / voting cards                                          */
/* ------------------------------------------------------------------ */

export interface BadgeLink {
  id: string;
  label: string;
  url: string;
  /** Print it as a QR code as well as text. */
  qr: boolean;
}

export interface BadgeDesign {
  perPage: 4 | 6 | 8;
  doubleSided: boolean;
  /** How the printer turns the paper, so the backs line up with the fronts. */
  duplexFlip: 'long' | 'short';
  title: string;
  subtitle: string;
  accent: string;
  logoDataUrl?: string;
  front: {
    showRole: boolean;
    showGroup: boolean;
    showDistrict: boolean;
    showChannel: boolean;
    showAttendance: boolean;
    showCheckinQr: boolean;
    showBand: boolean;
    showCustomFields: boolean;
    extraText: string;
  };
  back: {
    heading: string;
    text: string;
    links: BadgeLink[];
    showAgenda: boolean;
    showQrCaptions: boolean;
  };
}

export const DEFAULT_BADGE_DESIGN: BadgeDesign = {
  perPage: 8,
  doubleSided: false,
  duplexFlip: 'long',
  title: '',
  subtitle: '',
  accent: '#1d4ed8',
  front: {
    showRole: true,
    showGroup: true,
    showDistrict: true,
    showChannel: true,
    showAttendance: true,
    showCheckinQr: true,
    showBand: true,
    showCustomFields: false,
    extraText: '',
  },
  back: {
    heading: 'Useful links',
    text: '',
    links: [],
    showAgenda: false,
    showQrCaptions: true,
  },
};

/** Registration options a member can be signed up for (assembly, convention, banquet…). */
export interface AttendanceOption {
  id: string;
  label: string;
  /** Printed on the badge when the member is signed up. */
  showOnBadge: boolean;
}

export interface VoterField {
  id: string;
  label: string;
  showOnBadge: boolean;
}

export interface Assembly {
  id: string;
  name: string;
  electionType: ElectionType;
  date: string;
  location: string;
  chair: string;
  notes: string;
  /** Eligible (registered/credentialed) voters currently present, per channel (manual counts). */
  voters: Record<Channel, number>;
  /** When true, eligible counts come from the checked-in voter roll instead of `voters`. */
  useRollForCounts: boolean;
  roles: VoterRole[];
  voterRoll: Voter[];
  officials: Officials;
  /** Appendix D step 5: the chair reviews the procedure and order of election and asks approval. */
  approvals: { procedure: string | null; order: string | null; whoVotes: string | null };
  settings: Settings;
  positions: Position[];
  /** Motions and other business put to the assembly. */
  motions: Motion[];
  motionSettings: MotionSettings;
  /** General Service Conference agenda items brought to the assembly for its sense. */
  conferenceItems: ConferenceItem[];
  conferenceSettings: ConferenceSettings;
  /** The running order for the day. */
  agenda: AgendaItem[];
  /** Clock time the assembly is planned to start, e.g. "09:00". */
  agendaStart: string;
  badge: BadgeDesign;
  attendanceOptions: AttendanceOption[];
  voterFields: VoterField[];
  livePositionId: string | null;
  live: Live;
  /** Show the in-person / virtual split on the projector display. */
  displayBreakdown: boolean;
  /** Language for the chair's announcements and the projector display. */
  language: Language;
  /** Colour-coded paper ballots, one per round (Appendix D step 9). */
  ballotColors: string[];
  log: LogEntry[];
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/* Derived results                                                     */
/* ------------------------------------------------------------------ */

export interface VoteSplit {
  inPerson: number;
  virtual: number;
  total: number;
}

export type WithdrawalRule = 'oneFifth' | 'oneThird' | 'lowest';

export interface BallotResult {
  number: number;
  /** Candidates on the board for this ballot. */
  activeIds: string[];
  /** Candidates who voluntarily withdrew since the previous ballot. */
  voluntaryWithdrawnIds: string[];
  /** Single-candidate yes/no confirmation ballot. */
  isConfirmation: boolean;
  votes: Record<string, VoteSplit>;
  valid: VoteSplit;
  invalid: VoteSplit;
  /** Ballots cast = valid + invalid. */
  cast: VoteSplit;
  /** The "total vote" all fractions are computed against. */
  totalVote: number;
  /** Minimum votes needed for two-thirds. */
  electThreshold: number;
  electedId: string | null;
  /** Automatic-withdrawal rule applied after this ballot (if any). */
  withdrawalRule: WithdrawalRule | null;
  /** Exact fractional limit for 1/5 or 1/3 rules (candidates strictly below are withdrawn). */
  withdrawalLimit: number | null;
  protectedIds: string[];
  autoWithdrawnIds: string[];
  /** Candidate ids sorted by votes, highest first. */
  ranking: string[];
  overVote: Channel[];
  collectedMismatch: Channel[];
  eligibleVoters: Record<Channel, number>;
}

export type ElectionMethod =
  | 'ballot' // reached two-thirds
  | 'confirmation' // single candidate reached two-thirds "yes"
  | 'unopposed' // single candidate, auto-elected by setting
  | 'hat' // chosen by lot
  | 'hatSecondDraw'; // second name out of another position's hat

export type Phase =
  | { kind: 'setup' }
  | { kind: 'ballot'; number: number; activeIds: string[]; isConfirmation: boolean }
  | { kind: 'motion'; activeIds: string[] }
  | { kind: 'hat'; poolIds: string[]; reason: 'motionDefeated' | 'fifthBallot' }
  | { kind: 'elected'; candidateId: string; method: ElectionMethod; ballotNumber: number | null }
  | { kind: 'notElected'; reason: string }
  | { kind: 'noCandidates' };

export type CandidateStatus =
  | { kind: 'standing' }
  | { kind: 'elected' }
  | { kind: 'withdrawn'; voluntary: boolean; afterBallot: number; rule: WithdrawalRule | null }
  | { kind: 'notElected' };

export interface PositionState {
  phase: Phase;
  ballots: BallotResult[];
  status: Record<string, CandidateStatus>;
  /** Ballots recorded after the election was already decided (data problem to show). */
  ignoredBallots: number;
}
