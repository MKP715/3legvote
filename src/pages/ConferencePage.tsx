import { useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import Papa from 'papaparse';
import { nanoid } from 'nanoid';
import { useAssembly, useStore } from '../store';
import {
  CHANNEL_LABEL,
  CHANNELS,
  type Assembly,
  type Channel,
  type ConferenceItem,
  type ConferenceOption,
  type VoteMethod,
} from '../engine/types';
import { CONFERENCE_COMMITTEES, tallyConferenceItem } from '../engine/business';
import { conferenceItemTemplate, saveCsv } from '../templates';
import { attempt, Badge, choose, confirmAction, notify, NumberField } from '../components/ui';
import { QrCode } from '../components/Qr';
import { openDisplay } from './Display';
import { NotFound } from './NotFound';

const METHODS: { id: VoteMethod; label: string }[] = [
  { id: 'hands', label: 'Show of hands' },
  { id: 'ballot', label: 'Written ballot' },
  { id: 'poll', label: 'Online poll' },
  { id: 'voice', label: 'Voice vote' },
];

const STATUS: Record<ConferenceItem['status'], { kind: 'muted' | 'info' | 'ok'; label: string }> = {
  toDiscuss: { kind: 'muted', label: 'To discuss' },
  discussed: { kind: 'info', label: 'Discussed' },
  polled: { kind: 'ok', label: 'Polled' },
};

/**
 * Conference agenda items brought to the area before the General Service Conference.
 * The assembly's sense informs the delegate, who then votes their conscience at the
 * Conference — the area is not binding them (Service Manual, Chapter Six).
 */
export function ConferencePage() {
  const { aid } = useParams();
  const a = useAssembly(aid);
  const s = useStore();
  const [openId, setOpenId] = useState<string | null>(null);
  const [committeeFilter, setCommitteeFilter] = useState('');
  const [form, setForm] = useState({ committee: '', reference: '', title: '', background: '', presenter: '' });
  const fileRef = useRef<HTMLInputElement>(null);

  if (!a) return <NotFound what="assembly" />;
  const committees = [...new Set(a.conferenceItems.map((i) => i.committee).filter(Boolean))].sort();
  const shown = committeeFilter ? a.conferenceItems.filter((i) => i.committee === committeeFilter) : a.conferenceItems;
  const grouped = new Map<string, ConferenceItem[]>();
  for (const item of shown) {
    const key = item.committee || 'Unassigned';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(item);
  }
  const polled = a.conferenceItems.filter((i) => i.rounds.length).length;

  const add = () => {
    if (!form.title.trim()) return;
    const id = s.addConferenceItem(a.id, { ...form, title: form.title.trim() });
    setOpenId(id);
    setForm({ committee: form.committee, reference: '', title: '', background: '', presenter: '' });
  };

  const onImport = async (f: File | undefined) => {
    if (!f) return;
    try {
      const text = (await f.text()).replace(/^﻿/, '');
      const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: 'greedy' });
      const pick = (row: Record<string, string>, ...names: string[]) => {
        for (const [k, v] of Object.entries(row)) {
          const key = k.trim().toLowerCase();
          if (names.includes(key) && v?.trim()) return v.trim();
        }
        return '';
      };
      const items = parsed.data
        .map((row) => ({
          committee: pick(row, 'committee'),
          reference: pick(row, 'reference', 'item', 'item #', 'number'),
          title: pick(row, 'title', 'agenda item', 'item title'),
          background: pick(row, 'background', 'summary', 'description'),
          links: [pick(row, 'link', 'url', 'background link')]
            .filter(Boolean)
            .map((url) => ({ id: nanoid(6), label: 'Background', url })),
        }))
        .filter((i) => i.title);
      if (!items.length) {
        notify('No items found. The file needs a header row with at least a “Title” column — download the template to see the format.', 'error');
        return;
      }
      if (a.conferenceItems.length) {
        const choice = await choose({
          title: `Import ${items.length} agenda item(s)`,
          body: <p>This assembly already has {a.conferenceItems.length} item(s). The file's items will be added to them.</p>,
          options: [
            { value: 'add', label: 'Add them' },
            { value: 'cancel', label: 'Cancel' },
          ],
        });
        if (choice !== 'add') return;
      }
      const n = s.importConferenceItems(a.id, items);
      notify(`Imported ${n} agenda item(s).`, 'success');
    } catch (e) {
      notify(`Could not read that file: ${(e as Error).message}`, 'error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const exportDelegateReport = () => {
    const rows = a.conferenceItems.map((item) => {
      const last = item.rounds[item.rounds.length - 1];
      const t = last ? tallyConferenceItem(last.counts, last.abstain, item.options) : null;
      const row: Record<string, string | number> = {
        Committee: item.committee,
        Reference: item.reference,
        Item: item.title,
        Status: STATUS[item.status].label,
        'Votes cast': t?.votesCast ?? '',
        Abstain: t?.abstainTotal ?? '',
        'Sense of the assembly': t?.sense ?? '',
        Notes: item.notes,
        'For the delegate': item.delegateNote,
      };
      for (const o of item.options) {
        const r = t?.options.find((x) => x.id === o.id);
        row[o.label] = r ? r.votes : '';
      }
      return row;
    });
    if (!rows.length) {
      notify('There are no Conference agenda items to export yet.', 'error');
      return;
    }
    saveCsv(rows, `${a.name.replace(/[^\w]+/g, '-')}-conference-items.csv`);
  };

  return (
    <>
      <nav aria-label="breadcrumb">
        <ul>
          <li>
            <Link to={`/a/${a.id}`}>{a.name}</Link>
          </li>
          <li>Conference agenda items</li>
        </ul>
      </nav>

      <div className="row-between wrap">
        <h2 style={{ margin: 0 }}>Conference agenda items</h2>
        <div className="row wrap">
          <span className="muted small">
            {a.conferenceItems.length} item(s) · {polled} polled
          </span>
          <button className="outline secondary" onClick={exportDelegateReport}>
            ⬇ Delegate report (CSV)
          </button>
        </div>
      </div>

      <details className="panel-lite">
        <summary>About this pre-Conference assembly</summary>
        <div className="grid">
          <label>
            Which Conference
            <input
              type="text"
              value={a.conferenceSettings.session}
              onChange={(e) => s.updateConferenceSettings(a.id, { session: e.target.value })}
              placeholder="e.g. 76th General Service Conference (2026)"
            />
          </label>
        </div>
        <label>
          What the assembly is told before polling
          <textarea
            rows={2}
            defaultValue={a.conferenceSettings.guidanceNote}
            key={a.conferenceSettings.guidanceNote}
            onBlur={(e) => s.updateConferenceSettings(a.id, { guidanceNote: e.target.value })}
          />
          <small className="muted">
            Shown on the projector with every item. The area's sense guides the delegate; at the Conference the delegate votes their conscience after
            hearing all the sharing.
          </small>
        </label>
        <OptionsEditor
          label="Default choices offered for a new item"
          options={a.conferenceSettings.defaultOptions}
          onChange={(defaultOptions) => s.updateConferenceSettings(a.id, { defaultOptions })}
        />
      </details>

      <div className="grid-2">
        <article className="panel">
          <header>
            <h3 style={{ margin: 0 }}>Add an agenda item</h3>
          </header>
          <div className="grid">
            <label>
              Committee
              <input
                type="text"
                list="conf-committees"
                value={form.committee}
                onChange={(e) => setForm({ ...form, committee: e.target.value })}
                placeholder="e.g. Literature"
              />
              <datalist id="conf-committees">
                {CONFERENCE_COMMITTEES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            <label>
              Item reference
              <input
                type="text"
                value={form.reference}
                onChange={(e) => setForm({ ...form, reference: e.target.value })}
                placeholder="e.g. Item 3"
              />
            </label>
          </div>
          <label>
            The item
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Consider a request to…"
            />
          </label>
          <label>
            Background
            <textarea rows={2} value={form.background} onChange={(e) => setForm({ ...form, background: e.target.value })} />
          </label>
          <label>
            Presented by
            <input type="text" value={form.presenter} onChange={(e) => setForm({ ...form, presenter: e.target.value })} />
          </label>
          <div className="row wrap">
            <button onClick={add} disabled={!form.title.trim()}>
              Add the item
            </button>
            <button className="outline secondary" onClick={() => fileRef.current?.click()}>
              ⬆ Import a list
            </button>
            <button className="outline secondary" onClick={() => saveCsv(conferenceItemTemplate(), 'conference-agenda-items-template.csv')}>
              ⬇ Template
            </button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => onImport(e.target.files?.[0])} />
          </div>
        </article>

        <article className="panel">
          <header className="row-between wrap">
            <h3 style={{ margin: 0 }}>The agenda</h3>
            {committees.length > 1 && (
              <select value={committeeFilter} onChange={(e) => setCommitteeFilter(e.target.value)} aria-label="Filter by committee">
                <option value="">All committees</option>
                {committees.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
          </header>
          {a.conferenceItems.length === 0 && (
            <p className="muted">
              Nothing here yet. Add the items your delegate received, or import them from a spreadsheet — one row per item.
            </p>
          )}
          {[...grouped.entries()].map(([committee, items]) => (
            <section key={committee} className="conf-group">
              <h4>{committee}</h4>
              <ul className="motion-list">
                {items.map((item) => (
                  <li key={item.id} className={item.id === openId ? 'current' : ''}>
                    <button className="link-btn" onClick={() => setOpenId(item.id === openId ? null : item.id)}>
                      <strong>
                        {item.reference ? `${item.reference}. ` : ''}
                        {item.title}
                      </strong>
                      {item.rounds.length > 0 && <div className="sub muted">{senseOf(item)}</div>}
                    </button>
                    <Badge kind={STATUS[item.status].kind}>{STATUS[item.status].label}</Badge>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </article>
      </div>

      {openId && a.conferenceItems.some((i) => i.id === openId) && (
        <ItemDetail key={openId} assembly={a} item={a.conferenceItems.find((i) => i.id === openId)!} />
      )}
    </>
  );
}

function senseOf(item: ConferenceItem): string {
  const last = item.rounds[item.rounds.length - 1];
  if (!last) return '';
  return tallyConferenceItem(last.counts, last.abstain, item.options).sense ?? '';
}

function OptionsEditor({
  label,
  options,
  onChange,
  locked,
}: {
  label: string;
  options: ConferenceOption[];
  onChange: (options: ConferenceOption[]) => void;
  /** Choices that already hold votes: they can be reworded, but not taken away. */
  locked?: Set<string>;
}) {
  const [draft, setDraft] = useState('');
  return (
    <div className="options-editor">
      <strong className="small">{label}</strong>
      <ul className="chip-list">
        {options.map((o, i) => (
          <li key={o.id} className="chip">
            <input
              type="text"
              defaultValue={o.label}
              key={o.label}
              aria-label={`Choice ${i + 1}`}
              onBlur={(e) => {
                const text = e.target.value.trim();
                if (text && text !== o.label) onChange(options.map((x) => (x.id === o.id ? { ...x, label: text } : x)));
              }}
            />
            <button
              className="outline danger mini"
              aria-label={`Remove ${o.label}`}
              onClick={() => onChange(options.filter((x) => x.id !== o.id))}
              disabled={options.length <= 2 || locked?.has(o.id)}
              title={locked?.has(o.id) ? 'The assembly has already voted on this choice — undo the poll to remove it' : undefined}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <form
        className="row wrap"
        onSubmit={(e) => {
          e.preventDefault();
          const text = draft.trim();
          if (!text) return;
          onChange([...options, { id: nanoid(6), label: text }]);
          setDraft('');
        }}
      >
        <input type="text" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Another choice" aria-label="New choice" />
        <button type="submit" className="outline" disabled={!draft.trim()}>
          Add
        </button>
      </form>
    </div>
  );
}

function ItemDetail({ assembly, item }: { assembly: Assembly; item: ConferenceItem }) {
  const s = useStore();
  const a = assembly;
  const [polling, setPolling] = useState(false);
  const [method, setMethod] = useState<VoteMethod>('hands');
  const [counts, setCounts] = useState<Record<Channel, Record<string, number>>>({ inPerson: {}, virtual: {} });
  const [abstain, setAbstain] = useState<Record<Channel, number>>({ inPerson: 0, virtual: 0 });
  const [linkDraft, setLinkDraft] = useState({ label: '', url: '' });

  const preview = useMemo(() => tallyConferenceItem(counts, abstain, item.options), [counts, abstain, item.options]);
  // A choice that has votes recorded against it cannot be removed, or those votes would
  // vanish from the result without trace.
  const voted = useMemo(() => {
    const ids = new Set<string>();
    for (const r of item.rounds)
      for (const ch of CHANNELS) for (const [id, n] of Object.entries(r.counts[ch] ?? {})) if (n > 0) ids.add(id);
    return ids;
  }, [item.rounds]);
  const last = item.rounds[item.rounds.length - 1] ?? null;
  const result = last ? tallyConferenceItem(last.counts, last.abstain, item.options) : null;

  const setCount = (ch: Channel, optionId: string, v: number) =>
    setCounts((c) => ({ ...c, [ch]: { ...c[ch], [optionId]: v } }));

  const record = async () => {
    const ok = await confirmAction({
      title: 'Record this poll?',
      body: (
        <>
          <p>{preview.sense ?? 'No votes have been entered.'}</p>
          <p className="sub muted">
            {preview.votesCast} votes cast, {preview.abstainTotal} abstaining.
          </p>
        </>
      ),
      confirmLabel: 'Record the poll',
    });
    if (!ok) return;
    const saved = attempt(
      () =>
        s.recordConferencePoll(a.id, item.id, {
          counts: { inPerson: { ...counts.inPerson }, virtual: { ...counts.virtual } },
          abstain: { ...abstain },
          method,
        }),
      'Poll recorded.',
    );
    if (saved) {
      setCounts({ inPerson: {}, virtual: {} });
      setAbstain({ inPerson: 0, virtual: 0 });
      setPolling(false);
    }
  };

  return (
    <article className="panel conf-detail">
      <header className="row-between wrap">
        <h3 style={{ margin: 0 }}>
          {item.reference ? `${item.reference}. ` : ''}
          {item.title} <Badge kind={STATUS[item.status].kind}>{STATUS[item.status].label}</Badge>
        </h3>
        <div className="row wrap">
          <button
            className="outline secondary mini"
            onClick={() => {
              s.setScreen(a.id, 'conference', item.id);
              openDisplay(a.id);
            }}
          >
            📽 Show on projector
          </button>
          <button
            className="outline danger mini"
            onClick={async () => {
              if (await confirmAction({ title: `Remove “${item.title}”?`, danger: true, confirmLabel: 'Remove' }))
                attempt(() => s.removeConferenceItem(a.id, item.id), 'Item removed.');
            }}
          >
            Remove
          </button>
        </div>
      </header>

      <div className="grid">
        <label>
          Committee
          <input
            type="text"
            list="conf-committees"
            defaultValue={item.committee}
            key={`c-${item.committee}`}
            onBlur={(e) => s.updateConferenceItem(a.id, item.id, { committee: e.target.value })}
          />
        </label>
        <label>
          Presented by
          <input
            type="text"
            defaultValue={item.presenter ?? ''}
            key={`p-${item.presenter}`}
            onBlur={(e) => s.updateConferenceItem(a.id, item.id, { presenter: e.target.value })}
          />
        </label>
      </div>

      <label>
        Background
        <textarea
          rows={3}
          defaultValue={item.background}
          key={`b-${item.background}`}
          onBlur={(e) => s.updateConferenceItem(a.id, item.id, { background: e.target.value })}
        />
      </label>

      {/* ---- background links, shown as QR codes so the room can read them ---- */}
      <div className="conf-links">
        <strong className="small">Background material</strong>
        <ul className="link-cards">
          {item.links.map((l) => (
            <li key={l.id}>
              <QrCode text={l.url} size={90} label={l.label || 'Background link'} />
              <div>
                <strong>{l.label || 'Link'}</strong>
                <div className="sub muted break">{l.url}</div>
                <button
                  className="outline danger mini"
                  onClick={() => s.updateConferenceItem(a.id, item.id, { links: item.links.filter((x) => x.id !== l.id) })}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
        <form
          className="row wrap"
          onSubmit={(e) => {
            e.preventDefault();
            if (!linkDraft.url.trim()) return;
            s.updateConferenceItem(a.id, item.id, {
              links: [...item.links, { id: nanoid(6), label: linkDraft.label.trim() || 'Background', url: linkDraft.url.trim() }],
            });
            setLinkDraft({ label: '', url: '' });
          }}
        >
          <input
            type="text"
            value={linkDraft.label}
            onChange={(e) => setLinkDraft({ ...linkDraft, label: e.target.value })}
            placeholder="Label"
            aria-label="Link label"
          />
          <input
            type="url"
            value={linkDraft.url}
            onChange={(e) => setLinkDraft({ ...linkDraft, url: e.target.value })}
            placeholder="https://…"
            aria-label="Link address"
          />
          <button type="submit" className="outline" disabled={!linkDraft.url.trim()}>
            Add link
          </button>
        </form>
      </div>

      {/* ---- discussion notes ---- */}
      <label>
        Notes from the discussion
        <textarea
          rows={4}
          defaultValue={item.notes}
          key={`n-${item.notes}`}
          placeholder="What was shared, both ways…"
          onBlur={(e) => {
            s.updateConferenceItem(a.id, item.id, { notes: e.target.value });
            if (e.target.value.trim() && item.status === 'toDiscuss') s.updateConferenceItem(a.id, item.id, { status: 'discussed' });
          }}
        />
      </label>

      <OptionsEditor
        label="Choices the assembly is polled on"
        options={item.options}
        onChange={(options) => s.updateConferenceItem(a.id, item.id, { options })}
        locked={voted}
      />

      {/* ---- the poll ---- */}
      {!polling && (
        <div className="row wrap">
          <button onClick={() => setPolling(true)}>{item.rounds.length ? 'Poll again' : 'Poll the assembly'}</button>
          {item.rounds.length > 0 && (
            <button className="outline danger" onClick={() => attempt(() => s.undoConferencePoll(a.id, item.id), 'Last poll undone.')}>
              Undo last poll
            </button>
          )}
          {item.status === 'toDiscuss' && (
            <button className="outline secondary" onClick={() => s.updateConferenceItem(a.id, item.id, { status: 'discussed' })}>
              Mark as discussed
            </button>
          )}
        </div>
      )}

      {polling && (
        <div className="panel-lite vote-panel">
          <header className="row-between wrap">
            <strong>Poll the assembly</strong>
            <label className="inline-field">
              Taken by
              <select value={method} onChange={(e) => setMethod(e.target.value as VoteMethod)} aria-label="How the poll was taken">
                {METHODS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </header>
          <div className="table-scroll">
            <table className="entry-table">
              <thead>
                <tr>
                  <th>Choice</th>
                  {CHANNELS.map((ch) => (
                    <th key={ch} className="num">
                      {CHANNEL_LABEL[ch]}
                    </th>
                  ))}
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {item.options.map((o) => (
                  <tr key={o.id}>
                    <th scope="row">{o.label}</th>
                    {CHANNELS.map((ch) => (
                      <td key={ch} className="num">
                        <NumberField
                          value={counts[ch][o.id] ?? 0}
                          onChange={(v) => setCount(ch, o.id, v ?? 0)}
                          label={`${o.label}, ${CHANNEL_LABEL[ch]}`}
                        />
                      </td>
                    ))}
                    <td className="num strong">{(counts.inPerson[o.id] ?? 0) + (counts.virtual[o.id] ?? 0)}</td>
                  </tr>
                ))}
                <tr>
                  <th scope="row">Abstain</th>
                  {CHANNELS.map((ch) => (
                    <td key={ch} className="num">
                      <NumberField
                        value={abstain[ch]}
                        onChange={(v) => setAbstain((x) => ({ ...x, [ch]: v ?? 0 }))}
                        label={`Abstain, ${CHANNEL_LABEL[ch]}`}
                      />
                    </td>
                  ))}
                  <td className="num strong">{preview.abstainTotal}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Total vote</th>
                  {CHANNELS.map((ch) => (
                    <td key={ch} className="num">
                      {Object.values(counts[ch]).reduce((n, v) => n + v, 0) + abstain[ch]}
                    </td>
                  ))}
                  <td className="num strong">{preview.totalVote}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="preview-line">{preview.sense ?? 'Enter the counts to see the sense of the assembly.'}</p>
          <div className="row wrap">
            <button onClick={record} disabled={preview.totalVote === 0}>
              Record the poll
            </button>
            <button className="outline secondary" onClick={() => setPolling(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ---- results ---- */}
      {result && (
        <div className="conf-result">
          <strong>Sense of the assembly</strong>
          <p className="sense">{result.sense}</p>
          <div className="table-scroll">
            <table className="entry-table">
              <thead>
                <tr>
                  <th>Choice</th>
                  <th className="num">{CHANNEL_LABEL.inPerson}</th>
                  <th className="num">{CHANNEL_LABEL.virtual}</th>
                  <th className="num">Total</th>
                  <th className="num">Share of votes cast</th>
                </tr>
              </thead>
              <tbody>
                {result.options.map((o) => (
                  <tr key={o.id} className={result.leading?.id === o.id ? 'row-lead' : ''}>
                    <th scope="row">{o.label}</th>
                    <td className="num">{o.byChannel.inPerson}</td>
                    <td className="num">{o.byChannel.virtual}</td>
                    <td className="num strong">{o.votes}</td>
                    <td className="num">
                      {Math.round(o.pct)}%{o.substantialUnanimity && <Badge kind="ok">two-thirds</Badge>}
                    </td>
                  </tr>
                ))}
                <tr>
                  <th scope="row">Abstain</th>
                  <td className="num">{result.abstain.inPerson}</td>
                  <td className="num">{result.abstain.virtual}</td>
                  <td className="num strong">{result.abstainTotal}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
          {item.rounds.length > 1 && <p className="sub muted">{item.rounds.length} polls taken; the most recent is shown.</p>}
        </div>
      )}

      <label>
        What the delegate will carry to the Conference
        <textarea
          rows={3}
          defaultValue={item.delegateNote}
          key={`d-${item.delegateNote}`}
          placeholder="The sense of the area, the minority view, and anything the delegate should know…"
          onBlur={(e) => s.updateConferenceItem(a.id, item.id, { delegateNote: e.target.value })}
        />
        <small className="muted">{a.conferenceSettings.guidanceNote}</small>
      </label>
    </article>
  );
}
