# BCH Ecosystem Radar

A live status-page-style dashboard for the Bitcoin Cash ecosystem — wallets,
social platforms, infrastructure, explorers, developer services, merchant
tools and community sites — built with plain HTML, CSS and vanilla
JavaScript. No frameworks, no build step.

## Files

- `index.html` — page structure and markup
- `styles.css` — dark BCH-themed design system, layout, animations
- `app.js` — data registry, monitoring engine, rendering, charts, modal

## Run locally

Just open `index.html` in a browser, or serve the folder statically:

```bash
npx serve .
# or
python3 -m http.server 8080
```

## Deploy

**GitHub Pages**
1. Push this folder to a repository.
2. Repo Settings → Pages → Deploy from branch → `main` / root.
3. Done — it's a fully static site.

**Vercel**
1. Import the repository at vercel.com/new.
2. Framework preset: "Other" (no build command, no output directory needed).
3. Deploy.

## How monitoring works

Each service is "pinged" with a timed `fetch(url, { mode: 'no-cors' })`.
Browsers allow this to resolve (as an opaque response) for most reachable
hosts even without a CORS policy, which is enough to measure reachability
and latency without needing to read the response body. If a probe throws
(DNS failure, connection blocked, timeout, offline browser, restrictive
CSP, etc.) the app falls back automatically to a seeded **simulated
monitoring mode** for that service only — so one unreachable host never
breaks the rest of the dashboard. Each service card shows which mode
(`live` or `simulated`) produced its current reading.

## Customizing

- Add or edit services in the `SERVICES` array at the top of `app.js`.
- Categories are defined in `CATEGORIES` right above it — add a new entry
  there and give services that `category` id to create a new section.
- Colors and type live in the `:root` block at the top of `styles.css`.
