'use client'

import PayablesView from '@/components/finance/PayablesView'

export default function PayablesPage() {
  return (
    <div className="max-w-5xl">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Payables</h2>
        <p className="text-sm text-gray-500">Supplier invoices and outgoing payments</p>
      </div>
      <PayablesView />
    </div>
  )
}
