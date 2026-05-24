'use client'

import { useState } from 'react'
import useSWR from 'swr'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'

const UAE_EMIRATES = [
  'Dubai', 'Abu Dabei', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah',
]

const DUBAI_LOCATIONS = [
  'Abu Hail', 'Al Baraha', 'Al Barsha', 'Al Bastakiya', 'Al Buteen', 'Al Dhagaya',
  'Al Garhoud', 'Al Hamriya', 'Al Hudaiba', 'Al Jaddaf', 'Al Jafilia', 'Al Karama',
  'Al Mamzar', 'Al Manara', 'Al Mankhool', 'Al Mizhar', 'Al Muntazah', 'Al Quoz',
  'Al Qusais', 'Arjan', 'Arabian Ranches', 'Bluewaters Island', 'Bur Dubai',
  'Business Bay', 'City Walk', 'DAMAC Lagoons', 'Deira', 'Discovery Gardens',
  'District City', 'Downtown Dubai', 'Dubai Creek Harbour', 'Dubai Hills Estate',
  'Dubai Marina', 'Dubai Silicon Oasis', 'Emaar South', 'Al Furjan', 'Green Community',
  'Jumeirah', 'Jumeirah Lake Towers (JLT)', 'Jumeirah Village Circle (JVC)',
  'MBR City (Meydan)', 'Marina', 'Marsa Dubai', 'Motor City', 'Palm Jumeirah',
  'Port de La Mer', 'Rashidiya', 'Satwa', 'Sobha Hartland', 'Sport City',
  'The Springs', 'Tilal Al Ghaf', 'Town Square', 'Umm Suqeim',
]

const INTAKE_PATHS = [
  'Make Quotation',
  'Visit Site to Gather Details',
  'Assign Installation for Measurement',
  'Select Material / Order Samples',
  'Draft Proposal or Photo Ideas',
  'Client Clarifications & Sketches',
]

interface SedMember { id: string; name: string }

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface NewProjectModalProps {
  onClose: () => void
  onCreated: () => void
}

export default function NewProjectModal({ onClose, onCreated }: NewProjectModalProps) {
  const [form, setForm] = useState({
    projectName: '',
    nickname: '',
    clientName: '',
    projectDescription: '',
    detailedLocation: '',
    paymentMode: '' as '' | 'Standard' | 'Progressive',
    requiredIntakePaths: '',
    clientPhone: '',
    emirate: '',
    location: '',
    sedNotes: '',
    isCommunal: false,
  })
  const [selectedCommunSeds, setSelectedCommunSeds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState<{
    projectId: string
    tasksCreated: number
    warning?: string
  } | null>(null)

  const { data: sedData } = useSWR<{ members: SedMember[] }>(
    form.isCommunal ? '/api/team/sed' : null,
    fetcher,
  )
  const sedMembers = sedData?.members ?? []

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function toggleCommunSed(id: string) {
    setSelectedCommunSeds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  async function handleSave() {
    const missing: string[] = []
    if (!form.projectName.trim()) missing.push('Project Name')
    if (!form.nickname.trim()) missing.push('Nickname')
    if (!form.clientName.trim()) missing.push('Client Name')
    if (!form.projectDescription.trim()) missing.push('Project Scope')
    if (!form.detailedLocation.trim()) missing.push('Exact Location')
    if (!form.paymentMode) missing.push('Payment Mode')
    if (!form.requiredIntakePaths) missing.push('Requested Action')
    if (missing.length > 0) { setErr(`Required: ${missing.join(', ')}`); return }

    setSaving(true); setErr('')
    try {
      const body: Record<string, unknown> = {
        projectName: form.projectName.trim(),
        nickname: form.nickname.trim(),
        clientName: form.clientName.trim(),
        projectDescription: form.projectDescription,
        detailedLocation: form.detailedLocation,
        paymentMode: form.paymentMode,
      }
      if (form.clientPhone) body.clientPhone = form.clientPhone
      if (form.emirate) body.emirate = form.emirate
      if (form.location) body.location = form.location
      if (form.sedNotes) body.sedNotes = form.sedNotes
      if (form.isCommunal && selectedCommunSeds.length > 0) body.communSedIds = selectedCommunSeds

      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create project')
      setResult({ projectId: data.project.projectId, tasksCreated: data.tasksCreated, warning: data.warning })
      onCreated()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create project')
    } finally {
      setSaving(false)
    }
  }

  if (result) {
    return (
      <Modal open onClose={onClose} title="Project Created">
        <div className="space-y-3 text-sm">
          <p className="text-green-700 font-medium">
            Project <span className="font-mono">{result.projectId}</span> created successfully.
          </p>
          {result.tasksCreated > 0 && (
            <p className="text-gray-600">{result.tasksCreated} Phase 1 tasks generated automatically.</p>
          )}
          {result.warning && (
            <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              {result.warning}
            </p>
          )}
          <div className="pt-2">
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>
      </Modal>
    )
  }

  const showLocation = form.emirate === 'Dubai' || form.emirate === ''

  return (
    <Modal
      open
      onClose={onClose}
      title="F1 — New Project Intake"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} loading={saving}>Create Project</Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
      
        {err && (
          <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded px-3 py-2">{err}</p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Project Name *</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={form.projectName}
              onChange={(e) => set('projectName', e.target.value)}
              placeholder="Full official project name"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Nickname *</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={form.nickname}
              onChange={(e) => set('nickname', e.target.value)}
              placeholder="Short internal reference"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Client Name *</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={form.clientName}
              onChange={(e) => set('clientName', e.target.value)}
              placeholder="Full name"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Client Phone</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={form.clientPhone}
              onChange={(e) => set('clientPhone', e.target.value)}
              placeholder="+971 50 XXX XXXX"
            />
          </div>

          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Project Scope *</label>
            <textarea
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              value={form.projectDescription}
              onChange={(e) => set('projectDescription', e.target.value)}
              placeholder="What is being fabricated / installed?"
            />
          </div>

          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Exact Location *</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={form.detailedLocation}
              onChange={(e) => set('detailedLocation', e.target.value)}
              placeholder="Building, floor, unit, city"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Emirate</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
              value={form.emirate}
              onChange={(e) => { set('emirate', e.target.value); set('location', '') }}
            >
              <option value="">— select —</option>
              {UAE_EMIRATES.map((e) => <option key={e}>{e}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Area {!showLocation && <span className="text-gray-400 font-normal">(Dubai only)</span>}
            </label>
            {showLocation ? (
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                value={form.location}
                onChange={(e) => set('location', e.target.value)}
              >
                <option value="">— select area —</option>
                {DUBAI_LOCATIONS.map((l) => <option key={l}>{l}</option>)}
              </select>
            ) : (
              <input
                disabled
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-400"
                placeholder="Select Dubai to pick an area"
              />
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Requested Action *</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
              value={form.requiredIntakePaths}
              onChange={(e) => set('requiredIntakePaths', e.target.value)}
            >
              <option value="">— select —</option>
              {INTAKE_PATHS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Payment Mode *</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
              value={form.paymentMode}
              onChange={(e) => set('paymentMode', e.target.value as '' | 'Standard' | 'Progressive')}
            >
              <option value="">— select —</option>
              <option>Standard</option>
              <option>Progressive</option>
            </select>
          </div>

          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
            <textarea
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              value={form.sedNotes}
              onChange={(e) => set('sedNotes', e.target.value)}
              placeholder="General notes from first call..."
            />
          </div>

          <div className="col-span-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isCommunal}
                onChange={(e) => {
                  set('isCommunal', e.target.checked)
                  if (!e.target.checked) setSelectedCommunSeds([])
                }}
                className="w-4 h-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
              />
              <span className="text-sm text-gray-700">Communal project (shared with other SEDs)?</span>
            </label>

            {form.isCommunal && (
              <div className="mt-2 pl-6 space-y-1">
                {sedMembers.length === 0 && (
                  <p className="text-xs text-gray-400">
                    No other SED members found with Airtable IDs configured.
                  </p>
                )}
                {sedMembers.map((m) => (
                  <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedCommunSeds.includes(m.id)}
                      onChange={() => toggleCommunSed(m.id)}
                      className="w-4 h-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                    />
                    <span className="text-gray-700">{m.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
