// Runs before every build: clears book/photochop/assets so stale hashed chunks never pile up.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.resolve(here, '..', '..', 'assets');
fs.rmSync(assets, { recursive: true, force: true });
console.log('cleared', assets);
