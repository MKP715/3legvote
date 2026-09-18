import { useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import Papa from 'papaparse';
import { saveAs } from 'file-saver';
import { nanoid } from 'nanoid';
import { useAssembly, useStore } from '../store';
import { CHANNEL_LABEL, CHANNELS, type Channel, type VoterRole } from '../engine/types';
import { computeEligibility, regionalTrusteeBalance, rollFromRows } from '../engine/voters';
import { PRESETS } from '../presets';
import { Badge, confirmAction, notify } from '../components/ui';
import { NotFound } from './NotFound';

/**
 * Registration & roll call (Service Manual Appendix D, step 10: "The secretary calls the roll of
 * voting members"). Tracks who is present in the room and online, so eligible voter counts are exact.
 */
export function VotersPage() {
  const { aid } = useParams();
  const a = useAssembly(aid);
  const s = useStore();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'present' | 'absent' | Channel>('all');
  const [form, setForm] = useState({ name: '', roleId: '', group: '', district: '', channel: 'inPerson' as Channel, present: true });
  const fileRef = useRef<HTMLInputElement>(null);

  const el = useMemo(() => (a ? computeEligibility(a.voterRoll, a.roles) : null), [a]);
  if (!a || !el) return <NotFound what="assembly" />;
  const roleName = new Map(a.roles.map((r) => [r.id, r.name]));
  const eligibleIds = new Set(el.eligible.map((v) => v.id));
  const exclusion = new Map(el.excluded.map((x) => [x.voter.id, x.reason]));
  const bal = a.electionType === 'regionalTrustee' ? regionalTrusteeBalance(el.eligible, a.roles) : null;
  const roleId = form.roleId || a.roles.find((r) => r.votes)?.id || a.roles[0]?.id || '';

  const shown = a.voterRoll.filter((v) => {
    if (q && !`${v.name} ${v.group} ${v.district} ${roleName.get(v.roleId) ?? ''}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === 'present') return v.present;
    if (filter === 'absent') return !v.present;
    if (filter === 'inPerson' || filter === 'virtual') return v.channel === filter;
    return true;
  });

  const addVoter = () => {
    if (!form.name.trim()) return;
    s.addVoter(a.id, { ...form, name: form.name.trim(), roleId });
    setForm({ ...form, name: '', group: '', district: '' });
  };

  const onImport = async (f: File | undefined) => {
    if (!f) return;
    const text = await f.text();
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: 'greedy' });
    const voters = rollFromRows(parsed.data, a.roles, () => nanoid(8));
    if (!voters.length) {
      notify('No names found. The CSV needs a header row with at least a “Name” column.', 'error');
      return;
    }
    const replace =
      a.voterRoll.length > 0 &&
      (await confirmAction({
        title: `Import ${voters.length} names`,
        body: <p>Replace the existing roll of {a.voterRoll.length}? Choose Cancel to add these names to it instead.</p>,
        confirmLabel: 'Replace roll',
        danger: true,
      }));
    s.importVoters(a.id, voters, replace);
    notify(`Imported ${voters.length} names.`, 'success');
    if (fileRef.current) fileRef.current.value = '';
  };

  const exportRoll = () => {
    const rows = a.voterRoll.map((v) => ({
      Name: v.name,
      Role: roleName.get(v.roleId) ?? '',
      Group: v.group,
      District: v.district,
      Email: v.email ?? '',
      Channel: CHANNEL_LABEL[v.channel],
      Present: v.present ? 'yes' : 'no',
      'Checked in': v.checkedInAt ? new Date(v.checkedInAt).toLocaleString() : '',
      Voting: eligibleIds.has(v.id) ? 'yes' : v.present ? `no — ${exclusion.get(v.id) ?? ''}` : '',
    }));
    saveAs(new Blob([Papa.unparse(rows)], { type: 'text/csv;charset=utf-8' }), `${a.name.replace(/[^\w]+/g, '-')}-roll-call.csv`);
  };

  const template = () => {
    const csv = Papa.unparse([
      { Name: 'Jane D.', Role: 'GSR', Group: 'Tuesday Night Step', District: '5', Email: '', Channel: 'In-person', Present: '' },
      { Name: 'Sam P.', Role: 'Alternate GSR', Group: 'Tuesday Night Step', District: '5', Email: '', Channel: 'Virtual', Present: '' },
    ]);
    saveAs(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'voter-roll-template.csv');
  };

  const setRoles = (roles: VoterRole[]) => s.setRoles(a.id, roles);

  return (
    <>
      <nav aria-label="breadcrumb">
        <ul>
          <li>
            <Link to={`/a/${a.id}`}>{a.name}</Link>
          </li>
          <li>Roll call</li>
        </ul>
      </nav>
      <div className="row-between wrap">
        <h2 style={{ margin: 0 }}>Registration &amp; roll call</h2>
        <label className="inline-field">
          <input type="checkbox" role="switch" checked={a.useRollForCounts} onChange={(e) => s.updateAssembly(a.id, { useRollForCounts: e.target.checked })} />
          Use this roll for eligible voter counts
        </label>
      </div>
      <p className="muted">
        Who votes: {PRESETS[a.electionType].whoVotes} One person, one vote — no proxies or absentee ballots. Check people in as they arrive (in the room
        or in the virtual waiting room).
      </p>

      <div className="stat-row">
        <div className="stat">
          <span>Present</span>
          <strong>{el.present}</strong>
        </div>
        {CHANNELS.map((ch) => (
          <div className="stat" key={ch}>
            <span>Voting — {CHANNEL_LABEL[ch]}</span>
            <strong>{el.byChannel[ch]}</strong>
          </div>
        ))}
        <div className="stat">
          <span>Voting total</span>
          <strong>{el.total}</strong>
        </div>
        <div className="stat">
          <span>On roll</span>
          <strong>{a.voterRoll.length}</strong>
        </div>
      </div>
      {bal && <div className={bal.ok ? 'ok-box' : 'warn-box'}>{bal.message}</div>}

      <article>
        <header className="row-between wrap">
          <h3 style={{ margin: 0 }}>Voter roll</h3>
          <div className="row wrap">
            <button className="outline" onClick={() => fileRef.current?.click()}>
              Import CSV
            </button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => onImport(e.target.files?.[0])} />
            <button className="outline secondary" onClick={template}>
              CSV template
            </button>
            <button className="outline secondary" onClick={exportRoll} disabled={!a.voterRoll.length}>
              Export attendance
            </button>
            <button
              className="outline danger"
              disabled={!el.present}
              onClick={async () => {
                if (await confirmAction({ title: 'Mark everyone absent?', body: <p>Use this to start a new session’s roll call.</p>, danger: true, confirmLabel: 'Clear roll call' }))
                  s.setAllAbsent(a.id);
              }}
            >
              Clear check-ins
            </button>
          </div>
        </header>

        <form
          className="roll-add"
          onSubmit={(e) => {
            e.preventDefault();
            addVoter();
          }}
        >
          <input type="text" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Voter name" />
          <select value={roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })} aria-label="Role">
            {a.roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <input type="text" placeholder="Group" value={form.group} onChange={(e) => setForm({ ...form, group: e.target.value })} aria-label="Group" />
          <input type="text" placeholder="District" value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} aria-label="District" />
          <select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value as Channel })} aria-label="Attending">
            {CHANNELS.map((ch) => (
              <option key={ch} value={ch}>
                {CHANNEL_LABEL[ch]}
              </option>
            ))}
          </select>
          <label className="inline-field">
            <input type="checkbox" checked={form.present} onChange={(e) => setForm({ ...form, present: e.target.checked })} />
            Present
          </label>
          <button type="submit" disabled={!form.name.trim()}>
            Add
          </button>
        </form>

        <div className="row wrap">
          <input type="search" placeholder="Search names, groups, districts…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Filter">
            <option value="all">Everyone</option>
            <option value="present">Present</option>
            <option value="absent">Not checked in</option>
            <option value="inPerson">In-person</option>
            <option value="virtual">Virtual</option>
          </select>
        </div>

        {a.voterRoll.length === 0 ? (
          <p className="muted">No one on the roll yet. Add names above or import a CSV from your registrar.</p>
        ) : (
          <div className="table-scroll">
            <table className="roll-table">
              <thead>
                <tr>
                  <th>Present</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Group / district</th>
                  <th>Attending</th>
                  <th>Vote</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((v) => (
                  <tr key={v.id} className={v.present ? 'row-present' : ''}>
                    <td>
                      <button
                        className={`checkin ${v.present ? '' : 'outline secondary'}`}
                        onClick={() => s.setPresent(a.id, v.id, !v.present)}
                        aria-pressed={v.present}
                        aria-label={`${v.name} ${v.present ? 'present' : 'absent'}`}
                      >
                        {v.present ? '✓ Here' : 'Check in'}
                      </button>
                    </td>
                    <td>
                      <strong>{v.name}</strong>
                      {v.checkedInAt && <div className="sub muted">{new Date(v.checkedInAt).toLocaleTimeString()}</div>}
                    </td>
                    <td>
                      <select value={v.roleId} onChange={(e) => s.updateVoter(a.id, v.id, { roleId: e.target.value })} aria-label={`Role of ${v.name}`}>
                        {a.roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="sub">{[v.group, v.district && `D${v.district.replace(/^d(istrict)?\s*/i, '')}`].filter(Boolean).join(' · ')}</td>
                    <td>
                      <button
                        className="outline secondary mini"
                        onClick={() => s.updateVoter(a.id, v.id, { channel: v.channel === 'inPerson' ? 'virtual' : 'inPerson' })}
                        title="Switch between in-person and virtual"
                      >
                        {v.channel === 'inPerson' ? '🏛 In-person' : '💻 Virtual'}
                      </button>
                    </td>
                    <td>
                      {eligibleIds.has(v.id) ? (
                        <Badge kind="ok">votes</Badge>
                      ) : v.present ? (
                        <span className="sub muted">{exclusion.get(v.id)}</span>
                      ) : (
                        ''
                      )}
                    </td>
                    <td>
                      <button className="outline danger mini" onClick={() => s.removeVoter(a.id, v.id)} aria-label={`Remove ${v.name}`}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <article>
        <header className="row-between wrap">
          <h3 style={{ margin: 0 }}>Roles &amp; voting rights</h3>
          <button
            className="outline secondary"
            onClick={async () => {
              if (await confirmAction({ title: 'Reset roles to the preset?', body: <p>Voters with a removed role will need a new role.</p>, confirmLabel: 'Reset' }))
                setRoles(structuredClone(PRESETS[a.electionType].roles));
            }}
          >
            Reset to “{PRESETS[a.electionType].label}”
          </button>
        </header>
        <p className="muted small">Voting rights vary between areas — set them to match your guidelines. An alternate votes only when the primary for the same group/district is absent.</p>
        <table>
          <thead>
            <tr>
              <th>Role</th>
              <th>Votes</th>
              <th>Alternate for</th>
              {a.electionType === 'regionalTrustee' && <th>Voting bloc</th>}
              <th />
            </tr>
          </thead>
          <tbody>
            {a.roles.map((r, i) => (
              <tr key={r.id}>
                <td>
                  <input
                    type="text"
                    defaultValue={r.name}
                    onBlur={(e) => setRoles(a.roles.map((x, j) => (j === i ? { ...x, name: e.target.value.trim() || x.name } : x)))}
                    aria-label="Role name"
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={r.votes}
                    onChange={(e) => setRoles(a.roles.map((x, j) => (j === i ? { ...x, votes: e.target.checked } : x)))}
                    aria-label={`${r.name} votes`}
                  />
                </td>
                <td>
                  <select
                    value={r.alternateFor ?? ''}
                    onChange={(e) => setRoles(a.roles.map((x, j) => (j === i ? { ...x, alternateFor: e.target.value || undefined } : x)))}
                    aria-label={`${r.name} is alternate for`}
                  >
                    <option value="">—</option>
                    {a.roles
                      .filter((x) => x.id !== r.id && !x.alternateFor)
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                  </select>
                </td>
                {a.electionType === 'regionalTrustee' && (
                  <td>
                    <select
                      value={r.bloc ?? ''}
                      onChange={(e) => setRoles(a.roles.map((x, j) => (j === i ? { ...x, bloc: (e.target.value || undefined) as VoterRole['bloc'] } : x)))}
                      aria-label={`${r.name} bloc`}
                    >
                      <option value="">—</option>
                      <option value="delegate">Region delegate</option>
                      <option value="conferenceTrustees">Conference Committee on Trustees</option>
                      <option value="trusteesNominating">Trustees’ Nominating Committee</option>
                    </select>
                  </td>
                )}
                <td>
                  <button
                    className="outline danger mini"
                    disabled={a.voterRoll.some((v) => v.roleId === r.id)}
                    title={a.voterRoll.some((v) => v.roleId === r.id) ? 'In use on the roll' : 'Remove role'}
                    onClick={() => setRoles(a.roles.filter((x) => x.id !== r.id))}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="outline" onClick={() => setRoles([...a.roles, { id: nanoid(6), name: 'New role', votes: true }])}>
          Add role
        </button>
      </article>
    </>
  );
}
