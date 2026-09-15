// Chain hub page — the brand-level landing for a restaurant network (e.g.
// "Сыроварня"), reachable at its bare /restaurants/{baseSlug}/ URL. Lists
// every active location grouped by city, with a map for whichever city is
// selected. Every location on the page links to its own real, already-
// indexable /menu/ page — the hub exists to make the network browsable and
// to catch the broad "{сеть} меню" search intent, not to duplicate a
// specific branch's menu content.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMeta } from '@/lib/useMeta'
import { api } from '../api/client.js'
import { useSWRLite } from '../hooks/useSWRLite.js'
import ChainLocationsMap from '../components/ChainLocationsMap.jsx'
import '@/pages/menu-redesign.css'

function groupByCity(locations) {
  const byCity = new Map()
  for (const loc of locations) {
    if (!byCity.has(loc.city)) byCity.set(loc.city, [])
    byCity.get(loc.city).push(loc)
  }
  return Array.from(byCity.entries())
    .map(([city, locs]) => ({ city, locations: locs }))
    .sort((a, b) => b.locations.length - a.locations.length || a.city.localeCompare(b.city, 'ru'))
}

export default function ChainHub() {
  const { slug = '' } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const { data: hub, error, loading } = useSWRLite(`chain-hub:${slug}`, () => api.restaurant(slug))

  useEffect(() => {
    // # A slug that turns out not to be a chain (no sibling locations) is a
    // # plain restaurant — send the visitor to its canonical menu page, the
    // # same place the old static redirect stub already points direct links.
    if (hub && hub.isHub !== true) {
      navigate(`/restaurants/${slug}/menu/`, { replace: true })
    }
  }, [hub, navigate, slug])

  const cityGroups = useMemo(() => groupByCity(hub?.locations ?? []), [hub])

  const [selectedCity, setSelectedCity] = useState(null)
  useEffect(() => {
    if (!cityGroups.length || selectedCity) return
    const fromUrl = searchParams.get('city')
    const fromPreference = typeof window !== 'undefined' ? window.localStorage?.getItem('catalog_city') : null
    const match =
      cityGroups.find((g) => g.city === fromUrl) ||
      cityGroups.find((g) => g.city === fromPreference) ||
      cityGroups[0]
    setSelectedCity(match.city)
  }, [cityGroups, searchParams, selectedCity])

  function changeCity(city) {
    setSelectedCity(city)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('city', city)
      return next
    }, { replace: true })
  }

  const activeGroup = cityGroups.find((g) => g.city === selectedCity) ?? cityGroups[0] ?? null

  useMeta(
    hub?.isHub
      ? {
          title: `Меню ${hub.name} с КБЖУ — сеть ресторанов, ${hub.totalCount} адресов`,
          description: `${hub.name}: меню с КБЖУ по каждому филиалу сети. ${hub.totalCount} ресторанов в ${cityGroups.length} городах — выберите свой и сравнивайте блюда по калорийности и БЖУ.`,
          canonical: `https://restaurantsecret.ru/restaurants/${slug}/`,
        }
      : {},
  )

  if (loading || !hub) {
    return (
      <div className="rsm2-root chain-hub">
        <div className="chain-hub__loading">Загружаем сеть…</div>
      </div>
    )
  }

  if (error || hub.isHub !== true) {
    return null
  }

  return (
    <div className="rsm2-root chain-hub">
      <header className="rsm2-hero chain-hub__hero">
        <div className="rsm2-hero__lead">
          <span className="rsm2-hero__eyebrow">Сеть ресторанов</span>
          <h1 className="rsm2-hero__title">{hub.name}</h1>
        </div>
        <div className="rsm2-hero__stats">
          <div className="rsm2-hero__stat">
            <span className="rsm2-hero__stat-value">{hub.totalCount}</span>
            <span className="rsm2-hero__stat-label">ресторанов</span>
          </div>
          <div className="rsm2-hero__rule" />
          <div className="rsm2-hero__stat">
            <span className="rsm2-hero__stat-value">{cityGroups.length}</span>
            <span className="rsm2-hero__stat-label">городов</span>
          </div>
          {hub.cuisine ? (
            <>
              <div className="rsm2-hero__rule" />
              <div className="rsm2-hero__stat">
                <span className="rsm2-hero__stat-value chain-hub__cuisine-value">{hub.cuisine}</span>
                <span className="rsm2-hero__stat-label">кухня</span>
              </div>
            </>
          ) : null}
        </div>
      </header>

      <div className="chain-hub__city-select">
        <label htmlFor="chain-hub-city" className="chain-hub__city-select-label">
          <svg className="chain-hub__city-select-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21Z" />
            <circle cx="12" cy="9.5" r="2.5" />
          </svg>
          Город
        </label>
        <div className="chain-hub__city-select-control">
          <select
            id="chain-hub-city"
            value={selectedCity ?? ''}
            onChange={(event) => changeCity(event.target.value)}
          >
            {cityGroups.map((g) => (
              <option key={g.city} value={g.city}>
                {g.city} — {g.locations.length} {g.locations.length === 1 ? 'филиал' : 'филиала'}
              </option>
            ))}
          </select>
          <svg className="chain-hub__city-select-chevron" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </div>

      {activeGroup ? (
        <div className="chain-hub__body">
          <div className="chain-hub__list">
            {activeGroup.locations.map((loc) => (
              <a key={loc.slug} className="chain-hub__card" href={`/restaurants/${loc.slug}/menu/`}>
                <div className="chain-hub__card-main">
                  <div className="chain-hub__card-name">{loc.branch || loc.city}</div>
                  <div className="chain-hub__card-meta">
                    {loc.dishesCount} блюд с КБЖУ{loc.metro ? ` · м. ${loc.metro}` : ''}
                  </div>
                </div>
                <span className="chain-hub__card-cta">Открыть меню →</span>
              </a>
            ))}
          </div>
          <ChainLocationsMap locations={activeGroup.locations} />
        </div>
      ) : null}
    </div>
  )
}
