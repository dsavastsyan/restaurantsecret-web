// src/lib/useMeta.js
// Lightweight hook to manage per-page <title>, <meta name="description">, and <link rel="canonical">.
// Call it at the top level of any page component.
import { useEffect } from 'react'

/**
 * @param {{ title?: string, description?: string, canonical?: string, robots?: string }} params
 */
export function useMeta(params = {}) {
  const { title, description, canonical, robots } = params
  // Distinguish "caller has an opinion about robots" (Menu.jsx always passes
  // this key, even as undefined for an indexable page) from "caller never
  // mentioned robots" (every other page) — only the former may clear an
  // existing tag, so pages that don't opt in never fight a global default
  // (e.g. the preview persona panel's blanket noindex).
  const hasRobotsOpinion = Object.prototype.hasOwnProperty.call(params, 'robots')

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

    let restoreRobots = null
    if (hasRobotsOpinion) {
      const existing = document.querySelector('meta[name="robots"]')
      if (robots) {
        if (existing) {
          const previousContent = existing.getAttribute('content')
          existing.setAttribute('content', robots)
          restoreRobots = () => existing.setAttribute('content', previousContent)
        } else {
          const created = document.createElement('meta')
          created.setAttribute('name', 'robots')
          created.setAttribute('content', robots)
          document.head.appendChild(created)
          restoreRobots = () => created.remove()
        }
      } else if (existing) {
        // The page explicitly has no robots restriction — remove any tag left
        // by a global default (e.g. the preview persona panel) instead of
        // silently inheriting it.
        const previousContent = existing.getAttribute('content')
        existing.remove()
        restoreRobots = () => {
          const restored = document.createElement('meta')
          restored.setAttribute('name', 'robots')
          restored.setAttribute('content', previousContent)
          document.head.appendChild(restored)
        }
      }
    }

    return () => {
      restoreRobots?.()
    }
  }, [title, description, canonical, robots, hasRobotsOpinion])
}
