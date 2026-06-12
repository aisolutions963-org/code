'use client'

import { useState, useRef, useEffect } from 'react'
import useSWR from 'swr'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Client } from '@/lib/types'

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
    clientPhone: '',
    emirate: '',
    location: '',
    sedNotes: '',
    isCommunal: false,
  })
  const [selectedSedId, setSelectedSedId] = useState('')
  const [selectedCommunSeds, setSelectedCommunSeds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState<{
    projectId: string
    tasksCreated: number
    warning?: string
  } | null>(null)

  const { data: sedData } = useSWR<{ members: SedMember[] }>('/api/team/sed', fetcher)
  const sedMembers = sedData?.members ?? []

  // Client autocomplete — only fetches when user interacts with the field
  const [clientsNeeded, setClientsNeeded] = useState(false)
  const { data: clientsData } = useSWR<{ clients: Client[] }>(
    clientsNeeded ? '/api/clients' : null,
    fetcher,
  )
  const allClients = clientsData?.clients ?? []
  const [clientSuggestionsOpen, setClientSuggestionsOpen] = useState(false)
  const clientInputRef = useRef<HTMLInputElement>(null)
  const clientDropRef = useRef<HTMLDivElement>(null)

  const clientSuggestions = form.clientName.trim().length >= 1
    ? allClients.filter((c) =>
        c.clientName.toLowerCase().includes(form.clientName.toLowerCase()),
      ).slice(0, 8)
    : []

  function selectClient(c: Client) {
    set('clientName', c.clientName)
    if (c.phone) set('clientPhone', c.phone)
    setClientSuggestionsOpen(false)
    clientInputRef.current?.blur()
  }

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (
        clientInputRef.current && !clientInputRef.current.contains(e.target as Node) &&
        clientDropRef.current && !clientDropRef.current.contains(e.target as Node)
      ) {
        setClientSuggestionsOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

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
    if (!form.projectDescription.trim()) missing.push('Project Scope')
    if (missing.length > 0) { setErr(`Required: ${missing.join(', ')}`); return }

    setSaving(true); setErr('')
    try {
      const body: Record<string, unknown> = {
        projectName: form.projectName.trim(),
        projectDescription: form.projectDescription,
      }

      if (form.nickname.trim()) body.nickname = form.nickname.trim()
      if (form.clientName.trim()) body.clientName = form.clientName.trim()
      if (form.detailedLocation.trim()) body.detailedLocation = form.detailedLocation.trim()
      if (form.clientPhone) body.clientPhone = form.clientPhone
      if (form.emirate) body.emirate = form.emirate
      if (form.location) body.location = form.location
      if (form.sedNotes) body.sedNotes = form.sedNotes
      if (selectedSedId) body.salesOwnerCollaboratorId = selectedSedId
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
          {/* Project Name — required */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Project Name *</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={form.projectName}
              onChange={(e) => set('projectName', e.target.value)}
              placeholder="Full official project name"
            />
          </div>

          {/* Nickname — optional */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Nickname</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={form.nickname}
              onChange={(e) => set('nickname', e.target.value)}
              placeholder="Short internal reference"
            />
          </div>

          {/* Project Scope — required, full width */}
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

          {/* Assigned SED — manual, optional */}
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Assigned SED</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
              value={selectedSedId}
              onChange={(e) => setSelectedSedId(e.target.value)}
            >
              <option value="">— select SED —</option>
              {sedMembers.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          {/* Client Name — optional with autocomplete */}
          <div className="relative">
            <label className="block text-xs font-medium text-gray-500 mb-1">Client Name</label>
            <input
              ref={clientInputRef}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={form.clientName}
              onChange={(e) => { set('clientName', e.target.value); setClientsNeeded(true); setClientSuggestionsOpen(true) }}
              onFocus={() => { setClientsNeeded(true); setClientSuggestionsOpen(true) }}
              placeholder="Type to search or enter new client name"
              autoComplete="off"
            />
            {clientSuggestionsOpen && clientSuggestions.length > 0 && (
              <div
                ref={clientDropRef}
                className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden"
              >
                {clientSuggestions.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); selectClient(c) }}
                    className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-brand-50 text-left text-sm border-b border-gray-100 last:border-0"
                  >
                    <div>
                      <span className="font-medium text-gray-900">{c.clientName}</span>
                      {c.phone && <span className="text-xs text-gray-400 ml-2">{c.phone}</span>}
                    </div>
                    {(c.projectCount ?? 0) > 0 && (
                      <span className="text-[11px] text-gray-400 shrink-0 ml-2">
                        {c.projectCount} project{c.projectCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Client Phone — optional */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Client Phone</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={form.clientPhone}
              onChange={(e) => set('clientPhone', e.target.value)}
              placeholder="+971 50 XXX XXXX"
            />
          </div>

          {/* Exact Location — optional */}
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Exact Location</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={form.detailedLocation}
              onChange={(e) => set('detailedLocation', e.target.value)}
              placeholder="Building, floor, unit, city"
            />
          </div>

          {/* Emirate */}
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

          {/* Area (Dubai only) */}
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

          {/* Notes */}
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

          {/* Communal project */}
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
                {sedMembers
                  .filter((m) => m.id !== selectedSedId)
                  .map((m) => (
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
