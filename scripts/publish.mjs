// Copies the built site from dist/ to the repository root so GitHub Pages
// ("Deploy from a branch: main / (root)") serves the app. Files published last time
// are listed in .published.json and removed first, so stale hashed assets don't pile up.
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const manifestPath = join(root, '.published.json');

if (!existsSync(join(dist, 'index.html'))) {
  console.error('dist/index.html not found — run the Vite build first.');
  process.exit(1);
}

// Never overwrite project sources, even if a build output happens to share a name.
const PROTECTED = new Set(['src', 'scripts', 'public', 'node_modules', '.git', '.github', 'package.json', 'package-lock.json', 'README.md', 'LICENSE', 'tsconfig.json', 'vite.config.ts', '.gitignore']);

// Work out what the new build contains BEFORE removing anything, so a failed build can
// never leave the site without an index.html.
const published = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else published.push(relative(dist, p).split(sep).join('/'));
  }
};
walk(dist);

const tops = [...new Set(published.map((f) => f.split('/')[0]))];
for (const t of tops) {
  if (PROTECTED.has(t)) throw new Error(`Refusing to overwrite protected path: ${t}`);
}

// Remove what the previous build published, plus any stray hashed service-worker files.
const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : [];
const strays = readdirSync(root).filter((f) => /^workbox-[\da-f]+\.js$/.test(f) && !tops.includes(f));
for (const f of [...previous, ...strays]) {
  if (PROTECTED.has(f.split('/')[0])) continue;
  rmSync(join(root, f), { force: true, recursive: true });
}

for (const t of tops) {
  cpSync(join(dist, t), join(root, t), { recursive: true });
}
writeFileSync(manifestPath, JSON.stringify(tops.sort(), null, 2) + '\n');
writeFileSync(join(root, '.nojekyll'), '');
console.log(`Published ${published.length} files to the repository root: ${tops.join(', ')}`);
