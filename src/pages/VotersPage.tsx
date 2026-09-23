import { useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import Papa from 'papaparse';
import { nanoid } from 'nanoid';
import { useAssembly, useStore } from '../store';
import { CHANNEL_LABEL, CHANNELS, type Assembly, type Channel, type Voter, type VoterRole } from '../engine/types';
import { computeEligibility, regionalTrusteeBalance, rollFromRows, type RollImport } from '../engine/voters';
import { PRESETS } from '../presets';
import { ROLL_COLUMN_HELP, saveCsv, voterRollTemplate } from '../templates';
import { Badge, choose, confirmAction, notify } from '../components/ui';
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
  const [importInfo, setImportInfo] = useState<RollImport | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const el = useMemo(() => (a ? computeEligibility(a.voterRoll, a.roles) : null), [a]);
  if (!a || !el) return <NotFound what="assembly" />;
  const roleName = new Map(a.roles.map((r) => [r.id, r.name]));
  const eligibleIds = new Set(el.eligible.map((v) => v.id));
  const exclusion = new Map(el.excluded.map((x) => [x.voter.id, x.reason]));
  const bal = a.electionType === 'regionalTrustee' ? regionalTrusteeBalance(el.eligible, a.roles) : null;
  const roleId = form.roleId || a.roles.find((r) => r.votes)?.id || a.roles[0]?.id || '';

  const showRegistration = a.attendanceOptions.length > 0 || a.voterFields.length > 0;

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
    try {
      const text = (await f.text()).replace(/^\uFEFF/, '');
      const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: 'greedy' });
      const result = rollFromRows(parsed.data, a.roles, () => nanoid(8));
      if (!result.voters.length) {
        notify('No names found. The file needs a header row with at least a “Name” column — download the template to see the format.', 'error');
        return;
      }
      let replace = false;
      if (a.voterRoll.length > 0) {
        const choice = await choose({
          title: `Import ${result.voters.length} names`,
          body: (
            <>
              <p>
                This roll already has {a.voterRoll.length} name(s). Replace them with the file, or add the file’s names to what is already here?
              </p>
              <p className="sub muted">Columns used: {result.usedColumns.join(', ') || 'none recognised'}.</p>
            </>
          ),
          options: [
            { value: 'replace', label: 'Replace the roll', danger: true },
            { value: 'add', label: 'Add to the roll' },
          ],
        });
        if (!choice) return; // Cancel / Escape does nothing at all
        replace = choice === 'replace';
      }
      s.importVoters(a.id, result.voters, replace);
      setImportInfo(result);
      const problems = result.unmatchedRoles.length + result.duplicateNames.length + result.skipped;
      notify(
        problems
          ? `Imported ${result.voters.length} names — ${problems} thing(s) to check below.`
          : `Imported ${result.voters.length} names.`,
        problems ? 'info' : 'success',
      );
    } catch (e) {
      notify(`Could not read that file: ${(e as Error).message}`, 'error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
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
    saveCsv(rows, `${a.name.replace(/[^\w]+/g, '-')}-roll-call.csv`);
  };

  const template = () => {
    saveCsv(voterRollTemplate(a), 'voter-roll-template.csv');
    notify('Template downloaded — it is filled with example rows for this election’s roles.', 'success');
  };

  const addMissingRoles = () => {
    const have = new Set(a.roles.map((r) => r.id));
    const missing = PRESETS[a.electionType].roles.filter((r) => !have.has(r.id));
    if (!missing.length) {
      notify('All the roles for this type of election are already listed.', 'info');
      return;
    }
    setRoles([...a.roles, ...structuredClone(missing)]);
    notify(`Added: ${missing.map((r) => r.name).join(', ')}.`, 'success');
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
        <Link role="button" className="outline" to={`/a/${a.id}/checkin`}>
          📷 Check-in desk
        </Link>
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
              Download template
            </button>
            <button className="outline secondary" onClick={exportRoll} disabled={!a.voterRoll.length}>
              Export attendance
            </button>
            <Link role="button" className="outline secondary" to={`/a/${a.id}/ballots`}>
              Print voting cards
            </Link>
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

        <RegistrationOptions assembly={a} />

        <details className="panel-lite">
          <summary>How to prepare the file before you import</summary>
          <p className="muted small">
            Any spreadsheet works — export it as CSV (Excel: <em>File → Save As → CSV UTF-8</em>; Google Sheets: <em>File → Download → CSV</em>). The
            first row must be the column names. Extra columns are ignored, so a registrar’s existing list usually imports as it is. Download the
            template to see a filled-in example for this election.
          </p>
          <table>
            <thead>
              <tr>
                <th>Column</th>
                <th>What to put in it</th>
              </tr>
            </thead>
            <tbody>
              {ROLL_COLUMN_HELP.map(([col, help]) => (
                <tr key={col}>
                  <td>
                    <strong>{col}</strong>
                  </td>
                  <td className="sub">{help}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">Roles available in this election: {a.roles.map((r) => r.name).join(' · ')}.</p>
        </details>

        {importInfo && (importInfo.unmatchedRoles.length > 0 || importInfo.duplicateNames.length > 0 || importInfo.skipped > 0) && (
          <div className="warn-box">
            <strong>Check the import:</strong>
            <ul>
              {importInfo.unmatchedRoles.length > 0 && (
                <li>
                  Role{importInfo.unmatchedRoles.length > 1 ? 's' : ''} not recognised: {importInfo.unmatchedRoles.join(', ')} — those people were given
                  “{importInfo.fallbackRole}”. Set their role in the table below, or add the role under “Roles &amp; voting rights”.
                </li>
              )}
              {importInfo.duplicateNames.length > 0 && (
                <li>Listed more than once: {importInfo.duplicateNames.join(', ')}. One person has one vote — remove the extra rows.</li>
              )}
              {importInfo.skipped > 0 && <li>{importInfo.skipped} row(s) had no name and were skipped.</li>}
            </ul>
            <button className="outline mini" onClick={() => setImportInfo(null)}>
              Dismiss
            </button>
          </div>
        )}

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
                  {showRegistration && <th>Signed up for</th>}
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
                    {showRegistration && (
                      <td>
                        <RegistrationCell assembly={a} voter={v} />
                      </td>
                    )}
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
                      <button
                        className="outline danger mini"
                        aria-label={`Remove ${v.name}`}
                        onClick={async () => {
                          if (
                            !v.present ||
                            (await confirmAction({
                              title: `Remove ${v.name} from the roll?`,
                              body: <p>They are checked in, so this changes the number of eligible voters.</p>,
                              confirmLabel: 'Remove',
                              danger: true,
                            }))
                          )
                            s.removeVoter(a.id, v.id);
                        }}
                      >
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
          <div className="row wrap">
            <button className="outline" onClick={addMissingRoles}>
              Add missing roles
            </button>
            <button
              className="outline secondary"
              onClick={async () => {
                if (
                  await confirmAction({
                    title: 'Reset roles to the preset?',
                    body: <p>Voters with a removed role will need a new role.</p>,
                    confirmLabel: 'Reset',
                  })
                )
                  setRoles(structuredClone(PRESETS[a.electionType].roles));
              }}
            >
              Reset to “{PRESETS[a.electionType].label}”
            </button>
          </div>
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
                    value={r.name}
                    onChange={(e) => setRoles(a.roles.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                    onBlur={(e) => !e.target.value.trim() && setRoles(a.roles.map((x, j) => (j === i ? { ...x, name: `Role ${i + 1}` } : x)))}
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


/**
 * What people register for (the assembly itself, a convention, a banquet...) and any extra
 * detail the registrar collects. Both are saved with the assembly and can be printed on the
 * name badges.
 */
function RegistrationOptions({ assembly }: { assembly: Assembly }) {
  const s = useStore();
  const a = assembly;
  const [option, setOption] = useState('');
  const [field, setField] = useState('');
  return (
    <details className="panel-lite">
      <summary>
        Registration options &amp; extra details ({a.attendanceOptions.length} option(s), {a.voterFields.length} field(s))
      </summary>
      <p className="muted small">
        Tick these for each person as they register. They show on the roll, on the name badges and in the attendance section of the report.
      </p>
      <div className="grid-2">
        <div>
          <strong className="small">Registration options</strong>
          <ul className="chip-list">
            {a.attendanceOptions.map((o) => (
              <li key={o.id} className="chip">
                <input
                  type="text"
                  defaultValue={o.label}
                  key={o.label}
                  aria-label={`Option ${o.label}`}
                  onBlur={(e) => {
                    const label = e.target.value.trim();
                    if (label && label !== o.label)
                      s.setAttendanceOptions(
                        a.id,
                        a.attendanceOptions.map((x) => (x.id === o.id ? { ...x, label } : x)),
                      );
                  }}
                />
                <label className="inline-field" title="Print this on the badge">
                  <input
                    type="checkbox"
                    checked={o.showOnBadge}
                    onChange={(e) =>
                      s.setAttendanceOptions(
                        a.id,
                        a.attendanceOptions.map((x) => (x.id === o.id ? { ...x, showOnBadge: e.target.checked } : x)),
                      )
                    }
                  />
                  badge
                </label>
                <button
                  className="outline danger mini"
                  aria-label={`Remove ${o.label}`}
                  onClick={() =>
                    s.setAttendanceOptions(
                      a.id,
                      a.attendanceOptions.filter((x) => x.id !== o.id),
                    )
                  }
                >
                  X
                </button>
              </li>
            ))}
          </ul>
          <form
            className="row wrap"
            onSubmit={(e) => {
              e.preventDefault();
              const label = option.trim();
              if (!label) return;
              s.setAttendanceOptions(a.id, [...a.attendanceOptions, { id: nanoid(6), label, showOnBadge: true }]);
              setOption('');
            }}
          >
            <input
              type="text"
              value={option}
              onChange={(e) => setOption(e.target.value)}
              placeholder="e.g. Banquet"
              aria-label="New registration option"
            />
            <button type="submit" className="outline" disabled={!option.trim()}>
              Add
            </button>
          </form>
        </div>
        <div>
          <strong className="small">Extra details collected at registration</strong>
          <ul className="chip-list">
            {a.voterFields.map((f) => (
              <li key={f.id} className="chip">
                <input
                  type="text"
                  defaultValue={f.label}
                  key={f.label}
                  aria-label={`Field ${f.label}`}
                  onBlur={(e) => {
                    const label = e.target.value.trim();
                    if (label && label !== f.label)
                      s.setVoterFields(
                        a.id,
                        a.voterFields.map((x) => (x.id === f.id ? { ...x, label } : x)),
                      );
                  }}
                />
                <label className="inline-field" title="Print this on the badge">
                  <input
                    type="checkbox"
                    checked={f.showOnBadge}
                    onChange={(e) =>
                      s.setVoterFields(
                        a.id,
                        a.voterFields.map((x) => (x.id === f.id ? { ...x, showOnBadge: e.target.checked } : x)),
                      )
                    }
                  />
                  badge
                </label>
                <button
                  className="outline danger mini"
                  aria-label={`Remove ${f.label}`}
                  onClick={() =>
                    s.setVoterFields(
                      a.id,
                      a.voterFields.filter((x) => x.id !== f.id),
                    )
                  }
                >
                  X
                </button>
              </li>
            ))}
          </ul>
          <form
            className="row wrap"
            onSubmit={(e) => {
              e.preventDefault();
              const label = field.trim();
              if (!label) return;
              s.setVoterFields(a.id, [...a.voterFields, { id: nanoid(6), label, showOnBadge: false }]);
              setField('');
            }}
          >
            <input
              type="text"
              value={field}
              onChange={(e) => setField(e.target.value)}
              placeholder="e.g. Dietary needs"
              aria-label="New registration field"
            />
            <button type="submit" className="outline" disabled={!field.trim()}>
              Add
            </button>
          </form>
        </div>
      </div>
    </details>
  );
}

/** One person's registration: what they are signed up for, and any extra detail. */
function RegistrationCell({ assembly, voter }: { assembly: Assembly; voter: Voter }) {
  const s = useStore();
  const a = assembly;
  const on = new Set(voter.attending ?? []);
  return (
    <div className="reg-cell">
      {a.attendanceOptions.map((o) => (
        <button
          key={o.id}
          className={`chip-toggle ${on.has(o.id) ? 'on' : ''}`}
          aria-pressed={on.has(o.id)}
          onClick={() => s.setVoterAttending(a.id, voter.id, o.id, !on.has(o.id))}
        >
          {o.label}
        </button>
      ))}
      {a.voterFields.map((f) => (
        <input
          key={f.id}
          type="text"
          className="reg-field"
          placeholder={f.label}
          aria-label={`${f.label} for ${voter.name}`}
          defaultValue={voter.custom?.[f.id] ?? ''}
          onBlur={(e) => s.setVoterCustom(a.id, voter.id, f.id, e.target.value)}
        />
      ))}
    </div>
  );
}
