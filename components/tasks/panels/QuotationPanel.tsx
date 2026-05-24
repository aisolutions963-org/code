'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { Task, TaskUpdateInput } from '@/lib/types'

interface QuotationPanelProps {
  task: Task
  variant: 'makeQuotation' | 'f4'
  onUpdate: (id: string, fields: Partial<TaskUpdateInput>) => Promise<void>
}

export default function QuotationPanel({ task, variant, onUpdate }: QuotationPanelProps) {
  const [quotationInput, setQuotationInput] = useState(task.projectQuotationNumber ?? '')
  const [referenceInput, setReferenceInput] = useState(task.projectQuotationReference ?? '')
  const [quotationError, setQuotationError] = useState('')
  const [saving, setSaving] = useState(false)

  async function patchProjectQuotation(qn: string, ref: string): Promise<void> {
    const projectId = task.projectRecordId ?? task.project?.[0]
    if (!projectId) throw new Error('No project linked to this task')
    const patchBody: Record<string, string> = { quotationNumber: qn }
    if (ref) patchBody.quotationReference = ref
    const res = await fetch(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patchBody),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      throw new Error((d as { error?: string }).error ?? 'Failed to save quotation')
    }
  }

  async function saveAndComplete() {
    setSaving(true)
    setQuotationError('')
    try {
      const existingQN = (task.projectQuotationNumber ?? '').trim()
      const newQN = quotationInput.trim()
      const needsPatch = newQN && (newQN !== existingQN || referenceInput.trim())
      if (needsPatch) await patchProjectQuotation(newQN, referenceInput.trim())
      await onUpdate(task.id, { status: 'Completed' } as Partial<TaskUpdateInput>)
      toast.success('Saved')
    } catch (e) {
      setQuotationError(e instanceof Error ? e.message : 'Failed')
      toast.error('Failed')
    } finally {
      setSaving(false)
    }
  }

  async function saveQuotationOnly() {
    if (!quotationInput.trim()) { setQuotationError('Enter a quotation number'); return }
    setSaving(true)
    setQuotationError('')
    try {
      await patchProjectQuotation(quotationInput.trim(), referenceInput.trim())
      toast.success('Quotation saved')
      await onUpdate(task.id, {})
    } catch (e) {
      setQuotationError(e instanceof Error ? e.message : 'Failed')
      toast.error('Failed')
    } finally {
      setSaving(false)
    }
  }

  if (variant === 'makeQuotation') {
    return (
      <>
        {(task.status !== 'Completed' ||
          (!task.projectQuotationNumber && !task.projectQuotationReference)) && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-3 space-y-2">
            <p className="text-xs font-semibold text-amber-800">
              Quotation Number
              {task.status !== 'Completed' && <span className="text-red-500 ml-0.5">*</span>}
              <span className="ml-1 font-normal text-amber-600">
                {task.status === 'Completed'
                  ? '— task complete, save to record'
                  : '— required to complete this task'}
              </span>
            </p>
            <input
              className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
              placeholder="e.g. WW-2024-001"
              value={quotationInput}
              onChange={(e) => { setQuotationInput(e.target.value); setQuotationError('') }}
            />
            <p className="text-xs font-semibold text-amber-800">
              Reference Number{' '}
              <span className="font-normal text-amber-600">— optional, manually assigned</span>
            </p>
            <input
              className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white font-mono"
              placeholder="e.g. R0, R1…"
              value={referenceInput}
              onChange={(e) => setReferenceInput(e.target.value)}
            />
            {quotationError && <p className="text-xs text-red-600">{quotationError}</p>}
            <div className="flex justify-end pt-1">
              {task.status === 'Completed' ? (
                <button
                  onClick={saveQuotationOnly}
                  disabled={saving}
                  className="px-4 py-1.5 text-xs rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-700 disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Save Quotation'}
                </button>
              ) : (
                <button
                  onClick={saveAndComplete}
                  disabled={saving || !quotationInput.trim()}
                  className="px-4 py-1.5 text-xs rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-700 disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Save & Complete'}
                </button>
              )}
            </div>
          </div>
        )}
        {task.status === 'Completed' &&
          (task.projectQuotationNumber || task.projectQuotationReference) && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-3 space-y-1">
              <p className="text-xs font-semibold text-green-800">Quotation Saved</p>
              {task.projectQuotationNumber && (
                <p className="text-xs text-green-700">
                  Number:{' '}
                  <span className="font-mono font-medium">{task.projectQuotationNumber}</span>
                </p>
              )}
              {task.projectQuotationReference && (
                <p className="text-xs text-green-700">
                  Reference:{' '}
                  <span className="font-mono font-medium">{task.projectQuotationReference}</span>
                </p>
              )}
            </div>
          )}
      </>
    )
  }

  // F4 variant
  return (
    <>
      {task.status !== 'Completed' &&
        (task.projectQuotationNumber ? (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5">
            <p className="text-xs font-semibold text-blue-800 mb-1">Quotation on file</p>
            <p className="text-xs text-blue-700">
              <span className="font-mono font-medium">{task.projectQuotationNumber}</span>
              {task.projectQuotationReference && (
                <span className="ml-2 font-mono text-blue-500">{task.projectQuotationReference}</span>
              )}
            </p>
          </div>
        ) : (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-3 space-y-2">
            <p className="text-xs font-semibold text-blue-800">
              Quotation Number <span className="text-red-500">*</span>
              <span className="ml-1 font-normal text-blue-600">— required to record advance payment</span>
            </p>
            <input
              className="w-full border border-blue-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
              placeholder="e.g. WW-2024-001"
              value={quotationInput}
              onChange={(e) => { setQuotationInput(e.target.value); setQuotationError('') }}
            />
            <p className="text-xs font-semibold text-blue-800">
              Reference Number
              <span className="ml-1 font-normal text-blue-600">— optional, manually assigned</span>
            </p>
            <input
              className="w-full border border-blue-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white font-mono"
              placeholder="e.g. R0, R1…"
              value={referenceInput}
              onChange={(e) => setReferenceInput(e.target.value)}
            />
            {quotationError && <p className="text-xs text-red-600">{quotationError}</p>}
          </div>
        ))}
      {task.status === 'Completed' &&
        (task.projectQuotationNumber || task.projectQuotationReference) && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5">
            <p className="text-xs font-semibold text-blue-800 mb-1">Payment Recorded</p>
            <p className="text-xs text-blue-700">
              {task.projectQuotationNumber && (
                <span className="font-mono font-medium">{task.projectQuotationNumber}</span>
              )}
              {task.projectQuotationReference && (
                <span className="ml-2 font-mono text-blue-500">{task.projectQuotationReference}</span>
              )}
            </p>
          </div>
        )}
    </>
  )
}
