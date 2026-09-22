/**
 * Import virtual votes from a poll/form export (Zoom poll report, Google Forms, Microsoft Forms,
 * or any CSV with one row per response).
 *
 * Rules that matter for an election:
 *  - Every response row is counted. An answer that is blank, lists two names, or names someone
 *    not on the board counts as invalid — it is never silently dropped, because the total vote
 *    decides the two-thirds threshold.
 *  - A participant who answers twice is counted once (their latest answer) — but only when the
 *    file really identifies participants. Anonymous polls repeat a placeholder name for everyone,
 *    so de-duplication is switched off rather than collapsing 40 votes into 1.
 *  - A report containing several polls is filtered to one question, chosen by which question's
 *    answers actually match this ballot's candidates.
 */
import Papa from 'papaparse';
import { AGAINST } from './types';
import { normName } from './voters';

export interface PollOption {
  id: string;
  name: string;
}

export interface PollImportResult {
  votes: Record<string, number>;
  invalid: number;
  /** Rows that were treated as responses (after filtering to one question). */
  responses: number;
  duplicatesRemoved: number;
  /** Identity values that appeared more than once. */
  duplicateIdentities: string[];
  /** True when the file does not identify participants, so repeats cannot be detected. */
  dedupeDisabled: boolean;
  dedupeNote: string;
  unmatched: string[];
  answerColumn: string;
  answerColumnIndex: number;
  identityColumn: string | null;
  columns: { index: number; header: string; hits: number }[];
  questions: string[];
  question: string | null;
  /** True when the file holds several polls and the teller should confirm which one. */
  questionAmbiguous: boolean;
  /** Stable fingerprint of this import, so the same file is not added twice. */
  signature: string;
}

export interface PollImportOptions {
  column?: number;
  question?: string | null;
}

const YES = ['yes', 'si', 'oui', 'y', 'for', 'approve'];
const NO = ['no', 'non', 'n', 'against', 'oppose'];
/** Names meeting platforms use when a poll is anonymous or a device is not signed in. */
const PLACEHOLDER = /anonymous|attendee|participant|guest|unknown|^user( \d+)?$|iphone|ipad|android|^phone|^room|^n a$/;

function matcher(options: PollOption[]) {
  const hasAgainst = options.some((x) => x.id === AGAINST);
  // Exact keys include yes/no words on a confirmation ballot; the looser "contains" pass below
  // only ever uses candidate names, so an answer like "Comfortable" is not read as a "for" vote.
  const table = options.map((o) => ({
    id: o.id,
    exact: new Set<string>(o.id === AGAINST ? NO : hasAgainst ? [normName(o.name), ...YES] : [normName(o.name)]),
    names: o.id === AGAINST ? [] : [normName(o.name)],
  }));
  return (raw: string): string | null => {
    const v = normName(raw);
    if (!v) return null;
    for (const t of table) if (t.exact.has(v)) return t.id;
    const hits = table.filter((t) => t.names.some((k) => k.length > 2 && (v.includes(k) || (v.length > 2 && k.includes(v)))));
    return hits.length === 1 ? hits[0].id : null;
  };
}

function fingerprint(parts: (string | number)[]): string {
  let h = 2166136261;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return (h >>> 0).toString(36);
}

export function parsePoll(text: string, options: PollOption[], opts: PollImportOptions = {}): PollImportResult {
  const parsed = Papa.parse<string[]>(text.replace(/^﻿/, '').trim(), { skipEmptyLines: 'greedy' });
  const rows = parsed.data.filter((r) => Array.isArray(r) && r.some((c) => String(c ?? '').trim() !== ''));
  if (!rows.length) throw new Error('The file is empty.');
  const match = matcher(options);
  const cell = (r: string[], i: number) => String(r[i] ?? '').trim();

  // 1. The answer column is the one whose values match the most candidates.
  const width = Math.max(...rows.map((r) => r.length));
  const hitCounts: number[] = [];
  for (let c = 0; c < width; c++) {
    let hits = 0;
    for (const r of rows) if (match(cell(r, c))) hits++;
    hitCounts.push(hits);
  }
  // Candidates are voters too, so a "User Name" column can match as many names as the answer
  // column. Prefer a header that reads like an answer, then the rightmost column.
  const headerScore = (c: number) => {
    const h = normName(String(rows.find((r) => String(r[c] ?? '').trim())?.[c] ?? ''));
    if (/answer|response|choice|vote|respuesta|reponse/.test(h)) return 2;
    if (/name|email|user|participant|time|question/.test(h)) return -2;
    return 0;
  };
  let best = -1;
  hitCounts.forEach((h, c) => {
    if (h <= 0) return;
    if (best < 0) {
      best = c;
      return;
    }
    const better = h - hitCounts[best] || headerScore(c) - headerScore(best) || 1; // ties → rightmost
    if (better > 0) best = c;
  });
  if (opts.column !== undefined && hitCounts[opts.column] > 0) best = opts.column;
  if (best < 0) throw new Error('Could not find a column with candidate names. Check that the poll options match the candidates’ names.');

  // 2. The first row that has anything in the answer column is the header — unless that value
  //    is already a candidate's name, in which case the file has no header. Everything after it
  //    is a response, including answers we cannot match (those count as invalid).
  const firstFilled = rows.findIndex((r) => cell(r, best) !== '');
  const headerIdx = firstFilled >= 0 && !match(cell(rows[firstFilled], best)) ? firstFilled : -1;
  const header = headerIdx >= 0 ? rows[headerIdx].map((h) => String(h ?? '')) : [];
  const afterHeader = rows.slice(headerIdx + 1).filter((r) => cell(r, best) !== '');

  // The identity column must actually be filled in — an anonymous export often has the
  // columns but leaves them empty, and an empty column cannot identify anybody.
  const idCol = (() => {
    const filled = (i: number) => i >= 0 && afterHeader.some((r) => cell(r, i) !== '');
    const find = (re: RegExp) => header.findIndex((h, i) => i !== best && re.test(normName(h)));
    const email = find(/e ?mail|correo|courriel/);
    if (filled(email)) return email;
    const name = find(/user name|^name$|participant|nombre|^nom$|display name|respondent/);
    if (filled(name)) return name;
    return -1;
  })();

  // 3. Several polls in one file: filter to one question.
  const qCol = header.findIndex((h, i) => i !== best && /^(question|pregunta)/.test(normName(h)));
  const questions = qCol >= 0 ? [...new Set(afterHeader.map((r) => cell(r, qCol)).filter(Boolean))] : [];
  let question: string | null = null;
  if (qCol >= 0 && questions.length) {
    if (opts.question && questions.includes(opts.question)) question = opts.question;
    else {
      // the question whose answers match this ballot's candidates most often
      let bestScore = -1;
      for (const q of questions) {
        const score = afterHeader.filter((r) => cell(r, qCol) === q && match(cell(r, best))).length;
        if (score >= bestScore) {
          bestScore = score;
          question = q;
        }
      }
    }
  }
  const data = question ? afterHeader.filter((r) => cell(r, qCol) === question) : afterHeader;

  // 4. One response per participant — unless the file cannot identify them.
  const identities = idCol >= 0 ? data.map((r) => normName(cell(r, idCol))) : [];
  const counts = new Map<string, number>();
  for (const id of identities) if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  const repeated = [...counts.entries()].filter(([, n]) => n > 1);
  const looksAnonymous = repeated.some(([id, n]) => PLACEHOLDER.test(id) || n > Math.max(2, data.length * 0.2));
  const canDedupe = idCol >= 0 && identities.some(Boolean) && !looksAnonymous;

  let kept = data;
  let duplicatesRemoved = 0;
  if (canDedupe) {
    const byId = new Map<string, string[]>();
    const anonymous: string[][] = [];
    for (const r of data) {
      const id = normName(cell(r, idCol));
      if (id) byId.set(id, r); // latest answer wins
      else anonymous.push(r);
    }
    kept = [...byId.values(), ...anonymous];
    duplicatesRemoved = data.length - kept.length;
  }

  const votes: Record<string, number> = {};
  for (const o of options) votes[o.id] = 0;
  let invalid = 0;
  const unmatched = new Set<string>();
  for (const r of kept) {
    const raw = cell(r, best);
    // More than one choice (e.g. "Ann;Bob") is not a valid single-name ballot.
    const parts = raw.split(/[;|]/).filter((x) => x.trim());
    const id = parts.length === 1 ? match(raw) : null;
    if (id) votes[id]++;
    else {
      invalid++;
      unmatched.add(raw);
    }
  }

  const dedupeNote = canDedupe
    ? duplicatesRemoved
      ? `${duplicatesRemoved} repeat answer(s) not counted (one response per ${header[idCol] || 'participant'}).`
      : ''
    : looksAnonymous
      ? 'This looks like an anonymous poll — every response is counted, so make sure the poll allowed one answer per person.'
      : 'The file has no name or email column, so repeat answers cannot be detected.';

  return {
    votes,
    invalid,
    responses: data.length,
    duplicatesRemoved,
    duplicateIdentities: canDedupe ? repeated.map(([id]) => id) : [],
    dedupeDisabled: !canDedupe,
    dedupeNote,
    unmatched: [...unmatched].slice(0, 12),
    answerColumn: header[best] || `Column ${best + 1}`,
    answerColumnIndex: best,
    identityColumn: idCol >= 0 ? header[idCol] : null,
    columns: hitCounts.map((hits, index) => ({ index, hits, header: header[index] || `Column ${index + 1}` })).filter((c) => c.hits > 0),
    questions,
    question,
    questionAmbiguous: questions.length > 1 && !opts.question,
    signature: fingerprint([
      options.map((o) => o.id).join(','),
      question ?? '',
      header[best] ?? best,
      ...options.map((o) => votes[o.id]),
      invalid,
      data.length,
    ]),
  };
}
