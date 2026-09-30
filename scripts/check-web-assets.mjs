import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] || 'dist';
const limit = 25 * 1024 * 1024;
const oversized = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (fs.statSync(p).size > limit) oversized.push(p);
  }
}
walk(root);
if (oversized.length) throw new Error('Pages asset limit exceeded: ' + oversized.join(', '));
console.log('Every production asset fits the 25 MiB Pages limit.');
