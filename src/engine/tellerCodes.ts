/**
 * Codes that let tellers count on their own phones or laptops with no server:
 *
 *  1. The chair's screen shows a QR code / link containing the ballot setup (the candidates
 *     on the board, the channel, and a random key for this ballot).
 *  2. A teller opens it, taps once per ballot paper (or poll answer), then shows a report code
 *     (text + QR).
 *  3. The chair pastes or scans the report; its counts are added to that ballot. The key stops
 *     a report from being added to the wrong ballot, and the report id stops it being added twice.
 */
import { CHANNELS, type Channel } from './types';

export interface TellerSetup {
  v: 1;
  k: string; // ballot key
  a: string; // assembly name
  p: string; // position title
  n: number; // ballot number
  ch: Channel;
  conf: boolean;
  o: [string, string][]; // [id, label]
  col?: string; // ballot colour
}

export interface TellerResult {
  v: 1;
  k: string;
  r: string; // report id
  t: string; // teller name
  ch: Channel;
  c: number[]; // counts in option order
  i: number; // invalid
}

const PREFIX_SETUP = 'TLS1.';
const PREFIX_RESULT = 'TLR1.';
const PREFIX_CHECKIN = 'TLC1.';

function toB64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Tiny checksum so a mistyped/truncated code is rejected instead of silently mis-read. */
function checksum(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).slice(0, 4).padStart(4, '0');
}

function encode(prefix: string, obj: unknown): string {
  const body = toB64Url(JSON.stringify(obj));
  return `${prefix}${body}.${checksum(body)}`;
}

function decode<T>(prefix: string, code: string, what = 'a Third Legacy teller code'): T {
  const clean = code.trim().replace(/\s+/g, '');
  const at = clean.indexOf(prefix);
  if (at < 0) throw new Error(`That is not ${what}.`);
  const rest = clean.slice(at + prefix.length);
  const dot = rest.lastIndexOf('.');
  if (dot < 0) throw new Error('The code is incomplete.');
  const body = rest.slice(0, dot);
  const sum = rest.slice(dot + 1, dot + 5);
  if (checksum(body) !== sum) throw new Error('The code is damaged or incomplete — copy it again.');
  return JSON.parse(fromB64Url(body)) as T;
}

export const encodeSetup = (s: TellerSetup) => encode(PREFIX_SETUP, s);
export const decodeSetup = (code: string) => {
  const s = decode<TellerSetup>(PREFIX_SETUP, code);
  const optionsOk = Array.isArray(s.o) && s.o.length > 0 && s.o.every((o) => Array.isArray(o) && o.length === 2 && typeof o[1] === 'string');
  if (s.v !== 1 || !optionsOk || !s.k || !CHANNELS.includes(s.ch)) throw new Error('Unsupported teller setup.');
  return s;
};
export const encodeResult = (r: TellerResult) => encode(PREFIX_RESULT, r);
export const decodeResult = (code: string) => {
  const r = decode<TellerResult>(PREFIX_RESULT, code);
  if (r.v !== 1 || !Array.isArray(r.c) || !r.k || !r.r || !CHANNELS.includes(r.ch)) throw new Error('Unsupported teller report.');
  if (r.c.some((x) => !Number.isInteger(x) || x < 0) || !Number.isInteger(r.i) || r.i < 0) throw new Error('The report contains invalid numbers.');
  return r;
};

/**
 * Registration desk: the code printed on a member's voting card. It identifies the person
 * within one election and nothing else — no name, no email — so a dropped card reveals nothing.
 */
export interface CheckinCode {
  v: 1;
  a: string; // assembly id
  i: string; // voter id
}

export const encodeCheckin = (c: CheckinCode) => encode(PREFIX_CHECKIN, c);
export const decodeCheckin = (code: string) => {
  const c = decode<CheckinCode>(PREFIX_CHECKIN, code, 'a voting card for this app');
  if (c.v !== 1 || typeof c.a !== 'string' || typeof c.i !== 'string' || !c.a || !c.i) throw new Error('That voting card is not readable.');
  return c;
};

/** Link a teller opens on their own device. */
export function tellerUrl(setup: TellerSetup): string {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#/teller/${encodeSetup(setup)}`;
}
