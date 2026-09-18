/**
 * Third Legacy Procedure — rules engine.
 *
 * Implements the procedure as described in The A.A. Service Manual:
 *
 *  1. Candidates' names are posted. Each voter writes ONE name per ballot.
 *  2. The first candidate to receive TWO-THIRDS of the total vote is elected.
 *  3. After the 2nd ballot, any candidate with LESS THAN ONE-FIFTH of the total vote
 *     is automatically withdrawn — except the top two candidates remain.
 *  4. After the 3rd ballot, candidates with LESS THAN ONE-THIRD of the total vote are
 *     automatically withdrawn — except the top two candidates remain.
 *  5. After the 4th ballot, if no one is elected, the candidate with the SMALLEST total
 *     is automatically withdrawn — except the top two candidates remain.
 *  6. The chair then asks for a motion, second and simple majority of hands on conducting
 *     a 5th and final ballot. If defeated, the choice is made by lot immediately.
 *  7. If no one is elected on the 5th ballot, the choice is made by lot.
 *  8. Going to the hat: the top two candidates remain (all tied first-place candidates if
 *     there is a tie for first; otherwise the top candidate and all tied second-place
 *     candidates). The first name out of the hat is elected.
 *
 * "Top two remain" throughout means: if two or more candidates tie for first, all of them;
 * otherwise the leader plus everyone tied for second.
 *
 * All arithmetic is integer-exact (no floating point comparisons):
 *   elected         ⇔ votes × 3 ≥ total × 2
 *   below one-fifth ⇔ votes × 5 < total
 *   below one-third ⇔ votes × 3 < total
 */
import {
  AGAINST,
  CHANNELS,
  type BallotRecord,
  type BallotResult,
  type Candidate,
  type CandidateStatus,
  type Channel,
  type ElectionMethod,
  type Phase,
  type Position,
  type PositionState,
  type Settings,
  type VoteSplit,
  type WithdrawalRule,
} from './types';

export const MAX_BALLOTS = 5;

/** Minimum whole number of votes that is at least two-thirds of `total`. */
export function twoThirdsThreshold(total: number): number {
  if (total <= 0) return 0;
  // ceil(2T/3) in integer arithmetic
  return Math.floor((2 * total + 2) / 3);
}

export function reachesTwoThirds(votes: number, total: number): boolean {
  return total > 0 && votes > 0 && votes * 3 >= total * 2;
}

export function belowOneFifth(votes: number, total: number): boolean {
  return votes * 5 < total;
}

export function belowOneThird(votes: number, total: number): boolean {
  return votes * 3 < total;
}

/** Which automatic-withdrawal rule applies after ballot `n`. */
export function withdrawalRuleAfter(n: number): WithdrawalRule | null {
  if (n === 2) return 'oneFifth';
  if (n === 3) return 'oneThird';
  if (n === 4) return 'lowest';
  return null;
}

/**
 * "The top two candidates remain." If two or more tie for first, all tied-for-first
 * candidates are protected; otherwise the leader and all candidates tied for second.
 */
export function topTwo(ids: string[], totals: Record<string, number>): string[] {
  if (ids.length <= 2) return [...ids];
  const values = ids.map((id) => totals[id] ?? 0);
  const max = Math.max(...values);
  const atMax = ids.filter((id) => (totals[id] ?? 0) === max);
  if (atMax.length >= 2) return atMax;
  const rest = values.filter((v) => v < max);
  const second = Math.max(...rest);
  return ids.filter((id) => {
    const v = totals[id] ?? 0;
    return v === max || v === second;
  });
}

function emptySplit(): VoteSplit {
  return { inPerson: 0, virtual: 0, total: 0 };
}

function safeCount(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

/**
 * Tally one ballot against the candidates that were on the board for it, and work out
 * who (if anyone) is elected and who is automatically withdrawn afterwards.
 */
export function tallyBallot(
  ballot: BallotRecord,
  number: number,
  activeIds: string[],
  settings: Settings,
  voluntaryWithdrawnIds: string[] = [],
): BallotResult {
  const isConfirmation = activeIds.length === 1;
  const options = isConfirmation ? [...activeIds, AGAINST] : [...activeIds];
  const optionSet = new Set(options);

  const votes: Record<string, VoteSplit> = {};
  for (const id of options) votes[id] = emptySplit();
  const valid = emptySplit();
  const invalid = emptySplit();

  for (const ch of CHANNELS) {
    const c = ballot.counts[ch];
    let chInvalid = safeCount(c?.invalid);
    for (const [key, raw] of Object.entries(c?.votes ?? {})) {
      const n = safeCount(raw);
      if (optionSet.has(key)) {
        votes[key][ch] += n;
        votes[key].total += n;
        valid[ch] += n;
        valid.total += n;
      } else {
        // A vote for someone not on the board for this ballot is not a valid vote.
        chInvalid += n;
      }
    }
    invalid[ch] += chInvalid;
    invalid.total += chInvalid;
  }

  const cast: VoteSplit = {
    inPerson: valid.inPerson + invalid.inPerson,
    virtual: valid.virtual + invalid.virtual,
    total: valid.total + invalid.total,
  };
  const totalVote = valid.total + (settings.countInvalidInTotal ? invalid.total : 0);
  const electThreshold = twoThirdsThreshold(totalVote);

  const totals: Record<string, number> = {};
  for (const id of activeIds) totals[id] = votes[id].total;

  const ranking = [...activeIds].sort((a, b) => totals[b] - totals[a]);

  let electedId: string | null = null;
  for (const id of activeIds) {
    if (reachesTwoThirds(totals[id], totalVote)) {
      // At most one candidate can hold two-thirds of the vote.
      electedId = id;
      break;
    }
  }

  let withdrawalRule: WithdrawalRule | null = null;
  let withdrawalLimit: number | null = null;
  let protectedIds: string[] = [];
  let autoWithdrawnIds: string[] = [];

  if (!electedId && !isConfirmation) {
    withdrawalRule = withdrawalRuleAfter(number);
    protectedIds = topTwo(activeIds, totals);
    const unprotected = activeIds.filter((id) => !protectedIds.includes(id));
    if (withdrawalRule === 'oneFifth') {
      withdrawalLimit = totalVote / 5;
      autoWithdrawnIds = unprotected.filter((id) => belowOneFifth(totals[id], totalVote));
    } else if (withdrawalRule === 'oneThird') {
      withdrawalLimit = totalVote / 3;
      autoWithdrawnIds = unprotected.filter((id) => belowOneThird(totals[id], totalVote));
    } else if (withdrawalRule === 'lowest' && unprotected.length > 0) {
      const min = Math.min(...unprotected.map((id) => totals[id]));
      const lowest = unprotected.filter((id) => totals[id] === min);
      if (lowest.length === 1 || settings.fourthBallotLowestTie === 'withdrawAllTied') {
        autoWithdrawnIds = lowest;
      }
    }
  }

  const overVote: Channel[] = [];
  const collectedMismatch: Channel[] = [];
  for (const ch of CHANNELS) {
    const eligible = safeCount(ballot.eligibleVoters?.[ch]);
    if (eligible > 0 && cast[ch] > eligible) overVote.push(ch);
    const collected = ballot.collected?.[ch];
    if (collected !== null && collected !== undefined && Number.isFinite(collected)) {
      if (collected !== cast[ch]) collectedMismatch.push(ch);
    }
  }

  return {
    number,
    activeIds: [...activeIds],
    voluntaryWithdrawnIds,
    isConfirmation,
    votes,
    valid,
    invalid,
    cast,
    totalVote,
    electThreshold,
    electedId,
    withdrawalRule,
    withdrawalLimit,
    protectedIds,
    autoWithdrawnIds,
    ranking,
    overVote,
    collectedMismatch,
    eligibleVoters: {
      inPerson: safeCount(ballot.eligibleVoters?.inPerson),
      virtual: safeCount(ballot.eligibleVoters?.virtual),
    },
  };
}

function isVoluntarilyOut(c: Candidate | undefined, ballotNumber: number): boolean {
  return !!c && c.withdrawnBeforeBallot !== null && c.withdrawnBeforeBallot <= ballotNumber;
}

/** Candidates in the hat, from the last ballot's totals among those still standing. */
export function hatPool(lastBallot: BallotResult, standingIds: string[]): string[] {
  const totals: Record<string, number> = {};
  for (const id of standingIds) totals[id] = lastBallot.votes[id]?.total ?? 0;
  return topTwo(standingIds, totals);
}

/** The effective (latest) fifth-ballot motion vote, if any. */
export function effectiveMotion(position: Position) {
  return position.motionVotes.length ? position.motionVotes[position.motionVotes.length - 1] : null;
}

/**
 * Replay every recorded action for a position and derive the full state:
 * each ballot's results, each candidate's status, and what happens next.
 */
export function computePosition(position: Position, settings: Settings): PositionState {
  const byId = new Map(position.candidates.map((c) => [c.id, c]));
  const status: Record<string, CandidateStatus> = {};
  for (const c of position.candidates) status[c.id] = { kind: 'standing' };

  const markVoluntary = (ids: string[], ballotNumber: number) => {
    for (const id of ids) {
      status[id] = { kind: 'withdrawn', voluntary: true, afterBallot: ballotNumber - 1, rule: null };
    }
  };

  const finish = (phase: Phase, ballots: BallotResult[], ignored = 0): PositionState => {
    if (phase.kind === 'elected') {
      for (const [id, s] of Object.entries(status)) {
        if (id === phase.candidateId) status[id] = { kind: 'elected' };
        else if (s.kind === 'standing') status[id] = { kind: 'notElected' };
      }
    } else if (phase.kind === 'notElected') {
      for (const [id, s] of Object.entries(status)) {
        if (s.kind === 'standing') status[id] = { kind: 'notElected' };
      }
    }
    return { phase, ballots, status, ignoredBallots: ignored };
  };

  if (position.appointment && byId.has(position.appointment.candidateId)) {
    return finish(
      { kind: 'elected', candidateId: position.appointment.candidateId, method: 'hatSecondDraw', ballotNumber: null },
      [],
    );
  }

  if (!position.started) return { phase: { kind: 'setup' }, ballots: [], status, ignoredBallots: 0 };

  let standing = position.candidates.map((c) => c.id);
  const results: BallotResult[] = [];

  const applyVoluntary = (ballotNumber: number) => {
    const out = standing.filter((id) => isVoluntarilyOut(byId.get(id), ballotNumber));
    if (out.length) {
      markVoluntary(out, ballotNumber);
      standing = standing.filter((id) => !out.includes(id));
    }
    return out;
  };

  for (let i = 0; i < position.ballots.length; i++) {
    const n = i + 1;
    const ignored = position.ballots.length - i;
    const volOut = applyVoluntary(n);

    // Can a ballot legitimately be held at this point? (A single remaining candidate
    // gets a confirmation ballot whatever its number.)
    if (n > MAX_BALLOTS && standing.length > 1) {
      return decideNext(n - 1, ignored);
    }
    if (n === MAX_BALLOTS && standing.length > 1) {
      const motion = effectiveMotion(position);
      if (!motion || !motion.carried) {
        // A 5th ballot was recorded without a carried motion: ignore it and ask for the motion.
        return decideNext(n - 1, ignored);
      }
    }

    if (standing.length === 0) return finish({ kind: 'noCandidates' }, results, ignored);
    if (standing.length === 1 && settings.singleCandidate === 'autoElect') {
      return finish({ kind: 'elected', candidateId: standing[0], method: 'unopposed', ballotNumber: null }, results, ignored);
    }

    const r = tallyBallot(position.ballots[i], n, standing, settings, volOut);
    results.push(r);

    if (r.electedId) {
      return finish(
        { kind: 'elected', candidateId: r.electedId, method: r.isConfirmation ? 'confirmation' : 'ballot', ballotNumber: n },
        results,
        position.ballots.length - n,
      );
    }
    if (r.isConfirmation) {
      return finish(
        {
          kind: 'notElected',
          reason: 'The only remaining candidate did not receive two-thirds of the total vote on the confirmation ballot. Reopen the position (reset) to take new nominations.',
        },
        results,
        position.ballots.length - n,
      );
    }
    for (const id of r.autoWithdrawnIds) {
      status[id] = { kind: 'withdrawn', voluntary: false, afterBallot: n, rule: r.withdrawalRule };
    }
    standing = standing.filter((id) => !r.autoWithdrawnIds.includes(id));
  }

  return decideNext(results.length, position.ballots.length - results.length);

  /** Determine the next step after `n` ballots have been counted. */
  function decideNext(n: number, ignored: number): PositionState {
    const next = n + 1;
    // Voluntary withdrawals that take effect before the next step.
    const pendingOut = standing.filter((id) => isVoluntarilyOut(byId.get(id), next));
    if (pendingOut.length) {
      markVoluntary(pendingOut, next);
      standing = standing.filter((id) => !pendingOut.includes(id));
    }

    if (standing.length === 0) return finish({ kind: 'noCandidates' }, results, ignored);
    if (standing.length === 1) {
      if (settings.singleCandidate === 'autoElect') {
        return finish({ kind: 'elected', candidateId: standing[0], method: 'unopposed', ballotNumber: null }, results, ignored);
      }
      return finish({ kind: 'ballot', number: next, activeIds: [...standing], isConfirmation: true }, results, ignored);
    }

    if (n < MAX_BALLOTS - 1) {
      return finish({ kind: 'ballot', number: next, activeIds: [...standing], isConfirmation: false }, results, ignored);
    }

    const last = results[results.length - 1];
    let reason: 'motionDefeated' | 'fifthBallot';
    if (n === MAX_BALLOTS - 1) {
      const motion = effectiveMotion(position);
      if (!motion) return finish({ kind: 'motion', activeIds: [...standing] }, results, ignored);
      if (motion.carried) {
        return finish({ kind: 'ballot', number: MAX_BALLOTS, activeIds: [...standing], isConfirmation: false }, results, ignored);
      }
      reason = 'motionDefeated';
    } else {
      reason = 'fifthBallot';
    }

    const poolIds = hatPool(last, standing);
    const hat = position.hat;
    if (hat && hat.order.length > 0 && poolIds.includes(hat.order[0])) {
      return finish({ kind: 'elected', candidateId: hat.order[0], method: 'hat', ballotNumber: null }, results, ignored);
    }
    return finish({ kind: 'hat', poolIds, reason }, results, ignored);
  }
}

/* ------------------------------------------------------------------ */
/* Helpers for presentation                                            */
/* ------------------------------------------------------------------ */

export const METHOD_LABEL: Record<ElectionMethod, string> = {
  ballot: 'Elected by two-thirds vote',
  confirmation: 'Elected on a confirmation ballot (two-thirds "yes")',
  unopposed: 'Elected unopposed (only remaining candidate)',
  hat: 'Chosen by lot ("from the hat")',
  hatSecondDraw: 'Second name drawn from the hat',
};

export const RULE_LABEL: Record<WithdrawalRule, string> = {
  oneFifth: 'less than one-fifth of the total vote (after 2nd ballot)',
  oneThird: 'less than one-third of the total vote (after 3rd ballot)',
  lowest: 'smallest total (after 4th ballot)',
};

export function pct(votes: number, total: number): string {
  if (total <= 0) return '—';
  return `${((votes / total) * 100).toFixed(1)}%`;
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function fmtLimit(x: number | null): string {
  if (x === null) return '';
  return Number.isInteger(x) ? String(x) : x.toFixed(2);
}

/** Motion to hold a fifth ballot: simple majority of those voting. */
export function motionCarries(hands: Record<Channel, { yes: number; no: number }>): boolean {
  const yes = safeCount(hands.inPerson.yes) + safeCount(hands.virtual.yes);
  const no = safeCount(hands.inPerson.no) + safeCount(hands.virtual.no);
  return yes > no;
}
