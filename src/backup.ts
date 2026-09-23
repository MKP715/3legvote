/**
 * Automatic backup to a folder on this device (a USB stick, a synced drive, anywhere).
 *
 * The folder is chosen once and remembered between sessions. After every recorded ballot —
 * and any other change — the app writes the whole election to that folder: `latest.json`,
 * which is overwritten, plus a time-stamped snapshot of each step so a mistake can be
 * recovered from. It uses the browser's File System Access API, so nothing is uploaded and
 * no server is involved. Firefox and Safari do not support it yet; there the app falls back
 * to reminding the operator to export a backup by hand.
 */
import { create } from 'zustand';
import { del, get, set } from 'idb-keyval';
import type { Assembly } from './engine/types';

const HANDLE_KEY = 'third-legacy-backup-folder';

/* The minimum of the File System Access API we use — also what the tests fake. */
export interface WritableLike {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}
export interface FileHandleLike {
  createWritable(): Promise<WritableLike>;
}
export interface DirectoryHandleLike {
  name: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandleLike>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandleLike>;
  queryPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
}

export function backupSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export function folderSlug(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/[^\w\s-]+/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 60) || 'election'
  );
}

/** 2026-09-23_1432-05 — sorts chronologically in a file listing. */
export function fileStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

function labelSlug(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'change'
  );
}

async function writeFile(dir: DirectoryHandleLike, name: string, contents: string): Promise<void> {
  const file = await dir.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  try {
    await writable.write(contents);
  } finally {
    await writable.close();
  }
}

/**
 * Writes one election into `<folder>/<election name>/`: `latest.json` plus a time-stamped
 * snapshot. Returns the file names written.
 */
export async function writeBackup(
  root: DirectoryHandleLike,
  assembly: Assembly,
  label: string,
  now = new Date(),
): Promise<{ folder: string; snapshot: string }> {
  const folderName = folderSlug(assembly.name);
  const dir = await root.getDirectoryHandle(folderName, { create: true });
  const json = JSON.stringify(assembly, null, 2);
  const snapshot = `${fileStamp(now)}-${labelSlug(label)}.json`;
  await writeFile(dir, 'latest.json', json);
  await writeFile(dir, snapshot, json);
  return { folder: folderName, snapshot };
}

/* ------------------------------------------------------------------ */
/* Status the UI shows                                                  */
/* ------------------------------------------------------------------ */

interface BackupState {
  supported: boolean;
  handle: DirectoryHandleLike | null;
  folderName: string | null;
  /** The folder is remembered but the browser needs the operator to allow it again. */
  needsPermission: boolean;
  lastSavedAt: string | null;
  lastFile: string | null;
  lastError: string | null;
  saving: boolean;
}

export const useBackup = create<BackupState>(() => ({
  supported: backupSupported(),
  handle: null,
  folderName: null,
  needsPermission: false,
  lastSavedAt: null,
  lastFile: null,
  lastError: null,
  saving: false,
}));

async function permissionState(handle: DirectoryHandleLike, request: boolean): Promise<PermissionState> {
  const opts = { mode: 'readwrite' as const };
  const current = (await handle.queryPermission?.(opts)) ?? 'granted';
  if (current === 'granted' || !request) return current;
  return (await handle.requestPermission?.(opts)) ?? 'denied';
}

/** Re-attach the folder chosen in an earlier session (no prompt — that needs a click). */
export async function restoreBackupFolder(): Promise<void> {
  if (!backupSupported()) return;
  try {
    const handle = (await get(HANDLE_KEY)) as DirectoryHandleLike | undefined;
    if (!handle) return;
    const state = await permissionState(handle, false);
    useBackup.setState({
      handle: state === 'granted' ? handle : handle,
      folderName: handle.name,
      needsPermission: state !== 'granted',
    });
  } catch {
    /* nothing remembered */
  }
}

/** Ask for a folder (must be called from a click). */
export async function chooseBackupFolder(): Promise<boolean> {
  if (!backupSupported()) return false;
  try {
    const picker = (window as unknown as { showDirectoryPicker: (o?: object) => Promise<DirectoryHandleLike> }).showDirectoryPicker;
    const handle = await picker({ id: 'third-legacy-backups', mode: 'readwrite', startIn: 'documents' });
    const state = await permissionState(handle, true);
    if (state !== 'granted') {
      useBackup.setState({ lastError: 'Permission to write to that folder was not given.' });
      return false;
    }
    await set(HANDLE_KEY, handle);
    useBackup.setState({ handle, folderName: handle.name, needsPermission: false, lastError: null });
    return true;
  } catch (e) {
    // The operator cancelling the picker is not an error worth reporting.
    if ((e as Error)?.name !== 'AbortError') useBackup.setState({ lastError: (e as Error).message });
    return false;
  }
}

/** Re-grant permission for a remembered folder (must be called from a click). */
export async function reconnectBackupFolder(): Promise<boolean> {
  const { handle } = useBackup.getState();
  if (!handle) return chooseBackupFolder();
  const state = await permissionState(handle, true);
  useBackup.setState({ needsPermission: state !== 'granted' });
  return state === 'granted';
}

export async function forgetBackupFolder(): Promise<void> {
  await del(HANDLE_KEY).catch(() => undefined);
  useBackup.setState({ handle: null, folderName: null, needsPermission: false, lastSavedAt: null, lastFile: null });
}

/** Write one election now. Returns false when there is no usable folder. */
export async function backupNow(assembly: Assembly, label = 'manual backup'): Promise<boolean> {
  const { handle, needsPermission } = useBackup.getState();
  if (!handle || needsPermission) return false;
  useBackup.setState({ saving: true });
  try {
    const { snapshot } = await writeBackup(handle, assembly, label);
    useBackup.setState({ saving: false, lastSavedAt: new Date().toISOString(), lastFile: snapshot, lastError: null });
    return true;
  } catch (e) {
    const err = e as Error;
    // The folder may have been removed (USB stick pulled out) or permission revoked.
    useBackup.setState({
      saving: false,
      lastError: `Could not write the backup: ${err.message}`,
      needsPermission: err.name === 'NotAllowedError' || err.name === 'SecurityError',
    });
    return false;
  }
}
