import React, { useEffect, useRef, useState } from 'react'
import { Utensils } from 'lucide-react'
import {
  getGoogleMapsApiKey,
  loadGooglePlacesUiKit,
  reportGooglePlacesUsage,
} from '@/lib/googlePlaces'

const GOOGLE_MAPS_API_KEY = getGoogleMapsApiKey()
const GOOGLE_PLACE_MEDIA_ROOT_MARGIN = '500px 0px'

export default function GooglePlaceMedia({ placeId, restaurantName }) {
  const mediaContainerRef = useRef(null)
  const elementHostRef = useRef(null)
  const detailsRef = useRef(null)
  const [shouldLoad, setShouldLoad] = useState(false)
  const [status, setStatus] = useState('idle')

  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY || !placeId || shouldLoad) return undefined

    const target = mediaContainerRef.current
    if (!target || typeof window === 'undefined' || typeof window.IntersectionObserver !== 'function') {
      setShouldLoad(true)
      return undefined
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        setShouldLoad(true)
        observer.disconnect()
      },
      { rootMargin: GOOGLE_PLACE_MEDIA_ROOT_MARGIN },
    )

    observer.observe(target)
    return () => observer.disconnect()
  }, [placeId, shouldLoad])

  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY || !placeId || !shouldLoad) return undefined

    let isActive = true
    let details
    let timeoutId
    let usageReported = false
    setStatus('loading')

    const handleLoad = () => {
      if (!isActive) return
      clearTimeout(timeoutId)
      setStatus('loaded')
      if (!usageReported) {
        usageReported = true
        reportGooglePlacesUsage()
      }
    }
    const handleError = () => {
      if (!isActive) return
      clearTimeout(timeoutId)
      details?.removeEventListener('gmp-load', handleLoad)
      details?.removeEventListener('gmp-error', handleError)
      if (detailsRef.current === details) detailsRef.current = null
      elementHostRef.current?.replaceChildren()
      setStatus('error')
    }

    loadGooglePlacesUiKit(GOOGLE_MAPS_API_KEY)
      .then(() => {
        const host = elementHostRef.current
        if (!isActive || !host) return

        details = document.createElement('gmp-place-details-compact')
        details.setAttribute('orientation', 'vertical')
        details.setAttribute('aria-label', `Фотография ресторана ${restaurantName} из Google`)
        detailsRef.current = details
        details.addEventListener('gmp-load', handleLoad)
        details.addEventListener('gmp-error', handleError)

        const request = document.createElement('gmp-place-details-place-request')
        request.setAttribute('place', placeId)

        const content = document.createElement('gmp-place-content-config')
        const media = document.createElement('gmp-place-media')
        media.setAttribute('lightbox-preferred', '')
        media.setAttribute('preferred-size', 'large')
        const attribution = document.createElement('gmp-place-attribution')
        attribution.setAttribute('light-scheme-color', 'gray')
        attribution.setAttribute('dark-scheme-color', 'white')

        content.append(media, attribution)
        details.append(request, content)
        host.replaceChildren(details)
        timeoutId = window.setTimeout(handleError, 20_000)
      })
      .catch(handleError)

    return () => {
      isActive = false
      clearTimeout(timeoutId)
      details?.removeEventListener('gmp-load', handleLoad)
      details?.removeEventListener('gmp-error', handleError)
      if (detailsRef.current === details) detailsRef.current = null
      if (elementHostRef.current) elementHostRef.current.replaceChildren()
    }
  }, [placeId, shouldLoad])

  useEffect(() => {
    if (detailsRef.current && restaurantName) {
      detailsRef.current.setAttribute('aria-label', `Фотография ресторана ${restaurantName} из Google`)
    }
  }, [restaurantName])

  if (!GOOGLE_MAPS_API_KEY || !placeId || status === 'error') {
    return (
      <div ref={mediaContainerRef} className="catalog-card__place-media catalog-card__place-media--placeholder" aria-hidden="true">
        <div className="catalog-card__place-media-placeholder">
          <span className="catalog-card__place-media-placeholder-icon">
            <Utensils size={32} strokeWidth={1.7} />
          </span>
        </div>
      </div>
    )
  }

  return (
    <div ref={mediaContainerRef} className={`catalog-card__place-media${status === 'loaded' ? ' is-loaded' : ''}`}>
      {shouldLoad && <div ref={elementHostRef} className="catalog-card__place-media-element" />}
      {status !== 'loaded' && (
        <div className="catalog-card__place-media-placeholder" aria-hidden="true">
          <span className="catalog-card__place-media-placeholder-icon">
            <Utensils size={32} strokeWidth={1.7} />
          </span>
        </div>
      )}
    </div>
  )
}
