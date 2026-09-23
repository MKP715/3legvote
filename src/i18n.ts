/**
 * Language pack for everything read aloud or shown to the room: the chair's announcements,
 * the opening explanation of the procedure, and the projector display. (The operator screens
 * stay in English.)
 */
import type { ElectionMethod, ElectionType, Language, WithdrawalRule } from './engine/types';

export const LANGUAGES: Record<Language, string> = { en: 'English', es: 'Español', fr: 'Français' };

export function ordinalL(n: number, lang: Language): string {
  if (lang === 'es') return `${n}.ª`;
  if (lang === 'fr') return n === 1 ? '1er' : `${n}e`;
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function listL(names: string[], lang: Language): string {
  const and = lang === 'es' ? 'y' : lang === 'fr' ? 'et' : 'and';
  if (names.length <= 1) return names.join('');
  if (names.length === 2) return `${names[0]} ${and} ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}${lang === 'en' ? ',' : ''} ${and} ${names[names.length - 1]}`;
}

export function sentence(text: string): string {
  return /[.!?»]$/.test(text) ? text : `${text}.`;
}

type Dict = {
  ballot: (n: number) => string;
  finalBallot: string;
  confirmationBallot: string;
  resultsHeader: (n: string, title: string, cast: number, ip: number, v: number, inv: number) => string;
  totalVote: (t: number, th: number) => string;
  yesFor: (name: string) => string;
  no: string;
  elected: (name: string, title: string) => string;
  notConfirmed: (name: string) => string;
  noTwoThirds: string;
  fracName: (rule: 'oneFifth' | 'oneThird') => string;
  withdrawnRule: (frac: string, limit: string, names: string) => string;
  noneWithdrawnRule: (frac: string, limit: string) => string;
  keptTopTwo: (names: string, plural: boolean) => string;
  lowestWithdrawn: (names: string, plural: boolean) => string;
  lowestTieNone: string;
  nominations: (title: string) => string[];
  nextBallot: (n: string, title: string, names: string) => string;
  writeOne: string;
  fifthFinal: string;
  mayWithdraw: string;
  onlyCandidate: (name: string, title: string) => string[];
  motion: (names: string) => string[];
  hatDefeated: string;
  hatFifth: string;
  hatNames: (names: string, title: string) => string;
  electedMethod: (name: string, title: string, method: string) => string;
  allWithdrawn: (title: string) => string;
  methods: Record<ElectionMethod, string>;
  rules: Record<WithdrawalRule, string>;
  // display / board
  totalVoteLabel: string;
  twoThirdsLabel: string;
  ballotsCastLabel: string;
  electedLabel: (title: string) => string;
  candidate: string;
  status: string;
  standing: string;
  electedStatus: string;
  notElected: string;
  withdrewBefore: string;
  withdrewAfter: (n: string) => string;
  withdrawnAfter: (n: string, rule: string) => string;
  blankInvalid: string;
  neededToElect: string;
  withdrawalRule: string;
  topTwo: string;
  withdrawnTag: string;
  electedTag: string;
  splitNote: string;
  votingOpen: (ballot: string, color: string | null) => string;
  counting: string;
  drawing: string;
  waiting: string;
  nominationsBanner: (names: string) => string;
  writeOneBanner: (ballot: string, names: string) => string;
  confirmationBanner: (name: string) => string;
  motionBanner: string;
  hatBanner: (names: string) => string;
  notFilled: string;
  noCandidates: string;
  inPerson: string;
  virtual: string;
  opening: (title: string, whoVotes: string, colors: string) => string[];
  // extra projector labels
  positionOf: (n: number, total: number) => string;
  turnoutLabel: string;
  eligibleLabel: string;
  electedSoFar: string;
  comingUp: string;
  needToElect: (need: number, total: number) => string;
  withdrawHint: (frac: string, limit: string) => string;
  notYetHeld: string;
  locale: string;
};

const EN: Dict = {
  ballot: (n) => `${ordinalL(n, 'en')} ballot`,
  finalBallot: 'final',
  confirmationBallot: 'confirmation ballot',
  resultsHeader: (n, title, cast, ip, v, inv) =>
    `Results of the ${n} for ${title}: ${cast} ballot${cast === 1 ? '' : 's'} cast — ${ip} in person and ${v} virtual` +
    (inv ? `, of which ${inv} ${inv === 1 ? 'was' : 'were'} blank or invalid` : '') +
    '.',
  totalVote: (t, th) => `The total vote is ${t}. Two-thirds of the total vote is ${th}.`,
  yesFor: (n) => `Yes (${n})`,
  no: 'No',
  elected: (name, title) => sentence(`${name} has received two-thirds of the total vote and is elected ${title}`),
  notConfirmed: (name) => `${name} did not receive two-thirds of the total vote and is not elected.`,
  noTwoThirds: 'No candidate has received two-thirds of the total vote.',
  fracName: (r) => (r === 'oneFifth' ? 'one-fifth' : 'one-third'),
  withdrawnRule: (frac, limit, names) => sentence(`Candidates with less than ${frac} of the total vote (fewer than ${limit} votes) are automatically withdrawn: ${names}`),
  noneWithdrawnRule: (frac, limit) => `No candidates are withdrawn under the ${frac} rule (fewer than ${limit} votes).`,
  keptTopTwo: (names, plural) => `${names} ${plural ? 'are below the limit but remain as' : 'is below the limit but remains as one of'} the top two candidates.`,
  lowestWithdrawn: (names, plural) => sentence(`The candidate${plural ? 's' : ''} with the smallest total ${plural ? 'are' : 'is'} automatically withdrawn: ${names}`),
  lowestTieNone: 'Candidates are tied for the smallest total; under this assembly’s settings no one is withdrawn.',
  nominations: (title) => [
    `Nominations for ${title}. The names of eligible candidates are posted; anyone unable to serve may ask to have their name removed.`,
    'When nominations are closed, each voter writes one name on a ballot.',
  ],
  nextBallot: (n, title, names) => sentence(`We will now take the ${n} for ${title}. The candidates are ${names}`),
  writeOne: 'Please write one name only. In-person voters hand ballots to the tellers; virtual voters use the online poll.',
  fifthFinal: 'This is the fifth and final ballot. If no one receives two-thirds, the choice will be made by lot.',
  mayWithdraw: 'Any candidate who wishes to withdraw may do so now.',
  onlyCandidate: (name, title) => [`${name} is the only candidate for ${title}.`, 'Voters will vote YES or NO. Two-thirds of the total vote is required to elect.'],
  motion: (names) => [
    sentence(`No candidate has been elected after four ballots. The remaining candidates are ${names}`),
    'The chair will entertain a motion for a fifth and final ballot. It requires a second and a simple majority of hands.',
    'If the motion is defeated, balloting is over and the choice is made by lot — “going to the hat” — immediately.',
  ],
  hatDefeated: 'The motion for a fifth ballot has been defeated. The choice will be made by lot.',
  hatFifth: 'No candidate received two-thirds on the fifth ballot. The choice will be made by lot.',
  hatNames: (names, title) => `The names of ${names} will be placed in the hat. The first name drawn out of the hat is elected ${title}.`,
  electedMethod: (name, title, method) => `${sentence(`${name} is elected ${title}`)} ${method}.`,
  allWithdrawn: (title) => `All candidates for ${title} have withdrawn. Reset the position to reopen nominations.`,
  methods: {
    ballot: 'Elected by two-thirds vote',
    confirmation: 'Elected on a confirmation ballot (two-thirds “yes”)',
    unopposed: 'Elected unopposed (only remaining candidate)',
    hat: 'Chosen by lot (“from the hat”)',
    hatSecondDraw: 'Second name drawn from the hat',
  },
  rules: {
    oneFifth: 'less than one-fifth of the total vote (after 2nd ballot)',
    oneThird: 'less than one-third of the total vote (after 3rd ballot)',
    lowest: 'smallest total (after 4th ballot)',
  },
  totalVoteLabel: 'Total vote',
  twoThirdsLabel: '⅔ to elect',
  ballotsCastLabel: 'Ballots cast',
  electedLabel: (t) => `Elected ${t}`,
  candidate: 'Candidate',
  status: 'Status',
  standing: 'Standing',
  electedStatus: 'Elected',
  notElected: 'Not elected',
  withdrewBefore: 'Withdrew before voting',
  withdrewAfter: (n) => `Withdrew after ${n}`,
  withdrawnAfter: (n, rule) => `Withdrawn after ${n} (${rule})`,
  blankInvalid: 'Blank / invalid',
  neededToElect: '⅔ needed to elect',
  withdrawalRule: 'Withdrawal rule',
  topTwo: 'top two',
  withdrawnTag: 'withdrawn',
  electedTag: 'elected',
  splitNote: 'Small figures: in-person / virtual.',
  votingOpen: (b, c) => `Voting is open — ${b}${c ? ` · ${c} ballot` : ''}`,
  counting: 'Voting is closed — the tellers are counting',
  drawing: 'Drawing from the hat…',
  waiting: 'Waiting for the chair to begin an election…',
  nominationsBanner: (n) => `Nominations — ${n || 'no candidates yet'}`,
  writeOneBanner: (b, n) => `${b} — write ONE name: ${n}`,
  confirmationBanner: (n) => `Confirmation ballot — ${n}: YES or NO`,
  motionBanner: 'Motion for a fifth and final ballot — simple majority of hands',
  hatBanner: (n) => `Going to the hat: ${n}`,
  notFilled: 'Not elected — the position remains open',
  noCandidates: 'All candidates have withdrawn',
  inPerson: 'in person',
  virtual: 'virtual',
  positionOf: (n, total) => `Position ${n} of ${total}`,
  turnoutLabel: 'Turnout',
  eligibleLabel: 'Eligible voters',
  electedSoFar: 'Elected so far',
  comingUp: 'Still to elect',
  needToElect: (need, total) => `${need} of ${total} votes elects`,
  withdrawHint: (frac, limit) => `Under ${limit} (${frac}) is withdrawn after this ballot`,
  notYetHeld: 'not yet held',
  locale: 'en',
  opening: (title, whoVotes, colors) => [
    `We will now elect our ${title} using the Third Legacy Procedure, as described in The A.A. Service Manual.`,
    `Who votes: ${whoVotes}`,
    'The names of eligible candidates are posted. Each voter writes ONE name per ballot — in the room on the paper ballot, online in the poll. The in-person and virtual votes are added together.',
    'The first candidate to receive two-thirds of the total vote is elected.',
    'After the second ballot, any candidate with less than one-fifth of the total vote is automatically withdrawn; after the third ballot, anyone with less than one-third. The top two candidates always remain.',
    'After the fourth ballot, the candidate with the smallest total is withdrawn, and the chair asks for a motion, a second, and a simple majority of hands on a fifth and final ballot. If the motion is defeated — or if no one is elected on the fifth ballot — the choice is made by lot: the top two names go into the hat and the first name drawn is elected.',
    ...(colors ? [`Ballot colours, in order: ${colors}.`] : []),
    'Candidates may withdraw at any time. Is there anyone whose name is posted who is unable to serve?',
  ],
};

const ES: Dict = {
  ballot: (n) => `${ordinalL(n, 'es')} votación`,
  finalBallot: 'final',
  confirmationBallot: 'votación de confirmación',
  resultsHeader: (n, title, cast, ip, v, inv) =>
    `Resultados de la ${n} para ${title}: ${cast} papeleta${cast === 1 ? '' : 's'} — ${ip} en persona y ${v} virtuales` +
    (inv ? `; ${inv} en blanco o nula${inv === 1 ? '' : 's'}` : '') +
    '.',
  totalVote: (t, th) => `El total de votos es ${t}. Los dos tercios del total son ${th}.`,
  yesFor: (n) => `Sí (${n})`,
  no: 'No',
  elected: (name, title) => sentence(`${name} ha recibido dos tercios del total de votos y queda elegido/a ${title}`),
  notConfirmed: (name) => `${name} no recibió dos tercios del total de votos y no queda elegido/a.`,
  noTwoThirds: 'Ningún candidato ha recibido dos tercios del total de votos.',
  fracName: (r) => (r === 'oneFifth' ? 'un quinto' : 'un tercio'),
  withdrawnRule: (frac, limit, names) => sentence(`Los candidatos con menos de ${frac} del total de votos (menos de ${limit} votos) se retiran automáticamente: ${names}`),
  noneWithdrawnRule: (frac, limit) => `Nadie se retira por la regla de ${frac} (menos de ${limit} votos).`,
  keptTopTwo: (names, plural) => `${names} ${plural ? 'quedan por debajo del límite pero permanecen como' : 'queda por debajo del límite pero permanece como uno de'} los dos candidatos principales.`,
  lowestWithdrawn: (names, plural) => sentence(`${plural ? 'Los candidatos' : 'El candidato'} con el total más bajo se retira${plural ? 'n' : ''} automáticamente: ${names}`),
  lowestTieNone: 'Hay empate en el total más bajo; según las normas de esta asamblea nadie se retira.',
  nominations: (title) => [
    `Nominaciones para ${title}. Se anotan los nombres de los candidatos elegibles; quien no pueda servir puede pedir que se retire su nombre.`,
    'Al cerrar las nominaciones, cada votante escribe un solo nombre en la papeleta.',
  ],
  nextBallot: (n, title, names) => sentence(`Procedemos a la ${n} para ${title}. Los candidatos son ${names}`),
  writeOne: 'Escriban un solo nombre. En la sala, entreguen la papeleta a los escrutadores; los votantes virtuales usan la encuesta en línea.',
  fifthFinal: 'Esta es la quinta y última votación. Si nadie recibe dos tercios, la elección se hará por sorteo.',
  mayWithdraw: 'Cualquier candidato que desee retirarse puede hacerlo ahora.',
  onlyCandidate: (name, title) => [`${name} es el único candidato para ${title}.`, 'Se votará SÍ o NO. Se requieren dos tercios del total de votos para elegir.'],
  motion: (names) => [
    sentence(`Nadie ha sido elegido después de cuatro votaciones. Los candidatos que quedan son ${names}`),
    'La presidencia acepta una moción para una quinta y última votación. Requiere apoyo y mayoría simple a mano alzada.',
    'Si la moción no se aprueba, termina la votación y la elección se hace por sorteo — “al sombrero” — de inmediato.',
  ],
  hatDefeated: 'La moción para una quinta votación no fue aprobada. La elección se hará por sorteo.',
  hatFifth: 'Nadie recibió dos tercios en la quinta votación. La elección se hará por sorteo.',
  hatNames: (names, title) => `Los nombres de ${names} se colocan en el sombrero. El primer nombre que se saque queda elegido ${title}.`,
  electedMethod: (name, title, method) => `${sentence(`${name} queda elegido/a ${title}`)} ${method}.`,
  allWithdrawn: (title) => `Todos los candidatos para ${title} se han retirado.`,
  methods: {
    ballot: 'Elegido/a por dos tercios de los votos',
    confirmation: 'Elegido/a en votación de confirmación (dos tercios “sí”)',
    unopposed: 'Elegido/a sin oposición',
    hat: 'Elegido/a por sorteo (“del sombrero”)',
    hatSecondDraw: 'Segundo nombre sacado del sombrero',
  },
  rules: {
    oneFifth: 'menos de un quinto del total (después de la 2.ª votación)',
    oneThird: 'menos de un tercio del total (después de la 3.ª votación)',
    lowest: 'total más bajo (después de la 4.ª votación)',
  },
  totalVoteLabel: 'Total de votos',
  twoThirdsLabel: '⅔ para elegir',
  ballotsCastLabel: 'Papeletas',
  electedLabel: (t) => `Elegido/a ${t}`,
  candidate: 'Candidato',
  status: 'Estado',
  standing: 'En la lista',
  electedStatus: 'Elegido/a',
  notElected: 'No elegido/a',
  withdrewBefore: 'Se retiró antes de votar',
  withdrewAfter: (n) => `Se retiró después de la ${n}`,
  withdrawnAfter: (n, rule) => `Retirado/a después de la ${n} (${rule})`,
  blankInvalid: 'En blanco / nulas',
  neededToElect: '⅔ para elegir',
  withdrawalRule: 'Regla de retiro',
  topTwo: 'dos primeros',
  withdrawnTag: 'retirado',
  electedTag: 'elegido',
  splitNote: 'Cifras pequeñas: en persona / virtual.',
  votingOpen: (b, c) => `Votación abierta — ${b}${c ? ` · papeleta ${c}` : ''}`,
  counting: 'Votación cerrada — los escrutadores están contando',
  drawing: 'Sacando del sombrero…',
  waiting: 'Esperando que la presidencia comience una elección…',
  nominationsBanner: (n) => `Nominaciones — ${n || 'sin candidatos todavía'}`,
  writeOneBanner: (b, n) => `${b} — escriba UN nombre: ${n}`,
  confirmationBanner: (n) => `Votación de confirmación — ${n}: SÍ o NO`,
  motionBanner: 'Moción para una quinta y última votación — mayoría simple a mano alzada',
  hatBanner: (n) => `Al sombrero: ${n}`,
  notFilled: 'No elegido — el cargo sigue vacante',
  noCandidates: 'Todos los candidatos se han retirado',
  inPerson: 'en persona',
  virtual: 'virtuales',
  positionOf: (n, total) => `Cargo ${n} de ${total}`,
  turnoutLabel: 'Participación',
  eligibleLabel: 'Votantes elegibles',
  electedSoFar: 'Elegidos hasta ahora',
  comingUp: 'Faltan por elegir',
  needToElect: (need, total) => `${need} de ${total} votos eligen`,
  withdrawHint: (frac, limit) => `Menos de ${limit} (${frac}) se retira después de esta votación`,
  notYetHeld: 'aún no se ha votado',
  locale: 'es',
  opening: (title, whoVotes, colors) => [
    `Vamos a elegir ${title} mediante el Procedimiento del Tercer Legado, descrito en El Manual de Servicio de A.A.`,
    `Quién vota: ${whoVotes}`,
    'Se anotan los nombres de los candidatos elegibles. Cada votante escribe UN nombre por votación — en la sala en la papeleta, en línea en la encuesta. Los votos en persona y virtuales se suman.',
    'El primer candidato que reciba dos tercios del total de votos queda elegido.',
    'Después de la segunda votación se retira automáticamente a quien tenga menos de un quinto del total; después de la tercera, a quien tenga menos de un tercio. Los dos candidatos principales siempre permanecen.',
    'Después de la cuarta votación se retira al candidato con el total más bajo y se pide una moción, apoyo y mayoría simple a mano alzada para una quinta y última votación. Si la moción no se aprueba — o si nadie es elegido en la quinta votación — la elección se hace por sorteo: los dos nombres principales van al sombrero y el primero que se saque queda elegido.',
    ...(colors ? [`Colores de las papeletas, en orden: ${colors}.`] : []),
    'Los candidatos pueden retirarse en cualquier momento. ¿Hay alguien en la lista que no pueda servir?',
  ],
};

const FR: Dict = {
  ballot: (n) => `${ordinalL(n, 'fr')} tour de scrutin`,
  finalBallot: 'dernier',
  confirmationBallot: 'scrutin de confirmation',
  resultsHeader: (n, title, cast, ip, v, inv) =>
    `Résultats du ${n} pour ${title} : ${cast} bulletin${cast === 1 ? '' : 's'} — ${ip} en personne et ${v} en ligne` +
    (inv ? `, dont ${inv} blanc${inv === 1 ? '' : 's'} ou nul${inv === 1 ? '' : 's'}` : '') +
    '.',
  totalVote: (t, th) => `Le total des voix est de ${t}. Les deux tiers du total sont ${th}.`,
  yesFor: (n) => `Oui (${n})`,
  no: 'Non',
  elected: (name, title) => sentence(`${name} a obtenu les deux tiers du total des voix et est élu(e) ${title}`),
  notConfirmed: (name) => `${name} n’a pas obtenu les deux tiers du total des voix et n’est pas élu(e).`,
  noTwoThirds: 'Aucun candidat n’a obtenu les deux tiers du total des voix.',
  fracName: (r) => (r === 'oneFifth' ? 'un cinquième' : 'un tiers'),
  withdrawnRule: (frac, limit, names) => sentence(`Les candidats ayant moins d’${frac} du total des voix (moins de ${limit} voix) sont retirés automatiquement : ${names}`),
  noneWithdrawnRule: (frac, limit) => `Personne n’est retiré selon la règle d’${frac} (moins de ${limit} voix).`,
  keptTopTwo: (names, plural) => `${names} ${plural ? 'sont sous la limite mais restent comme' : 'est sous la limite mais reste parmi'} les deux premiers candidats.`,
  lowestWithdrawn: (names, plural) => sentence(`${plural ? 'Les candidats ayant' : 'Le candidat ayant'} le plus petit total ${plural ? 'sont retirés' : 'est retiré'} automatiquement : ${names}`),
  lowestTieNone: 'Égalité pour le plus petit total ; selon les règles de cette assemblée, personne n’est retiré.',
  nominations: (title) => [
    `Mises en candidature pour ${title}. Les noms des candidats admissibles sont affichés ; toute personne ne pouvant servir peut demander le retrait de son nom.`,
    'Une fois les candidatures closes, chaque votant inscrit un seul nom sur son bulletin.',
  ],
  nextBallot: (n, title, names) => sentence(`Nous procédons au ${n} pour ${title}. Les candidats sont ${names}`),
  writeOne: 'Inscrivez un seul nom. Dans la salle, remettez votre bulletin aux scrutateurs ; en ligne, utilisez le sondage.',
  fifthFinal: 'Ceci est le cinquième et dernier tour. Si personne n’obtient les deux tiers, le choix se fera par tirage au sort.',
  mayWithdraw: 'Tout candidat qui souhaite se retirer peut le faire maintenant.',
  onlyCandidate: (name, title) => [`${name} est le seul candidat pour ${title}.`, 'Vous voterez OUI ou NON. Les deux tiers du total des voix sont nécessaires pour élire.'],
  motion: (names) => [
    sentence(`Personne n’a été élu après quatre tours. Les candidats restants sont ${names}`),
    'La présidence accepte une proposition pour un cinquième et dernier tour. Elle doit être appuyée et adoptée à la majorité simple à main levée.',
    'Si la proposition est rejetée, le vote est terminé et le choix se fait immédiatement par tirage au sort — « au chapeau ».',
  ],
  hatDefeated: 'La proposition d’un cinquième tour a été rejetée. Le choix se fera par tirage au sort.',
  hatFifth: 'Personne n’a obtenu les deux tiers au cinquième tour. Le choix se fera par tirage au sort.',
  hatNames: (names, title) => `Les noms de ${names} sont placés dans le chapeau. Le premier nom tiré est élu ${title}.`,
  electedMethod: (name, title, method) => `${sentence(`${name} est élu(e) ${title}`)} ${method}.`,
  allWithdrawn: (title) => `Tous les candidats pour ${title} se sont retirés.`,
  methods: {
    ballot: 'Élu(e) aux deux tiers des voix',
    confirmation: 'Élu(e) par scrutin de confirmation (deux tiers « oui »)',
    unopposed: 'Élu(e) sans opposition',
    hat: 'Choisi(e) par tirage au sort (« au chapeau »)',
    hatSecondDraw: 'Deuxième nom tiré du chapeau',
  },
  rules: {
    oneFifth: 'moins d’un cinquième du total (après le 2e tour)',
    oneThird: 'moins d’un tiers du total (après le 3e tour)',
    lowest: 'plus petit total (après le 4e tour)',
  },
  totalVoteLabel: 'Total des voix',
  twoThirdsLabel: '⅔ pour élire',
  ballotsCastLabel: 'Bulletins',
  electedLabel: (t) => `Élu(e) ${t}`,
  candidate: 'Candidat',
  status: 'Statut',
  standing: 'En lice',
  electedStatus: 'Élu(e)',
  notElected: 'Non élu(e)',
  withdrewBefore: 'Retiré(e) avant le vote',
  withdrewAfter: (n) => `Retiré(e) après le ${n}`,
  withdrawnAfter: (n, rule) => `Retiré(e) après le ${n} (${rule})`,
  blankInvalid: 'Blancs / nuls',
  neededToElect: '⅔ pour élire',
  withdrawalRule: 'Règle de retrait',
  topTwo: 'deux premiers',
  withdrawnTag: 'retiré',
  electedTag: 'élu',
  splitNote: 'Petits chiffres : en personne / en ligne.',
  votingOpen: (b, c) => `Le vote est ouvert — ${b}${c ? ` · bulletin ${c}` : ''}`,
  counting: 'Le vote est clos — les scrutateurs comptent',
  drawing: 'Tirage au sort…',
  waiting: 'En attente du début d’une élection…',
  nominationsBanner: (n) => `Candidatures — ${n || 'aucun candidat pour l’instant'}`,
  writeOneBanner: (b, n) => `${b} — inscrivez UN nom : ${n}`,
  confirmationBanner: (n) => `Scrutin de confirmation — ${n} : OUI ou NON`,
  motionBanner: 'Proposition d’un cinquième et dernier tour — majorité simple à main levée',
  hatBanner: (n) => `Au chapeau : ${n}`,
  notFilled: 'Non élu — le poste reste vacant',
  noCandidates: 'Tous les candidats se sont retirés',
  inPerson: 'en personne',
  virtual: 'en ligne',
  positionOf: (n, total) => `Poste ${n} sur ${total}`,
  turnoutLabel: 'Participation',
  eligibleLabel: 'Votants admissibles',
  electedSoFar: 'Élus jusqu’ici',
  comingUp: 'Restent à élire',
  needToElect: (need, total) => `${need} voix sur ${total} élisent`,
  withdrawHint: (frac, limit) => `Moins de ${limit} (${frac}) est retiré après ce tour`,
  notYetHeld: 'pas encore tenu',
  locale: 'fr',
  opening: (title, whoVotes, colors) => [
    `Nous allons élire ${title} selon la Procédure du Troisième Legs décrite dans Le Manuel du service des AA.`,
    `Qui vote : ${whoVotes}`,
    'Les noms des candidats admissibles sont affichés. Chaque votant inscrit UN seul nom par tour — dans la salle sur le bulletin, en ligne dans le sondage. Les voix en personne et en ligne sont additionnées.',
    'Le premier candidat qui obtient les deux tiers du total des voix est élu.',
    'Après le deuxième tour, tout candidat ayant moins d’un cinquième du total est retiré automatiquement ; après le troisième, moins d’un tiers. Les deux premiers candidats restent toujours.',
    'Après le quatrième tour, le candidat ayant le plus petit total est retiré, et la présidence demande une proposition, un appui et la majorité simple à main levée pour un cinquième et dernier tour. Si la proposition est rejetée — ou si personne n’est élu au cinquième tour — le choix se fait par tirage au sort : les deux premiers noms vont dans le chapeau et le premier nom tiré est élu.',
    ...(colors ? [`Couleurs des bulletins, dans l’ordre : ${colors}.`] : []),
    'Les candidats peuvent se retirer à tout moment. Y a-t-il une personne inscrite qui ne peut pas servir ?',
  ],
};

/**
 * Who votes, in the language the chair is reading. English comes from the presets; these are
 * the same sentences for the Spanish and French opening scripts.
 */
const WHO_VOTES: Record<Exclude<Language, 'en'>, Record<ElectionType, string>> = {
  es: {
    area: 'los RSG, los MCD y los miembros del comité de área — incluidos los oficiales del área — según las guías del área. Los suplentes votan solo cuando la persona a la que sustituyen está ausente.',
    district: 'los RSG de los grupos del distrito, y los oficiales del distrito cuando las guías del distrito les dan voto (los RSG suplentes votan cuando su RSG está ausente).',
    areaTrusteeCandidate: 'los miembros votantes de la asamblea de área (RSG, MCD y miembros del comité de área, incluidos los oficiales).',
    regionalTrustee:
      'los delegados de la región, más un número igual de votantes — la mitad del Comité de Custodios de la Conferencia y la mitad del Comité de Nombramientos de los custodios.',
    trusteeAtLarge: 'todos los delegados del país que nomina (EE. UU. o Canadá) y todos los miembros del Comité de Nombramientos de los custodios.',
    intergroup: 'los representantes de intergrupo y los miembros del comité directivo (los suplentes votan cuando su representante está ausente).',
    custom: 'los miembros votantes según las guías de esta entidad de servicio.',
  },
  fr: {
    area: 'les RSG, les MCD et les membres du comité de région — y compris les officiers — selon les lignes de conduite de la région. Un substitut ne vote que si la personne qu’il remplace est absente.',
    district: 'les RSG des groupes du district, et les officiers du district lorsque les lignes de conduite leur accordent un vote (le RSG substitut vote si le RSG est absent).',
    areaTrusteeCandidate: 'les membres votants de l’assemblée régionale (RSG, MCD et membres du comité de région, y compris les officiers).',
    regionalTrustee:
      'les délégués de la région, plus un nombre égal de votants — une moitié du comité des Serviteurs de confiance de la Conférence et une moitié du comité des mises en candidature des Serviteurs de confiance.',
    trusteeAtLarge:
      'tous les délégués du pays qui propose (États-Unis ou Canada) et tous les membres du comité des mises en candidature des Serviteurs de confiance.',
    intergroup: 'les représentants d’intergroupe et les membres du comité directeur (un substitut vote si son représentant est absent).',
    custom: 'les membres votants définis par les lignes de conduite de cette entité de service.',
  },
};

export function whoVotesL(type: ElectionType, lang: Language, english: string): string {
  return lang === 'en' ? english : (WHO_VOTES[lang]?.[type] ?? english);
}

export const DICTS: Record<Language, Dict> = { en: EN, es: ES, fr: FR };
export const t = (lang: Language | undefined): Dict => DICTS[lang ?? 'en'] ?? EN;
