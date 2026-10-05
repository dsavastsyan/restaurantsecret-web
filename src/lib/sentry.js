import * as Sentry from "@sentry/react";
import { IS_PREVIEW } from "@/config/api";
import {
    ASSET_RECOVERY_ACTIVE_FLAG,
    isAssetPreloadErrorEvent,
} from "@/lib/assetRecovery";

// Sentry DSNs are meant to ship in client bundles — they only let this project
// receive events, not read anything back — so it's fine as a plain literal
// here rather than an env var, same as the Yandex Metrika counter ID.
const SENTRY_DSN = "https://ca3f9a982f4fdf6cad0af77fa1b67a31@o4512183355768832.ingest.de.sentry.io/4512183431594064";

export function initSentry() {
    Sentry.init({
        dsn: SENTRY_DSN,
        environment: IS_PREVIEW ? "preview" : "production",
        beforeSend(event) {
            // Vite emits these when a tab has an old app shell while a deploy
            // has already removed its hashed chunks. assetRecovery handles the
            // event by clearing caches and forcing a fresh navigation; keeping
            // the transient browser error in Sentry creates noisy duplicate
            // issues instead of an actionable application error.
            if (
                globalThis?.[ASSET_RECOVERY_ACTIVE_FLAG]
                && isAssetPreloadErrorEvent(event)
            ) {
                return null;
            }
            return event;
        },
        // Preview builds still report crashes (catching bugs before they
        // reach prod is the point), just tagged separately so a flood of
        // test traffic on a preview deploy doesn't read as a real incident.
    });
}

export { Sentry };
