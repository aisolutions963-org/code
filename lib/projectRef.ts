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
