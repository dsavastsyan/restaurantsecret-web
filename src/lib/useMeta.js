// src/lib/useMeta.js
// Lightweight hook to manage per-page <title>, <meta name="description">, and <link rel="canonical">.
// Call it at the top level of any page component.
import { useEffect } from 'react'

/**
 * @param {{ title?: string, description?: string, canonical?: string, robots?: string }} params
 */
export function useMeta({ title, description, canonical, robots } = {}) {
  useEffect(() => {
    // Title
    if (title) {
      document.title = title
    }

    // Description
    if (description) {
      let el = document.querySelector('meta[name="description"]')
      if (!el) {
        el = document.createElement('meta')
        el.setAttribute('name', 'description')
        document.head.appendChild(el)
      }
      el.setAttribute('content', description)
    }

    // Canonical
    if (canonical) {
      let el = document.querySelector('link[rel="canonical"]')
      if (!el) {
        el = document.createElement('link')
        el.setAttribute('rel', 'canonical')
        document.head.appendChild(el)
      }
      el.setAttribute('href', canonical)
    }

    let robotsEl = null
    let previousRobots = null
    let createdRobots = false
    if (robots) {
      robotsEl = document.querySelector('meta[name="robots"]')
      if (!robotsEl) {
        robotsEl = document.createElement('meta')
        robotsEl.setAttribute('name', 'robots')
        document.head.appendChild(robotsEl)
        createdRobots = true
      } else {
        previousRobots = robotsEl.getAttribute('content')
      }
      robotsEl.setAttribute('content', robots)
    }

    return () => {
      if (!robotsEl) return
      if (createdRobots) robotsEl.remove()
      else if (previousRobots === null) robotsEl.removeAttribute('content')
      else robotsEl.setAttribute('content', previousRobots)
    }
  }, [title, description, canonical, robots])
}
