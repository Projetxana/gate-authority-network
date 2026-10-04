# Publish GATE to npm and the Official MCP Registry

## Prerequisites

- Node.js 20+
- npm account
- control of the npm scope `@gate-avn`
- GitHub account controlling the `Projetxana` namespace
- clean passing tests

## 1. Test

```bash
npm install
npm run check
npm test
npm run demo
npm run pack:check
```

Inspect the `npm pack --dry-run` output. Do not publish secrets, state files, private configuration, or unrelated repository files.

## 2. Authenticate to npm

```bash
npm login
npm whoami
```

Confirm the current npm identity has permission to publish packages in the `@gate-avn` scope.

## 3. Publish SDK first

```bash
cd packages/sdk
npm publish --access public
```

Verify:

```bash
npm view @gate-avn/sdk version
```

## 4. Publish MCP package

```bash
cd ../mcp
npm publish --access public
```

Verify:

```bash
npm view @gate-avn/mcp version
```

## 5. Smoke test from a clean directory

```bash
TMP="$(mktemp -d)"
cd "$TMP"
npm init -y
npm install @gate-avn/sdk
npx @gate-avn/mcp --help
npx @gate-avn/mcp --version
```

For interactive MCP testing, configure an MCP client to run:

```text
npx -y @gate-avn/mcp --demo
```

## 6. Publish MCP Registry metadata

From the repository root:

```bash
brew install mcp-publisher
mcp-publisher validate
mcp-publisher login github
mcp-publisher publish
```

The package field:

```json
"mcpName": "io.github.projetxana/gate-authority-network"
```

must match the `name` in `server.json`.

## 7. Verify registry entry

```bash
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.projetxana/gate-authority-network"
```

## Release discipline

This Developer Preview is experimental. Keep the version pre-release until the authority-source contract, authentication model, operational security model, and production deployment story are validated.
