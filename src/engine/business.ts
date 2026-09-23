/**
 * Assembly business: motions, substantial unanimity, and Conference agenda items.
 *
 * The rules follow The A.A. Service Manual (2024–2026), Appendix W, "How the Conference
 * Operates", which areas and districts commonly adapt:
 *
 *  - "All matters of policy … require substantial unanimity, that is, a two-thirds majority …
 *    taken to mean two-thirds vote of the … members voting, as long as the total vote
 *    constitutes a quorum."
 *  - "Simple majority is typically defined as one-half of votes cast plus one." (FAQ, Chapter 3)
 *  - "After each vote on a matter of policy, the side that did not prevail will always be given
 *    an opportunity to speak to their position."
 *  - "A motion to reconsider a vote may be made only by a member who voted with the prevailing
 *    side … No action may be reconsidered twice."
 *
 * Everything here is pure: the UI records counts, these functions decide the outcome.
 */
import type { Channel, MotionKind, MotionSettings, MotionVoteCount, VoteThreshold } from './types';
import { CHANNELS } from './types';

export interface MotionRule {
  label: string;
  /** "required" = someone must second it; "automatic" = a committee recommendation arrives seconded. */
  second: 'required' | 'automatic';
  debatable: boolean;
  threshold: VoteThreshold;
  /** Whether the side that did not prevail is invited to speak after the vote. */
  minorityHeard: boolean;
  madeWithoutComment: boolean;
  note: string;
}

/** Appendix W, "Summary of Conference Procedures". */
export const MOTION_RULES: Record<MotionKind, MotionRule> = {
  main: {
    label: 'Main motion',
    second: 'required',
    debatable: true,
    threshold: 'twoThirds',
    minorityHeard: true,
    madeWithoutComment: false,
    note: 'A matter of policy needs substantial unanimity — a two-thirds majority. Routine matters may be set to a simple majority.',
  },
  committee: {
    label: 'Committee recommendation',
    second: 'automatic',
    debatable: true,
    threshold: 'twoThirds',
    minorityHeard: true,
    madeWithoutComment: false,
    note: 'Presented in the committee’s report and automatically seconded. Members are asked not to amend the committee’s work on the spot.',
  },
  amend: {
    label: 'Amend a motion',
    second: 'required',
    debatable: true,
    threshold: 'twoThirds',
    minorityHeard: true,
    madeWithoutComment: false,
    note: 'Once on the floor the motion belongs to the whole body, not the committee that brought it. There are no “friendly” amendments.',
  },
  table: {
    label: 'Table the motion',
    second: 'required',
    debatable: false,
    threshold: 'simpleMajority',
    minorityHeard: false,
    madeWithoutComment: true,
    note: 'Postpones discussion to a later time in the same assembly.',
  },
  recommit: {
    label: 'Recommit (send back to committee)',
    second: 'required',
    debatable: true,
    threshold: 'twoThirds',
    minorityHeard: false,
    madeWithoutComment: true,
    note: 'Returns the motion to the committee for further consideration.',
  },
  callQuestion: {
    label: 'Call the question',
    second: 'required',
    debatable: false,
    threshold: 'twoThirds',
    minorityHeard: false,
    madeWithoutComment: true,
    note: 'Stops debate so the body can decide whether to vote now.',
  },
  reconsider: {
    label: 'Reconsider a vote',
    second: 'required',
    debatable: false,
    threshold: 'simpleMajority',
    minorityHeard: false,
    madeWithoutComment: true,
    note: 'May be moved only by someone who voted with the prevailing side; anyone may second. No action may be reconsidered twice.',
  },
  floor: {
    label: 'Floor action',
    second: 'required',
    debatable: true,
    threshold: 'twoThirds',
    minorityHeard: true,
    madeWithoutComment: true,
    note: 'Submitted in writing; the maker is given two minutes to state the rationale. Business that belongs to a committee should go there first.',
  },
  decline: {
    label: 'Decline to consider a floor action',
    second: 'required',
    debatable: false,
    threshold: 'twoThirds',
    minorityHeard: false,
    madeWithoutComment: true,
    note: 'Made without comment, after the maker has stated their rationale.',
  },
};

export const THRESHOLD_LABEL: Record<VoteThreshold, string> = {
  twoThirds: 'Two-thirds (substantial unanimity)',
  simpleMajority: 'Simple majority',
  threeQuarters: 'Three-quarters',
};

export interface MotionTally {
  yes: number;
  no: number;
  abstain: number;
  /** Votes that count toward the threshold. */
  votesCast: number;
  /** Everyone who voted at all, including abstentions — the "total vote" for quorum. */
  totalVote: number;
  byChannel: Record<Channel, MotionVoteCount>;
  /** Smallest number of "yes" votes that meets the threshold. */
  needed: number;
  thresholdMet: boolean;
  quorumRequired: number;
  quorumMet: boolean;
  carried: boolean;
  /** The side that did not prevail, which is invited to speak. */
  minoritySide: 'for' | 'against';
  yesPct: number;
}

const int = (n: unknown) => (Number.isFinite(Number(n)) && Number(n) > 0 ? Math.floor(Number(n)) : 0);

/** Smallest whole number of yes votes that satisfies the threshold out of `cast` votes. */
export function votesNeeded(threshold: VoteThreshold, cast: number): number {
  if (cast <= 0) return 0;
  if (threshold === 'simpleMajority') return Math.floor(cast / 2) + 1; // one-half of votes cast plus one
  if (threshold === 'threeQuarters') return Math.ceil((3 * cast) / 4 - 1e-9);
  return Math.floor((2 * cast + 2) / 3); // ceil(2/3)
}

export function meetsThreshold(threshold: VoteThreshold, yes: number, cast: number): boolean {
  if (cast <= 0 || yes <= 0) return false;
  if (threshold === 'simpleMajority') return yes * 2 > cast;
  if (threshold === 'threeQuarters') return yes * 4 >= cast * 3;
  return yes * 3 >= cast * 2;
}

/**
 * Work out a motion's result from the counts.
 * `eligible` is how many voting members are present, for the quorum test.
 */
export function tallyMotion(
  counts: Record<Channel, MotionVoteCount>,
  threshold: VoteThreshold,
  settings: MotionSettings,
  eligible: number,
): MotionTally {
  const byChannel = {
    inPerson: { yes: int(counts.inPerson?.yes), no: int(counts.inPerson?.no), abstain: int(counts.inPerson?.abstain) },
    virtual: { yes: int(counts.virtual?.yes), no: int(counts.virtual?.no), abstain: int(counts.virtual?.abstain) },
  } as Record<Channel, MotionVoteCount>;
  const yes = CHANNELS.reduce((n, ch) => n + byChannel[ch].yes, 0);
  const no = CHANNELS.reduce((n, ch) => n + byChannel[ch].no, 0);
  const abstain = CHANNELS.reduce((n, ch) => n + byChannel[ch].abstain, 0);
  const totalVote = yes + no + abstain;
  // An abstention is not a vote cast, unless this body decides to count it.
  const votesCast = settings.countAbstentions ? totalVote : yes + no;
  const needed = votesNeeded(threshold, votesCast);
  const thresholdMet = meetsThreshold(threshold, yes, votesCast);

  let quorumRequired = 0;
  if (settings.quorum.kind === 'fraction') quorumRequired = Math.ceil((settings.quorum.fraction ?? 0) * Math.max(eligible, 0) - 1e-9);
  if (settings.quorum.kind === 'count') quorumRequired = settings.quorum.count ?? 0;
  const quorumMet = quorumRequired <= 0 || totalVote >= quorumRequired;

  const carried = thresholdMet && quorumMet;
  return {
    yes,
    no,
    abstain,
    votesCast,
    totalVote,
    byChannel,
    needed,
    thresholdMet,
    quorumRequired,
    quorumMet,
    carried,
    // "If the motion passes with a two-thirds vote, the minority may speak. If the motion
    // receives a majority vote but fails to pass for lack of a two-thirds vote, the majority
    // may speak." — the side that did not prevail, either way.
    minoritySide: carried ? 'against' : 'for',
    yesPct: votesCast > 0 ? (yes / votesCast) * 100 : 0,
  };
}

/* ------------------------------------------------------------------ */
/* Conference agenda items                                             */
/* ------------------------------------------------------------------ */

/** The 13 standing committees of the General Service Conference (Service Manual, Chapter 7). */
export const CONFERENCE_COMMITTEES = [
  'Agenda',
  'Archives',
  'Cooperation with the Professional Community',
  'Corrections',
  'Finance',
  'Grapevine / La Viña',
  'International Conventions / Regional Forums',
  'Literature',
  'Policy / Admissions',
  'Public Information',
  'Report and Charter',
  'Treatment and Accessibilities',
  'Trustees',
];

export interface ConferenceOptionTally {
  id: string;
  label: string;
  byChannel: Record<Channel, number>;
  votes: number;
  pct: number;
  /** This option alone reached two-thirds of the votes cast. */
  substantialUnanimity: boolean;
  majority: boolean;
}

export interface ConferenceTally {
  options: ConferenceOptionTally[];
  abstain: Record<Channel, number>;
  abstainTotal: number;
  votesCast: number;
  totalVote: number;
  leading: ConferenceOptionTally | null;
  /** What the numbers amount to, for the UI to word in the room's language. */
  senseKind: 'unanimity' | 'majority' | 'plurality' | 'tied' | null;
  tied: boolean;
  /** The sense of the assembly in one line, or null when nothing has been recorded. */
  sense: string | null;
}

/**
 * Tally one poll of a Conference agenda item. The result is the sense of the assembly —
 * guidance for the delegate, who votes their own conscience at the Conference.
 */
export function tallyConferenceItem(
  counts: Record<Channel, Record<string, number>>,
  abstainCounts: Record<Channel, number>,
  options: { id: string; label: string }[],
): ConferenceTally {
  const abstain = { inPerson: int(abstainCounts?.inPerson), virtual: int(abstainCounts?.virtual) } as Record<Channel, number>;
  const abstainTotal = abstain.inPerson + abstain.virtual;
  const tallies: ConferenceOptionTally[] = options.map((o) => {
    const byChannel = { inPerson: int(counts.inPerson?.[o.id]), virtual: int(counts.virtual?.[o.id]) } as Record<Channel, number>;
    return { id: o.id, label: o.label, byChannel, votes: byChannel.inPerson + byChannel.virtual, pct: 0, substantialUnanimity: false, majority: false };
  });
  const votesCast = tallies.reduce((n, t) => n + t.votes, 0);
  for (const t of tallies) {
    t.pct = votesCast > 0 ? (t.votes / votesCast) * 100 : 0;
    t.substantialUnanimity = meetsThreshold('twoThirds', t.votes, votesCast);
    t.majority = meetsThreshold('simpleMajority', t.votes, votesCast);
  }
  const best = [...tallies].sort((a, b) => b.votes - a.votes)[0] ?? null;
  const tied = !!best && tallies.filter((t) => t.votes === best.votes).length > 1 && best.votes > 0;
  let sense: string | null = null;
  let senseKind: ConferenceTally['senseKind'] = null;
  if (votesCast > 0 && best && !tied) {
    senseKind = best.substantialUnanimity ? 'unanimity' : best.majority ? 'majority' : 'plurality';
    sense = best.substantialUnanimity
      ? `${best.label} — substantial unanimity (${Math.round(best.pct)}% of votes cast)`
      : best.majority
        ? `${best.label} — simple majority only (${Math.round(best.pct)}%), short of two-thirds`
        : `${best.label} leads with ${Math.round(best.pct)}%, without a majority`;
  } else if (tied) {
    senseKind = 'tied';
    sense = 'No clear sense of the assembly — the leading choices are tied';
  }
  return { options: tallies, abstain, abstainTotal, votesCast, totalVote: votesCast + abstainTotal, leading: tied ? null : best, tied, sense, senseKind };
}

/* ------------------------------------------------------------------ */
/* Agenda                                                              */
/* ------------------------------------------------------------------ */

export interface ScheduledItem {
  id: string;
  plannedStartMin: number;
  plannedEndMin: number;
}

/** Planned clock positions for every agenda item, in minutes from the start of the day. */
export function scheduleAgenda(items: { id: string; plannedMinutes: number }[]): ScheduledItem[] {
  let at = 0;
  return items.map((i) => {
    const start = at;
    at += Math.max(0, Math.floor(i.plannedMinutes || 0));
    return { id: i.id, plannedStartMin: start, plannedEndMin: at };
  });
}

export function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map((x) => parseInt(x, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return time;
  const total = (h * 60 + m + minutes + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Minutes an item has actually taken (so far, if it is still running). */
export function elapsedMinutes(startedAt?: string | null, endedAt?: string | null, now = Date.now()): number | null {
  if (!startedAt) return null;
  const end = endedAt ? new Date(endedAt).getTime() : now;
  return Math.max(0, Math.round((end - new Date(startedAt).getTime()) / 60000));
}
