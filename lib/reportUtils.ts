// Shared helpers for the report export routes.

/**
 * Normalise a project reference to the current CR format `WW-YY.NNN`.
 * Handles the three observed formats without migrating Airtable data:
 *   - `WW-2026-173` → `WW-26.173`  (4-digit year → last 2)
 *   - `WW-26-176`  → `WW-26.176`
 *   - `WW-26.175`  → `WW-26.175`   (already correct)
 * Anything that doesn't match a known pattern is returned unchanged.
 * Never throws, never returns empty for a non-empty input.
 */
export function formatProjectRef(raw: string | null | undefined): string {
  if (!raw || typeof raw !== 'string') return raw ?? ''
  const m = raw.trim().match(/^WW[-\s]?(\d{2,4})[-.](\d+)$/i)
  if (!m) return raw
  const year = m[1].length >= 4 ? m[1].slice(-2) : m[1]
  return `WW-${year}.${m[2]}`
}
