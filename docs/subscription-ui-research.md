# Subscription management UI research

Короткий ресерч для улучшения существующей страницы управления подпиской. Код UI не
изменялся. Источники — официальная документация и first-party интерфейсные паттерны.

## Короткий вывод

- **Recommendation:** собрать страницу вокруг одного явно выделенного блока текущего
  плана: название, статус, цена и период биллинга, следующая дата списания/окончания
  доступа, затем рядом — `Change plan`, `Manage payment method` и `Cancel subscription`.
- **Recommendation:** отмена должна быть доступной, но её результат — однозначным:
  «отменится [дата], доступ сохранится до [дата]», с подтверждением и возможностью
  возобновить подписку, если это поддерживает продукт.
- **Recommendation:** изменения тарифа показывать как сравнение «текущий → новый» с
  ценой, периодом, датой применения и явным описанием prorating/кредита; не прятать
  последствия в modal без summary.
- **Recommendation:** payment methods — отдельная секция с брендом и последними 4
  цифрами, статусом primary/backup и явным `Update`; не разрешать удалить единственный
  способ оплаты активной подписки до добавления нового.
- **Recommendation:** staging/debug controls держать в отдельной environment-gated
  панели, видимой только staff/test accounts; рядом показывать environment, user ID,
  subscription ID/status, last sync/error и безопасные test actions. Не выводить секреты.

## Паттерны по задачам

| Область | Verified: что делают официальные продукты | Recommendation для страницы |
|---|---|---|
| Текущий план | Stripe Customer Portal предназначен для управления подписками, payment methods, invoices и history; Apple показывает подписку из списка Subscriptions и позволяет открыть её для действий. [Stripe](https://support.stripe.com/questions/billing-customer-portal?locale=en-GB) · [Apple](https://support.apple.com/guide/iphone/see-your-purchases-and-subscriptions-iph4e3e7324f/27/ios/27) | Первый экран/верхний summary card: plan name + `Active/Trialing/Canceling`, цена и cadence, source (если relevant), включённые entitlements; действия привязать к этой карточке. |
| Дата продления | Google сообщает, что дата следующего renewal видна в Subscriptions/receipt; после отмены доступ сохраняется до уже оплаченной даты. Apple отдельно предлагает renewal receipts. [Google Play](https://support.google.com/googleplay/answer/7018481?hl=en) · [Apple](https://support.apple.com/guide/iphone/see-your-purchases-and-subscriptions-iph4e3e7324f/27/ios/27) | Использовать конкретный label: `Renews on 12 March 2027` или `Access ends on 12 March 2027`; не писать только «monthly». Для отменённого auto-renew показать обе вещи: отмена renewal + дата окончания доступа. |
| Смена тарифа | Stripe поддерживает upgrade/downgrade существующей подписки; его portal-конфигурация задаёт allowed updates, billing-cycle anchor и proration. Apple: открыть active subscription и выбрать другой option. Google: plan/cycle change может списать полную цену или разницу, а остаток может быть зачтён. [Stripe config](https://docs.stripe.com/api/customer_portal/configurations/create?api-version=2025-03-31.preview) · [Stripe](https://stripe.com/blog/billing-customer-portal) · [Apple](https://support.apple.com/guide/iphone/see-your-purchases-and-subscriptions-iph4e3e7324f/27/ios/27) · [Google Play](https://support.google.com/googleplay/answer/7018481?hl=en) | `Change plan` ведёт к списку доступных планов. На выборе показывать текущий план, новый plan/period, `Due today`/`Next charge`, дату применения и короткую proration note; после подтверждения — success state с новым статусом/датой. |
| Отмена | Stripe позволяет выбрать immediate или end-of-period cancellation и опционально собрать cancellation reason; Google использует `Manage → Cancel subscription → reason → Continue`; Google прямо уточняет, что uninstall не отменяет подписку. [Stripe config](https://docs.stripe.com/api/customer_portal/configurations/create?api-version=2025-03-31.preview) · [Google Play](https://support.google.com/googleplay/answer/7018481?hl=en) | Не делать destructive action единственным красным CTA на карточке. Открывать подтверждение с причиной (optional), датой окончания доступа, refund/proration policy и кнопками `Keep subscription` / `Cancel at period end`. После действия дать `Resume`/`Resubscribe`, если возможно. |
| Payment methods | Stripe portal позволяет обновить payment method; при активной подписке портал требует сохранить хотя бы один способ и сначала добавить новый перед удалением старого. Google позволяет обновить primary и добавить backup для снижения interruption risk. [Stripe Support](https://support.stripe.com/questions/billing-customer-portal?locale=en-GB) · [Google Play](https://support.google.com/googleplay/answer/4646404?co=GENIE.Platform%3DDesktop&hl=en) | Отдельный блок `Payment method`: `Visa •••• 4242`, expiry, `Primary`, failed/needs update state, `Update` и `Add backup`. Деструктивное удаление — только после проверки, что останется usable method. |
| Staging/debug controls | Stripe разделяет test/live mode: test mode не влияет на live data и banking networks; для sandbox используются test API keys/test values, а реальные card details в live mode запрещены. [Stripe API](https://docs.stripe.com/api) · [Stripe testing](https://docs.stripe.com/testing) | Паттерн для staging: заметный non-production badge (`STAGING`) вне production, collapsible `Debug` section только для staff/test accounts, read-only IDs/status/timestamps, mock/test actions с confirmation и явной пометкой «не реальные платежи». Never expose API keys, full PAN/CVC или auth tokens. |
| Responsive layout | GOV.UK рекомендует начинать с small screens и single-column layout, не проектировать под конкретные устройства, ограничивать desktop line length и использовать responsive padding. [GOV.UK layout](https://design-system.service.gov.uk/styles/layout/) | Mobile-first: карточки и действия в один столбец; на wide screens — основной plan summary + secondary billing/payment column. Не полагаться на горизонтальную таблицу для plan comparison: stacked rows/cards, wrap длинных дат/цен, sticky bottom action bar только если она не перекрывает focused element. |
| Accessibility | WCAG 2.2 требует видимый keyboard focus, понятные headings/labels, programmatic name/role/value, status messages и minimum pointer target 24×24 CSS px. GOV.UK summary list добавляет контекст к row actions (например, `Change payment method`), а destructive warning требует дополнительного confirmation step и не может сообщать смысл только цветом. [WCAG 2.2](https://www.w3.org/TR/WCAG22/) · [Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible) · [GOV.UK summary list](https://design-system.service.gov.uk/components/summary-list/) · [GOV.UK button](https://design-system.service.gov.uk/components/button/) | Использовать semantic headings и labels; action text делать самодостаточным (`Change plan`, `Update payment method`, `Cancel subscription`), ошибки и save/cancel result объявлять как status message; сохранять focus в dialog и возвращать его к trigger после закрытия; не кодировать status только цветом; обеспечить keyboard order и минимум 24×24 px hit area. |

## Suggested information hierarchy

1. Page heading: `Subscription`.
2. Current-plan summary: plan, status, price/period, renewal or access-end date, included
   benefits, primary `Change plan` action.
3. Payment method summary: primary method, expiry/error, update/add backup actions.
4. Billing history/invoices link (если доступен в продукте).
5. Secondary `Cancel subscription` action with explicit consequence copy.
6. Environment/debug panel only in non-production and for authorized users.

## Verification checklist for a future UI pass

- [ ] At a glance видно, что будет списано и когда.
- [ ] Для cancel/change plan видны effective date, access end date и financial consequence.
- [ ] После каждой mutation есть success/error state без потери контекста и с понятным next action.
- [ ] Нельзя случайно удалить единственный usable payment method.
- [ ] Staging/debug controls не попадают обычному production user и не раскрывают secrets.
- [ ] Страница usable на narrow viewport, keyboard-only и screen reader; focus не теряется в
      dialog/async update.

## Source notes

Все claims в таблице помечены как **Verified** через ссылку на первичный источник; строки
с предлагаемым применением помечены **Recommendation**. Ресерч не является аудитом
текущей реализации и не заменяет проверку текущего billing provider/договорных условий.
