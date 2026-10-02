# restaurantsecret-web

**RestaurantSecret — Frontend Application**

This repository contains the user interface and client-side logic for RestaurantSecret. It is built as a modern Single Page Application (SPA) that functions seamlessly as a web app, a Progressive Web App (PWA), and a Telegram Mini App.

## Core Functionality

- **Restaurant Discovery**: Browsing and searching for restaurants and dishes using Cloudflare-backed search.
- **Nutrition Tracking**: Interactive dish cards and menus with detailed nutrition breakdown.
- **User Authentication**: Secure login via email OTP handled by the PD-API.
- **Subscription Management**: Subscription-aware UI with integrated paywalls and feature gating.
- **Map Integration**: Interactive maps for locating restaurants using Leaflet.
- **Cross-Platform**: Optimized for both standard browsers and Telegram's WebView environment.

## Repository Structure

```text
├── public/             # Static assets (icons, manifest.json, etc.)
├── src/
│   ├── api/            # API client and request handlers
│   ├── app/            # Global application state and providers
│   ├── components/     # Reusable UI components (Modals, Cards, UI kit)
│   ├── config/         # App configuration (API endpoints, constants)
│   ├── hooks/          # Custom React hooks
│   ├── lib/            # Utility libraries and helpers
│   ├── pages/          # Page components (Home, Search, Restaurant details, Account)
│   ├── routes/         # Routing logic
│   ├── store/          # State management (Zustand stores)
│   ├── styles.css      # Main CSS file (Vanilla CSS)
│   └── main.jsx        # Application entry point
├── tests/              # E2E tests (Playwright)
├── index.html          # HTML entry point
├── package.json        # Dependencies and scripts
└── vite.config.js      # Vite configuration
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Starts the Vite development server with hot module replacement. |
| `npm run build` | Compiles the application for production and prepares the `/dist` folder. |
| `npm run preview` | Locally previews the production build. |

Cloudflare Pages PR previews and the staging-persona checklist are documented
in [docs/staging-preview.md](docs/staging-preview.md).
| `npm run test:e2e` | Runs end-to-end tests using Playwright. |

## Staging preview

The permanent staging build is available at
<https://develop.restaurantsecret-web.pages.dev>. It is deployed from `develop` and is
built against the staging public API and PD API. Pull requests targeting `develop` get
an isolated Cloudflare Pages preview from the same workflow.

## Getting Started

1. **Install dependencies**:
   ```bash
   npm install
   ```
2. **Setup environment variables**:
   Create a `.env` file (if applicable) or ensure `src/config/index.js` points to the
   correct API endpoints. The experimental Google Places photo on the first catalog
   card also requires `VITE_GOOGLE_MAPS_API_KEY`; use a browser key restricted by
   website referrer and to the Maps JavaScript API.
3. **Run in development mode**:
   ```bash
   npm run dev
   ```

## Stack

- **Framework**: React 18
- **Build Tool**: Vite
- **State Management**: Zustand
- **Routing**: React Router 6
- **Maps**: Leaflet & React Leaflet
- **Styling**: Vanilla CSS

## Maintenance Mode

The application includes a built-in maintenance mode that can be toggled without code changes or deployments, perfect for GitHub Pages environments.

## Backend release gate

Web releases are pinned to the linked Cloudflare Worker and `pd-api` pull
requests in `release/backend-dependencies.json`. The manifest can use separate
`staging_pull_request` and `production_pull_request` values when the backend
reaches the two environments through different promotion PRs. Each referenced
PR must be merged, its merge commit must be present in the target backend
branch, and the matching staging or production deploy jobs must be green before
the web workflow continues.

For a web PR that depends on a new backend change, update both the web manifest
and the backend PR. The PR checks wait for the backend PRs and their staging
deployments. After merge, the Pages workflow repeats the same check against
the backend production branches before building or deploying the site.

The workflows require a repository secret named `BACKEND_RELEASE_TOKEN`. It
should have read-only access to pull requests, actions, and contents in both
backend repositories. The default web-repository `GITHUB_TOKEN` is not enough
for cross-repository workflow status queries.

### How to Enable
1. Locate `public/maintenance.json` in the GitHub repository.
2. Edit the file directly in the GitHub UI:
   - Set `"enabled": true`.
   - Update `from`, `to`, `title`, and `message` as needed.
3. Commit the changes to the `main` branch.
4. The site will automatically show the maintenance screen to all users once the GitHub Pages action finishes deploying.

### How to Disable
1. Edit `public/maintenance.json` and set `"enabled": false`.
2. Commit the changes.

## Developer Bypass

If you need to access the application while maintenance mode is enabled, you can use the secret bypass key.

1. Find the `bypassKey` in `public/maintenance.json`.
2. Access the site with the following URL parameter:
   `https://restaurantsecret.ru/?bypass=YOUR_SECRET_KEY`
3. The bypass key will be saved in your browser's `localStorage` (`rs_maint_bypass`), so you can continue to browse the site without the URL parameter until the maintenance mode is disabled or the key is changed.
