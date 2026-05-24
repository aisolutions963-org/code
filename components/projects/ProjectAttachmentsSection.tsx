'use client'

import { useState } from 'react'
import { Task, DocLink, Attachment } from '@/lib/types'

interface LinkRow {
  label: string
  url: string
  notes?: string
}

interface TaskGroup {
  taskName: string
  itemName?: string
  links: LinkRow[]
}

function collectGroups(tasks: Task[]): TaskGroup[] {
  const groups: TaskGroup[] = []

  for (const task of tasks) {
    const links: LinkRow[] = []

    for (const d of task.taskDocLinks ?? []) {
      if (d.url) links.push({ label: d.label || 'Link', url: d.url, notes: d.notes })
    }
    for (const d of task.handoverDocLinks ?? []) {
      if (d.url) links.push({ label: d.label || 'Handover', url: d.url, notes: d.notes })
    }
    for (const d of task.fillersDocLinks ?? []) {
      if (d.url) links.push({ label: d.label || 'Fillers', url: d.url, notes: d.notes })
    }
    for (const a of task.taskDocuments ?? []) {
      if (a.url) links.push({ label: a.filename || 'File', url: a.url })
    }
    for (const a of task.handoverDocument ?? []) {
      if (a.url) links.push({ label: a.filename || 'Handover file', url: a.url })
    }
    for (const a of task.fillersAndMissingList ?? []) {
      if (a.url) links.push({ label: a.filename || 'Fillers file', url: a.url })
    }

    if (links.length > 0) {
      groups.push({ taskName: task.taskName, links })
    }
  }

  return groups
}

function ExternalIcon() {
  return (
    <svg className="w-3 h-3 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  )
}

interface Props {
  tasks: Task[]
}

export default function ProjectAttachmentsSection({ tasks }: Props) {
  const [open, setOpen] = useState(false)
  const groups = collectGroups(tasks)

  if (groups.length === 0) return null

  const totalLinks = groups.reduce((s, g) => s + g.links.length, 0)

  return (
    <section>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 text-left group"
      >
        <svg
          className={`w-3.5 h-3.5 text-gray-400 transition-transform shrink-0 ${open ? 'rotate-90' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Attachments & Links
        </h2>
        <span className="ml-1 text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
          {totalLinks}
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {groups.map((group, gi) => (
            <div key={gi} className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                <p className="text-xs font-medium text-gray-600 truncate">{group.taskName}</p>
              </div>
              <div className="divide-y divide-gray-50">
                {group.links.map((link, li) => (
                  <a
                    key={li}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 transition-colors"
                  >
                    <span className="flex-1 text-xs text-blue-600 hover:underline truncate">
                      {link.label}
                    </span>
                    {link.notes && (
                      <span className="text-xs text-gray-400 truncate max-w-[120px]">{link.notes}</span>
                    )}
                    <ExternalIcon />
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
