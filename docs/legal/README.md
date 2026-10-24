# Юридические документы

- [Согласие RestaurantSecret и AnyEat от 24.10.2026](pdn-consent-2026-10-24.md) — исходный текст PDF.
- Политика: `src/pages/legal-versions/privacy-2026-10-24.jsx`; текущая редакция выбирается в `src/pages/Privacy.jsx`, архив регистрируется в `src/pages/legal-versions/registry.js`. Прямые HTML-входы для текущей и архивных политик перечислены в `scripts/generate-spa-entrypoints.js`.
- Текущий PDF: `/legal/pdn-consent.pdf`; датированная копия: `/legal/versions/pdn-consent-2026-10-24.pdf`.
- Предыдущий PDF сохранён побайтно: `/legal/archive/pdn-consent-before-2026-10-24.pdf`. У него не было даты собственной редакции; дата политики внутри него не используется как дата публикации согласия.
- Ссылки на архив доступны на `/privacy#legal-archive`. Старые snapshots и архивные PDF не изменяются.

Воспроизведение PDF (Python с `reportlab`, шрифты Arial с кириллицей; пути к шрифтам можно заменить):

```sh
python3 scripts/generate-pdn-consent.py \
  docs/legal/pdn-consent-2026-10-24.md \
  public/legal/versions/pdn-consent-2026-10-24.pdf \
  --font '/System/Library/Fonts/Supplemental/Arial.ttf' \
  --bold-font '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
cp public/legal/versions/pdn-consent-2026-10-24.pdf public/legal/pdn-consent.pdf
```

При следующем обновлении создаётся новый датированный источник, snapshot политики и PDF. Предыдущие версии сохраняются, новые ссылки добавляются в архив и список HTML-входов. Формы на сайте ссылаются на датированный PDF и передают новую версию согласия только при новом подтверждении. Обновление документов само по себе не переоформляет старые согласия и не меняет серверную логику их получения.
