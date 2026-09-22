import Papa from 'papaparse';
import { saveAs } from 'file-saver';
import { AGAINST, type Assembly } from './engine/types';
import { computePosition, METHOD_LABEL, ordinal } from './engine/thirdLegacy';
import { nameOf } from './announce';
import { computeEligibility } from './engine/voters';

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'assembly';
}

export function exportJson(a: Assembly): void {
  const blob = new Blob([JSON.stringify(a, null, 2)], { type: 'application/json' });
  saveAs(blob, `${slug(a.name)}-${a.date || 'election'}.json`);
}

/** One row per candidate per ballot, plus invalid rows — easy to audit in a spreadsheet. */
export function ballotRows(a: Assembly) {
  const rows: Record<string, string | number>[] = [];
  for (const p of a.positions) {
    const st = computePosition(p, a.settings);
    for (const r of st.ballots) {
      const ids = r.isConfirmation ? [...r.activeIds, AGAINST] : r.activeIds;
      for (const id of ids) {
        const v = r.votes[id];
        let outcome = '';
        if (r.electedId === id) outcome = 'Elected';
        else if (r.autoWithdrawnIds.includes(id)) outcome = 'Automatically withdrawn';
        else if (r.protectedIds.includes(id) && r.withdrawalRule) outcome = 'Top two (protected)';
        rows.push({
          Position: p.title,
          Ballot: r.number,
          Candidate: id === AGAINST ? 'No (against)' : nameOf(p, id),
          'In-person': v.inPerson,
          Virtual: v.virtual,
          Total: v.total,
          'Percent of total vote': r.totalVote ? +((v.total / r.totalVote) * 100).toFixed(2) : 0,
          'Total vote': r.totalVote,
          'Two-thirds needed': r.electThreshold,
          Outcome: outcome,
        });
      }
      rows.push({
        Position: p.title,
        Ballot: r.number,
        Candidate: '(blank / invalid)',
        'In-person': r.invalid.inPerson,
        Virtual: r.invalid.virtual,
        Total: r.invalid.total,
        'Percent of total vote': '',
        'Total vote': r.totalVote,
        'Two-thirds needed': r.electThreshold,
        Outcome: a.settings.countInvalidInTotal ? 'Counted in total vote' : 'Not counted in total vote',
      });
    }
  }
  return rows;
}

export function summaryRows(a: Assembly) {
  return a.positions.map((p) => {
    const st = computePosition(p, a.settings);
    const ph = st.phase;
    return {
      Position: p.title,
      Elected: ph.kind === 'elected' ? nameOf(p, ph.candidateId) : '',
      Method: ph.kind === 'elected' ? METHOD_LABEL[ph.method] : '',
      'Decided on ballot': ph.kind === 'elected' && ph.ballotNumber ? ph.ballotNumber : '',
      Ballots: st.ballots.length,
      Status: ph.kind === 'elected' ? 'Elected' : ph.kind,
      Candidates: p.candidates.map((c) => c.name).join('; '),
    };
  });
}

/** Who was present and whether they had a vote (for the assembly's records). */
export function attendanceRows(a: Assembly) {
  const roleName = new Map(a.roles.map((r) => [r.id, r.name]));
  const el = computeEligibility(a.voterRoll, a.roles);
  const voting = new Set(el.eligible.map((v) => v.id));
  const reason = new Map(el.excluded.map((x) => [x.voter.id, x.reason]));
  return a.voterRoll
    .filter((v) => v.present)
    .map((v) => ({
      Name: v.name,
      Role: roleName.get(v.roleId) ?? '',
      Group: v.group,
      District: v.district,
      Attending: v.channel === 'virtual' ? 'Virtual' : 'In-person',
      Voting: voting.has(v.id) ? 'yes' : 'no',
      'If not voting, why': voting.has(v.id) ? '' : (reason.get(v.id) ?? ''),
      'Checked in': v.checkedInAt ? new Date(v.checkedInAt).toLocaleString() : '',
    }));
}

/**
 * One CSV with labelled sections: results summary, every ballot, attendance and the audit log.
 * Starts with a BOM so Excel opens accented names correctly.
 */
export function exportCsv(a: Assembly): void {
  const section = (title: string, rows: Record<string, string | number>[]) =>
    rows.length ? `"${title}"\r\n${Papa.unparse(rows, { newline: '\r\n' })}\r\n\r\n` : `"${title}"\r\n"(none)"\r\n\r\n`;
  const header = Papa.unparse(
    [
      {
        Assembly: a.name,
        Date: a.date,
        Location: a.location,
        Chair: a.chair,
        'Election type': a.electionType,
        Procedure: 'Third Legacy Procedure (A.A. Service Manual, Appendix G)',
        'Total vote': a.settings.countInvalidInTotal ? 'includes blank/invalid ballots' : 'valid votes only',
      },
    ],
    { newline: '\r\n' },
  );
  const csv =
    '﻿' +
    `${header}\r\n\r\n` +
    section('RESULTS', summaryRows(a)) +
    section('BALLOTS', ballotRows(a)) +
    section('ATTENDANCE', attendanceRows(a)) +
    section(
      'AUDIT LOG',
      a.log.map((l) => ({ Time: new Date(l.at).toLocaleString(), Action: l.action, Detail: l.detail ?? '' })),
    );
  saveAs(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${slug(a.name)}-${a.date || 'election'}-results.csv`);
}

export function readJsonFile(file: File): Promise<unknown> {
  return file.text().then((t) => JSON.parse(t));
}

/** Plain-text results for minutes, newsletters or an email to GSO. */
export function resultsSummaryText(a: Assembly): string {
  const lines: string[] = [];
  lines.push(`${a.name} — ${a.date}${a.location ? ` — ${a.location}` : ''}`);
  lines.push('Elections held by the Third Legacy Procedure.');
  lines.push('');
  for (const p of a.positions) {
    const st = computePosition(p, a.settings);
    const ph = st.phase;
    if (ph.kind === 'elected') {
      const c = p.candidates.find((x) => x.id === ph.candidateId);
      const how =
        ph.method === 'ballot' ? `two-thirds vote on the ${ordinal(ph.ballotNumber ?? 0)} ballot` : METHOD_LABEL[ph.method].toLowerCase();
      lines.push(`${p.title}: ${c?.name ?? ''}${c?.district ? ` (${c.district})` : ''} — ${how}`);
    } else if (ph.kind !== 'setup') {
      lines.push(`${p.title}: not filled`);
    }
  }
  const present = a.voterRoll.filter((v) => v.present);
  if (present.length) {
    lines.push('');
    lines.push(`Attendance: ${present.length} (${present.filter((v) => v.channel === 'inPerson').length} in person, ${present.filter((v) => v.channel === 'virtual').length} virtual).`);
  }
  return lines.join('\n');
}

export function exportAllJson(assemblies: Assembly[]): void {
  const blob = new Blob([JSON.stringify({ app: 'third-legacy-vote', exportedAt: new Date().toISOString(), assemblies }, null, 2)], {
    type: 'application/json',
  });
  saveAs(blob, `third-legacy-backup-${new Date().toISOString().slice(0, 10)}.json`);
}
