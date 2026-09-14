import { PD_API_BASE } from "@/config/api";
import { tryRefresh } from "@/lib/api";

export const COOKIE_POLICY_VERSION = "cookies_v1_2026-01-16";
export const USER_AGREEMENT_VERSION = "agreement_v1_2026-02-12";
const CONSENT_KEY = "rs_consent_v1";
const ANON_ID_KEY = "rs_anon_id";
const ATTRIBUTION_KEY = "rs_landing_attribution_v1";
const ATTRIBUTION_EVENT_SENT_KEY = "rs_attribution_event_signature_v1";
const ANALYTICS_SCHEMA_VERSION = "2026-02-20-utm-fix-v3";
const YANDEX_METRIKA_COUNTER_ID = 108992733;

// Helper to generate UUID v4
function uuidv4() {
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
        (
            c ^
            (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
        ).toString(16)
    );
}

// Search engines and other crawlers execute our client JS while rendering pages
// (to see SPA content), which would otherwise fire real analytics events on every
// crawl. None of that traffic is a real visitor, so we skip sending analytics for it.
const CRAWLER_USER_AGENT_PATTERN = /bot|spider|crawl|slurp|mediapartners|facebookexternalhit|embedly|quora link preview|whatsapp|telegrambot|w3c_validator|headlesschrome/i;

function isCrawlerUserAgent() {
    if (typeof navigator === "undefined") return false;
    return CRAWLER_USER_AGENT_PATTERN.test(navigator.userAgent || "");
}

class AnalyticsService {
    constructor() {
        this.apiUrl = PD_API_BASE;
        this.captureInitialAttribution();
    }

    captureInitialAttribution() {
        try {
            this.syncAttributionFromLocation();
        } catch {
            // Ignore storage errors in private mode / blocked storage contexts.
        }
    }

    readAttributionFromLocation() {
        const params = this.getNormalizedQueryParams();
        return {
            landing_path: window.location.pathname,
            referrer: document.referrer || null,
            utm_source: params.get("utm_source"),
            utm_medium: params.get("utm_medium"),
            utm_campaign: params.get("utm_campaign"),
            utm_content: params.get("utm_content"),
            utm_term: params.get("utm_term"),
            tg_start_param: params.get("tgwebappstartparam") || params.get("start"),
        };
    }

    getNormalizedQueryParams() {
        const normalized = new Map();

        const appendFromQueryString = (queryString) => {
            if (!queryString) return;
            const raw = queryString.startsWith("?") ? queryString.slice(1) : queryString;
            const parsed = new URLSearchParams(raw);
            for (const [key, value] of parsed.entries()) {
                const normalizedKey = key.trim().toLowerCase().replace(/^amp;/, "");
                if (!normalizedKey) continue;
                const normalizedValue = typeof value === "string" ? value.trim() : value;
                normalized.set(normalizedKey, normalizedValue || null);
            }
        };

        appendFromQueryString(window.location.search);

        // Some integrations pass UTM params after '#', keep those too.
        const hash = window.location.hash || "";
        const queryIdx = hash.indexOf("?");
        if (queryIdx !== -1) {
            appendFromQueryString(hash.slice(queryIdx + 1));
        }

        return {
            get: (key) => normalized.get(String(key).trim().toLowerCase()) ?? null,
        };
    }

    hasCampaignAttribution(attribution) {
        return Boolean(
            attribution?.utm_source ||
            attribution?.utm_medium ||
            attribution?.utm_campaign ||
            attribution?.utm_content ||
            attribution?.utm_term ||
            attribution?.tg_start_param
        );
    }

    buildAttributionSignature(attribution) {
        return [
            attribution?.utm_source || "",
            attribution?.utm_medium || "",
            attribution?.utm_campaign || "",
            attribution?.utm_content || "",
            attribution?.utm_term || "",
            attribution?.tg_start_param || "",
            attribution?.landing_path || "",
        ].join("|");
    }

    syncAttributionFromLocation() {
        const current = this.readAttributionFromLocation();
        const currentSig = this.buildAttributionSignature(current);
        const hasCampaign = this.hasCampaignAttribution(current);
        const stored = sessionStorage.getItem(ATTRIBUTION_KEY);

        if (!stored) {
            sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(current));
            return;
        }

        let parsed = null;
        try {
            parsed = JSON.parse(stored);
        } catch {
            parsed = null;
        }

        if (!parsed || typeof parsed !== "object") {
            sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(current));
            return;
        }

        const storedSig = this.buildAttributionSignature(parsed);
        if (hasCampaign && currentSig !== storedSig) {
            // New UTM in the same tab should start a fresh attribution boundary.
            sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(current));
            sessionStorage.removeItem("rs_session_started");
            sessionStorage.removeItem(ATTRIBUTION_EVENT_SENT_KEY);
        }
    }

    getInitialAttribution() {
        try {
            this.syncAttributionFromLocation();
            const raw = sessionStorage.getItem(ATTRIBUTION_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === "object") return parsed;
            }
        } catch {
            // Fallback to current location below.
        }

        return this.readAttributionFromLocation();
    }

    getConsentStatus() {
        try {
            const stored = localStorage.getItem(CONSENT_KEY);
            if (!stored) return "unset";
            const parsed = JSON.parse(stored);
            if (parsed.policyVersion !== COOKIE_POLICY_VERSION) return "unset";
            return parsed.analytics || "unset";
        } catch {
            return "unset";
        }
    }

    getAnonId() {
        return localStorage.getItem(ANON_ID_KEY) || null;
    }

    getAccessToken() {
        const token = localStorage.getItem("rs_access");
        if (!token || typeof token !== "string" || token.split(".").length !== 3) return null;

        try {
            const payloadBase64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
            const paddedPayload = payloadBase64.padEnd(Math.ceil(payloadBase64.length / 4) * 4, "=");
            const payloadJson = atob(paddedPayload);
            const payload = JSON.parse(payloadJson);
            const exp = Number(payload?.exp);
            if (Number.isFinite(exp) && Date.now() >= exp * 1000) {
                return null;
            }
        } catch {
            // If payload parsing failed, we still allow trying this token.
        }

        return token;
    }

    ensureAnonId() {
        let id = this.getAnonId();
        if (!id) {
            id = uuidv4();
            localStorage.setItem(ANON_ID_KEY, id);
        }
        return id;
    }

    async setConsent(status) {
        const validStatuses = ["granted", "denied"];
        if (!validStatuses.includes(status)) return;

        // Save to local storage
        const consentData = {
            analytics: status,
            updatedAt: new Date().toISOString(),
            policyVersion: COOKIE_POLICY_VERSION,
        };
        localStorage.setItem(CONSENT_KEY, JSON.stringify(consentData));

        // Handle Anon ID
        let anonId = null;
        if (status === "granted") {
            anonId = this.ensureAnonId();
        } else {
            // Optional: remove anon ID if denied?
            // For now, metrics usually require keeping it or rotating.
            // User requested: "(optional) delete rs_anon_id".
            // Let's keep it simple: if denied, we just don't send events.
            // But for the CONSENT call, we can send it if we have it, or not.
            anonId = this.getAnonId();
        }

        // Call Backend
        try {
            const payload = {
                status,
                policy_version: COOKIE_POLICY_VERSION,
                anon_id: anonId,
            };

            // Get token if exists (assuming stored in localStorage 'rs_token' or similar, 
            // but if we are in main app we might need to access auth store.
            // For simplicity, we'll try to read from a common place or just send anon if distinct).
            // Ideally, track() gets headers from a centralized API client.
            // Here we will use fetch directly for now, adding Auth header if we can find it.

            const sendConsent = async (tokenOverride) => {
                const token = tokenOverride || this.getAccessToken();
                const headers = { "Content-Type": "application/json" };
                if (token && typeof token === "string" && token.split('.').length === 3) {
                    headers["Authorization"] = `Bearer ${token}`;
                }

                return await fetch(`${this.apiUrl}/api/consent/analytics`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(payload),
                });
            };

            let res = await sendConsent();
            if (res.status === 401) {
                const newToken = await tryRefresh();
                if (newToken) {
                    await sendConsent(newToken);
                } else {
                    // If token is stale and refresh failed, retry as anonymous request.
                    await fetch(`${this.apiUrl}/api/consent/analytics`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload),
                    });
                }
            }
        } catch (err) {
            console.error("[Analytics] Failed to set consent", err);
        }

        // Trigger event for UI updates if needed
        window.dispatchEvent(new Event("rs-consent-update"));

        // If user has just granted analytics, send session_start now.
        // This captures landing UTM params for first-time consent on entry page.
        if (status === "granted") {
            this.trackSessionStart().catch(() => { });
            this.trackLandingAttribution().catch(() => { });
        }
    }

    getSessionId() {
        const now = Date.now();
        const storedSession = sessionStorage.getItem("rs_session_id");
        const lastActivity = localStorage.getItem("rs_last_activity");

        let sessionId = storedSession;

        if (!sessionId || !lastActivity || (now - Number(lastActivity) > 30 * 60 * 1000)) {
            // New session
            sessionId = uuidv4();
            sessionStorage.setItem("rs_session_id", sessionId);
            sessionStorage.removeItem("rs_session_started"); // Reset flag for new session
        }

        localStorage.setItem("rs_last_activity", now.toString());
        return sessionId;
    }

    async trackSessionStart() {
        // Ensure session exists
        this.getSessionId();

        if (sessionStorage.getItem("rs_session_started")) return;

        // Gather props
        const props = {
            ...this.getInitialAttribution(),
            screen_width: window.screen.width,
            screen_height: window.screen.height,
            viewport_width: window.innerWidth,
            viewport_height: window.innerHeight,
            device_pixel_ratio: window.devicePixelRatio,
            selected_city: localStorage.getItem("catalog_city") || "Москва",
        };

        const sent = await this.track("session_start", props, {
            ignoreConsent: true,
            withAttribution: false,
        });
        if (sent) {
            sessionStorage.setItem("rs_session_started", "true");
        }
    }

    async trackLandingAttribution() {
        if (this.getConsentStatus() !== "granted") return;

        const attribution = this.getInitialAttribution();
        if (!this.hasCampaignAttribution(attribution)) return;

        const signature = this.buildAttributionSignature(attribution);
        const sentSignature = sessionStorage.getItem(ATTRIBUTION_EVENT_SENT_KEY);
        if (sentSignature === signature) return;

        const sent = await this.track("landing_attribution", attribution, { withAttribution: false });
        if (sent) {
            sessionStorage.setItem(ATTRIBUTION_EVENT_SENT_KEY, signature);
        }
    }

    async track(eventName, props = {}, options = {}) {
        if (isCrawlerUserAgent()) return false;

        const { ignoreConsent = false, withAttribution = true } = options;
        if (!ignoreConsent && this.getConsentStatus() !== "granted") return false;

        const anonId = this.ensureAnonId();
        const sessionId = this.getSessionId();
        const mergedProps = withAttribution
            ? { analytics_schema_version: ANALYTICS_SCHEMA_VERSION, ...this.getInitialAttribution(), ...props }
            : { analytics_schema_version: ANALYTICS_SCHEMA_VERSION, ...props };

        const payload = {
            event_name: eventName,
            props: mergedProps,
            session_id: sessionId,
            anon_id: anonId,
        };

        const sendEvent = async (tokenOverride) => {
            const token = tokenOverride || this.getAccessToken();
            const headers = { "Content-Type": "application/json" };

            // Basic check to ensure it's a non-empty string that looks like a JWT
            if (token && typeof token === "string" && token.split('.').length === 3) {
                headers["Authorization"] = `Bearer ${token}`;
            }

            // Using fetch with keepalive ensures reliability on page unload
            return await fetch(`${this.apiUrl}/api/analytics/event`, {
                method: "POST",
                headers,
                body: JSON.stringify(payload),
                keepalive: true,
            });
        };

        try {
            let res = await sendEvent();
            if (res.status === 401) {
                const newToken = await tryRefresh();
                if (newToken) {
                    res = await sendEvent(newToken);
                } else {
                    // If token is stale and refresh failed, retry as anonymous request.
                    res = await fetch(`${this.apiUrl}/api/analytics/event`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload),
                        keepalive: true,
                    });
                }
            }
            return Boolean(res?.ok);
        } catch (err) {
            if (import.meta.env.DEV) console.warn("[Analytics] Track failed", err);
            return false;
        }
    }

    /**
     * Вызывать сразу после успешного логина.
     * Линкует все прошлые анонимные события с user_id на сервере.
     */
    async identify() {
        const token = this.getAccessToken();
        if (!token) return;
        const anonId = this.getAnonId();
        if (!anonId) return;

        try {
            await fetch(`${this.apiUrl}/api/analytics/identify`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`,
                },
                body: JSON.stringify({ anon_id: anonId }),
            });
        } catch (err) {
            if (import.meta.env.DEV) console.warn("[Analytics] Identify failed", err);
        }
    }

    reachGoal(goalName, props = {}) {
        if (!goalName || typeof window === "undefined") return false;

        try {
            window.__loadYandexMetrika?.();
            if (typeof window.ym !== "function") return false;
            window.ym(YANDEX_METRIKA_COUNTER_ID, "reachGoal", goalName, props);
            return true;
        } catch {
            return false;
        }
    }

    trackPageView(url = window.location.href) {
        if (typeof window === "undefined") return false;

        try {
            window.__loadYandexMetrika?.();
            if (typeof window.ym !== "function") return false;
            window.ym(YANDEX_METRIKA_COUNTER_ID, "hit", url, {
                title: document.title,
                referer: document.referrer || undefined,
            });
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Records that the user has accepted the latest policy/agreement.
     * Called upon login.
     */
    async recordPolicyAcceptance() {
        const sendPolicy = async (tokenOverride) => {
            const token = tokenOverride || this.getAccessToken();
            if (!token || typeof token !== "string" || token.split('.').length !== 3) return null;

            const headers = {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            };

            return await fetch(`${this.apiUrl}/api/consent/policy`, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    policy_version: USER_AGREEMENT_VERSION
                }),
            });
        };

        try {
            let res = await sendPolicy();
            if (res && res.status === 401) {
                const newToken = await tryRefresh();
                if (newToken) {
                    await sendPolicy(newToken);
                }
            }
        } catch (err) {
            console.error("[Analytics] Failed to record policy acceptance", err);
        }
    }

}

export const analytics = new AnalyticsService();
