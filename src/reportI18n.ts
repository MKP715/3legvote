/**
 * The printed record in the language the assembly asks for. The operator's own screen
 * stays in English; everything that appears on the printed page — headings, table columns
 * and the standing notes — is translated here.
 */
import type { Language } from './engine/types';

export interface ReportDict {
  locale: string;
  reportTitle: string;
  chairLabel: string;
  procedure: string;
  /** settings sentence */
  invalidIn: string;
  invalidOut: string;
  tieAll: string;
  tieNone: string;
  singleConfirm: string;
  singleDeclared: string;
  officials: Record<'secretary' | 'registrar' | 'tellers' | 'collectors' | 'recorder' | 'virtualTeller' | 'techHost', string>;
  approvals: Record<'procedure' | 'whoVotes' | 'order', string>;
  approvedAt: (when: string) => string;
  notRecorded: string;
  summary: string;
  colPosition: string;
  colElected: string;
  colHow: string;
  colBallots: string;
  notStarted: string;
  inProgress: string;
  candidates: string;
  ballotHeading: (n: string) => string;
  eligiblePresent: (ip: string, v: string) => string;
  tellerNote: (note: string) => string;
  fifthMotion: string;
  reconsideration: string;
  noMotion: string;
  carried: string;
  defeated: string;
  byHands: (result: string) => string;
  withCounts: (result: string, yes: number, no: number) => string;
  minorityOpinion: string;
  drawnByLot: (mode: string) => string;
  digitalDraw: string;
  physicalHat: string;
  electedIs: string;
  attendance: string;
  attendanceNote: (present: number, voting: number, ip: number, v: number) => string;
  colName: string;
  colRole: string;
  colGroup: string;
  colAttending: string;
  colVoting: string;
  yes: string;
  no: string;
  motions: string;
  motionsNote: string;
  colMotion: string;
  colMoved: string;
  colResult: string;
  colVotes: string;
  colThreshold: string;
  motionStatus: Record<'open' | 'carried' | 'defeated' | 'tabled' | 'withdrawn' | 'recommitted', string>;
  abstain: string;
  quorumNotMet: string;
  minorityHeard: (side: string, notes: string) => string;
  sideFor: string;
  sideAgainst: string;
  conference: string;
  conferenceNote: string;
  colItem: string;
  colChoice: string;
  colClock: string;
  agendaKinds: Record<'segment' | 'report' | 'break' | 'meal' | 'election' | 'motion' | 'conference' | 'workshop', string>;
  motionKinds: Record<'main' | 'committee' | 'amend' | 'table' | 'recommit' | 'callQuestion' | 'reconsider' | 'floor' | 'decline', string>;
  thresholds: Record<'twoThirds' | 'simpleMajority' | 'threeQuarters', string>;
  sense: {
    unanimity: (label: string, pct: number) => string;
    majority: (label: string, pct: number) => string;
    plurality: (label: string, pct: number) => string;
    tied: string;
  };
  colCommittee: string;
  colSense: string;
  senseNone: string;
  notesLabel: string;
  delegateNote: string;
  agenda: string;
  colPlanned: string;
  colActual: string;
  auditLog: string;
  auditNote: string;
  certifiedBy: string;
  roles: Record<'chair' | 'secretary' | 'teller', string>;
  producedBy: (version: string, when: string) => string;
  minutes: string;
}

const EN: ReportDict = {
  locale: 'en-US',
  reportTitle: 'Report',
  chairLabel: 'Chair',
  procedure: 'Third Legacy Procedure',
  invalidIn: 'Total vote includes blank / invalid ballots',
  invalidOut: 'Total vote counts valid votes only',
  tieAll: 'Ties for smallest total after 4th ballot: all withdrawn',
  tieNone: 'Ties for smallest total after 4th ballot: none withdrawn',
  singleConfirm: 'Single candidate: yes/no ballot, two-thirds required',
  singleDeclared: 'Single candidate: declared elected',
  officials: {
    secretary: 'Secretary',
    registrar: 'Registrar',
    tellers: 'Tellers',
    collectors: 'Ballot collectors',
    recorder: 'Recorder / tally',
    virtualTeller: 'Virtual teller',
    techHost: 'Tech host',
  },
  approvals: { procedure: 'Election procedure', whoVotes: 'Who votes', order: 'Order of election' },
  approvedAt: (when) => `approved ${when}`,
  notRecorded: 'approval not recorded',
  summary: 'Summary of the elections',
  colPosition: 'Position',
  colElected: 'Elected',
  colHow: 'How',
  colBallots: 'Ballots',
  notStarted: 'Not started',
  inProgress: 'In progress / not filled',
  candidates: 'Candidates',
  ballotHeading: (n) => `${n} ballot`,
  eligiblePresent: (ip, v) => `Eligible voters present: ${ip} in person, ${v} virtual.`,
  tellerNote: (note) => ` Teller note: ${note}`,
  fifthMotion: 'Fifth-ballot motion',
  reconsideration: 're-vote after reconsideration',
  noMotion: 'no motion / not seconded',
  carried: 'carried',
  defeated: 'defeated',
  byHands: (r) => `${r} by visual count of hands`,
  withCounts: (r, yes, no) => `${r} — yes ${yes}, no ${no}`,
  minorityOpinion: 'minority opinion',
  drawnByLot: (mode) => `Drawn by lot (${mode})`,
  digitalDraw: 'digital draw',
  physicalHat: 'physical hat',
  electedIs: 'Elected',
  attendance: 'Attendance',
  attendanceNote: (present, voting, ip, v) =>
    `${present} present — ${voting} voting (${ip} in person, ${v} virtual). Alternates vote only when the member they stand in for is absent; nobody votes twice.`,
  colName: 'Name',
  colRole: 'Role',
  colGroup: 'Group / district',
  colAttending: 'Attending',
  colVoting: 'Voting',
  yes: 'yes',
  no: 'no',
  motions: 'Motions and other business',
  motionsNote:
    'Matters of policy carry on substantial unanimity — two-thirds of the members voting, provided the total vote is a quorum. The side that did not prevail is always invited to speak.',
  colMotion: 'Motion',
  colMoved: 'Moved / seconded',
  colResult: 'Result',
  colVotes: 'Yes / No / Abstain',
  colThreshold: 'Needed',
  motionStatus: {
    open: 'on the floor',
    carried: 'carried',
    defeated: 'defeated',
    tabled: 'tabled',
    withdrawn: 'withdrawn',
    recommitted: 'recommitted',
  },
  abstain: 'abstain',
  quorumNotMet: 'quorum not met',
  minorityHeard: (side, notes) => `Minority (${side}) heard${notes ? `: ${notes}` : ''}`,
  sideFor: 'those in favour',
  sideAgainst: 'those against',
  conference: 'General Service Conference agenda items',
  conferenceNote:
    'The sense of the assembly on each item, taken to inform the delegate. At the Conference the delegate votes their conscience after hearing all the sharing.',
  colItem: 'Agenda item',
  colChoice: 'Choice',
  colClock: 'Time',
  agendaKinds: {
    segment: 'Business',
    report: 'Report',
    break: 'Break',
    meal: 'Meal',
    election: 'Election',
    motion: 'Motions',
    conference: 'Conference items',
    workshop: 'Workshop / sharing',
  },
  motionKinds: {
    main: 'Main motion',
    committee: 'Committee recommendation',
    amend: 'Amendment',
    table: 'Motion to table',
    recommit: 'Motion to recommit',
    callQuestion: 'Call the question',
    reconsider: 'Motion to reconsider',
    floor: 'Floor action',
    decline: 'Decline to consider',
  },
  thresholds: { twoThirds: 'Two-thirds (substantial unanimity)', simpleMajority: 'Simple majority', threeQuarters: 'Three-quarters' },
  sense: {
    unanimity: (label, pct) => `${label} — substantial unanimity (${pct}% of votes cast)`,
    majority: (label, pct) => `${label} — simple majority only (${pct}%), short of two-thirds`,
    plurality: (label, pct) => `${label} leads with ${pct}%, without a majority`,
    tied: 'No clear sense of the assembly — the leading choices are tied',
  },
  colCommittee: 'Committee',
  colSense: 'Sense of the assembly',
  senseNone: 'not polled',
  notesLabel: 'Notes',
  delegateNote: 'For the delegate',
  agenda: 'Agenda of the day',
  colPlanned: 'Planned',
  colActual: 'Actual',
  auditLog: 'Audit log',
  auditNote: 'Every action recorded by the app, in order, including any correction.',
  certifiedBy: 'Certified by',
  roles: { chair: 'Chair', secretary: 'Secretary', teller: 'Teller' },
  producedBy: (version, when) =>
    `Produced by Third Legacy Vote ${version} on ${when} from the records kept during the assembly. The procedure follows The A.A. Service Manual, Appendix G.`,
  minutes: 'min',
};

const ES: ReportDict = {
  locale: 'es-ES',
  reportTitle: 'Acta',
  chairLabel: 'Coordinador(a)',
  procedure: 'Procedimiento del Tercer Legado',
  invalidIn: 'El voto total incluye las papeletas en blanco o nulas',
  invalidOut: 'El voto total cuenta solo los votos válidos',
  tieAll: 'Empate en el total más bajo tras la 4.ª papeleta: todos se retiran',
  tieNone: 'Empate en el total más bajo tras la 4.ª papeleta: no se retira nadie',
  singleConfirm: 'Candidato único: votación sí/no, se requieren dos tercios',
  singleDeclared: 'Candidato único: declarado electo',
  officials: {
    secretary: 'Secretario(a)',
    registrar: 'Registrador(a)',
    tellers: 'Escrutadores',
    collectors: 'Recolectores de papeletas',
    recorder: 'Anotador(a)',
    virtualTeller: 'Escrutador(a) virtual',
    techHost: 'Anfitrión técnico',
  },
  approvals: { procedure: 'Procedimiento de elección', whoVotes: 'Quiénes votan', order: 'Orden de la elección' },
  approvedAt: (when) => `aprobado ${when}`,
  notRecorded: 'aprobación no registrada',
  summary: 'Resumen de las elecciones',
  colPosition: 'Puesto',
  colElected: 'Electo(a)',
  colHow: 'Cómo',
  colBallots: 'Papeletas',
  notStarted: 'No iniciada',
  inProgress: 'En curso / sin cubrir',
  candidates: 'Candidatos',
  ballotHeading: (n) => `${n} papeleta`,
  eligiblePresent: (ip, v) => `Votantes con derecho presentes: ${ip} presenciales, ${v} virtuales.`,
  tellerNote: (note) => ` Nota del escrutador: ${note}`,
  fifthMotion: 'Moción para la quinta papeleta',
  reconsideration: 'nueva votación tras la reconsideración',
  noMotion: 'sin moción / sin secundar',
  carried: 'aprobada',
  defeated: 'rechazada',
  byHands: (r) => `${r} por conteo visual de manos`,
  withCounts: (r, yes, no) => `${r} — sí ${yes}, no ${no}`,
  minorityOpinion: 'opinión de la minoría',
  drawnByLot: (mode) => `Sorteo (${mode})`,
  digitalDraw: 'sorteo digital',
  physicalHat: 'sombrero físico',
  electedIs: 'Electo(a)',
  attendance: 'Asistencia',
  attendanceNote: (present, voting, ip, v) =>
    `${present} presentes — ${voting} con voto (${ip} presenciales, ${v} virtuales). Los suplentes votan solo cuando falta el miembro al que sustituyen; nadie vota dos veces.`,
  colName: 'Nombre',
  colRole: 'Servicio',
  colGroup: 'Grupo / distrito',
  colAttending: 'Asiste',
  colVoting: 'Vota',
  yes: 'sí',
  no: 'no',
  motions: 'Mociones y otros asuntos',
  motionsNote:
    'Los asuntos de política se aprueban por unanimidad sustancial: dos tercios de los miembros que votan, siempre que el voto total constituya quórum. A la parte que no prevaleció siempre se le invita a expresar su opinión.',
  colMotion: 'Moción',
  colMoved: 'Propuesta / secundada',
  colResult: 'Resultado',
  colVotes: 'Sí / No / Abstención',
  colThreshold: 'Necesarios',
  motionStatus: {
    open: 'en el pleno',
    carried: 'aprobada',
    defeated: 'rechazada',
    tabled: 'pospuesta',
    withdrawn: 'retirada',
    recommitted: 'devuelta al comité',
  },
  abstain: 'abstención',
  quorumNotMet: 'sin quórum',
  minorityHeard: (side, notes) => `Se escuchó a la minoría (${side})${notes ? `: ${notes}` : ''}`,
  sideFor: 'los que votaron a favor',
  sideAgainst: 'los que votaron en contra',
  conference: 'Puntos del orden del día de la Conferencia de Servicios Generales',
  conferenceNote:
    'El sentir de la asamblea sobre cada punto, recogido para informar al delegado. En la Conferencia el delegado vota según su conciencia después de escuchar todo lo compartido.',
  colItem: 'Punto del orden del día',
  colChoice: 'Opción',
  colClock: 'Horario',
  agendaKinds: {
    segment: 'Asuntos',
    report: 'Informe',
    break: 'Descanso',
    meal: 'Comida',
    election: 'Elección',
    motion: 'Mociones',
    conference: 'Puntos de la Conferencia',
    workshop: 'Taller / compartimiento',
  },
  motionKinds: {
    main: 'Moción principal',
    committee: 'Recomendación de comité',
    amend: 'Enmienda',
    table: 'Moción para posponer',
    recommit: 'Moción para devolver al comité',
    callQuestion: 'Moción para cerrar el debate',
    reconsider: 'Moción para reconsiderar',
    floor: 'Moción desde el pleno',
    decline: 'Moción para no considerarla',
  },
  thresholds: { twoThirds: 'Dos tercios (unanimidad sustancial)', simpleMajority: 'Mayoría simple', threeQuarters: 'Tres cuartos' },
  sense: {
    unanimity: (label, pct) => `${label}: unanimidad sustancial (${pct}% de los votos emitidos)`,
    majority: (label, pct) => `${label}: solo mayoría simple (${pct}%), sin llegar a los dos tercios`,
    plurality: (label, pct) => `${label} encabeza con el ${pct}%, sin mayoría`,
    tied: 'No hay un sentir claro de la asamblea: las opciones principales están empatadas',
  },
  colCommittee: 'Comité',
  colSense: 'Sentir de la asamblea',
  senseNone: 'sin votar',
  notesLabel: 'Notas',
  delegateNote: 'Para el delegado',
  agenda: 'Orden del día',
  colPlanned: 'Previsto',
  colActual: 'Real',
  auditLog: 'Registro de auditoría',
  auditNote: 'Todas las acciones registradas por la aplicación, en orden, incluidas las correcciones.',
  certifiedBy: 'Certificado por',
  roles: { chair: 'Coordinador(a)', secretary: 'Secretario(a)', teller: 'Escrutador(a)' },
  producedBy: (version, when) =>
    `Generado por Third Legacy Vote ${version} el ${when} a partir de los registros llevados durante la asamblea. El procedimiento sigue el Manual de Servicio de A.A., Apéndice G.`,
  minutes: 'min',
};

const FR: ReportDict = {
  locale: 'fr-FR',
  reportTitle: 'Compte rendu',
  chairLabel: 'Président(e)',
  procedure: 'Procédure du Troisième Héritage',
  invalidIn: 'Le vote total comprend les bulletins blancs ou nuls',
  invalidOut: 'Le vote total ne compte que les votes valides',
  tieAll: 'Égalité au plus faible total après le 4e tour : tous se retirent',
  tieNone: 'Égalité au plus faible total après le 4e tour : personne ne se retire',
  singleConfirm: 'Candidat unique : vote oui/non, deux tiers requis',
  singleDeclared: 'Candidat unique : déclaré élu',
  officials: {
    secretary: 'Secrétaire',
    registrar: 'Responsable des inscriptions',
    tellers: 'Scrutateurs',
    collectors: 'Collecteurs de bulletins',
    recorder: 'Preneur de notes',
    virtualTeller: 'Scrutateur virtuel',
    techHost: 'Hôte technique',
  },
  approvals: { procedure: 'Procédure d’élection', whoVotes: 'Qui vote', order: 'Ordre des élections' },
  approvedAt: (when) => `approuvé ${when}`,
  notRecorded: 'approbation non consignée',
  summary: 'Résumé des élections',
  colPosition: 'Poste',
  colElected: 'Élu(e)',
  colHow: 'Comment',
  colBallots: 'Tours',
  notStarted: 'Non commencée',
  inProgress: 'En cours / non pourvu',
  candidates: 'Candidats',
  ballotHeading: (n) => `${n} tour de scrutin`,
  eligiblePresent: (ip, v) => `Votants admissibles présents : ${ip} sur place, ${v} en ligne.`,
  tellerNote: (note) => ` Note du scrutateur : ${note}`,
  fifthMotion: 'Proposition de cinquième tour',
  reconsideration: 'nouveau vote après reconsidération',
  noMotion: 'aucune proposition / non appuyée',
  carried: 'adoptée',
  defeated: 'rejetée',
  byHands: (r) => `${r} à main levée (décompte visuel)`,
  withCounts: (r, yes, no) => `${r} — oui ${yes}, non ${no}`,
  minorityOpinion: 'opinion minoritaire',
  drawnByLot: (mode) => `Tirage au sort (${mode})`,
  digitalDraw: 'tirage numérique',
  physicalHat: 'chapeau',
  electedIs: 'Élu(e)',
  attendance: 'Présences',
  attendanceNote: (present, voting, ip, v) =>
    `${present} présents — ${voting} votants (${ip} sur place, ${v} en ligne). Les suppléants ne votent que si le membre qu’ils remplacent est absent ; personne ne vote deux fois.`,
  colName: 'Nom',
  colRole: 'Service',
  colGroup: 'Groupe / district',
  colAttending: 'Participe',
  colVoting: 'Vote',
  yes: 'oui',
  no: 'non',
  motions: 'Propositions et autres affaires',
  motionsNote:
    'Les questions de politique sont adoptées par unanimité substantielle : les deux tiers des membres votants, pourvu que le vote total constitue un quorum. La partie qui n’a pas obtenu gain de cause est toujours invitée à s’exprimer.',
  colMotion: 'Proposition',
  colMoved: 'Proposée / appuyée',
  colResult: 'Résultat',
  colVotes: 'Oui / Non / Abstention',
  colThreshold: 'Requis',
  motionStatus: {
    open: 'en délibération',
    carried: 'adoptée',
    defeated: 'rejetée',
    tabled: 'reportée',
    withdrawn: 'retirée',
    recommitted: 'renvoyée au comité',
  },
  abstain: 'abstention',
  quorumNotMet: 'quorum non atteint',
  minorityHeard: (side, notes) => `Minorité (${side}) entendue${notes ? ` : ${notes}` : ''}`,
  sideFor: 'ceux qui étaient pour',
  sideAgainst: 'ceux qui étaient contre',
  conference: 'Points à l’ordre du jour de la Conférence des Services généraux',
  conferenceNote:
    'Le sentiment de l’assemblée sur chaque point, recueilli pour éclairer le délégué. À la Conférence, le délégué vote selon sa conscience après avoir entendu tous les partages.',
  colItem: 'Point à l’ordre du jour',
  colChoice: 'Choix',
  colClock: 'Horaire',
  agendaKinds: {
    segment: 'Affaires',
    report: 'Rapport',
    break: 'Pause',
    meal: 'Repas',
    election: 'Élection',
    motion: 'Propositions',
    conference: 'Points de la Conférence',
    workshop: 'Atelier / partage',
  },
  motionKinds: {
    main: 'Proposition principale',
    committee: 'Recommandation de comité',
    amend: 'Amendement',
    table: 'Proposition de report',
    recommit: 'Proposition de renvoi au comité',
    callQuestion: 'Proposition de clore le débat',
    reconsider: 'Proposition de reconsidérer',
    floor: 'Proposition de l’assemblée',
    decline: 'Proposition de ne pas examiner',
  },
  thresholds: { twoThirds: 'Deux tiers (unanimité substantielle)', simpleMajority: 'Majorité simple', threeQuarters: 'Trois quarts' },
  sense: {
    unanimity: (label, pct) => `${label} — unanimité substantielle (${pct} % des votes exprimés)`,
    majority: (label, pct) => `${label} — majorité simple seulement (${pct} %), en deçà des deux tiers`,
    plurality: (label, pct) => `${label} arrive en tête avec ${pct} %, sans majorité`,
    tied: 'Aucun sentiment clair de l’assemblée — les principaux choix sont à égalité',
  },
  colCommittee: 'Comité',
  colSense: 'Sentiment de l’assemblée',
  senseNone: 'non sondé',
  notesLabel: 'Notes',
  delegateNote: 'Pour le délégué',
  agenda: 'Ordre du jour',
  colPlanned: 'Prévu',
  colActual: 'Réel',
  auditLog: 'Journal',
  auditNote: 'Toutes les actions enregistrées par l’application, dans l’ordre, y compris les corrections.',
  certifiedBy: 'Certifié par',
  roles: { chair: 'Président(e)', secretary: 'Secrétaire', teller: 'Scrutateur' },
  producedBy: (version, when) =>
    `Produit par Third Legacy Vote ${version} le ${when} à partir des registres tenus pendant l’assemblée. La procédure suit Le Manuel du Service chez les AA, annexe G.`,
  minutes: 'min',
};

export const REPORT_DICTS: Record<Language, ReportDict> = { en: EN, es: ES, fr: FR };

export function r(lang: Language): ReportDict {
  return REPORT_DICTS[lang] ?? EN;
}

/** The sense of the assembly, worded in the report's language. */
export function senseText(
  result: { senseKind: 'unanimity' | 'majority' | 'plurality' | 'tied' | null; leading: { label: string; pct: number } | null },
  d: ReportDict,
): string | null {
  const pct = Math.round(result.leading?.pct ?? 0);
  const label = result.leading?.label ?? '';
  switch (result.senseKind) {
    case 'unanimity':
      return d.sense.unanimity(label, pct);
    case 'majority':
      return d.sense.majority(label, pct);
    case 'plurality':
      return d.sense.plurality(label, pct);
    case 'tied':
      return d.sense.tied;
    default:
      return null;
  }
}
