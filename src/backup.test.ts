import { describe, expect, it } from 'vitest';
import { fileStamp, folderSlug, writeBackup, type DirectoryHandleLike } from './backup';
import { newAssembly } from './store';

interface FakeFolder {
  handle: DirectoryHandleLike;
  files: Map<string, string>;
  dirs: Map<string, FakeFolder>;
}

/** In-memory stand-in for a folder on disk. */
function fakeFolder(name = 'Backups'): FakeFolder {
  const files = new Map<string, string>();
  const dirs = new Map<string, FakeFolder>();
  const handle: DirectoryHandleLike = {
    name,
    async getDirectoryHandle(child, options) {
      if (!dirs.has(child)) {
        if (!options?.create) throw new Error('NotFoundError');
        dirs.set(child, fakeFolder(child));
      }
      return dirs.get(child)!.handle;
    },
    async getFileHandle(fileName, options) {
      if (!files.has(fileName) && !options?.create) throw new Error('NotFoundError');
      return {
        async createWritable() {
          let buffer = '';
          return {
            async write(data: string) {
              buffer += data;
            },
            async close() {
              files.set(fileName, buffer);
            },
          };
        },
      };
    },
    async queryPermission() {
      return 'granted';
    },
  };
  return { handle, files, dirs };
}

describe('automatic folder backup', () => {
  it('writes latest.json and a time-stamped snapshot inside a folder named after the election', async () => {
    const root = fakeFolder();
    const a = newAssembly('Area 00 Fall Assembly 2026');
    a.notes = 'first';
    const at = new Date(2026, 8, 23, 14, 32, 5);

    const first = await writeBackup(root.handle, a, '1st ballot recorded', at);
    expect(first.folder).toBe('Area-00-Fall-Assembly-2026');
    expect(first.snapshot).toBe('2026-09-23_1432-05-1st-ballot-recorded.json');

    const dir = root.dirs.get('Area-00-Fall-Assembly-2026')!;
    expect([...dir.files.keys()].sort()).toEqual(['2026-09-23_1432-05-1st-ballot-recorded.json', 'latest.json']);
    expect(JSON.parse(dir.files.get('latest.json')!).notes).toBe('first');

    // A later change overwrites latest.json but keeps every snapshot.
    a.notes = 'second';
    await writeBackup(root.handle, a, '2nd ballot recorded', new Date(2026, 8, 23, 14, 40, 0));
    expect(JSON.parse(dir.files.get('latest.json')!).notes).toBe('second');
    expect(dir.files.size).toBe(3);
    expect(JSON.parse(dir.files.get('2026-09-23_1432-05-1st-ballot-recorded.json')!).notes).toBe('first');
  });

  it('writes a complete, re-importable election', async () => {
    const root = fakeFolder();
    const a = newAssembly('Test');
    a.positions.push({
      id: 'p1',
      title: 'Delegate',
      candidates: [{ id: 'c1', name: 'Ann B.', withdrawnBeforeBallot: null }],
      started: true,
      ballots: [],
      motionVotes: [],
      hat: null,
      hatSecondToPositionId: null,
      appointment: null,
      draft: null,
    });
    await writeBackup(root.handle, a, 'x');
    const saved = JSON.parse(root.dirs.get('Test')!.files.get('latest.json')!);
    expect(saved.positions[0].candidates[0].name).toBe('Ann B.');
    expect(saved.settings).toBeTruthy();
  });

  it('makes safe folder and file names', () => {
    expect(folderSlug('Área 9 / Asamblea: Otoño')).toBe('Area-9-Asamblea-Otono');
    expect(folderSlug('   ')).toBe('election');
    expect(fileStamp(new Date(2026, 0, 2, 3, 4, 5))).toBe('2026-01-02_0304-05');
  });
});
