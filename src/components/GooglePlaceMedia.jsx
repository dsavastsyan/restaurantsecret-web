import React, { useEffect, useRef, useState } from 'react'
import { Utensils } from 'lucide-react'
import {
  getGoogleMapsApiKey,
  loadGooglePlacesUiKit,
  reportGooglePlacesUsage,
} from '@/lib/googlePlaces'

const GOOGLE_MAPS_API_KEY = getGoogleMapsApiKey()

export default function GooglePlaceMedia({ placeId, restaurantName, className = 'catalog-card__place-media', mediaSize = 'large', mediaOnly = false }) {
  const elementHostRef = useRef(null)
  const detailsRef = useRef(null)
  const [status, setStatus] = useState('loading')
  const placeholderClassName = className === 'catalog-card__place-media'
    ? 'catalog-card__place-media-placeholder'
    : `${className}-placeholder`
  const elementClassName = className === 'catalog-card__place-media'
    ? 'catalog-card__place-media-element'
    : `${className}-element`
  const placeholderIconClassName = className === 'catalog-card__place-media'
    ? 'catalog-card__place-media-placeholder-icon'
    : `${className}-placeholder-icon`

  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY || !placeId) return undefined

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

        details = document.createElement(mediaOnly ? 'gmp-advanced-place-details' : 'gmp-place-details-compact')
        if (!mediaOnly) details.setAttribute('orientation', 'vertical')
        details.setAttribute('aria-label', `Фотография ресторана ${restaurantName} из Google`)
        detailsRef.current = details
        details.addEventListener('gmp-load', handleLoad)
        details.addEventListener('gmp-error', handleError)

        const request = document.createElement('gmp-place-details-place-request')
        request.setAttribute('place', placeId)

        const content = document.createElement('gmp-place-content-config')
        const media = document.createElement('gmp-place-media')
        media.setAttribute('lightbox-preferred', '')
        media.setAttribute('preferred-size', mediaSize)
        const attribution = document.createElement('gmp-place-attribution')
        attribution.setAttribute('light-scheme-color', 'gray')
        attribution.setAttribute('dark-scheme-color', 'white')

        if (mediaOnly) {
          details.append(request, media, attribution)
        } else {
          content.append(media, attribution)
          details.append(request, content)
        }
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
  }, [mediaOnly, mediaSize, placeId])

  useEffect(() => {
    if (detailsRef.current && restaurantName) {
      detailsRef.current.setAttribute('aria-label', `Фотография ресторана ${restaurantName} из Google`)
    }
  }, [restaurantName])

  if (!GOOGLE_MAPS_API_KEY || !placeId || status === 'error') {
    return (
      <div className={`${className} ${className}--placeholder`} aria-hidden="true">
        <div className={placeholderClassName} />
      </div>
    )
  }

  return (
    <div className={`${className}${status === 'loaded' ? ' is-loaded' : ''}`}>
      <div ref={elementHostRef} className={elementClassName} />
      {status !== 'loaded' && (
        <div className={placeholderClassName} aria-hidden="true">
          <span className={placeholderIconClassName}>
            <Utensils size={32} strokeWidth={1.7} />
          </span>
        </div>
      )}
    </div>
  )
}
