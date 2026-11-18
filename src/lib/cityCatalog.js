// Slug and genitive-case ("ресторанов ...") forms for every city currently
// in the restaurant catalog (see `SELECT DISTINCT city FROM restaurant` in
// D1). A city missing from these maps still works — citySlug() falls back to
// a percent-encoded slug and cityGenitive() falls back to the nominative
// name — but add it here when a new city shows up, the same way
// RETIRED_RESTAURANT_SLUGS in generate-sitemap.js is maintained by hand.
export const CITY_SLUGS = {
  'Москва': 'moskva',
  'Санкт-Петербург': 'sankt-peterburg',
  'Нижний Новгород': 'nizhniy-novgorod',
  'Минск': 'minsk',
  'Екатеринбург': 'ekaterinburg',
  'Сочи': 'sochi',
  'Казань': 'kazan',
  'Московская область': 'moskovskaya-oblast',
  'Альметьевск': 'almetevsk',
  'Ростов-на-Дону': 'rostov-na-donu',
  'Анапа': 'anapa',
  'Барнаул': 'barnaul',
  'Владивосток': 'vladivostok',
  'Волгоград': 'volgograd',
  'Воронеж': 'voronezh',
  'Геленджик': 'gelendzhik',
  'Калининград': 'kaliningrad',
  'Калуга': 'kaluga',
  'Кемерово': 'kemerovo',
  'Краснодар': 'krasnodar',
  'Красноярск': 'krasnoyarsk',
  'Новороссийск': 'novorossiysk',
  'Новосибирск': 'novosibirsk',
  'Пермь': 'perm',
  'Реутов': 'reutov',
  'Саранск': 'saransk',
  'Томск': 'tomsk',
  'Тюмень': 'tyumen',
  'Уфа': 'ufa',
  'Хабаровск': 'khabarovsk',
  'Челябинск': 'chelyabinsk',
  'Октябрьский': 'oktyabrskiy',
  'Чехов': 'chekhov',
  'Ханты-Мансийск': 'khanty-mansiysk',
  'Махачкала': 'makhachkala',
  'Нижневартовск': 'nizhnevartovsk',
  'Омск': 'omsk',
  'Пенза': 'penza',
  'Сергиев Посад': 'sergiev-posad',
  'Серпухов': 'serpukhov',
  'Ставрополь': 'stavropol',
  'Тверь': 'tver',
  'Череповец': 'cherepovets',
  'Ижевск': 'izhevsk',
  'Шебекино': 'shebekino',
  'Старый Оскол': 'staryy-oskol',
  'Белгород': 'belgorod',
  'Валуйки': 'valuyki',
  'Стерлитамак': 'sterlitamak',
  'Воткинск': 'votkinsk',
  'Балашиха': 'balashikha',
  'Оренбург': 'orenburg',
  'Великий Новгород': 'velikiy-novgorod',
  'Ярославль': 'yaroslavl',
  'Адлер': 'adler',
  'Азов': 'azov',
  'Алапаевск': 'alapaevsk',
  'Алушта': 'alushta',
  'Армавир': 'armavir',
  'Архангельск': 'arkhangelsk',
  'Астрахань': 'astrakhan',
  'Батайск': 'bataysk',
  'Брянск': 'bryansk',
  'Владимир': 'vladimir',
  'Волгодонск': 'volgodonsk',
  'Волжский': 'volzhskiy',
  'Вологда': 'vologda',
  'Волоконовка': 'volokonovka',
  'Горшечное': 'gorshechnoe',
  'Грозный': 'groznyy',
  'Губкин': 'gubkin',
  'Дагомыс': 'dagomys',
  'Дзержинский': 'dzerzhinskiy',
  'Дмитров': 'dmitrov',
  'Долгопрудный': 'dolgoprudnyy',
  'Дубовое': 'dubovoe',
  'Ейск': 'eysk',
  'Звенигород': 'zvenigorod',
  'Зеленоград': 'zelenograd',
  'Златоуст': 'zlatoust',
  'Иваново': 'ivanovo',
  'Ишимбай': 'ishimbay',
  'Йошкар-Ола': 'yoshkar-ola',
  'Каплино': 'kaplino',
  'Киров': 'kirov',
  'Кисловодск': 'kislovodsk',
  'Комсомольск-на-Амуре': 'komsomolsk-na-amure',
  'Копейск': 'kopeysk',
  'Красногорск': 'krasnogorsk',
  'Кудрово': 'kudrovo',
  'Липецк': 'lipetsk',
  'Люберцы': 'lyubertsy',
  'Маслова Пристань': 'maslova-pristan',
  'Мелеуз': 'meleuz',
  'Миасс': 'miass',
  'Мончегорск': 'monchegorsk',
  'Мурино': 'murino',
  'Мурманск': 'murmansk',
  'Мытищи': 'mytishchi',
  'Набережные Челны': 'naberezhnye-chelny',
  'Незнамово': 'neznamovo',
  'Новодвинск': 'novodvinsk',
  'Новоселье': 'novoselye',
  'Новочеркасск': 'novocherkassk',
  'Новый Оскол': 'novyy-oskol',
  'Новый Уренгой': 'novyy-urengoy',
  'Норильск': 'norilsk',
  'Ноябрьск': 'noyabrsk',
  'Обнинск': 'obninsk',
  'Одинцово': 'odintsovo',
  'Петропавловск-Камчатский': 'petropavlovsk-kamchatskiy',
  'Подкопаевка': 'podkopaevka',
  'Подольск': 'podolsk',
  'Пятигорск': 'pyatigorsk',
  'Разумное': 'razumnoe',
  'Ревда': 'revda',
  'Реж': 'rezh',
  'Рязань': 'ryazan',
  'Саки': 'saki',
  'Салават': 'salavat',
  'Самара': 'samara',
  'Саратов': 'saratov',
  'Северный': 'severnyy',
  'Северодвинск': 'severodvinsk',
  'Симферополь': 'simferopol',
  'Смоленск': 'smolensk',
  'Стрелецкое': 'streletskoe',
  'Строитель': 'stroitel',
  'Судак': 'sudak',
  'Сургут': 'surgut',
  'Сыктывкар': 'syktyvkar',
  'Таврово': 'tavrovo',
  'Таганрог': 'taganrog',
  'Тамбов': 'tambov',
  'Тольятти': 'tolyatti',
  'Томаровка': 'tomarovka',
  'Троицк': 'troitsk',
  'Тула': 'tula',
  'Тутаев': 'tutaev',
  'Ульяновск': 'ulyanovsk',
  'Уссурийск': 'ussuriysk',
  'Феодосия': 'feodosiya',
  'Химки': 'khimki',
  'Чайковский': 'chaykovskiy',
  'Чебаркуль': 'chebarkul',
  'Чернянка': 'chernyanka',
  'Чита': 'chita',
  'Шахты': 'shakhty',
  'Шушары': 'shushary',
  'Южно-Сахалинск': 'yuzhno-sakhalinsk',
  'Южноуральск': 'yuzhnouralsk',
  'Юрга': 'yurga',
  'Ялта': 'yalta',
}

function decodeSlug(value) {
  try {
    return decodeURIComponent(String(value ?? ''))
  } catch (_) {
    return null
  }
}

export function cityFromSlug(slug) {
  const decodedSlug = decodeSlug(slug)
  if (decodedSlug === null) return null

  const match = Object.entries(CITY_SLUGS).find(([, citySlugValue]) => (
    decodeSlug(citySlugValue) === decodedSlug
  ))
  return match ? match[0] : null
}

// Every H1/title/description on a city catalog page reads "КБЖУ ресторанов
// {город}" — grammatically wrong in nominative for any Russian city name
// except the indeclinable ones (Сочи, Кемерово). A city missing here falls
// back to its nominative name rather than a guessed (and possibly wrong)
// ending.
export const CITY_GENITIVE = {
  'Москва': 'Москвы',
  'Санкт-Петербург': 'Санкт-Петербурга',
  'Нижний Новгород': 'Нижнего Новгорода',
  'Минск': 'Минска',
  'Екатеринбург': 'Екатеринбурга',
  'Сочи': 'Сочи',
  'Казань': 'Казани',
  'Московская область': 'Московской области',
  'Альметьевск': 'Альметьевска',
  'Ростов-на-Дону': 'Ростова-на-Дону',
  'Анапа': 'Анапы',
  'Барнаул': 'Барнаула',
  'Владивосток': 'Владивостока',
  'Волгоград': 'Волгограда',
  'Воронеж': 'Воронежа',
  'Геленджик': 'Геленджика',
  'Калининград': 'Калининграда',
  'Калуга': 'Калуги',
  'Кемерово': 'Кемерово',
  'Краснодар': 'Краснодара',
  'Красноярск': 'Красноярска',
  'Новороссийск': 'Новороссийска',
  'Новосибирск': 'Новосибирска',
  'Пермь': 'Перми',
  'Реутов': 'Реутова',
  'Саранск': 'Саранска',
  'Томск': 'Томска',
  'Тюмень': 'Тюмени',
  'Уфа': 'Уфы',
  'Хабаровск': 'Хабаровска',
  'Челябинск': 'Челябинска',
  'Октябрьский': 'Октябрьского',
  'Чехов': 'Чехова',
  'Ханты-Мансийск': 'Ханты-Мансийска',
  'Махачкала': 'Махачкалы',
  'Нижневартовск': 'Нижневартовска',
  'Омск': 'Омска',
  'Пенза': 'Пензы',
  'Сергиев Посад': 'Сергиева Посада',
  'Серпухов': 'Серпухова',
  'Ставрополь': 'Ставрополя',
  'Тверь': 'Твери',
  'Череповец': 'Череповца',
  'Ижевск': 'Ижевска',
  'Шебекино': 'Шебекино',
  'Старый Оскол': 'Старого Оскола',
  'Белгород': 'Белгорода',
  'Валуйки': 'Валуек',
  'Стерлитамак': 'Стерлитамака',
  'Воткинск': 'Воткинска',
  'Балашиха': 'Балашихи',
  'Оренбург': 'Оренбурга',
  'Великий Новгород': 'Великого Новгорода',
  'Ярославль': 'Ярославля',
  'Адлер': 'Адлера',
  'Азов': 'Азова',
  'Алапаевск': 'Алапаевска',
  'Алушта': 'Алушты',
  'Армавир': 'Армавира',
  'Архангельск': 'Архангельска',
  'Астрахань': 'Астрахани',
  'Батайск': 'Батайска',
  'Брянск': 'Брянска',
  'Владимир': 'Владимира',
  'Волгодонск': 'Волгодонска',
  'Волжский': 'Волжского',
  'Вологда': 'Вологды',
  'Волоконовка': 'Волоконовки',
  'Горшечное': 'Горшечного',
  'Грозный': 'Грозного',
  'Губкин': 'Губкина',
  'Дагомыс': 'Дагомыса',
  'Дзержинский': 'Дзержинского',
  'Дмитров': 'Дмитрова',
  'Долгопрудный': 'Долгопрудного',
  'Дубовое': 'Дубового',
  'Ейск': 'Ейска',
  'Звенигород': 'Звенигорода',
  'Зеленоград': 'Зеленограда',
  'Златоуст': 'Златоуста',
  'Иваново': 'Иванова',
  'Ишимбай': 'Ишимбая',
  'Йошкар-Ола': 'Йошкар-Олы',
  'Каплино': 'Каплино',
  'Киров': 'Кирова',
  'Кисловодск': 'Кисловодска',
  'Комсомольск-на-Амуре': 'Комсомольска-на-Амуре',
  'Копейск': 'Копейска',
  'Красногорск': 'Красногорска',
  'Кудрово': 'Кудрово',
  'Липецк': 'Липецка',
  'Люберцы': 'Люберец',
  'Маслова Пристань': 'Масловой Пристани',
  'Мелеуз': 'Мелеуза',
  'Миасс': 'Миасса',
  'Мончегорск': 'Мончегорска',
  'Мурино': 'Мурино',
  'Мурманск': 'Мурманска',
  'Мытищи': 'Мытищ',
  'Набережные Челны': 'Набережных Челнов',
  'Незнамово': 'Незнамово',
  'Новодвинск': 'Новодвинска',
  'Новоселье': 'Новоселья',
  'Новочеркасск': 'Новочеркасска',
  'Новый Оскол': 'Нового Оскола',
  'Новый Уренгой': 'Нового Уренгоя',
  'Норильск': 'Норильска',
  'Ноябрьск': 'Ноябрьска',
  'Обнинск': 'Обнинска',
  'Одинцово': 'Одинцова',
  'Петропавловск-Камчатский': 'Петропавловска-Камчатского',
  'Подкопаевка': 'Подкопаевки',
  'Подольск': 'Подольска',
  'Пятигорск': 'Пятигорска',
  'Разумное': 'Разумного',
  'Ревда': 'Ревды',
  'Реж': 'Режа',
  'Рязань': 'Рязани',
  'Саки': 'Саки',
  'Салават': 'Салавата',
  'Самара': 'Самары',
  'Саратов': 'Саратова',
  'Северный': 'Северного',
  'Северодвинск': 'Северодвинска',
  'Симферополь': 'Симферополя',
  'Смоленск': 'Смоленска',
  'Стрелецкое': 'Стрелецкого',
  'Строитель': 'Строителя',
  'Судак': 'Судака',
  'Сургут': 'Сургута',
  'Сыктывкар': 'Сыктывкара',
  'Таврово': 'Таврово',
  'Таганрог': 'Таганрога',
  'Тамбов': 'Тамбова',
  'Тольятти': 'Тольятти',
  'Томаровка': 'Томаровки',
  'Троицк': 'Троицка',
  'Тула': 'Тулы',
  'Тутаев': 'Тутаева',
  'Ульяновск': 'Ульяновска',
  'Уссурийск': 'Уссурийска',
  'Феодосия': 'Феодосии',
  'Химки': 'Химок',
  'Чайковский': 'Чайковского',
  'Чебаркуль': 'Чебаркуля',
  'Чернянка': 'Чернянки',
  'Чита': 'Читы',
  'Шахты': 'Шахт',
  'Шушары': 'Шушар',
  'Южно-Сахалинск': 'Южно-Сахалинска',
  'Южноуральск': 'Южноуральска',
  'Юрга': 'Юрги',
  'Ялта': 'Ялты',
}

const normalizeCityName = (cityName) => String(cityName || '').trim().toLowerCase()
const CITY_SLUGS_BY_LOWER = new Map(Object.entries(CITY_SLUGS).map(([name, slug]) => [normalizeCityName(name), slug]))
const CITY_GENITIVE_BY_LOWER = new Map(Object.entries(CITY_GENITIVE).map(([name, genitive]) => [normalizeCityName(name), genitive]))

export function citySlug(cityName) {
  const name = normalizeCityName(cityName)
  return CITY_SLUGS_BY_LOWER.get(name) || encodeURIComponent(name)
}

export function cityGenitive(cityName) {
  const name = String(cityName || '').trim()
  return CITY_GENITIVE_BY_LOWER.get(normalizeCityName(name)) || name
}

export function isMappedCity(cityName) {
  const name = normalizeCityName(cityName)
  return CITY_SLUGS_BY_LOWER.has(name) && CITY_GENITIVE_BY_LOWER.has(name)
}

// Plain .js (no TS) on purpose: this module is imported both by the Vite app
// (Catalog.jsx) and by scripts/generate-sitemap.js, which runs under plain
// `node` with no TypeScript/JSX support.
function pluralizeRestaurantsPrepositional(count) {
  const value = Math.abs(Number(count)) % 100
  const lastDigit = value % 10
  if (value >= 11 && value <= 14) return 'ресторанах'
  if (lastDigit === 1) return 'ресторане'
  return 'ресторанах'
}

// Shared copy for a city's catalog landing page (/catalog/:city) — used both
// for the prerendered <title>/<meta description> (generate-sitemap.js) and
// the client-side useMeta() call (Catalog.jsx), so the two never drift.
export function cityCatalogTitle(cityName) {
  return `КБЖУ ресторанов ${cityGenitive(cityName)} — калории и БЖУ блюд | RestaurantSecret`
}

export function cityCatalogDescription(cityName, restaurantCount) {
  const count = Number(restaurantCount) || 0
  const word = pluralizeRestaurantsPrepositional(count)
  return `КБЖУ в ${count.toLocaleString('ru-RU')} ${word} ${cityGenitive(cityName)}: калории, белки, жиры и углеводы из меню. Быстрые фильтры по кухне и метро.`
}
