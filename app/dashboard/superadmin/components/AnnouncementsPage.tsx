'use client'

import { useState, useCallback } from 'react'
import useSWR from 'swr'
import { Announcement } from '@/lib/types'
import Button from '@/components/ui/Button'
import { AnnouncementForm } from './types'
import { fetcher, Spinner } from './shared'

const EMPTY_FORM: AnnouncementForm = {
  title: '',
  message: '',
  pinned: false,
  visibleTo: 'Everyone',
  expiresAt: '',
}

export default function AnnouncementsPage() {
  const { data, isLoading, mutate } = useSWR<{ announcements: Announcement[] }>(
    '/api/announcements', fetcher, { refreshInterval: 300_000 },
  )
  const announcements = data?.announcements ?? []
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState<AnnouncementForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  function startCreate() { setEditing('new'); setForm(EMPTY_FORM); setErr('') }
  function startEdit(a: Announcement) {
    setEditing(a.id)
    setForm({ title: a.title, message: a.message ?? '', pinned: a.pinned ?? false, visibleTo: a.visibleTo ?? 'All', expiresAt: a.expiresAt ?? '' })
    setErr('')
  }
  function cancelEdit() { setEditing(null); setErr('') }

  const handleSave = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return
    setSaving(true); setErr('')
    try {
      const body = {
        title: form.title,
        message: form.message || undefined,
        pinned: form.pinned,
        visibleTo: form.visibleTo || undefined,
        expiresAt: form.expiresAt || undefined,
      }
      const res = await fetch(
        editing === 'new' ? '/api/announcements' : `/api/announcements/${editing}`,
        {
          method: editing === 'new' ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      )
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Failed')
      }
      mutate()
      setEditing(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSaving(false)
    }
  }, [editing, form, mutate])

  async function handleDelete(id: string) {
    if (!confirm('Delete this announcement?')) return
    await fetch(`/api/announcements/${id}`, { method: 'DELETE' })
    mutate()
  }

  if (isLoading) return <Spinner />

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Announcements</h2>
          <p className="text-sm text-gray-500">{announcements.length} announcement{announcements.length !== 1 ? 's' : ''}</p>
        </div>
        <Button size="sm" onClick={startCreate}>+ New</Button>
      </div>

      {/* Form */}
      {editing && (
        <form onSubmit={handleSave} className="bg-white rounded-xl border border-brand-200 shadow-sm p-5 space-y-4">
          <p className="text-sm font-semibold text-gray-700">{editing === 'new' ? 'New Announcement' : 'Edit Announcement'}</p>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Title *</label>
            <input
              required
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Announcement title"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Message</label>
            <textarea
              rows={3}
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              placeholder="Optional message body"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Visible to</label>
              <select
                value={form.visibleTo}
                onChange={(e) => setForm((f) => ({ ...f, visibleTo: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {['Everyone', 'Superadmin', 'Manager', 'SED', 'Fabrication', 'Installation'].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Expires at</label>
              <input
                type="date"
                value={form.expiresAt}
                onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.pinned}
              onChange={(e) => setForm((f) => ({ ...f, pinned: e.target.checked }))}
              className="rounded"
            />
            Pin to top
          </label>
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" loading={saving}>Save</Button>
            <button type="button" onClick={cancelEdit} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
            {err && <span className="text-xs text-red-600">{err}</span>}
          </div>
        </form>
      )}

      {/* Table */}
      {announcements.length === 0 && !editing && (
        <p className="text-sm text-gray-400 text-center py-10">No announcements yet.</p>
      )}

      {announcements.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Title</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Audience</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Pinned</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Expires</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {announcements.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{a.title}</p>
                    {a.message && <p className="text-xs text-gray-400 truncate max-w-xs mt-0.5">{a.message}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{a.visibleTo ?? 'All'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{a.pinned ? '📌' : '—'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{a.expiresAt ?? 'Never'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => startEdit(a)} className="text-xs text-brand-600 hover:underline">Edit</button>
                      <button onClick={() => handleDelete(a.id)} className="text-xs text-red-500 hover:underline">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
