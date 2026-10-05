# AGENTS.md

## Флоу реализации новых фич

Для заметных пользовательских фич (не багфиксов/мелких правок) — обязателен процесс из
`../FEATURE_FLOW.md`: продуктовый ресерч → план со стоп-гейтом на апрув founder →
дизайн-ресерч → реализация. Документ тул-агностичный, читается и Claude Code, и Codex.

## Pull request обязателен

Любые изменения в репозитории должны завершаться созданием pull request. Агент не оставляет готовые изменения только в локальной ветке: создаёт отдельную ветку, коммитит относящиеся к задаче файлы, отправляет ветку в remote и открывает PR. Если создать PR технически невозможно (нет доступа, remote или сети), агент явно сообщает конкретную причину и не называет задачу полностью завершённой.

## Ветки и staging preview

Обычный feature/fix PR открывать в `develop`, не в `main`: ветвиться от актуального
`origin/develop` и использовать `gh pr create --base develop`. Постоянный preview
`https://develop.restaurantsecret-web.pages.dev` собирается только из `develop` и
работает со staging API. Продвижение `develop` → `main` и production deploy — отдельное
решение founder; агент самостоятельно их не выполняет.

## Зависимости web PR от backend (строка `Backend:` в описании PR)

Каждый web PR обязан в описании объявить, нужны ли ему backend-изменения. Строку нужно
добавить сразу при `gh pr create` (шаблон `.github/pull_request_template.md` её уже
содержит) — номер PR для этого знать не нужно, коммитить файлы не нужно, описание можно
править после открытия PR.

```
Backend: RestaurantSecret#511, RestaurantSecret-pd-api#221
Backend: none
```

`RestaurantSecret` — Worker (Cloudflare), `RestaurantSecret-pd-api` — pd-api. Указывать
реальные backend PR, чьи merge-коммиты уже находятся в `develop` (staging) или `main`
(production); `none` — если PR не меняет backend-контракт, API, Worker или данные.
`backend-release-gate` ждёт, пока перечисленные backend PR задеплоены в нужное окружение,
и падает с подсказкой, если строки нет. Деплой сайта (push в `main`, ручной запуск и ночная
сборка по расписанию) проходит тот же гейт: без него сайт не публикуется, остаётся
предыдущая версия.

Промоушен `develop` → `main` собственной строки не требует: он наследует строки (и файлы
`release/backend-dependencies/<номер>.json`) всех PR, которые приносит в `main`.

Старый способ — файл `release/backend-dependencies/<номер-PR>.json` — продолжает работать
и имеет приоритет над строкой. Формат: `{"version": 1, "backend_dependencies": false}` либо
`services` с `cloudflare` и `pd_api` и их `staging_pull_request`/`production_pull_request`.
Перед push проверять `node --test tests/backend-release-gate.test.mjs`.
