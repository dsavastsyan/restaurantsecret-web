# Web PR preview

Every pull request that changes the customer-facing web app must be checked in
its Cloudflare Pages preview before merge. Preview builds use only staging
backends:

- public catalog API: `restaurantsecret-api-staging.dsavastyan.workers.dev`;
- personal-data API: `staging-pd.restaurantsecret.ru`.

Production Pages variables are not changed. Preview deployments set
`VITE_DEPLOY_ENV=preview`, disable production analytics, return `X-Robots-Tag:
noindex`, and show a persistent `STAGING` panel.

## Persona check

Use the panel to activate each state:

1. `Без подписки`;
2. `Активная подписка`;
3. `Истёкшая`;
4. `Отменённая`.

For each state, open the account and subscription page, confirm the visible
subscription/paywall state, refresh the page, and confirm that the session is
preserved. `Сбросить тестовые данные` restores the currently selected persona's
canonical subscription state and issues a new staging session.

The browser calls only the same-origin `/api/preview-login` Pages Function. The
Function holds `PREVIEW_AUTH_SECRET` as an encrypted Preview binding and calls
the staging-only pd-api endpoint. The secret must never be added to a `VITE_*`
variable.

## Merge gate

The PR description must include the preview URL, the staging endpoints, and the
result of the four-persona checklist. Merge and production deployment happen
only after founder acceptance of the preview.
