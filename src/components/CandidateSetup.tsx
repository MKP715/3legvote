import { useRef, useState } from 'react';
import Papa from 'papaparse';
import type { Assembly, Position } from '../engine/types';
import { useStore } from '../store';
import { normName } from '../engine/voters';
import { candidateTemplate, saveCsv } from '../templates';
import { attempt, confirmAction, notify } from './ui';

/** Nominations: build the list of eligible candidates, then close nominations. */
export function CandidateSetup({ assembly, position }: { assembly: Assembly; position: Position }) {
  const s = useStore();
  const [name, setName] = useState('');
  const [district, setDistrict] = useState('');
  const [copyFrom, setCopyFrom] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const others = assembly.positions.filter((p) => p.id !== position.id);

  /** Import a prepared list of eligible candidates (Name, District, Note). */
  const importCsv = async (f: File | undefined) => {
    if (!f) return;
    try {
      const text = (await f.text()).replace(/^\uFEFF/, '');
      const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: 'greedy' });
      const pick = (row: Record<string, string>, keys: string[]) => {
        for (const k of Object.keys(row)) {
          const nk = normName(k);
          if (keys.some((x) => nk === x || nk.includes(x))) return (row[k] ?? '').trim();
        }
        return '';
      };
      let added = 0;
      let failed = 0;
      for (const row of parsed.data) {
        const n = pick(row, ['name', 'candidate', 'nombre', 'nom']);
        if (!n) continue;
        const d = pick(row, ['district', 'distrito', 'area', 'group']);
        // Collect the count rather than showing a toast per duplicate row.
        try {
          s.addCandidate(assembly.id, position.id, n, d);
          added++;
        } catch {
          failed++;
        }
      }
      notify(added ? `Added ${added} candidate(s)${failed ? `; ${failed} could not be added` : ''}.` : 'No candidates found in that file.', added ? 'success' : 'error');
    } catch (e) {
      notify(`Could not read that file: ${(e as Error).message}`, 'error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const add = () => {
    // Accept a pasted list: "Ann R., Bob T.; Cy W." as well as one name at a time.
    const parts = name
      .split(/[\n;,]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    const failed: string[] = [];
    let added = 0;
    for (const part of parts) {
      if (attempt(() => s.addCandidate(assembly.id, position.id, part, parts.length === 1 ? district : undefined))) added++;
      else failed.push(part);
    }
    // Keep whatever could not be added in the box so nothing is lost.
    setName(failed.join('; '));
    if (added && !failed.length) setDistrict('');
  };

  const start = async () => {
    const names = position.candidates.map((c) => c.name);
    const ok = await confirmAction({
      title: `Close nominations for ${position.title}?`,
      body: (
        <>
          <p>
            The candidate list will be locked (candidates may still withdraw voluntarily). {names.length === 1 && assembly.settings.singleCandidate === 'autoElect'
              ? 'With only one candidate, they will be declared elected (per your settings).'
              : names.length === 1
                ? 'With only one candidate, a yes/no confirmation ballot needing two-thirds will be held.'
                : 'Balloting begins with the 1st ballot.'}
          </p>
          <ol>
            {names.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ol>
        </>
      ),
      confirmLabel: 'Close nominations',
    });
    if (ok) attempt(() => s.startBalloting(assembly.id, position.id), 'Nominations closed.');
  };

  return (
    <article className="panel">
      <header>
        <h3 style={{ margin: 0 }}>Nominations — eligible candidates</h3>
      </header>
      <p className="muted">
        Post the full names (and districts) of eligible candidates. The chair asks whether anyone is unable to serve — remove those names. Some areas
        also allow nominations from the floor. Add several names at once by separating them with semicolons.
      </p>

      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input type="text" placeholder="Candidate name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Candidate name" />
        <input
          type="text"
          className="district-input"
          placeholder="District (optional)"
          value={district}
          onChange={(e) => setDistrict(e.target.value)}
          aria-label="Candidate district"
        />
        <button type="submit" disabled={!name.trim()}>
          Add
        </button>
      </form>

      {position.candidates.length > 0 ? (
        <ol className="cand-list">
          {position.candidates.map((c, i) => (
            <li key={c.id}>
              <input
                key={c.name}
                type="text"
                defaultValue={c.name}
                aria-label={`Name of candidate ${i + 1}`}
                onBlur={(e) => s.renameCandidate(assembly.id, position.id, c.id, e.target.value)}
              />
              <input
                key={`d-${c.district ?? ''}`}
                type="text"
                className="district-input"
                placeholder="District"
                defaultValue={c.district ?? ''}
                aria-label={`District of ${c.name}`}
                onBlur={(e) => s.updateCandidate(assembly.id, position.id, c.id, { district: e.target.value.trim() || undefined })}
              />
              <div role="group" className="mini-group">
                <button className="outline secondary" disabled={i === 0} onClick={() => s.moveCandidate(assembly.id, position.id, c.id, -1)} aria-label="Move up">
                  ↑
                </button>
                <button
                  className="outline secondary"
                  disabled={i === position.candidates.length - 1}
                  onClick={() => s.moveCandidate(assembly.id, position.id, c.id, 1)}
                  aria-label="Move down"
                >
                  ↓
                </button>
                <button
                  className="outline danger"
                  aria-label={`Remove ${c.name}`}
                  onClick={async () => {
                    if (
                      await confirmAction({
                        title: `Remove ${c.name} from the list?`,
                        body: <p>Use this when someone is unable to serve. Their name will not appear on the board or the ballots.</p>,
                        confirmLabel: 'Remove',
                        danger: true,
                      })
                    )
                      s.removeCandidate(assembly.id, position.id, c.id);
                  }}
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">No candidates yet.</p>
      )}

      {position.candidates.length > 1 && (
        <div className="row wrap">
          <span className="muted small">Posting order:</span>
          <button className="outline secondary mini" onClick={() => s.sortCandidates(assembly.id, position.id, 'alpha')}>
            A → Z
          </button>
          <button className="outline secondary mini" onClick={() => s.sortCandidates(assembly.id, position.id, 'shuffle')}>
            Random draw
          </button>
        </div>
      )}

      <div className="row wrap">
        <button className="outline secondary mini" onClick={() => fileRef.current?.click()}>
          Import list (CSV)
        </button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => importCsv(e.target.files?.[0])} />
        <button className="outline secondary mini" onClick={() => saveCsv(candidateTemplate(), 'candidate-list-template.csv')}>
          Download template
        </button>
        <small className="muted">Columns: Name, District, Note. Useful when the eligibility list is prepared in advance.</small>
      </div>

      {others.length > 0 && (
        <div className="row">
          <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} aria-label="Copy candidates from position">
            <option value="">Copy candidates from another position…</option>
            {others.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} ({p.candidates.length})
              </option>
            ))}
          </select>
          <button
            className="outline"
            disabled={!copyFrom}
            onClick={() => {
              const n = s.copyCandidates(assembly.id, position.id, copyFrom);
              notify(n ? `Copied ${n} candidate(s). Remove anyone not willing to stand.` : 'No new candidates to copy.', n ? 'success' : 'info');
            }}
          >
            Copy
          </button>
        </div>
      )}

      <details>
        <summary>Position options</summary>
        <label>
          If this position is decided by lot, elect the <strong>second</strong> name out of the hat to:
          <select
            value={position.hatSecondToPositionId ?? ''}
            onChange={(e) => s.updatePosition(assembly.id, position.id, { hatSecondToPositionId: e.target.value || null })}
          >
            <option value="">— nobody (default Third Legacy procedure) —</option>
            {others.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          <small className="muted">Some areas elect the alternate delegate this way. Only use it if your area’s guidelines say so.</small>
        </label>
        <label>
          Description / eligibility notes
          <textarea
            rows={2}
            defaultValue={position.description ?? ''}
            onBlur={(e) => s.updatePosition(assembly.id, position.id, { description: e.target.value })}
          />
        </label>
      </details>

      <footer className="row-end">
        <button onClick={start} disabled={!position.candidates.length}>
          Close nominations &amp; begin balloting
        </button>
      </footer>
    </article>
  );
}
