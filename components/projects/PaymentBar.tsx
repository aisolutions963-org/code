import { Project } from '@/lib/types'

function fmt(n: number) {
  return n.toLocaleString('en-AE', { style: 'currency', currency: 'AED', maximumFractionDigits: 0 })
}

export default function PaymentBar({ project }: { project: Project }) {
  const total = project.projectTotalCost ?? 0
  const paid = project.totalPaid ?? 0
  const remaining = project.remainingBalance ?? total - paid
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
        <span>Total: <strong className="text-gray-700">{fmt(total)}</strong></span>
        <span>Paid: <strong className="text-green-600">{fmt(paid)}</strong></span>
        <span>Due: <strong className="text-red-500">{fmt(remaining)}</strong></span>
        {isProgressive && (
          <span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded text-xs font-medium">
            Progressive
          </span>
        )}
      </div>

      <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
        <div
          className={`h-2 rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="text-xs text-gray-400 text-right">{pct}% paid</p>
    </div>
  )
}
