#!/usr/bin/env node
// Packs locally, inspects the exact archive and tests it outside the workspaces.
// Never publishes; all verification traffic is loopback. npm only downloads deps.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, copyFileSync, realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = mkdtempSync(path.join(tmpdir(), 'gate-mcp-package-'));
const run = (cmd, args, cwd = root, env = process.env) => execFileSync(cmd, args,
  {cwd, env, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024});
try {
  const [pack] = JSON.parse(run('npm', ['pack', '--workspace', '@gate-avn/mcp', '--json', '--ignore-scripts', '--pack-destination', temp, '--cache', path.join(temp, 'cache')]));
  const archive = path.join(temp, pack.filename);
  const expected = ['README.md', 'bin/gate-mcp.mjs', 'package.json', 'src/effect-boundary.mjs', 'src/verified-effect-reporter.mjs'];
  assert.deepEqual(pack.files.map(f => f.path).sort(), expected);
  const names = run('tar', ['-tzf', archive]).trim().split('\n').sort();
  assert.deepEqual(names, expected.map(p => `package/${p}`).sort());
  for (const name of expected) {
    const content = execFileSync('tar', ['-xOzf', archive, `package/${name}`]);
    assert.deepEqual(content, readFileSync(path.join(root, 'packages/mcp', name)), `archive drift: ${name}`);
    assert.doesNotMatch(content.toString(), /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|gate_sk_[A-Za-z0-9]{20,}/, `secret pattern in ${name}`);
  }
  const integrity = 'sha512-' + createHash('sha512').update(readFileSync(archive)).digest('base64');
  assert.equal(integrity, pack.integrity);
  const pkg = JSON.parse(readFileSync(path.join(root, 'packages/mcp/package.json')));
  const sdk = JSON.parse(readFileSync(path.join(root, 'packages/sdk/package.json')));
  const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json')));
  assert.equal(pkg.version, lock.packages['packages/mcp'].version);
  assert.equal(pkg.dependencies['@gate-avn/sdk'], sdk.version);
  assert.equal(pkg.dependencies['@gate-avn/sdk'], lock.packages['packages/mcp'].dependencies['@gate-avn/sdk']);
  const consumer = path.join(temp, 'consumer'); mkdirSync(consumer);
  writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({name: 'gate-mcp-candidate-consumer', private: true, type: 'module'}));
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--save-exact', '--cache', path.join(temp, 'cache'), archive], consumer);
  assert.equal(JSON.parse(readFileSync(path.join(consumer, 'node_modules/@gate-avn/mcp/package.json'))).version, pkg.version);
  assert.equal(JSON.parse(readFileSync(path.join(consumer, 'node_modules/@gate-avn/sdk/package.json'))).version, sdk.version);
  assert.ok(realpathSync(path.join(consumer, 'node_modules/@gate-avn/mcp')).startsWith(realpathSync(consumer) + path.sep));
  const output = run(process.execPath, ['--test', path.join(root, 'test/mcp-distribution-security.test.mjs')], consumer,
    {...process.env, GATE_MCP_CONSUMER_ROOT: consumer});
  process.stdout.write(output);
  // Run the CLI entrypoint in the consumer's module resolution context without
  // starting a stdio daemon or contacting any GATE service.
  assert.equal(run(process.execPath, [path.join(consumer, 'node_modules/@gate-avn/mcp/bin/gate-mcp.mjs'), '--version'], consumer).trim(), pkg.version);
  const report = {status: 'PASS', name: pkg.name, version: pkg.version, sdk: sdk.version,
    integrity, shasum: pack.shasum, files: names, bytes: readFileSync(archive).length,
    consumer: 'installed tgz, published SDK, no workspace links', hostedGATECalls: 0, published: false};
  if (process.env.GATE_MCP_ARTIFACT_DIR) {
    const destination = path.resolve(process.env.GATE_MCP_ARTIFACT_DIR); mkdirSync(destination, {recursive: true});
    copyFileSync(archive, path.join(destination, pack.filename));
    writeFileSync(path.join(destination, 'mcp-candidate-validation.json'), JSON.stringify(report, null, 2) + '\n');
  }
  console.log(JSON.stringify(report, null, 2));
} finally {rmSync(temp, {recursive: true, force: true});}
