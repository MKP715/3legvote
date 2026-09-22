/**
 * Example files people can download before an assembly, so they can see exactly what the
 * app expects. Each one is filled with realistic records rather than one or two rows.
 */
import Papa from 'papaparse';
import { saveAs } from 'file-saver';
import type { Assembly, Position } from './engine/types';
import { ordinal } from './engine/thirdLegacy';

/** Excel opens UTF-8 CSV correctly only when it starts with a byte-order mark. */
export function saveCsv(rows: Record<string, string | number>[], filename: string): void {
  const csv = '﻿' + Papa.unparse(rows, { newline: '\r\n' });
  saveAs(new Blob([csv], { type: 'text/csv;charset=utf-8' }), filename);
}

export function saveText(text: string, filename: string, type = 'text/csv;charset=utf-8'): void {
  saveAs(new Blob([text.startsWith('﻿') ? text : '﻿' + text], { type }), filename);
}

/**
 * Voter roll template, built from this assembly's own roles so the Role column already
 * contains values the app understands.
 */
export function voterRollTemplate(a: Assembly): Record<string, string>[] {
  const FIRST = ['Ann', 'Bob', 'Carmen', 'Dave', 'Elena', 'Frank', 'Grace', 'Hector', 'Iris', 'Jesse', 'Lena', 'Marcus', 'Nadia', 'Omar', 'Pat', 'Quinn'];
  const GROUPS = ['Serenity Group', 'Tuesday Night Step', 'Keep It Simple', 'Big Book Study', 'Early Birds', 'New Freedom', 'Came to Believe', 'Sunrise Sobriety'];
  const primary = a.roles.filter((r) => r.votes && !r.alternateFor);
  const alternates = a.roles.filter((r) => r.alternateFor);
  const nonVoting = a.roles.filter((r) => !r.votes);
  const rows: Record<string, string>[] = [];
  let n = 0;
  const row = (roleName: string, group: string, district: string, channel: string, present: string) => {
    const first = FIRST[n % FIRST.length];
    rows.push({
      Name: `${first} ${String.fromCharCode(66 + (n % 25))}.`,
      Role: roleName,
      Group: group,
      District: district,
      Email: '',
      Channel: channel,
      Present: present,
    });
    n++;
  };

  // Eight of the main voting role (usually GSRs), a mix of in-person and virtual.
  const main = primary[0]?.name ?? 'Voting member';
  GROUPS.forEach((g, i) => row(main, g, String((i % 4) + 1), i % 3 === 0 ? 'Virtual' : 'In-person', i < 6 ? 'yes' : ''));
  // An alternate whose primary is present (will not vote) and one whose primary is absent (will vote).
  for (const alt of alternates.slice(0, 2)) {
    const idx = alternates.indexOf(alt);
    row(alt.name, GROUPS[idx === 0 ? 0 : 7], String(idx + 1), 'In-person', 'yes');
  }
  // The other voting roles: officers, DCMs, committee chairs…
  for (const r of primary.slice(1, 5)) row(r.name, r.name.toLowerCase().includes('dcm') ? 'District 2' : 'Area', '2', 'In-person', 'yes');
  // Someone who attends but does not vote.
  for (const r of nonVoting.slice(0, 1)) row(r.name, '', '', 'In-person', 'yes');
  return rows;
}

export const ROLL_COLUMN_HELP = [
  ['Name', 'Required. First name and last initial is usual in A.A. Rows without a name are skipped.'],
  ['Role', 'Must be one of this election’s roles (see the list on this page). Common titles such as “Alt. GSR”, “Area Chair” or “Treasurer” are recognised. Anything unrecognised is reported after import and can be fixed in the table.'],
  ['Group', 'Home group (or district/area for officers). Used to pair an alternate with their primary — an alternate only votes when their group’s primary is absent, so fill this in for both.'],
  ['District', 'District number or name. Optional.'],
  ['Email', 'Optional. Only used to tell two people with the same name apart. It is never sent anywhere.'],
  ['Channel', '“In-person” or “Virtual” (also accepts Zoom, online, remote). Blank means in-person.'],
  ['Present', 'Leave blank to check people in on the day. “yes”, “y”, “x” or “1” marks someone already present.'],
];

/** Example of what a meeting-platform poll export looks like, for the virtual teller. */
export function pollExample(position: Position, ballotNumber: number, candidates: string[]): Record<string, string>[] {
  const question = `${position.title} — ${ordinal(ballotNumber)} ballot`;
  const people = ['Ann B.', 'Bob C.', 'Carmen D.', 'Dave E.', 'Elena F.', 'Frank G.'];
  const names = candidates.length ? candidates : ['Candidate One', 'Candidate Two'];
  return people.map((p, i) => ({
    '#': String(i + 1),
    'User Name': p,
    'User Email': `${p.split(' ')[0].toLowerCase()}@example.org`,
    'Submitted Date/Time': `Oct 4, 2026 10:0${i} AM`,
    [question]: names[i % names.length],
  }));
}

/** Candidate list template (nominations can be prepared in advance from eligibility records). */
export function candidateTemplate(): Record<string, string>[] {
  return [
    { Name: 'Ann B.', District: 'District 1', Note: 'Past DCM, 2 years' },
    { Name: 'Bob C.', District: 'District 4', Note: 'Past area secretary' },
    { Name: 'Carmen D.', District: 'District 7', Note: '' },
    { Name: 'Dave E.', District: 'District 9', Note: '' },
    { Name: 'Elena F.', District: 'District 12', Note: '' },
  ];
}
