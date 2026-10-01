# Places UI Kit Essentials для фото в карточке каталога

Дата исследования и доступа к источникам: **2026-10-01**.

## Вывод

`PlaceDetailsCompactElement` из Essentials подходит для одного Google-фото, встроенной
атрибуции и Google-managed lightbox. Поддерживаемая конфигурация —
`gmp-place-details-place-request` с Place ID и `gmp-place-content-config`, внутри которого
находятся `gmp-place-media lightbox-preferred` и `gmp-place-attribution`.
[Place Details UI Kit](https://developers.google.com/maps/documentation/javascript/places-ui-kit/place-details)
и [reference `PlaceDetailsCompactElement`](https://developers.google.com/maps/documentation/javascript/reference/places-widget#PlaceDetailsCompactElement)

Два требования нельзя гарантировать через публичные настройки Essentials:

1. **Точное 16:10.** У `gmp-place-media` нет настройки aspect ratio. Его публичные
   свойства — только `lightboxPreferred` и `preferredSize`; причём `preferredSize`
   документирован как подсказка для вариантов, поддерживающих несколько размеров
   (пример — вертикальный `PlaceSearchElement`), а не как управление пропорциями compact
   details. Google отдельно запрещает фиксировать высоту `PlaceDetailsCompactElement`.
   Следовательно, можно выбрать вертикальную ориентацию и ширину контейнера, но не
   обещать 16:10 и не обрезать внутреннее изображение через shadow DOM.
   [Reference `PlaceMediaElement`](https://developers.google.com/maps/documentation/javascript/reference/place-widget-child-elements#PlaceMediaElement)
   и [рекомендации по размеру compact element](https://developers.google.com/maps/documentation/javascript/places-ui-kit/place-details#place_details_compact_element)
2. **Только фото без Google-названия места.** В Essentials `PlaceContentConfigElement`
   позволяет выбирать media, address, rating, type, price, accessibility, open status и
   attribution, но не name. Возможность явно убрать name через исключение
   `gmp-place-name` документирована только для `AdvancedPlaceDetails*`; сам
   `PlaceNameElement` и advanced-компоненты доступны только в `v=beta` и относятся к
   Places UI Kit Pro. Поэтому в Essentials нет поддерживаемого публичного переключателя,
   который гарантированно убирает встроенное название места; скрывать его через
   внутренний DOM нельзя.
   [Список content elements](https://developers.google.com/maps/documentation/javascript/reference/place-widget-child-elements#PlaceContentConfigElement),
   [Advanced: omit the Place name](https://developers.google.com/maps/documentation/javascript/places-ui-kit/advanced-place-details#omit_the_place_name)
   и [reference `PlaceNameElement`](https://developers.google.com/maps/documentation/javascript/reference/place-widget-child-elements#PlaceNameElement)

## Поддерживаемая разметка

```html
<gmp-place-details-compact orientation="vertical">
  <gmp-place-details-place-request
    place="PLACE_ID">
  </gmp-place-details-place-request>
  <gmp-place-content-config>
    <gmp-place-media lightbox-preferred></gmp-place-media>
    <gmp-place-attribution
      light-scheme-color="gray"
      dark-scheme-color="white">
    </gmp-place-attribution>
  </gmp-place-content-config>
</gmp-place-details-compact>
```

- Compact element показывает **не более одной фотографии**. `lightbox-preferred`
  включает lightbox при клике; по умолчанию lightbox выключен.
  [Place Details](https://developers.google.com/maps/documentation/javascript/places-ui-kit/place-details#place_details_compact_element)
  и [reference `PlaceMediaElement`](https://developers.google.com/maps/documentation/javascript/reference/place-widget-child-elements#PlaceMediaElement)
- `gmp-place-attribution` управляет только допустимым цветом атрибуции. Даже если этот
  child не добавить, UI Kit всё равно выводит атрибуцию с цветами по умолчанию.
  [Reference `PlaceAttributionElement`](https://developers.google.com/maps/documentation/javascript/reference/place-widget-child-elements#PlaceAttributionElement)
- Порядок content children не меняет порядок отрисовки: его определяет компонент.
  [Place Details: configure content](https://developers.google.com/maps/documentation/javascript/places-ui-kit/place-details#configure_the_content)
- Для vertical Google рекомендует ширину 180–300 px; ниже 160 px отображение может
  ломаться. Для horizontal — 180–500 px, но при ширине меньше 350 px thumbnail вообще
  скрывается. В обоих режимах нельзя задавать фиксированную высоту. Для фото сверху в
  карточке vertical — единственный разумный вариант, но это всё ещё не контракт 16:10.
  [Place Details: configure appearance](https://developers.google.com/maps/documentation/javascript/places-ui-kit/place-details#configure_the_appearance)

## Инициализация, канал и стоимость

- Нужны Google Cloud project с billing account, включённый **Places UI Kit**, API key и
  загрузка Maps JavaScript API через inline bootstrap loader. После этого требуется
  `await google.maps.importLibrary('places')`. Официальный пример использует
  `v: "weekly"`; Essentials `PlaceDetailsCompactElement` есть в weekly reference без
  beta-notice. Beta требуется именно advanced-компонентам.
  [Get started](https://developers.google.com/maps/documentation/javascript/places-ui-kit/get-started),
  [weekly release 3.61.2](https://developers.google.com/maps/documentation/javascript/releases#3.61.2)
  и [reference](https://developers.google.com/maps/documentation/javascript/reference/places-widget#PlaceDetailsCompactElement)
- Для production browser key нужно применить website/referrer restriction и API
  restriction на Maps JavaScript API; Google относит Places UI Kit к Maps JavaScript API
  в рекомендациях по защите ключей. Ключ публичен в браузере по природе, но не должен
  быть неограниченным.
  [Google Maps Platform security guidance](https://developers.google.com/maps/api-security-best-practices)
- Place Details / Place Search UI Kit тарифицируются как **Places UI Kit Query,
  Essentials**: один UI Kit request оплачивается независимо от числа выведенных полей.
  На дату исследования global free usage cap — 10 000 событий в месяц, затем $1.00 за
  1 000 до первого volume tier; цену надо перепроверять перед production rollout.
  [SKU details](https://developers.google.com/maps/billing-and-pricing/sku-details#places-ui-kit-query)
  и [global pricing table](https://developers.google.com/maps/billing-and-pricing/pricing#essentials)

## Place ID, отсутствие фото и ошибки

- Хранить Place ID в `restaurant_location` допустимо: Place ID прямо освобождён от
  caching restrictions и может храниться бессрочно. Фото и photo URI к этому исключению
  не относятся; собственный proxy/cache фотографий не нужен и создавал бы отдельные
  требования.
  [Maps JavaScript API policies](https://developers.google.com/maps/documentation/javascript/policies#exceptions_from_caching_restrictions)
- `PlaceDetailsPlaceRequestElement.place` принимает Place object, Place ID или resource
  name и по умолчанию равен `null`. Если `restaurant_location` пуст, компонент не надо
  монтировать: карточка остаётся в прежнем виде без media-блока.
  [Reference `PlaceDetailsPlaceRequestElement`](https://developers.google.com/maps/documentation/javascript/reference/places-widget#PlaceDetailsPlaceRequestElement)
- После успешной загрузки компонент испускает non-bubbling `gmp-load`; при отклонённом
  backend request (пример Google — неверный API key) — non-bubbling `gmp-error`.
  Публичный event API не сообщает отдельный статус «у места нет фото», а read-only
  `place` у compact содержит только ID, location и viewport. Поэтому корректный host
  fallback: при `gmp-error` убрать media-region, но оставить исходную карточку; отсутствие
  фото доверить собственному placeholder/layout UI Kit. Не определять его чтением
  shadow DOM.
  [Events and `place` property](https://developers.google.com/maps/documentation/javascript/reference/places-widget#PlaceDetailsCompactElement)
- Наличие фото не гарантировано: Places возвращает photos только если у места есть
  связанный photographic content. UI Kit не документирует отдельный callback для этого
  состояния.
  [Place Photos](https://developers.google.com/maps/documentation/places/web-service/place-photos#get_a_photo_name)

## Атрибуция и границы стилизации

- Атрибуцию, встроенную UI Kit, нельзя удалять, менять, скрывать или перекрывать; она
  должна оставаться контрастной и видимой. Google-контент нужно визуально отделить от
  данных карточки границей, фоном, тенью или достаточным whitespace.
  [Policies and attributions](https://developers.google.com/maps/documentation/javascript/policies#included_google_maps_attribution)
- Публично поддерживаются CSS custom properties host element для цветов, шрифтов,
  рамки/радиуса и placeholder color. В reference нет свойства для высоты или aspect
  ratio фотографии. Не обращаться к внутренним классам/shadow DOM.
  [CSS properties of `PlaceDetailsCompactElement`](https://developers.google.com/maps/documentation/javascript/reference/places-widget#PlaceDetailsCompactElement)

## Рекомендация для пробной первой карточки

Монтировать компонент только для `index === 0`, только при непустом Place ID и только
после ленивой загрузки `places`. Использовать vertical orientation, допустимую ширину,
`lightbox-preferred`, встроенную attribution и исходную карточку как fallback при
отсутствии ID/ошибке. Перед реализацией принять, что Essentials может вывести
встроенное название места и не гарантирует 16:10; устранить оба ограничения без
Advanced Pro beta или неподдерживаемого вмешательства во внутренний DOM нельзя.
