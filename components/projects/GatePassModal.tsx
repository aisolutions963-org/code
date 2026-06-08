'use client'

import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Project } from '@/lib/types'
import { triggerPrint } from '@/lib/printGatePass'
import { todayUAE } from '@/lib/dateUtils'

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'
const lbl = 'block text-xs font-medium text-gray-500 mb-1'

interface GatePassItem {
  description: string
  quantity: string
  unit: string
  condition: string
}

function genSerial() {
  const d = new Date()
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  return `GP-${ymd}-${String(Math.floor(Math.random() * 9000) + 1000)}`
}

function SectionHeading({ children }: { children: string }) {
  return (
    <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wide border-l-2 border-teal-400 pl-2 mt-5 mb-3">
      {children}
    </div>
  )
}

export default function GatePassModal({
  project: initialProject,
  onClose,
  onCreated,
}: {
  project: Project | null
  onClose: () => void
  onCreated: () => void
}) {
  const [project, setProject] = useState<Project | null>(initialProject)
  const [projects, setProjects] = useState<Project[]>([])
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState('')

  const [dateOfIssue, setDateOfIssue] = useState(() => todayUAE())
  const [timeOfIssue, setTimeOfIssue] = useState('')
  const [timeAmPm, setTimeAmPm] = useState<'AM' | 'PM'>('AM')
  const [passValidity, setPassValidity] = useState('single-entry')

  const [driverName, setDriverName] = useState('')
  const [driverIdLicense, setDriverIdLicense] = useState('')
  const [driverContact, setDriverContact] = useState('')
  const [transportCompany, setTransportCompany] = useState('')
  const [vehicleModel, setVehicleModel] = useState('')
  const [vehiclePlate, setVehiclePlate] = useState('')

  const [invoiceDoNumber, setInvoiceDoNumber] = useState('')
  const [items, setItems] = useState<GatePassItem[]>([
    { description: '', quantity: '', unit: 'Pcs', condition: '' },
  ])

  const [customerName, setCustomerName] = useState(initialProject?.clientName ?? '')
  const [deliveryAddress, setDeliveryAddress] = useState(
    [initialProject?.location, initialProject?.emirate].filter(Boolean).join(', '),
  )
  const [customerContact, setCustomerContact] = useState(initialProject?.clientPhone ?? '')

  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)
  const [generatedSerial, setGeneratedSerial] = useState('')
  const [printing, setPrinting] = useState(false)

  useEffect(() => {
    if (initialProject) return
    setProjectsLoading(true)
    fetch('/api/projects')
      .then((r) => r.json())
      .then((d) => setProjects(d.projects ?? []))
      .catch(() => {})
      .finally(() => setProjectsLoading(false))
  }, [initialProject])

  function handleProjectSelect(id: string) {
    setSelectedProjectId(id)
    const found = projects.find((p) => p.id === id) ?? null
    setProject(found)
    if (found) {
      setCustomerName(found.clientName ?? '')
      setDeliveryAddress([found.location, found.emirate].filter(Boolean).join(', '))
      setCustomerContact(found.clientPhone ?? '')
    }
  }

  function addItem() {
    setItems([...items, { description: '', quantity: '', unit: 'Pcs', condition: '' }])
  }

  function removeItem(i: number) {
    setItems(items.filter((_, idx) => idx !== i))
  }

  function updateItem(i: number, field: keyof GatePassItem, value: string) {
    setItems(items.map((it, idx) => (idx === i ? { ...it, [field]: value } : it)))
  }

  function getPrintData(serial: string) {
    return {
      serial,
      dateOfIssue,
      timeOfIssue,
      timeAmPm,
      passValidity,
      driverName,
      driverIdLicense,
      driverContact,
      transportCompany,
      vehicleModel,
      vehiclePlate,
      invoiceDoNumber,
      items,
      customerName,
      deliveryAddress,
      customerContact,
      projectRef: project?.projectId ?? '',
      companyName: process.env.NEXT_PUBLIC_APP_NAME ?? 'WOODWINGS',
    }
  }

  async function handleSave() {
    if (!project) { setErr('Please select a project'); return }
    if (!driverName.trim()) { setErr('Driver name is required'); return }
    setSaving(true)
    setErr('')

    const payload = {
      _v: 1 as const,
      timeOfIssue,
      timeAmPm,
      passValidity,
      driverName,
      driverIdLicense,
      driverContact,
      transportCompany,
      vehicleModel,
      vehiclePlate,
      invoiceDoNumber,
      items,
      customerName,
      deliveryAddress,
      customerContact,
    }

    try {
      const res = await fetch('/api/gate-passes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: [project.id],
          itemsDescription: JSON.stringify(payload),
          estimatedSupplyDate: dateOfIssue,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error)
      }
      const { gatePass } = await res.json()
      const serial = (gatePass?.name as string | undefined) || genSerial()
      setGeneratedSerial(serial)
      setDone(true)
      onCreated()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create gate pass')
    } finally {
      setSaving(false)
    }
  }

  function handlePrint() {
    if (printing) return
    setPrinting(true)
    const d = getPrintData(generatedSerial)
    triggerPrint({
      serial: d.serial,
      projectRef: d.projectRef,
      dateOfIssue: d.dateOfIssue,
      timeOfIssue: d.timeOfIssue,
      timeAmPm: d.timeAmPm,
      passValidity: d.passValidity,
      driverName: d.driverName,
      driverIdLicense: d.driverIdLicense,
      driverContact: d.driverContact,
      transportCompany: d.transportCompany,
      vehicleModel: d.vehicleModel,
      vehiclePlate: d.vehiclePlate,
      invoiceDoNumber: d.invoiceDoNumber,
      items: d.items,
      customerName: d.customerName,
      deliveryAddress: d.deliveryAddress,
      customerContact: d.customerContact,
      companyName: d.companyName,
    })
    setTimeout(() => setPrinting(false), 2000)
  }

  if (done) {
    return (
      <Modal open onClose={onClose} title="Gate Pass Created">
        <div className="py-6 text-center space-y-3">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-gray-900">Gate pass created</p>
          <p className="text-xs text-gray-400 font-mono">{generatedSerial}</p>
          <p className="text-xs text-gray-500">{project?.projectName}</p>
          <div className="flex gap-2 justify-center pt-2">
            <Button onClick={handlePrint} loading={printing}>
              <svg className="w-4 h-4 mr-1.5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print / Save as PDF
            </Button>
            <Button variant="secondary" onClick={onClose}>Done</Button>
          </div>
        </div>
      </Modal>
    )
  }

  const title = project ? `Gate Pass — ${project.projectName}` : 'New Gate Pass'

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} loading={saving}>Generate Gate Pass</Button>
        </>
      }
    >
      <div className="text-sm space-y-1">
        {err && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</p>
        )}

        {/* Project selector — standalone mode only */}
        {!initialProject && (
          <div>
            <label className={lbl}>Project *</label>
            {projectsLoading ? (
              <div className="flex items-center gap-2 py-2">
                <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-gray-400">Loading projects…</span>
              </div>
            ) : (
              <select
                className={inp}
                value={selectedProjectId}
                onChange={(e) => handleProjectSelect(e.target.value)}
              >
                <option value="">Select project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.projectId} — {p.projectName}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Pass meta */}
        <div className="grid grid-cols-3 gap-3 mt-1">
          <div>
            <label className={lbl}>Date of Issue *</label>
            <input type="date" className={inp} value={dateOfIssue} onChange={(e) => setDateOfIssue(e.target.value)} />
          </div>
          <div>
            <label className={lbl}>Time of Entry/Exit</label>
            <div className="flex gap-1.5">
              <input type="time" className={`${inp} flex-1`} value={timeOfIssue} onChange={(e) => setTimeOfIssue(e.target.value)} />
              <select
                className="border border-gray-300 rounded-lg px-2 text-sm focus:outline-none"
                value={timeAmPm}
                onChange={(e) => setTimeAmPm(e.target.value as 'AM' | 'PM')}
              >
                <option>AM</option>
                <option>PM</option>
              </select>
            </div>
          </div>
          <div>
            <label className={lbl}>Pass Validity</label>
            <select className={inp} value={passValidity} onChange={(e) => setPassValidity(e.target.value)}>
              <option value="single-entry">Single Entry</option>
              <option value="single-exit">Single Exit</option>
              <option value="returnable">Returnable</option>
              <option value="non-returnable">Non-Returnable</option>
            </select>
          </div>
        </div>

        <SectionHeading>1. Transport &amp; Driver Details</SectionHeading>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Driver Full Name *</label>
            <input className={inp} value={driverName} onChange={(e) => setDriverName(e.target.value)} placeholder="Full name…" />
          </div>
          <div>
            <label className={lbl}>Driver ID / License No.</label>
            <input className={inp} value={driverIdLicense} onChange={(e) => setDriverIdLicense(e.target.value)} placeholder="ID or license number…" />
          </div>
          <div>
            <label className={lbl}>Driver Contact No.</label>
            <input className={inp} value={driverContact} onChange={(e) => setDriverContact(e.target.value)} placeholder="+971…" />
          </div>
          <div>
            <label className={lbl}>Transport Company / Logistics Partner</label>
            <input className={inp} value={transportCompany} onChange={(e) => setTransportCompany(e.target.value)} placeholder="Company name…" />
          </div>
          <div>
            <label className={lbl}>Vehicle Model &amp; Color</label>
            <input className={inp} value={vehicleModel} onChange={(e) => setVehicleModel(e.target.value)} placeholder="e.g. Toyota Hilux White" />
          </div>
          <div>
            <label className={lbl}>Vehicle License Plate</label>
            <input className={inp} value={vehiclePlate} onChange={(e) => setVehiclePlate(e.target.value)} placeholder="e.g. Dubai A 12345" />
          </div>
        </div>

        <SectionHeading>2. Shipment &amp; Item Details</SectionHeading>
        <div>
          <label className={lbl}>Invoice / Delivery Order (DO) Number</label>
          <input className={inp} value={invoiceDoNumber} onChange={(e) => setInvoiceDoNumber(e.target.value)} placeholder="INV-XXXX or DO-XXXX" />
        </div>
        <div className="mt-2">
          <label className={lbl}>Items</label>
          <div className="space-y-2 mt-1">
            {items.map((item, i) => (
              <div key={i} className="flex gap-2 items-center">
                <span className="text-xs text-gray-400 w-5 text-right shrink-0">{i + 1}.</span>
                <input
                  className={`${inp} flex-[3]`}
                  value={item.description}
                  onChange={(e) => updateItem(i, 'description', e.target.value)}
                  placeholder="Item description…"
                />
                <input
                  className={`${inp} w-16`}
                  value={item.quantity}
                  onChange={(e) => updateItem(i, 'quantity', e.target.value)}
                  placeholder="Qty"
                />
                <select
                  className="border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none w-20"
                  value={item.unit}
                  onChange={(e) => updateItem(i, 'unit', e.target.value)}
                >
                  <option>Pcs</option>
                  <option>Sets</option>
                  <option>Boxes</option>
                  <option>Rolls</option>
                  <option>Units</option>
                </select>
                <input
                  className={`${inp} flex-[2]`}
                  value={item.condition}
                  onChange={(e) => updateItem(i, 'condition', e.target.value)}
                  placeholder="Condition / Remarks"
                />
                {items.length > 1 && (
                  <button type="button" onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600 text-xs shrink-0 px-1">
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addItem}
            className="mt-2 text-xs text-teal-600 hover:text-teal-800 flex items-center gap-1 font-medium"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add item
          </button>
        </div>

        <SectionHeading>3. Delivery &amp; Customer Details</SectionHeading>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={lbl}>Customer / Client Name</label>
            <input className={inp} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Client name…" />
          </div>
          <div className="col-span-2">
            <label className={lbl}>Delivery Address</label>
            <input className={inp} value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Full delivery address…" />
          </div>
          <div>
            <label className={lbl}>Customer Contact No.</label>
            <input className={inp} value={customerContact} onChange={(e) => setCustomerContact(e.target.value)} placeholder="+971…" />
          </div>
        </div>

        <p className="text-[11px] text-gray-400 pt-2">
          Section 4 (Authorization &amp; Signatures) is printed on the generated document.
        </p>
      </div>
    </Modal>
  )
}
