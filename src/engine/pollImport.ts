/**
 * Import virtual votes from a poll/form export (Zoom poll report, Google Forms, Microsoft Forms,
 * or any CSV with one row per response). The column holding the answers is found automatically
 * by matching candidate names. One response per participant is counted (the latest), so a voter
 * who answers twice is not counted twice.
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
  responses: number;
  duplicatesRemoved: number;
  unmatched: string[];
  answerColumn: string;
  answerColumnIndex: number;
  identityColumn: string | null;
  /** Columns that contain candidate names, so the teller can pick a different one. */
  columns: { index: number; header: string; hits: number }[];
  /** When the export has a "Question" column (several polls in one file), its distinct values. */
  questions: string[];
  question: string | null;
}

export interface PollImportOptions {
  column?: number;
  question?: string | null;
}

const YES = ['yes', 'si', 'oui', 'y', 'for', 'approve'];
const NO = ['no', 'non', 'n', 'against', 'oppose'];

function matcher(options: PollOption[]) {
  const table = options.map((o) => ({ id: o.id, keys: new Set<string>() }));
  options.forEach((o, i) => {
    if (o.id === AGAINST) NO.forEach((k) => table[i].keys.add(k));
    else {
      table[i].keys.add(normName(o.name));
      // Confirmation ballots: "Yes" / "Yes — Name" also mean a vote for the candidate.
      if (options.some((x) => x.id === AGAINST)) YES.forEach((k) => table[i].keys.add(k));
    }
  });
  return (raw: string): string | null => {
    const v = normName(raw);
    if (!v) return null;
    for (const t of table) if (t.keys.has(v)) return t.id;
    // "Yes - Pat M." style or name with extra text: accept if exactly one option name is contained.
    const hits = table.filter((t) => [...t.keys].some((k) => k.length > 2 && (v.includes(k) || (v.length > 2 && k.includes(v)))));
    return hits.length === 1 ? hits[0].id : null;
  };
}

export function parsePoll(text: string, options: PollOption[], opts: PollImportOptions = {}): PollImportResult {
  const parsed = Papa.parse<string[]>(text.trim(), { skipEmptyLines: 'greedy' });
  const rows = parsed.data.filter((r) => Array.isArray(r) && r.some((c) => String(c).trim() !== ''));
  if (!rows.length) throw new Error('The file is empty.');
  const match = matcher(options);

  // Pick the column with the most answers that match a candidate (or the one the teller chose).
  const width = Math.max(...rows.map((r) => r.length));
  const hitCounts: number[] = [];
  for (let c = 0; c < width; c++) {
    let hits = 0;
    for (const r of rows) if (r[c] !== undefined && match(String(r[c]))) hits++;
    hitCounts.push(hits);
  }
  let best = -1;
  hitCounts.forEach((h, c) => {
    if (h > 0 && (best < 0 || h > hitCounts[best])) best = c;
  });
  if (opts.column !== undefined && hitCounts[opts.column] > 0) best = opts.column;
  if (best < 0) throw new Error('Could not find a column with candidate names. Check that the poll options match the candidates’ names.');

  const firstHit = rows.findIndex((r) => r[best] !== undefined && match(String(r[best])));
  // The header row is the last row before the first answer that has something in the answer column.
  let headerIdx = -1;
  for (let i = firstHit - 1; i >= 0; i--) {
    if (rows[i].length > best && String(rows[i][best]).trim()) {
      headerIdx = i;
      break;
    }
  }
  const header = headerIdx >= 0 ? rows[headerIdx].map((h) => String(h)) : [];
  const idCol = (() => {
    const find = (re: RegExp) => header.findIndex((h, i) => i !== best && re.test(normName(h)));
    const email = find(/e ?mail|correo|courriel/);
    if (email >= 0) return email;
    return find(/user name|^name$|participant|nombre|^nom$|display name|respondent/);
  })();

  // Long-format exports list several polls in one file with a "Question" column.
  const qCol = header.findIndex((h, i) => i !== best && /^(question|pregunta)/.test(normName(h)));
  let data = rows.slice(firstHit).filter((r) => r.length > best && String(r[best]).trim() !== '');
  const questions = qCol >= 0 ? [...new Set(data.map((r) => String(r[qCol] ?? '').trim()).filter(Boolean))] : [];
  const question = qCol >= 0 ? (opts.question && questions.includes(opts.question) ? opts.question : (questions[questions.length - 1] ?? null)) : null;
  if (qCol >= 0 && question) data = data.filter((r) => String(r[qCol] ?? '').trim() === question);
  // Keep the latest response per participant.
  const byId = new Map<string, string[]>();
  const anonymous: string[][] = [];
  for (const r of data) {
    const id = idCol >= 0 ? normName(String(r[idCol] ?? '')) : '';
    if (id) byId.set(id, r);
    else anonymous.push(r);
  }
  const kept = [...byId.values(), ...anonymous];

  const votes: Record<string, number> = {};
  for (const o of options) votes[o.id] = 0;
  let invalid = 0;
  const unmatched = new Set<string>();
  for (const r of kept) {
    const raw = String(r[best]);
    // More than one choice (e.g. "Ann;Bob") is not a valid single-name ballot.
    const parts = raw.split(/[;|]/).filter((x) => x.trim());
    const id = parts.length === 1 ? match(raw) : null;
    if (id) votes[id]++;
    else {
      invalid++;
      unmatched.add(raw.trim());
    }
  }
  return {
    votes,
    invalid,
    responses: data.length,
    duplicatesRemoved: data.length - kept.length,
    unmatched: [...unmatched].slice(0, 12),
    answerColumn: header[best] || `Column ${best + 1}`,
    answerColumnIndex: best,
    identityColumn: idCol >= 0 ? header[idCol] : null,
    columns: hitCounts
      .map((hits, index) => ({ index, hits, header: header[index] || `Column ${index + 1}` }))
      .filter((c) => c.hits > 0),
    questions,
    question,
  };
}
