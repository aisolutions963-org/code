'use client'

import { useState } from 'react'
import GatePassModal from '@/components/projects/GatePassModal'

export default function FormsPage() {
  const [showGatePass, setShowGatePass] = useState(false)

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Forms</h1>
        <p className="text-sm text-gray-500 mt-0.5">Create documents and records for any project.</p>
      </div>

      <div className="grid gap-4">
        {/* Gate Pass */}
        <div className="border border-gray-200 rounded-xl p-5 flex items-center justify-between bg-white shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2.5.5M13 16l2.5.5M13 16H9m4 0h2m4-10h-4l-3 9H3" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Gate Pass</p>
              <p className="text-xs text-gray-500">Authorise a delivery for any project</p>
            </div>
          </div>
          <button
            onClick={() => setShowGatePass(true)}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors"
          >
            Create
          </button>
        </div>
      </div>

      {showGatePass && (
        <GatePassModal
          project={null}
          onClose={() => setShowGatePass(false)}
          onCreated={() => setShowGatePass(false)}
        />
      )}
    </div>
  )
}
