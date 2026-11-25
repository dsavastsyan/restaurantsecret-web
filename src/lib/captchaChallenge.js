// REPO: restaurantsecret-web
// file: src/lib/captchaChallenge.js
//
// Solves the Cloudflare Turnstile challenge the API asks for once a
// visitor's anti-scraping score crosses the threshold (see RestaurantSecret
// functions/index.js — `{ error: "captcha_required", sitekey }`). Before
// this module existed the frontend had no way to clear that gate at all:
// the request just failed with a raw 403 and looked like a broken site
// (incident 2026-09-29).

const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js'

let scriptPromise = null

function loadTurnstile() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no_window'))
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = TURNSTILE_SCRIPT_URL
    script.async = true
    script.defer = true
    script.onload = () => {
      if (window.turnstile) resolve(window.turnstile)
      else reject(new Error('turnstile_unavailable'))
    }
    script.onerror = () => {
      scriptPromise = null // allow a retry on the next call
      reject(new Error('turnstile_script_failed'))
    }
    document.head.appendChild(script)
  })

  return scriptPromise
}

// Shows a modal with the Turnstile widget and resolves with the token once
// solved. Rejects with `error.code = 'captcha_cancelled'` if the visitor
// closes the modal, or `'captcha_error'` if Turnstile/the network fails.
export function solveCaptcha(sitekey) {
  return new Promise((resolve, reject) => {
    if (!sitekey) {
      const err = new Error('captcha_missing_sitekey')
      err.code = 'captcha_error'
      reject(err)
      return
    }

    loadTurnstile()
      .then((turnstile) => {
        const overlay = document.createElement('div')
        overlay.setAttribute('role', 'dialog')
        overlay.setAttribute('aria-modal', 'true')
        overlay.style.cssText =
          'position:fixed;inset:0;background:rgba(20,16,12,0.55);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;'

        const card = document.createElement('div')
        card.style.cssText =
          'background:#fdf8f1;border-radius:16px;padding:24px;max-width:340px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.3);text-align:center;font-family:inherit;'

        const title = document.createElement('p')
        title.textContent = 'Подтвердите, что вы не робот'
        title.style.cssText = 'margin:0 0 16px;font-size:15px;font-weight:600;color:#2a2118;'
        card.appendChild(title)

        const widgetHost = document.createElement('div')
        widgetHost.style.cssText = 'display:flex;justify-content:center;'
        card.appendChild(widgetHost)

        const cancelBtn = document.createElement('button')
        cancelBtn.type = 'button'
        cancelBtn.textContent = 'Отмена'
        cancelBtn.style.cssText =
          'margin-top:16px;background:none;border:none;color:#8a7c68;font-size:13px;text-decoration:underline;cursor:pointer;padding:4px;'
        card.appendChild(cancelBtn)

        overlay.appendChild(card)
        document.body.appendChild(overlay)

        let widgetId = null
        let settled = false

        const cleanup = () => {
          if (settled) return
          settled = true
          try {
            if (widgetId != null) turnstile.remove(widgetId)
          } catch (_) {
            // widget already gone — nothing to clean up
          }
          overlay.remove()
        }

        cancelBtn.onclick = () => {
          cleanup()
          const err = new Error('captcha_cancelled')
          err.code = 'captcha_cancelled'
          reject(err)
        }

        widgetId = turnstile.render(widgetHost, {
          sitekey,
          theme: 'light',
          callback: (token) => {
            cleanup()
            resolve(token)
          },
          'error-callback': () => {
            cleanup()
            const err = new Error('captcha_error')
            err.code = 'captcha_error'
            reject(err)
          },
        })
      })
      .catch((err) => {
        err.code = err.code || 'captcha_error'
        reject(err)
      })
  })
}
