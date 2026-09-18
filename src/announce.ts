/** Plain-language announcements the chair can read aloud after each step (EN / ES / FR). */
import { AGAINST, type BallotResult, type Language, type Phase, type Position, type PositionState } from './engine/types';
import { fmtLimit, pct } from './engine/thirdLegacy';
import { listL, sentence, t } from './i18n';

export { sentence };

export function nameOf(p: Position, id: string, lang: Language = 'en'): string {
  if (id === AGAINST) return t(lang).no;
  return p.candidates.find((c) => c.id === id)?.name ?? '(unknown)';
}

export function listNames(names: string[], lang: Language = 'en'): string {
  return listL(names, lang);
}

export function ballotAnnouncement(p: Position, r: BallotResult, lang: Language = 'en'): string[] {
  const d = t(lang);
  const lines: string[] = [];
  const title = r.isConfirmation ? `${d.ballot(r.number)} (${d.confirmationBallot})` : d.ballot(r.number);
  lines.push(d.resultsHeader(title, p.title, r.cast.total, r.cast.inPerson, r.cast.virtual, r.invalid.total));
  lines.push(d.totalVote(r.totalVote, r.electThreshold));
  const order = r.isConfirmation ? [...r.activeIds, AGAINST] : r.ranking;
  for (const id of order) {
    const v = r.votes[id];
    const label = r.isConfirmation && id !== AGAINST ? d.yesFor(nameOf(p, id, lang)) : nameOf(p, id, lang);
    lines.push(`${label}: ${v.total} (${pct(v.total, r.totalVote)})`);
  }
  if (r.electedId) {
    lines.push(d.elected(nameOf(p, r.electedId, lang), p.title));
    return lines;
  }
  if (r.isConfirmation) {
    lines.push(d.notConfirmed(nameOf(p, r.activeIds[0], lang)));
    return lines;
  }
  lines.push(d.noTwoThirds);

  const withdrawn = r.autoWithdrawnIds.map((id) => nameOf(p, id, lang));
  if (r.withdrawalRule === 'oneFifth' || r.withdrawalRule === 'oneThird') {
    const frac = d.fracName(r.withdrawalRule);
    const limit = r.withdrawalLimit ?? 0;
    if (withdrawn.length) lines.push(d.withdrawnRule(frac, fmtLimit(limit), listL(withdrawn, lang)));
    else lines.push(d.noneWithdrawnRule(frac, fmtLimit(limit)));
    const kept = r.protectedIds.filter((id) => r.votes[id].total < limit).map((id) => nameOf(p, id, lang));
    if (kept.length) lines.push(d.keptTopTwo(listL(kept, lang), kept.length > 1));
  } else if (r.withdrawalRule === 'lowest') {
    if (withdrawn.length) lines.push(d.lowestWithdrawn(listL(withdrawn, lang), withdrawn.length > 1));
    else if (r.activeIds.length > r.protectedIds.length) lines.push(d.lowestTieNone);
  }
  return lines;
}

export function nextStepAnnouncement(p: Position, st: PositionState, lang: Language = 'en'): string[] {
  const d = t(lang);
  const phase: Phase = st.phase;
  const names = (ids: string[]) => listL(ids.map((id) => nameOf(p, id, lang)), lang);
  switch (phase.kind) {
    case 'setup':
      return d.nominations(p.title);
    case 'ballot': {
      if (phase.isConfirmation) return d.onlyCandidate(names(phase.activeIds), p.title);
      const lines = [d.nextBallot(d.ballot(phase.number), p.title, names(phase.activeIds)), d.writeOne];
      lines.push(phase.number === 5 ? d.fifthFinal : d.mayWithdraw);
      return lines;
    }
    case 'motion':
      return d.motion(names(phase.activeIds));
    case 'hat':
      return [phase.reason === 'motionDefeated' ? d.hatDefeated : d.hatFifth, d.hatNames(names(phase.poolIds), p.title)];
    case 'elected':
      return [d.electedMethod(nameOf(p, phase.candidateId, lang), p.title, d.methods[phase.method])];
    case 'notElected':
      return [phase.reason];
    case 'noCandidates':
      return [d.allWithdrawn(p.title)];
  }
}

/** Explanation the chair reads before the first ballot (Service Manual Appendix D, step 5). */
export function openingScript(title: string, whoVotes: string, colors: string[], lang: Language = 'en'): string[] {
  return t(lang).opening(title, whoVotes, colors.slice(0, 5).join(', '));
}
