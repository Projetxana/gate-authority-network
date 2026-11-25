#!/usr/bin/env node
// Packs locally, inspects the exact archive and tests it outside the workspaces.
// Never publishes; verification traffic is loopback and installs use verified cached tarballs.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, copyFileSync, realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = mkdtempSync(path.join(tmpdir(), 'gate-mcp-package-'));
// Keep the same npm as the invoking npm run; PATH may contain another bundled npm.
const run = (cmd, args, cwd = root, env = process.env) => execFileSync(
  cmd === 'npm' && env.npm_execpath ? process.execPath : cmd,
  cmd === 'npm' && env.npm_execpath ? [env.npm_execpath, ...args] : args,
  {cwd, env, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024});
try {
  const [pack] = JSON.parse(run('npm', ['pack', '--workspace', '@gate-avn/mcp', '--json', '--ignore-scripts', '--pack-destination', temp, '--cache', path.join(temp, 'cache')]));
  const archive = path.join(temp, pack.filename);
  const expected = ['README.md', 'bin/gate-mcp.mjs', 'package.json', 'src/admission-policy.mjs', 'src/effect-boundary.mjs', 'src/verified-effect-reporter.mjs'];
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
  const [sdkPack] = JSON.parse(run('npm', ['pack', '--workspace', '@gate-avn/sdk', '--json', '--ignore-scripts', '--pack-destination', temp]));
  const sdkArchive = path.join(temp, sdkPack.filename);
  const sdkExpected = ['README.md', 'dist/admission-policy.mjs', 'dist/index.d.ts', 'dist/index.js', 'package.json'];
  assert.deepEqual(sdkPack.files.map(f => f.path).sort(), sdkExpected);
  for (const filename of sdkExpected) {
    assert.deepEqual(execFileSync('tar', ['-xOzf', sdkArchive, `package/${filename}`]), readFileSync(path.join(root, 'packages/sdk', filename)), `SDK archive drift: ${filename}`);
  }
  assert.equal('sha512-' + createHash('sha512').update(readFileSync(sdkArchive)).digest('base64'), sdkPack.integrity);
  // npm ci already fetched these exact public dependencies. Use verified cached
  // tarballs, never workspace links or a not-yet-published candidate SDK.
  const sourceCache = run('npm', ['config', 'get', 'cache']).trim();
  const vendors = [];
  for (const name of ['@modelcontextprotocol/server', '@modelcontextprotocol/core', 'zod']) {
    const meta = lock.packages[`node_modules/${name}`];
    assert.ok(meta.integrity.startsWith('sha512-'));
    const digest = Buffer.from(meta.integrity.slice(7), 'base64').toString('hex');
    const bytes = readFileSync(path.join(sourceCache, '_cacache', 'content-v2', 'sha512', digest.slice(0, 2), digest.slice(2, 4), digest.slice(4)));
    assert.equal(createHash('sha512').update(bytes).digest('hex'), digest);
    const filename = path.join(temp, name.replaceAll('@', '').replaceAll('/', '-') + '.tgz');
    writeFileSync(filename, bytes); vendors.push(filename);
  }
  run('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--save-exact', '--cache', path.join(temp, 'cache'), sdkArchive, archive, ...vendors], consumer);
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
    integrity, sha256: createHash('sha256').update(readFileSync(archive)).digest('hex'),
    sdkIntegrity: sdkPack.integrity, sdkSha256: createHash('sha256').update(readFileSync(sdkArchive)).digest('hex'),
    shasum: pack.shasum, files: names, bytes: readFileSync(archive).length,
    consumer: 'installed MCP and SDK candidate tgz, integrity-checked published dependencies, no workspace links', hostedGATECalls: 0, published: false};
  if (process.env.GATE_MCP_ARTIFACT_DIR) {
    const destination = path.resolve(process.env.GATE_MCP_ARTIFACT_DIR); mkdirSync(destination, {recursive: true});
    copyFileSync(archive, path.join(destination, pack.filename));
    copyFileSync(sdkArchive, path.join(destination, sdkPack.filename));
    writeFileSync(path.join(destination, 'mcp-candidate-validation.json'), JSON.stringify(report, null, 2) + '\n');
  }
  console.log(JSON.stringify(report, null, 2));
} finally {rmSync(temp, {recursive: true, force: true});}
