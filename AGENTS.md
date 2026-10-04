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

## Манифест backend-зависимостей для web PR

Каждый web PR обязан содержать файл
`release/backend-dependencies/<номер-PR>.json`. Этот файл нужен CI, чтобы явно отличать
web-изменения, которым нужен backend deploy, от изменений только в web-коде.

Если PR не меняет backend-контракт, backend API, Worker или данные, создать манифест
ровно такого вида:

```json
{
  "version": 1,
  "backend_dependencies": false
}
```

Не добавлять в этот режим поле `services`. В таком случае `backend-release-gate` успешно
завершается с отметкой `skipping ... release gate` и не ждёт backend staging deploy.

Если PR зависит от backend-изменений, использовать legacy-совместимый формат с обоими
сервисами (`cloudflare` и `pd_api`) и отдельными `staging_pull_request` и
`production_pull_request`. Указывать реальные backend PR, чьи merge-коммиты уже находятся
в соответствующих ветках (`develop` для staging и `main` для production); не копировать
старые номера из другого web PR без проверки.

Перед push проверить манифесты командой `node --test tests/backend-release-gate.test.mjs`.
Отсутствующий манифест, неизвестный режим или смешение `backend_dependencies: false` с
`services` должны считаться ошибкой PR и быть исправлены до review.
