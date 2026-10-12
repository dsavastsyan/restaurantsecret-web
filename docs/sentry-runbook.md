# Sentry: подключение и разбор ошибок

Эта инструкция — единственный источник правил для Sentry в `restaurantsecret-web`.
Organization: `restaurantsecret`. Project: `javascript-react` (project ID
`4512183431594064`). Не спрашивай у founder эти значения повторно.

## Подключение и read-only доступ

1. Основной способ чтения Issues — Sentry Web API с отдельным read-only токеном. Создай
   в Sentry для аккаунта `restaurantsecret` User Auth Token или Internal Integration
   token со scope `project:read` и `event:read`: Settings → Developer Settings → Auth
   Tokens. Сохрани его локально в `.secrets/sentry-read.token` в корне `RestSecret/`;
   этот файл находится вне git, не в этом репозитории и не в GitHub secrets.
2. Для получения unresolved Issues используй запрос:
   ```
   curl -s -H "Authorization: Bearer $(cat .secrets/sentry-read.token)" \
     "https://restaurantsecret.sentry.io/api/0/projects/restaurantsecret/javascript-react/issues/?query=is%3Aunresolved"
   ```
   `SENTRY_AUTH_TOKEN` из GitHub Actions для этого не используй: это другой токен со
   scope `org:ci`, предназначенный только для загрузки source maps при сборке. Наличие
   этого токена не означает запрет на API и не делает его токеном чтения Issues. DSN
   фронтенда также не даёт read-доступа.
3. Авторизованная браузерная сессия (Claude in Chrome или обычный авторизованный
   профиль) — необязательный запасной вариант, если read-токена нет под рукой или
   нужно визуально посмотреть данные, например график. Не используй её как обязательный
   основной путь.
4. Ответ `401` означает, что read-токен невалиден или просрочен; `403` — что у токена
   не хватает scope `project:read` или `event:read`. В этих случаях перегенерируй токен
   в Sentry, а не меняй organization/project и не используй `org:ci`-токен. Не проси
   повторно SENTRY_ORG/SENTRY_PROJECT.

## Разбор issue и история исправлений

Для каждой актуальной ошибки зафиксируй issue ID/title, stack trace, окружение, release,
`first seen`/`last seen`, частоту и затронутых пользователей. Затем:

1. Найди связанные и предыдущие issues; сравни стеки, даты событий и релизы.
2. По release/commit найди соответствующие PR и коммиты. Прочитай описание PR и diff,
   чтобы понять, какую именно причину исправлял каждый из них и могло ли исправление
   породить новую ошибку.
3. Подтверди фактическое попадание исправления в нужное окружение по успешному деплою
   и его SHA. Для web production сверяй Sentry release с успешными GitHub Actions
   деплоями `deploy-pages.yml`; для staging проверь соответствующий staging deployment.
   Merge PR сам по себе не доказывает, что код уже задеплоен.
4. Различай исходный сбой и регрессию после исправления. События из release, куда fix ещё
   не попал, не доказывают, что исправление не сработало. После выпуска проверь исходный
   issue и новые связанные issues.
5. Перед исправлением коротко изложи в PR или отчёте цепочку issue → PR/commit → release →
   deployment, подтверждения и проверку нового исправления. Для простого read-only
   запроса сообщи найденную цепочку и текущий статус без внесения изменений.

## Секреты

Не записывай и не выводи auth tokens, значения GitHub Actions secrets или секретные части
DSN в документацию, логи, команды с выводом или ответы. Содержимое `.secrets/sentry-read.token`
и сам путь к нему в выводе команд или логах также считай секретом.
