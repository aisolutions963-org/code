// Barrel — re-exports everything from all sub-modules.
// Import from '@/lib/airtable' (which re-exports from here) or from these files directly.

export * from './projects'
export * from './tasks'
export * from './payments'
export * from './calendar'
export * from './team'
export * from './materials'
export * from './quotations'
export * from './maintenance'
export * from './announcements'
export * from './client-requests'
export * from './timesheets'
export * from './closing'
// _client.ts is otherwise internal — named re-export only, not a wildcard, so its other
// internals (fetchAll, raw table constants, etc.) don't leak into the public barrel.
export { getDeletedProjectIds } from './_client'
