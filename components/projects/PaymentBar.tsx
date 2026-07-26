import { Project } from '@/lib/types'

function fmt(n: number) {
  return n.toLocaleString('en-AE', { style: 'currency', currency: 'AED', maximumFractionDigits: 0 })
}

export default function PaymentBar({ project }: { project: Project }) {
  const total = project.projectTotalCost ?? 0
  const paid = project.totalPaid ?? 0
  const remaining = project.remainingBalance ?? total - paid
  const quotationPending = project.projectTotalCost == null
  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0
  const isProgressive = project.paymentMode === 'Progressive'

  const barColor =
    pct >= 100
      ? 'bg-green-500'
      : isProgressive
        ? 'bg-purple-500'
        : 'bg-brand-500'

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>Total: <strong className={quotationPending ? 'text-gray-400 italic' : 'text-gray-700'}>{quotationPending ? 'Pending' : fmt(total)}</strong></span>
        <span>Paid: <strong className="text-green-600">{fmt(paid)}</strong></span>
        <span>Due: <strong className={quotationPending ? 'text-gray-400 italic' : 'text-red-500'}>{quotationPending ? 'Quotation pending' : fmt(remaining)}</strong></span>
        {isProgressive && (
          <span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded text-xs font-medium">
            Progressive
          </span>
        )}
      </div>

      {/* With no total yet, a % bar would misrepresent real payments as "0% paid" — just
          show the collected amount as a flat, unmeasured bar instead. */}
      {quotationPending ? (
        paid > 0 && (
          <p className="text-xs text-green-600 font-medium text-right">AED {paid.toLocaleString()} collected so far</p>
        )
      ) : (
        <>
          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all ${barColor}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 text-right">{pct}% paid</p>
        </>
      )}
    </div>
  )
}
