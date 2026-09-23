/**
 * Sample agendas from The A.A. Service Manual, Appendix D ("Sample Area Meeting Formats"),
 * which the manual offers as suggestions only — every area sets its own order of business.
 */
import type { AgendaItem, AgendaKind } from './engine/types';

type Seed = [title: string, kind: AgendaKind, minutes: number, presenter?: string];

const seed = (rows: Seed[]): AgendaItem[] =>
  rows.map(([title, kind, plannedMinutes, presenter]) => ({
    id: '',
    title,
    kind,
    plannedMinutes,
    presenter: presenter ?? '',
    notes: '',
    startedAt: null,
    endedAt: null,
  }));

export const AGENDA_TEMPLATES: { id: string; label: string; description: string; items: AgendaItem[] }[] = [
  {
    id: 'election',
    label: 'Election assembly (Appendix D)',
    description: 'The order of business the Service Manual gives for an election assembly.',
    items: seed([
      ['Moment of silence and the Serenity Prayer', 'segment', 5, 'Chair'],
      ['Reports: secretary, delegate, officers and DCMs', 'report', 45],
      ['Procedure for electing committee members; accept those already elected', 'segment', 10, 'Chair'],
      ['District caucuses to elect any DCM not yet elected', 'segment', 15],
      ['Review the election procedure and who votes; approve it and the order of election', 'segment', 15, 'Chair'],
      ['Post eligible candidates; ask who is unable to serve', 'segment', 15, 'Chair'],
      ['Appoint tellers, collectors and a recorder; distribute ballots', 'segment', 10, 'Chair'],
      ['Roll call of voting members', 'segment', 15, 'Secretary'],
      ['Election: Delegate', 'election', 45],
      ['Election: Alternate Delegate', 'election', 30],
      ['Break', 'break', 15],
      ['Election: Area officers', 'election', 60],
      ['Report to GSO: delegate, officers, committee members and GSRs attending', 'segment', 10, 'Secretary'],
      ['Other business', 'segment', 15],
      ['Close', 'segment', 5, 'Chair'],
    ]),
  },
  {
    id: 'regular',
    label: 'Regular (non-election) assembly (Appendix D)',
    description: 'The Service Manual’s sample order of business for a regular assembly.',
    items: seed([
      ['Moment of silence and the Serenity Prayer', 'segment', 5, 'Chair'],
      ['Chairperson’s report on committee activities', 'report', 10, 'Chair'],
      ['Delegate’s Conference report / news from GSO', 'report', 30, 'Delegate'],
      ['Secretary’s report', 'report', 10, 'Secretary'],
      ['Treasurer’s report', 'report', 10, 'Treasurer'],
      ['Standing committee reports', 'report', 30],
      ['District reports', 'report', 30],
      ['Break', 'break', 15],
      ['GSR time — ideas, opinions and suggestions', 'segment', 20],
      ['Sharing session', 'workshop', 45],
      ['Lunch', 'meal', 60],
      ['Old and new business (motions)', 'motion', 45],
      ['Reports from intergroup / central offices', 'report', 10],
      ['Other business', 'segment', 15],
      ['Close', 'segment', 5, 'Chair'],
    ]),
  },
  {
    id: 'preconference',
    label: 'Pre-Conference assembly (Conference agenda items)',
    description: 'For the assembly where the delegate brings the Conference agenda to the area.',
    items: seed([
      ['Moment of silence and the Serenity Prayer', 'segment', 5, 'Chair'],
      ['Welcome and how the day will run', 'segment', 10, 'Chair'],
      ['What the Conference is and how agenda items reach it', 'report', 20, 'Delegate'],
      ['Conference agenda items — first committee', 'conference', 60],
      ['Break', 'break', 15],
      ['Conference agenda items — second committee', 'conference', 60],
      ['Lunch', 'meal', 60],
      ['Conference agenda items — remaining committees', 'conference', 90],
      ['Sharing session: what the delegate should carry', 'workshop', 30],
      ['Thanks and close', 'segment', 10, 'Chair'],
    ]),
  },
];

export const AGENDA_KIND_LABEL: Record<AgendaKind, string> = {
  segment: 'Business',
  report: 'Report',
  break: 'Break',
  meal: 'Meal',
  election: 'Election',
  motion: 'Motions',
  conference: 'Conference items',
  workshop: 'Workshop / sharing',
};

export const AGENDA_KIND_ICON: Record<AgendaKind, string> = {
  segment: '•',
  report: '📋',
  break: '☕',
  meal: '🍽',
  election: '🗳',
  motion: '✋',
  conference: '📄',
  workshop: '💬',
};
