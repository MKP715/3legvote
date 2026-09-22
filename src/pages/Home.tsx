import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useStore } from '../store';
import { computePosition } from '../engine/thirdLegacy';
import type { ElectionType, Voter } from '../engine/types';
import { PRESETS } from '../presets';
import { exportAllJson, readJsonFile } from '../exporters';
import { attempt, choose, confirmAction, notify } from '../components/ui';

export function Home() {
  const assemblies = useStore((s) => s.assemblies);
  const s = useStore();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [type, setType] = useState<ElectionType>('area');
  const [picked, setPicked] = useState<string[]>(PRESETS.area.positions);
  const [custom, setCustom] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const preset = PRESETS[type];

  const chooseType = (t: ElectionType) => {
    setType(t);
    setPicked(PRESETS[t].positions);
  };

  const create = () => {
    const extra = custom
      .split(/[\n;,]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    const all = [...preset.positions, ...preset.optionalPositions];
    const ordered = [...all.filter((p) => picked.includes(p)), ...extra];
    const id = s.createAssembly(name || preset.label, ordered, type);
    nav(`/a/${id}`);
  };

  const loadDemo = () => {
    const id = s.createAssembly('Practice Assembly (demo)', ['Delegate', 'Alternate Delegate', 'Area Chair'], 'area');
    const a = useStore.getState().assemblies.find((x) => x.id === id)!;
    s.setVoters(id, 'inPerson', 84);
    s.setVoters(id, 'virtual', 36);
    s.updateAssembly(id, { location: 'Practice — not a real election', chair: 'Area Chair' });
    const [del, , chair] = a.positions;
    const cands: [string, string][] = [
      ['Pat M.', 'District 3'],
      ['Chris R.', 'District 7'],
      ['Jordan T.', 'District 12'],
      ['Sam K.', 'District 1'],
      ['Alex D.', 'District 9'],
    ];
    for (const [n, d] of cands) s.addCandidate(id, del.id, n, d);
    for (const n of ['Taylor B.', 'Morgan L.']) s.addCandidate(id, chair.id, n);
    const roles = a.roles;
    const gsr = roles.find((r) => r.id === 'gsr')!.id;
    const dcm = roles.find((r) => r.id === 'dcm')!.id;
    const groups = ['Serenity', 'Tuesday Night Step', 'Keep It Simple', 'Big Book Study', 'Early Birds', 'Hope', 'New Freedom', 'Came to Believe'];
    const roll: Voter[] = groups.map((g, i) => ({
      id: `v${i}`,
      name: `GSR — ${g}`,
      roleId: gsr,
      group: g,
      district: String((i % 4) + 1),
      channel: i % 3 === 0 ? 'virtual' : 'inPerson',
      present: true,
    }));
    const officer = roles.find((r) => r.id === 'officer')!.id;
    const altgsr = roles.find((r) => r.id === 'altgsr')!.id;
    roll.push(
      { id: 'vd1', name: 'DCM — District 1', roleId: dcm, group: 'District 1', district: '1', channel: 'inPerson', present: true },
      { id: 'vd2', name: 'DCM — District 2', roleId: dcm, group: 'District 2', district: '2', channel: 'virtual', present: true },
      { id: 'vo1', name: 'Area Secretary', roleId: officer, group: 'Area', district: '', channel: 'inPerson', present: true },
      { id: 'vo2', name: 'Area Treasurer', roleId: officer, group: 'Area', district: '', channel: 'inPerson', present: true },
      // An alternate whose GSR is present: shown as not voting until the GSR leaves.
      { id: 'va1', name: 'Alt GSR — Serenity', roleId: altgsr, group: 'Serenity', district: '1', channel: 'inPerson', present: true },
    );
    s.importVoters(id, roll, true);
    nav(`/a/${id}`);
    notify('Demo assembly created. Try running the Delegate election.', 'success');
  };

  const onImport = async (f: File | undefined) => {
    if (!f) return;
    try {
      const raw = (await readJsonFile(f)) as { assemblies?: unknown[] };
      if (raw && Array.isArray(raw.assemblies)) {
        let restored = 0;
        let skipped = 0;
        for (const item of raw.assemblies) {
          const inc = item as { id?: string; name?: string; updatedAt?: string };
          const existing = assemblies.find((x) => x.id === inc?.id);
          if (existing) {
            const when = (iso?: string) => (iso ? new Date(iso).toLocaleString() : 'unknown');
            const choice = await choose({
              title: `“${existing.name}” is already here`,
              body: (
                <p>
                  In the backup: saved {when(inc.updatedAt)}. On this device: saved {when(existing.updatedAt)}.
                </p>
              ),
              options: [
                { value: 'replace', label: 'Use the backup', danger: true },
                { value: 'both', label: 'Keep both' },
                { value: 'skip', label: 'Keep what is here' },
              ],
            });
            if (choice === 'skip' || !choice) {
              skipped++;
              continue;
            }
            if (choice === 'replace') s.deleteAssembly(existing.id);
          }
          if (attempt(() => s.importAssembly(item, existing ? false : undefined))) restored++;
        }
        notify(
          `Restored ${restored} election${restored === 1 ? '' : 's'}${skipped ? `; ${skipped} left as ${skipped === 1 ? 'it was' : 'they were'}` : ''}.`,
          'success',
        );
      } else {
        let id = '';
        if (attempt(() => (id = s.importAssembly(raw)), 'Assembly imported.')) nav(`/a/${id}`);
      }
    } catch (e) {
      notify(`Could not read that file: ${(e as Error).message}`, 'error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <>
      <section className="hero">
        <h1>Third Legacy Vote</h1>
        <p>
          Run A.A. service elections by the <strong>Third Legacy Procedure</strong> — multiple positions, in-person and virtual voters, exact two-thirds /
          one-fifth / one-third calculations, the fifth-ballot motion, and going to the hat. It works offline, and everything stays in this browser.
        </p>
        <p>
          <Link to="/guide">How the Third Legacy Procedure works →</Link>
        </p>
      </section>

      <div className="grid-2">
        <article>
          <header>
            <h3 style={{ margin: 0 }}>New election</h3>
          </header>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create();
            }}
          >
            <label>
              Type of election
              <select value={type} onChange={(e) => chooseType(e.target.value as ElectionType)}>
                {(Object.keys(PRESETS) as ElectionType[]).map((k) => (
                  <option key={k} value={k}>
                    {PRESETS[k].label}
                  </option>
                ))}
              </select>
              <small className="muted">{preset.description}</small>
            </label>
            <label>
              Name
              <input type="text" placeholder="e.g. Area 00 Fall Election Assembly 2026" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            {preset.positions.length + preset.optionalPositions.length > 0 && (
              <fieldset>
                <legend>Positions, in the order they are elected (you can change this later)</legend>
                {[...preset.positions, ...preset.optionalPositions].map((p) => (
                  <label key={p}>
                    <input
                      type="checkbox"
                      checked={picked.includes(p)}
                      onChange={(e) => setPicked((x) => (e.target.checked ? [...x, p] : x.filter((y) => y !== p)))}
                    />
                    {p}
                  </label>
                ))}
              </fieldset>
            )}
            <label>
              Other positions (comma separated)
              <input type="text" placeholder="e.g. Archivist, Grapevine Chair" value={custom} onChange={(e) => setCustom(e.target.value)} />
            </label>
            <p className="sub muted">Who votes: {preset.whoVotes}</p>
            <button type="submit">Create</button>
          </form>
        </article>

        <article>
          <header>
            <h3 style={{ margin: 0 }}>Your elections</h3>
          </header>
          {assemblies.length === 0 && <p className="muted">None yet. Create one, import a saved file, or try the demo.</p>}
          <ul className="assembly-list">
            {assemblies.map((a) => {
              const done = a.positions.filter((p) => computePosition(p, a.settings).phase.kind === 'elected').length;
              return (
                <li key={a.id}>
                  <div>
                    <Link to={`/a/${a.id}`}>
                      <strong>{a.name}</strong>
                    </Link>
                    <div className="sub muted">
                      {a.date} · {PRESETS[a.electionType]?.label} · {done}/{a.positions.length} filled
                    </div>
                  </div>
                  <div role="group" className="mini-group">
                    <button className="outline secondary" onClick={() => nav(`/a/${s.duplicateAssembly(a.id)}`)} title="Duplicate">
                      Copy
                    </button>
                    <button
                      className="outline danger"
                      onClick={async () => {
                        if (
                          await confirmAction({
                            title: `Delete “${a.name}”?`,
                            body: <p>This permanently removes the election and all its ballots from this browser. Export it first if you need a record.</p>,
                            danger: true,
                            confirmLabel: 'Delete',
                          })
                        )
                          s.deleteAssembly(a.id);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="row wrap">
            <button className="outline" onClick={() => fileRef.current?.click()}>
              Import / restore (.json)
            </button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onImport(e.target.files?.[0])} />
            <button className="outline secondary" disabled={!assemblies.length} onClick={() => exportAllJson(assemblies)}>
              Back up everything
            </button>
            <button className="outline secondary" onClick={loadDemo}>
              Try a demo
            </button>
          </div>
          <p className="sub muted">
            Data is saved only in this browser on this device. Back up before clearing browser data, and use Export/Import to move to another computer.
          </p>
        </article>
      </div>
    </>
  );
}
