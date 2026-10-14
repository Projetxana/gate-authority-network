import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync
} from 'node:fs';

import os from 'node:os';
import path from 'node:path';

import {
  execFileSync,
  spawnSync
} from 'node:child_process';

import {
  fileURLToPath
} from 'node:url';

const UPSTREAM_REPO =
  ['https:', '', 'github.com', 'RamjotSingh', 'typescript-sdk.git']
    .join('/');

const UPSTREAM_COMMIT =
  '429e72bcdf02a6a3da76ab6f580e8986449553ab';

const PNPM_VERSION =
  '10.26.1';

const here =
  path.dirname(
    fileURLToPath(import.meta.url)
  );

const root =
  path.resolve(here, '..');

const fixture =
  path.join(
    root,
    'interop',
    'mcp-subscription',
    'liveGateAuthorityFixture.test.ts'
  );

const sdk =
  path.join(
    root,
    'packages',
    'sdk',
    'dist',
    'index.js'
  );

const work =
  mkdtempSync(
    path.join(
      os.tmpdir(),
      'gate-stage18b-live-'
    )
  );

const upstream =
  path.join(
    work,
    'typescript-sdk'
  );

function run(
  command,
  args,
  cwd = root
) {
  const result =
    spawnSync(
      command,
      args,
      {
        cwd,
        stdio: 'inherit',
        env: process.env
      }
    );

  if (
    result.status !== 0
  ) {
    throw new Error(
      `${command} exited ${result.status}`
    );
  }
}

try {
  console.log(
    '=== STAGE 18B LIVE GATE -> MCP ==='
  );

  console.log(
    `Pinned MCP prototype: ${UPSTREAM_COMMIT}`
  );

  run(
    'git',
    [
      'clone',
      '--quiet',
      '--filter=blob:none',
      UPSTREAM_REPO,
      upstream
    ]
  );

  run(
    'git',
    [
      '-C',
      upstream,
      'checkout',
      '--quiet',
      '--detach',
      UPSTREAM_COMMIT
    ]
  );

  const actual =
    execFileSync(
      'git',
      [
        '-C',
        upstream,
        'rev-parse',
        'HEAD'
      ],
      {
        encoding: 'utf8'
      }
    ).trim();

  if (
    actual !== UPSTREAM_COMMIT
  ) {
    throw new Error(
      `Unexpected upstream commit ${actual}`
    );
  }

  console.log(
    '=== INSTALL EXTERNAL MCP PROTOTYPE ==='
  );

  run(
    'npx',
    [
      '--yes',
      `pnpm@${PNPM_VERSION}`,
      'install',
      '--frozen-lockfile'
    ],
    upstream
  );

  console.log(
    '=== BUILD EXTERNAL MCP PROTOTYPE ==='
  );

  run(
    'npx',
    [
      '--yes',
      `pnpm@${PNPM_VERSION}`,
      'build:all'
    ],
    upstream
  );

  mkdirSync(
    path.join(
      upstream,
      'gate-sdk'
    ),
    {
      recursive: true
    }
  );

  cpSync(
    sdk,
    path.join(
      upstream,
      'gate-sdk',
      'index.mjs'
    )
  );

  cpSync(
    fixture,
    path.join(
      upstream,
      'packages',
      'server',
      'test',
      'server',
      'liveGateAuthorityFixture.test.ts'
    )
  );

  console.log(
    '=== RUN LIVE INTEROP PROOF ==='
  );

  run(
    'npx',
    [
      '--yes',
      `pnpm@${PNPM_VERSION}`,
      '--filter',
      '@modelcontextprotocol/server',
      'exec',
      'vitest',
      'run',
      'test/server/liveGateAuthorityFixture.test.ts',
      '--reporter=verbose'
    ],
    upstream
  );

  console.log(
    '=== RESULT ==='
  );

  console.log(
    'PASS Stage 18B: external MCP prototype -> live GATE verify -> ALLOW -> signed revocation -> DENY -> stream closed'
  );

  console.log(
    `Pinned upstream commit: ${actual}`
  );
} finally {
  rmSync(
    work,
    {
      recursive: true,
      force: true
    }
  );
}
