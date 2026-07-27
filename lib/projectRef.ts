// Canonical project identifier shown to users.
//
// Priority: the quotation number immediately followed by its reference (e.g. "3212" + "r3" → "3212r3").
// When no quotation number exists yet, fall back to the WW-xx-xxx projectId. Only the *displayed* label
// uses this — raw fields (projectId, quotationNumber, …) stay untouched for keys/filters/logic.
export function projectRefLabel(p: {
  quotationNumber?: string | null
  quotationReference?: string | null
  projectId?: string | null
}): string {
  const qn = (p.quotationNumber ?? '').trim()
  if (qn) return `${qn}${(p.quotationReference ?? '').trim()}`
  return (p.projectId ?? '').trim()
}

// remainingBalance is an Airtable formula field (Total Cost − Total Paid) computed against a blank
// Total Cost as 0 — so it goes negative once a payment is recorded before the quotation exists.
// projectTotalCost is only ever set when the F5 quotation is actually submitted, so its absence is
// the direct, single cause of that negative figure — use it to show "Quotation pending" instead.
export function remainingBalanceLabel(p: {
  projectTotalCost?: number | null
  remainingBalance?: number | null
}): string {
  if (p.projectTotalCost == null) return 'Quotation pending'
  return `AED ${(p.remainingBalance ?? 0).toLocaleString()}`
}
