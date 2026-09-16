import LegalVersion20251120 from './legal-2025-11-20.jsx'
import PrivacyVersion20251125 from './privacy-2025-11-25.jsx'
import PrivacyVersion20260903 from './privacy-2026-09-03.jsx'
import PrivacyVersion20260916 from './privacy-2026-09-16.jsx'

// Maps a YYYY-MM-DD version date (as it appears in /legal/versions/:date and
// /privacy/versions/:date) to the frozen snapshot component for that date.
// Add an entry here whenever Legal.jsx or Privacy.jsx is revised — see the
// comment at the top of each snapshot file for the process.
export const legalVersions = {
  '2025-11-20': LegalVersion20251120,
}

export const privacyVersions = {
  '2025-11-25': PrivacyVersion20251125,
  '2026-09-03': PrivacyVersion20260903,
  '2026-09-16': PrivacyVersion20260916,
}
