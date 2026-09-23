import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useAssembly, useStore } from '../store';
import type { AgendaItem, AgendaKind } from '../engine/types';
import { addMinutes, elapsedMinutes, scheduleAgenda } from '../engine/business';
import { AGENDA_KIND_ICON, AGENDA_KIND_LABEL, AGENDA_TEMPLATES } from '../agendaTemplates';
import { attempt, Badge, confirmAction, NumberField } from '../components/ui';
import { openDisplay } from './Display';
import { NotFound } from './NotFound';

const KINDS: AgendaKind[] = ['segment', 'report', 'election', 'motion', 'conference', 'workshop', 'break', 'meal'];

/**
 * The day's running order: what is planned, what is running now, and how the time is going.
 * The current item is shown on the projector so the room can see where it is up to.
 */
export function AgendaPage() {
  const { aid } = useParams();
  const a = useAssembly(aid);
  const s = useStore();
  const [draft, setDraft] = useState<{ title: string; kind: AgendaKind; minutes: number | null; presenter: string }>({
    title: '',
    kind: 'segment',
    minutes: 15,
    presenter: '',
  });
  // Re-render every 20s so the running clock stays honest.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 20000);
    return () => window.clearInterval(id);
  }, []);

  if (!a) return <NotFound what="assembly" />;
  const plan = scheduleAgenda(a.agenda);
  const current = a.agenda.find((i) => i.startedAt && !i.endedAt) ?? null;
  const totalPlanned = a.agenda.reduce((n, i) => n + (i.plannedMinutes || 0), 0);
  const spent = a.agenda.reduce((n, i) => n + (elapsedMinutes(i.startedAt, i.endedAt) ?? 0), 0);
  const plannedSoFar = a.agenda
    .filter((i) => i.startedAt)
    .reduce((n, i) => n + (i.plannedMinutes || 0), 0);
  const drift = spent - plannedSoFar;

  const linkTarget = (item: AgendaItem) => {
    if (item.kind === 'election' && item.linkId) return `/a/${a.id}/p/${item.linkId}`;
    if (item.kind === 'motion') return `/a/${a.id}/motions`;
    if (item.kind === 'conference') return `/a/${a.id}/conference`;
    return null;
  };

  const add = () => {
    if (!draft.title.trim()) return;
    s.addAgendaItem(a.id, { title: draft.title, kind: draft.kind, plannedMinutes: draft.minutes ?? 15, presenter: draft.presenter });
    setDraft({ ...draft, title: '', presenter: '' });
  };

  const next = () => {
    const i = a.agenda.findIndex((x) => x.id === current?.id);
    const following = a.agenda[i + 1];
    if (current) s.finishAgendaItem(a.id, current.id);
    if (following) s.startAgendaItem(a.id, following.id);
  };

  return (
    <>
      <nav aria-label="breadcrumb">
        <ul>
          <li>
            <Link to={`/a/${a.id}`}>{a.name}</Link>
          </li>
          <li>Agenda</li>
        </ul>
      </nav>

      <div className="row-between wrap">
        <h2 style={{ margin: 0 }}>Agenda</h2>
        <div className="row wrap">
          <label className="inline-field">
            Starts
            <input type="time" value={a.agendaStart} onChange={(e) => s.setAgendaStart(a.id, e.target.value)} aria-label="Assembly start time" />
          </label>
          <button className="outline" onClick={() => { s.setScreen(a.id, 'agenda'); openDisplay(a.id); }}>
            📽 Show on projector
          </button>
        </div>
      </div>

      <div className="stat-row">
        <div className="stat">
          <span>Planned</span>
          <strong>{Math.floor(totalPlanned / 60)}h {totalPlanned % 60}m</strong>
          <small>ends about {addMinutes(a.agendaStart, totalPlanned)}</small>
        </div>
        <div className="stat">
          <span>Used so far</span>
          <strong>{Math.floor(spent / 60)}h {spent % 60}m</strong>
        </div>
        <div className="stat">
          <span>Running</span>
          <strong className={drift > 5 ? 'over' : drift < -5 ? 'under' : ''}>
            {drift === 0 ? 'on time' : drift > 0 ? `${drift}m over` : `${-drift}m early`}
          </strong>
        </div>
        <div className="stat">
          <span>Now</span>
          <strong>{current ? AGENDA_KIND_ICON[current.kind] : '—'}</strong>
          <small>{current?.title ?? 'nothing running'}</small>
        </div>
      </div>

      {a.agenda.length === 0 ? (
        <article className="panel">
          <header>
            <h3 style={{ margin: 0 }}>Start from a sample agenda</h3>
          </header>
          <p className="muted">
            The Service Manual gives sample formats for an election assembly and a regular assembly (Appendix D) — "meant to be suggestive only".
            Load one and change it to suit your area.
          </p>
          <div className="row wrap">
            {AGENDA_TEMPLATES.map((t) => (
              <button
                key={t.id}
                className="outline"
                onClick={() => attempt(() => s.loadAgendaTemplate(a.id, t.items), `${t.label} loaded.`)}
                title={t.description}
              >
                {t.label}
              </button>
            ))}
          </div>
        </article>
      ) : (
        <article>
          <header className="row-between wrap">
            <h3 style={{ margin: 0 }}>Running order</h3>
            <div className="row wrap">
              {current && (
                <>
                  <button onClick={next}>Finish &amp; start next →</button>
                  <button className="outline secondary" onClick={() => s.finishAgendaItem(a.id, current.id)}>
                    Finish this item
                  </button>
                </>
              )}
              <button
                className="outline danger"
                onClick={async () => {
                  if (await confirmAction({ title: 'Clear the agenda?', danger: true, confirmLabel: 'Clear' })) s.loadAgendaTemplate(a.id, []);
                }}
              >
                Clear
              </button>
            </div>
          </header>

          <div className="table-scroll">
            <table className="agenda-table">
              <thead>
                <tr>
                  <th>Planned</th>
                  <th>Item</th>
                  <th className="num">Minutes</th>
                  <th className="num">Actual</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {a.agenda.map((item, i) => {
                  const p = plan[i];
                  const used = elapsedMinutes(item.startedAt, item.endedAt);
                  const running = item.startedAt && !item.endedAt;
                  const over = used !== null && item.plannedMinutes > 0 && used > item.plannedMinutes;
                  const target = linkTarget(item);
                  return (
                    <tr key={item.id} className={running ? 'row-running' : item.endedAt ? 'row-done' : ''}>
                      <td className="nowrap sub">
                        {addMinutes(a.agendaStart, p.plannedStartMin)}–{addMinutes(a.agendaStart, p.plannedEndMin)}
                      </td>
                      <td>
                        <span className="agenda-kind" title={AGENDA_KIND_LABEL[item.kind]}>
                          {AGENDA_KIND_ICON[item.kind]}
                        </span>
                        <input
                          type="text"
                          className="agenda-title"
                          defaultValue={item.title}
                          key={item.title}
                          aria-label="Agenda item title"
                          onBlur={(e) => s.updateAgendaItem(a.id, item.id, { title: e.target.value.trim() || item.title })}
                        />
                        <div className="row wrap sub">
                          <select
                            value={item.kind}
                            onChange={(e) => s.updateAgendaItem(a.id, item.id, { kind: e.target.value as AgendaKind })}
                            aria-label="Kind"
                          >
                            {KINDS.map((k) => (
                              <option key={k} value={k}>
                                {AGENDA_KIND_LABEL[k]}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            placeholder="Who leads it"
                            defaultValue={item.presenter}
                            key={`p-${item.presenter}`}
                            aria-label="Presenter"
                            onBlur={(e) => s.updateAgendaItem(a.id, item.id, { presenter: e.target.value })}
                          />
                          {item.kind === 'election' && (
                            <select
                              value={item.linkId ?? ''}
                              onChange={(e) => s.updateAgendaItem(a.id, item.id, { linkId: e.target.value || undefined })}
                              aria-label="Which election"
                            >
                              <option value="">— which position? —</option>
                              {a.positions.map((p2) => (
                                <option key={p2.id} value={p2.id}>
                                  {p2.title}
                                </option>
                              ))}
                            </select>
                          )}
                          {target && (
                            <Link to={target} className="sub">
                              open →
                            </Link>
                          )}
                        </div>
                      </td>
                      <td className="num">
                        <NumberField
                          value={item.plannedMinutes}
                          onChange={(v) => s.updateAgendaItem(a.id, item.id, { plannedMinutes: v ?? 0 })}
                          label={`Planned minutes for ${item.title}`}
                        />
                      </td>
                      <td className="num">
                        {used === null ? <span className="muted">—</span> : <strong className={over ? 'over' : ''}>{used}m</strong>}
                        {running && <div><Badge kind="info">running</Badge></div>}
                      </td>
                      <td>
                        <div role="group" className="mini-group">
                          {!running && (
                            <button className="outline" onClick={() => s.startAgendaItem(a.id, item.id)} title="Start this item">
                              ▶
                            </button>
                          )}
                          <button className="outline secondary" disabled={i === 0} onClick={() => s.moveAgendaItem(a.id, item.id, -1)} aria-label="Move up">
                            ↑
                          </button>
                          <button
                            className="outline secondary"
                            disabled={i === a.agenda.length - 1}
                            onClick={() => s.moveAgendaItem(a.id, item.id, 1)}
                            aria-label="Move down"
                          >
                            ↓
                          </button>
                          <button className="outline danger" onClick={() => s.removeAgendaItem(a.id, item.id)} aria-label={`Remove ${item.title}`}>
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <form
            className="row wrap"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <input
              type="text"
              placeholder="Add an item"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              aria-label="New agenda item"
            />
            <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as AgendaKind })} aria-label="New item kind">
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {AGENDA_KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <label className="inline-field">
              Minutes
              <NumberField value={draft.minutes} onChange={(v) => setDraft({ ...draft, minutes: v })} label="Minutes" />
            </label>
            <button type="submit" disabled={!draft.title.trim()}>
              Add
            </button>
          </form>
        </article>
      )}
    </>
  );
}
