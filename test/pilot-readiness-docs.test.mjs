import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(path.join(root, p), 'utf8');

test('Free MCP example explicitly opts into bounded consistency', () => {
  const readme = read('packages/mcp/README.md');
  assert.match(readme, /Real Free Network — Developer Preview/);
  assert.match(readme, /consistency: 'bounded', \/\/ Explicit Free-plan setting/);
  assert.doesNotMatch(readme, /consistency: 'strict',\s*\n\s*counter/);
});

test('public trial MCP examples use the validated published version', () => {
  const readme = read('packages/mcp/README.md');
  assert.match(readme, /npx @gate-avn\/mcp@0\.1\.0-dev\.8/);
  assert.doesNotMatch(readme, /npx @gate-avn\/mcp(?:\s|\n|$)/);
  assert.doesNotMatch(readme, /npx @gate-avn\/mcp@dev/);
});

test('SDK docs pin the validated public version in quickstarts', () => {
  for (const p of ['packages/sdk/README.md', 'docs/QUICKSTART.md']) {
    const doc = read(p);
    assert.match(doc, /npm install @gate-avn\/sdk@0\.1\.0-dev\.4/);
    assert.doesNotMatch(doc, /npm install @gate-avn\/sdk@dev/);
  }
});

test('pilot gate is present and keeps external integration closed', () => {
  const gate = read('docs/PILOT-READINESS-GATES.md');
  assert.match(gate, /HOLD independent-expert integration pitch/);
  assert.match(gate, /P0-B, end-to-end MCP/);
  assert.match(gate, /P0-F, independent cold trial/);
});
