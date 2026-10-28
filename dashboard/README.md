# GATE public website + adoption metrics

This folder is the static Vercel root directory for the GATE Developer Preview.

Routes:

- `/` — **product landing page** in English, with Free onboarding, npm versions, effects/authority framing, explicit security boundaries and SEO metadata.
- `/live.html` — real Free GATE project creation, verification and optional plan upgrade flows. Retained unchanged except for navigation / documentation copy.
- `/quickstart.html` — the existing synthetic sandbox.
- `/adoption.html` — the former home page, preserved with all IDs, `app.js` and API data calls for adoption metrics.
- `/robots.txt`, `/sitemap.xml` — basic indexing discovery, URLs point to the existing Vercel domain. Update canonical/sitemap after assigning a custom production domain.

Neither the marketing home page nor its `marketing.js` reads keys, stores user data, sends analytics, or fabricates adoption metrics. `adoption.html` keeps its own existing telemetry, which is a different purpose.

## Local test

```sh
cd dashboard
python3 -m http.server 8080
# open http://localhost:8080
```

From the repository root:

```sh
node --test test/marketing-site.test.mjs
npm test
npm run check
```

## Deploy

Vercel Root Directory remains `dashboard`. Use a GitHub branch preview first. A merge to main may trigger a production deploy depending on the Vercel integration.

**Developer Preview limitations:** a single Canadian primary, no production replicas or independently guaranteed upstream delivery, no hosted Stage18 signed exact-work permit production service. The Free script's issuer is developer-controlled and only a local guarded effect is performed.
