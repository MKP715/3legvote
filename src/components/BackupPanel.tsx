import { useEffect, useRef, useState } from 'react';
import type { Assembly } from '../engine/types';
import { useStore } from '../store';
import { backupNow, chooseBackupFolder, forgetBackupFolder, reconnectBackupFolder, restoreBackupFolder, useBackup } from '../backup';
import { exportJson } from '../exporters';
import { confirmAction, notify } from './ui';

const fmtTime = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString() : '');

/**
 * Watches every election and writes it to the chosen folder shortly after each change,
 * labelling the snapshot with whatever was just recorded ("3rd ballot recorded").
 */
export function AutoBackup() {
  useEffect(() => {
    void restoreBackupFolder();
    const seen = new Map<string, string>(); // assembly id → updatedAt already written
    let timer: number | undefined;
    let queue: string[] = [];

    const flush = async () => {
      const ids = [...new Set(queue)];
      queue = [];
      const { handle, needsPermission } = useBackup.getState();
      if (!handle || needsPermission) return;
      for (const id of ids) {
        const a = useStore.getState().assemblies.find((x) => x.id === id);
        if (!a) continue;
        const label = a.log[a.log.length - 1]?.action ?? 'change';
        if (await backupNow(a, label)) seen.set(a.id, a.updatedAt);
      }
    };

    // Prime with what is already saved so opening the app doesn't rewrite everything.
    for (const a of useStore.getState().assemblies) seen.set(a.id, a.updatedAt);

    const unsubscribe = useStore.subscribe((state) => {
      const { handle, needsPermission } = useBackup.getState();
      if (!handle || needsPermission) return;
      for (const a of state.assemblies) {
        if (seen.get(a.id) !== a.updatedAt) {
          seen.set(a.id, a.updatedAt);
          queue.push(a.id);
        }
      }
      if (queue.length) {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => void flush(), 1500);
      }
    });
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);
  return null;
}

/** One-line state for the election screens. */
export function BackupChip({ assembly }: { assembly: Assembly }) {
  const { supported, folderName, needsPermission, lastSavedAt, lastError, saving } = useBackup();
  if (!supported || !folderName) return null;
  return (
    <span className="backup-chip">
      {needsPermission ? (
        <button className="outline mini" onClick={() => void reconnectBackupFolder()}>
          ⚠ Reconnect backup folder
        </button>
      ) : lastError ? (
        <button className="outline danger mini" onClick={() => void backupNow(assembly, 'retry')}>
          ⚠ Backup failed — retry
        </button>
      ) : (
        <span className="muted small" title={`Backing up to ${folderName}`}>
          💾 {saving ? 'Saving…' : lastSavedAt ? `Backed up ${fmtTime(lastSavedAt)}` : `Backup folder: ${folderName}`}
        </span>
      )}
    </span>
  );
}

/** Full panel on the assembly page. */
export function BackupPanel({ assembly }: { assembly: Assembly }) {
  const { supported, folderName, needsPermission, lastSavedAt, lastFile, lastError, saving } = useBackup();
  const [busy, setBusy] = useState(false);
  const exportedAt = useRef<string | null>(null);

  const connect = async () => {
    setBusy(true);
    const ok = await chooseBackupFolder();
    setBusy(false);
    if (ok) {
      const saved = await backupNow(assembly, 'backup folder connected');
      notify(saved ? 'Backup folder connected — this election has been saved to it.' : 'Folder connected.', 'success');
    }
  };

  return (
    <article className="panel">
      <header className="row-between wrap">
        <h3 style={{ margin: 0 }}>Automatic backup</h3>
        {folderName && !needsPermission && !lastError && (
          <span className="badge badge-ok">{saving ? 'Saving…' : lastSavedAt ? `Saved ${fmtTime(lastSavedAt)}` : 'Connected'}</span>
        )}
      </header>

      {!supported ? (
        <>
          <p className="warn-box">
            This browser cannot write to a folder on its own. Use <strong>Chrome or Edge on a laptop</strong> for automatic backups — or export a copy by
            hand after each position.
          </p>
          <button
            className="outline"
            onClick={() => {
              exportJson(assembly);
              exportedAt.current = new Date().toISOString();
            }}
          >
            Export a copy now
          </button>
        </>
      ) : !folderName ? (
        <>
          <p className="muted">
            Choose a folder once — a USB stick, or a folder that syncs to the cloud. After every ballot the app writes the whole election there, so a
            closed laptop or a cleared browser cannot lose the assembly.
          </p>
          <button onClick={connect} aria-busy={busy}>
            Choose a backup folder…
          </button>
        </>
      ) : (
        <>
          <p className="muted">
            Saving to <strong>{folderName}</strong> → <code>{assembly.name}</code>. Each change writes <code>latest.json</code> and a time-stamped
            snapshot, so you can go back to any point in the assembly.
            {lastFile && <> Last file: <code>{lastFile}</code>.</>}
          </p>
          {needsPermission && (
            <div className="warn-box row-between wrap">
              <span>The browser needs your permission again for this folder (it asks once per session).</span>
              <button className="outline" onClick={() => void reconnectBackupFolder()}>
                Reconnect
              </button>
            </div>
          )}
          {lastError && <p className="warn-box">{lastError}</p>}
          <div className="row wrap">
            <button className="outline" onClick={() => void backupNow(assembly, 'manual backup').then((ok) => notify(ok ? 'Backed up.' : 'Could not back up — check the folder.', ok ? 'success' : 'error'))}>
              Back up now
            </button>
            <button className="outline secondary" onClick={connect}>
              Change folder
            </button>
            <button
              className="outline secondary"
              onClick={async () => {
                if (await confirmAction({ title: 'Stop automatic backups?', body: <p>The files already written are kept.</p>, confirmLabel: 'Stop' }))
                  await forgetBackupFolder();
              }}
            >
              Stop
            </button>
          </div>
        </>
      )}
    </article>
  );
}
