'use client'

import ReceivablesView from '@/components/finance/ReceivablesView'

export default function ReceivablesPage() {
  return (
    <div className="max-w-5xl">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Receivables</h2>
        <p className="text-sm text-gray-500">Client outstanding balances and old debts</p>
      </div>
      <ReceivablesView />
    </div>
  )
}
