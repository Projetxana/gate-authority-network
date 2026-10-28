import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const home = read('dashboard/index.html');
const legacy = read('dashboard/adoption.html');
const live = read('dashboard/live.html');
const script = read('dashboard/marketing.js');
const robots = read('dashboard/robots.txt');
const sitemap = read('dashboard/sitemap.xml');
const manifest = JSON.parse(read('server.json'));

test('product home is in English, points to a real Free project, and exposes correct package versions', () => {
  assert.match(home, /<html lang="en">/);
  assert.match(home, /href="\.\/live\.html"/);
  assert.match(home, /href="\.\/adoption\.html"/);
  assert.match(home, /@gate-avn\/sdk@0\.1\.0-dev\.4/);
  assert.match(home, /MCP <strong>0\.1\.0-dev\.8<\/strong>/);
  assert.match(home, /<link rel="canonical"/);
  assert.match(home, /<meta name="description"/);
  assert.match(home, /<h1 id="main-heading">/);
});

test('product claims preserve the real current security boundary', () => {
  assert.match(home, /no production regional replicas/i);
  assert.match(home, /no hosted Stage 18 exact-work permits/i);
  assert.match(home, /your own action policy/i);
  assert.match(home, /issuer is controlled by the developer/i);
  assert.match(home, /ILLUSTRATIVE FLOW/);
  assert.doesNotMatch(home, /enterprise certified|SOC 2 certified|guaranteed live issuer/i);
});

test('adoption metrics dashboard remains accessible, with its existing runtime', () => {
  assert.match(legacy, /<title>GATE — Adoption Dashboard<\/title>/);
  assert.match(legacy, /id="downloadsChart"/);
  assert.match(legacy, /id="verifiedEffectsToday"/);
  assert.match(legacy, /src="\.\/app\.js"/);
  assert.match(live, /href="\.\/adoption\.html"/);
});

test('marketing is static and does not read bearer tokens, persist keys or call network endpoints', () => {
  assert.doesNotMatch(script, /fetch\(|localStorage|sessionStorage|GATE_API_KEY|sendBeacon|XMLHttpRequest/);
  assert.match(script, /navigator\.clipboard/);
});

test('robots and sitemap refer to the same published site', () => {
  assert.match(robots, /Sitemap: https:\/\/gate-phi-eosin\.vercel\.app\/sitemap\.xml/);
  assert.match(sitemap, /<loc>https:\/\/gate-phi-eosin\.vercel\.app\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/gate-phi-eosin\.vercel\.app\/live\.html<\/loc>/);
});

test('MCP registry source manifest uses publicly published dev.8', () => {
  assert.equal(manifest.version, '0.1.0-dev.8');
  assert.equal(manifest.packages[0].version, '0.1.0-dev.8');
});
