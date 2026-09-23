import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import QRCode from 'qrcode';
import { nanoid } from 'nanoid';
import { useAssembly, useStore } from '../store';
import { CHANNEL_LABEL, type Assembly, type BadgeDesign, type BadgeLink, type Voter } from '../engine/types';
import { encodeCheckin } from '../engine/tellerCodes';
import { AGENDA_KIND_ICON } from '../agendaTemplates';
import { BADGE_LAYOUT, fillPage, mirrorForDuplex, paginate } from '../badgeLayout';
import { addMinutes } from '../engine/business';
import { notify } from '../components/ui';
import { NotFound } from './NotFound';

type Who = 'all' | 'present' | 'voting' | 'attending';

/**
 * Name badges for the assembly: designed once, saved with the assembly, and printed
 * single- or double-sided. Every badge can carry the member's check-in QR code, so the
 * registration desk scans the same badge people wear.
 */
export function BadgesPage() {
  const { aid } = useParams();
  const a = useAssembly(aid);
  const s = useStore();
  const [who, setWho] = useState<Who>('all');
  const [attendingId, setAttendingId] = useState('');
  const [blanks, setBlanks] = useState(0);

  const voters = useMemo(() => {
    if (!a) return [];
    const roleVotes = new Map(a.roles.map((r) => [r.id, r.votes]));
    return a.voterRoll.filter((v) => {
      if (who === 'present') return v.present;
      if (who === 'voting') return !!roleVotes.get(v.roleId);
      if (who === 'attending') return !attendingId || (v.attending ?? []).includes(attendingId);
      return true;
    });
  }, [a, who, attendingId]);

  const qrTargets = useMemo(() => (a && a.badge.front.showCheckinQr ? voters : []), [a, voters]);
  const codes = useCheckinCodes(a?.id ?? '', qrTargets);

  if (!a) return <NotFound what="assembly" />;
  const b = a.badge;
  const patchFront = (patch: Partial<BadgeDesign['front']>) => s.updateBadge(a.id, { front: { ...b.front, ...patch } });
  const patchBack = (patch: Partial<BadgeDesign['back']>) => s.updateBadge(a.id, { back: { ...b.back, ...patch } });

  const rows: (Voter | null)[] = [...voters, ...Array.from({ length: blanks }, () => null)];
  const pages = paginate(rows, b.perPage);

  const onLogo = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 400_000) {
      notify('That image is large (over 400 KB). Please use a smaller logo so the assembly file stays small.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => s.updateBadge(a.id, { logoDataUrl: String(reader.result) });
    reader.onerror = () => notify('That image could not be read.', 'error');
    reader.readAsDataURL(file);
  };

  return (
    <>
      <nav aria-label="breadcrumb" className="no-print">
        <ul>
          <li>
            <Link to={`/a/${a.id}`}>{a.name}</Link>
          </li>
          <li>Name badges</li>
        </ul>
      </nav>

      <div className="row-between wrap no-print">
        <h2 style={{ margin: 0 }}>Name badges</h2>
        <div className="row wrap">
          <span className="muted small">
            {voters.length} badge(s){blanks ? ` + ${blanks} blank` : ''} · {pages.length} sheet(s)
            {b.doubleSided ? ` + ${pages.length} back(s)` : ''}
          </span>
          <button onClick={() => window.print()} disabled={rows.length === 0}>
            🖨 Print
          </button>
        </div>
      </div>

      <div className="no-print">
        <div className="grid-2">
          {/* ---------------- who gets one ---------------- */}
          <article className="panel">
            <header>
              <h3 style={{ margin: 0 }}>Who gets a badge</h3>
            </header>
            <div className="grid">
              <label>
                Print for
                <select value={who} onChange={(e) => setWho(e.target.value as Who)}>
                  <option value="all">Everyone on the roll ({a.voterRoll.length})</option>
                  <option value="present">Everyone marked present</option>
                  <option value="voting">Voting members only</option>
                  <option value="attending">Signed up for…</option>
                </select>
              </label>
              {who === 'attending' && (
                <label>
                  Which registration
                  <select value={attendingId} onChange={(e) => setAttendingId(e.target.value)}>
                    <option value="">— choose —</option>
                    {a.attendanceOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Blank badges for walk-ins
                <input
                  type="number"
                  min={0}
                  max={200}
                  value={blanks}
                  onChange={(e) => setBlanks(Math.max(0, Math.min(200, Number(e.target.value) || 0)))}
                />
              </label>
            </div>
            {voters.length === 0 && (
              <p className="muted">
                Nobody matches. Add people on the <Link to={`/a/${a.id}/voters`}>registration page</Link> first.
              </p>
            )}
          </article>

          {/* ---------------- layout and design ---------------- */}
          <article className="panel">
            <header>
              <h3 style={{ margin: 0 }}>Paper and layout</h3>
            </header>
            <div className="grid">
              <label>
                Badges per sheet
                <select value={b.perPage} onChange={(e) => s.updateBadge(a.id, { perPage: Number(e.target.value) as BadgeDesign['perPage'] })}>
                  {(Object.keys(BADGE_LAYOUT) as unknown as BadgeDesign['perPage'][]).map((n) => (
                    <option key={n} value={n}>
                      {BADGE_LAYOUT[n].label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Accent colour
                <input type="color" value={b.accent} onChange={(e) => s.updateBadge(a.id, { accent: e.target.value })} aria-label="Accent colour" />
              </label>
            </div>
            <label>
              <input type="checkbox" role="switch" checked={b.doubleSided} onChange={(e) => s.updateBadge(a.id, { doubleSided: e.target.checked })} />
              Print a back for every badge
            </label>
            {b.doubleSided && (
              <label>
                Your printer flips the paper on the
                <select value={b.duplexFlip} onChange={(e) => s.updateBadge(a.id, { duplexFlip: e.target.value as 'long' | 'short' })}>
                  <option value="long">Long edge (the usual setting)</option>
                  <option value="short">Short edge</option>
                </select>
                <small className="muted">
                  The backs are laid out in the mirrored order so each back lands behind the right front. Print one sheet first and check before
                  running the lot.
                </small>
              </label>
            )}
            <div className="row wrap">
              <label className="inline-field">
                Logo
                <input type="file" accept="image/*" onChange={(e) => onLogo(e.target.files?.[0])} aria-label="Badge logo" />
              </label>
              {b.logoDataUrl && (
                <button className="outline danger mini" onClick={() => s.updateBadge(a.id, { logoDataUrl: undefined })}>
                  Remove logo
                </button>
              )}
            </div>
          </article>
        </div>

        <div className="grid-2">
          {/* ---------------- front ---------------- */}
          <article className="panel">
            <header>
              <h3 style={{ margin: 0 }}>The front</h3>
            </header>
            <div className="grid">
              <label>
                Heading
                <input
                  type="text"
                  value={b.title}
                  onChange={(e) => s.updateBadge(a.id, { title: e.target.value })}
                  placeholder={a.name}
                />
              </label>
              <label>
                Sub-heading
                <input
                  type="text"
                  value={b.subtitle}
                  onChange={(e) => s.updateBadge(a.id, { subtitle: e.target.value })}
                  placeholder={[a.date, a.location].filter(Boolean).join(' · ')}
                />
              </label>
            </div>
            <fieldset>
              <legend className="small">Show on the front</legend>
              {(
                [
                  ['showRole', 'Service position'],
                  ['showGroup', 'Group'],
                  ['showDistrict', 'District'],
                  ['showChannel', 'In person / online'],
                  ['showAttendance', 'What they are signed up for'],
                  ['showCustomFields', 'Extra registration details'],
                  ['showCheckinQr', 'Check-in QR code'],
                  ['showBand', 'Voting / non-voting band'],
                ] as [keyof BadgeDesign['front'], string][]
              ).map(([key, label]) => (
                <label key={key}>
                  <input type="checkbox" checked={!!b.front[key]} onChange={(e) => patchFront({ [key]: e.target.checked })} />
                  {label}
                </label>
              ))}
            </fieldset>
            <label>
              Extra line on the front
              <input
                type="text"
                value={b.front.extraText}
                onChange={(e) => patchFront({ extraText: e.target.value })}
                placeholder="e.g. Wi-Fi: guest / password"
              />
            </label>
          </article>

          {/* ---------------- back ---------------- */}
          <article className="panel">
            <header className="row-between wrap">
              <h3 style={{ margin: 0 }}>The back</h3>
              {!b.doubleSided && <span className="muted small">Turn on double-sided printing to use it</span>}
            </header>
            <div className="grid">
              <label>
                Heading
                <input type="text" value={b.back.heading} onChange={(e) => patchBack({ heading: e.target.value })} />
              </label>
            </div>
            <label>
              Text
              <textarea
                rows={3}
                value={b.back.text}
                onChange={(e) => patchBack({ text: e.target.value })}
                placeholder="Anything the room should have to hand — schedule, house rules, the Serenity Prayer…"
              />
            </label>
            <label>
              <input type="checkbox" checked={b.back.showAgenda} onChange={(e) => patchBack({ showAgenda: e.target.checked })} />
              Print the day's agenda on the back ({a.agenda.length} item(s))
            </label>
            <label>
              <input type="checkbox" checked={b.back.showQrCaptions} onChange={(e) => patchBack({ showQrCaptions: e.target.checked })} />
              Print the web address under each QR code
            </label>
            <LinksEditor links={b.back.links} onChange={(links) => patchBack({ links })} />
          </article>
        </div>

        <article className="panel">
          <header>
            <h3 style={{ margin: 0 }}>Preview</h3>
          </header>
          <p className="muted small">
            The design is saved with this assembly, so the same badges can be reprinted all weekend. What you see here is what prints — one sheet of{' '}
            {b.perPage}.
          </p>
          <div className="nb-preview">
            <BadgeFace assembly={a} voter={voters[0] ?? null} code={voters[0] ? codes[voters[0].id] : undefined} />
            {b.doubleSided && <BadgeBack assembly={a} voter={voters[0] ?? null} />}
          </div>
        </article>
      </div>

      {/* ---------------- what actually prints ---------------- */}
      <div className="nb-sheets print-only" data-per-page={b.perPage}>
        {pages.map((page, i) => (
          <div key={`p${i}`}>
            <section className="nb-page">
              {page.map((v, j) => (
                <BadgeFace key={v?.id ?? `blank-${j}`} assembly={a} voter={v} code={v ? codes[v.id] : undefined} />
              ))}
              {Array.from({ length: Math.max(0, b.perPage - page.length) }, (_, k) => (
                <div className="nb nb-empty" key={`pad${k}`} />
              ))}
            </section>
            {b.doubleSided && (
              <section className="nb-page">
                {mirrorForDuplex(fillPage(page, b.perPage), BADGE_LAYOUT[b.perPage].cols, b.duplexFlip).map((v, j) => (
                  <BadgeBack key={`b${v?.id ?? j}`} assembly={a} voter={v} />
                ))}
              </section>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */

/** Check-in QR codes, generated locally; no name or email is encoded. */
function useCheckinCodes(assemblyId: string, voters: Voter[]): Record<string, string> {
  const [codes, setCodes] = useState<Record<string, string>>({});
  const ids = voters.map((v) => v.id).join(',');
  useEffect(() => {
    let alive = true;
    if (!assemblyId || !voters.length) {
      setCodes({});
      return;
    }
    void (async () => {
      const out: Record<string, string> = {};
      for (const v of voters) {
        try {
          out[v.id] = await QRCode.toDataURL(encodeCheckin({ v: 1, a: assemblyId, i: v.id }), { errorCorrectionLevel: 'M', margin: 0, width: 240 });
        } catch {
          /* a badge without a QR still works — the desk can search the name */
        }
      }
      if (alive) setCodes(out);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assemblyId, ids]);
  return codes;
}

function LinksEditor({ links, onChange }: { links: BadgeLink[]; onChange: (links: BadgeLink[]) => void }) {
  const [draft, setDraft] = useState({ label: '', url: '', qr: true });
  return (
    <div className="links-editor">
      <strong className="small">Links printed on the back</strong>
      <ul className="link-rows">
        {links.map((l) => (
          <li key={l.id}>
            <input
              type="text"
              defaultValue={l.label}
              key={`l-${l.label}`}
              aria-label="Link label"
              onBlur={(e) => onChange(links.map((x) => (x.id === l.id ? { ...x, label: e.target.value } : x)))}
            />
            <input
              type="url"
              defaultValue={l.url}
              key={`u-${l.url}`}
              aria-label="Link address"
              onBlur={(e) => onChange(links.map((x) => (x.id === l.id ? { ...x, url: e.target.value } : x)))}
            />
            <label className="inline-field">
              <input type="checkbox" checked={l.qr} onChange={(e) => onChange(links.map((x) => (x.id === l.id ? { ...x, qr: e.target.checked } : x)))} />
              QR
            </label>
            <button className="outline danger mini" aria-label={`Remove ${l.label}`} onClick={() => onChange(links.filter((x) => x.id !== l.id))}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      <form
        className="row wrap"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.url.trim()) return;
          onChange([...links, { id: nanoid(6), label: draft.label.trim() || 'Link', url: draft.url.trim(), qr: draft.qr }]);
          setDraft({ label: '', url: '', qr: true });
        }}
      >
        <input type="text" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Label" aria-label="New link label" />
        <input type="url" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="https://…" aria-label="New link address" />
        <label className="inline-field">
          <input type="checkbox" checked={draft.qr} onChange={(e) => setDraft({ ...draft, qr: e.target.checked })} />
          QR code
        </label>
        <button type="submit" className="outline" disabled={!draft.url.trim()}>
          Add
        </button>
      </form>
    </div>
  );
}

function BadgeFace({ assembly, voter, code }: { assembly: Assembly; voter: Voter | null; code?: string }) {
  const a = assembly;
  const b = a.badge;
  const role = voter ? a.roles.find((r) => r.id === voter.roleId) : null;
  const alternateFor = role?.alternateFor ? a.roles.find((r) => r.id === role.alternateFor)?.name : null;
  const where = voter
    ? [b.front.showGroup && voter.group, b.front.showDistrict && voter.district && `District ${voter.district.replace(/^d(istrict)?\s*/i, '')}`]
        .filter(Boolean)
        .join(' · ')
    : '';
  const attending = voter
    ? a.attendanceOptions.filter((o) => o.showOnBadge && (voter.attending ?? []).includes(o.id))
    : [];
  const customs = voter
    ? a.voterFields.filter((f) => f.showOnBadge && (voter.custom?.[f.id] ?? '').trim())
    : [];

  return (
    <div className="nb" style={{ ['--nb-accent' as string]: b.accent }}>
      <div className="nb-top">
        {b.logoDataUrl && <img className="nb-logo" src={b.logoDataUrl} alt="" />}
        <div>
          <div className="nb-title">{b.title || a.name}</div>
          <div className="nb-subtitle">{b.subtitle || [a.date, a.location].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
      <div className="nb-main">
        <div className="nb-id">
          <div className="nb-name">{voter?.name ?? ''}</div>
          {b.front.showRole && <div className="nb-role">{role?.name ?? ''}</div>}
          {where && <div className="nb-where">{where}</div>}
          {b.front.showChannel && voter && <div className="nb-where">{CHANNEL_LABEL[voter.channel]}</div>}
          {b.front.showAttendance && attending.length > 0 && (
            <div className="nb-tags">
              {attending.map((o) => (
                <span key={o.id} className="nb-tag">
                  {o.label}
                </span>
              ))}
            </div>
          )}
          {b.front.showCustomFields &&
            customs.map((f) => (
              <div key={f.id} className="nb-where">
                {f.label}: {voter?.custom?.[f.id]}
              </div>
            ))}
          {b.front.extraText && <div className="nb-extra">{b.front.extraText}</div>}
        </div>
        {b.front.showCheckinQr && code && <img className="nb-qr" src={code} alt="" />}
      </div>
      {b.front.showBand && (
        <div className={`nb-band ${role?.votes ? (alternateFor ? 'alt' : 'votes') : 'novote'}`}>
          {!voter
            ? ''
            : role?.votes
              ? alternateFor
                ? `ALTERNATE — votes only if the ${alternateFor} is absent`
                : 'VOTING MEMBER'
              : 'NON-VOTING'}
        </div>
      )}
    </div>
  );
}

function BadgeBack({ assembly, voter }: { assembly: Assembly; voter: Voter | null }) {
  const a = assembly;
  const b = a.badge;
  const links = b.back.links.filter((l) => l.url.trim());
  return (
    <div className="nb nb-back" style={{ ['--nb-accent' as string]: b.accent }}>
      {voter && <div className="nb-back-name">{voter.name}</div>}
      {b.back.heading && <div className="nb-back-heading">{b.back.heading}</div>}
      {b.back.text && <div className="nb-back-text">{b.back.text}</div>}
      {b.back.showAgenda && a.agenda.length > 0 && (
        <ul className="nb-agenda">
          {a.agenda.slice(0, 10).map((item, i) => {
            const start = a.agenda.slice(0, i).reduce((n, x) => n + (x.plannedMinutes || 0), 0);
            return (
              <li key={item.id}>
                <span className="t">{addMinutes(a.agendaStart, start)}</span> {AGENDA_KIND_ICON[item.kind]} {item.title}
              </li>
            );
          })}
        </ul>
      )}
      {links.length > 0 && (
        <div className="nb-links">
          {links.map((l) => (
            <div className="nb-link" key={l.id}>
              {l.qr && <BadgeLinkQr url={l.url} />}
              <div>
                <strong>{l.label}</strong>
                {b.back.showQrCaptions && <div className="nb-url">{l.url.replace(/^https?:\/\//, '')}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BadgeLinkQr({ url }: { url: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 0, width: 200 })
      .then((d) => alive && setSrc(d))
      .catch(() => alive && setSrc(''));
    return () => {
      alive = false;
    };
  }, [url]);
  return src ? <img className="nb-link-qr" src={src} alt="" /> : <div className="nb-link-qr" />;
}
