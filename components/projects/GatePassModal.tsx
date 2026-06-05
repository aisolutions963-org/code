'use client'

import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Project } from '@/lib/types'

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

function formatDateDisplay(iso: string) {
  if (!iso) return ''
  const [y, m, day] = iso.split('-')
  return `${day} / ${m} / ${y}`
}

interface PrintData {
  serial: string
  dateOfIssue: string
  timeOfIssue: string
  timeAmPm: string
  passValidity: string
  driverName: string
  driverIdLicense: string
  driverContact: string
  transportCompany: string
  vehicleModel: string
  vehiclePlate: string
  invoiceDoNumber: string
  items: GatePassItem[]
  customerName: string
  deliveryAddress: string
  customerContact: string
  projectRef: string
  companyName: string
}

function buildGatePassHtml(data: PrintData): string {
  const validityMap: Record<string, string> = {
    'single-entry': 'Single Entry',
    'single-exit': 'Single Exit',
    'returnable': 'Returnable',
    'non-returnable': 'Non-Returnable',
  }
  const checkboxes = Object.entries(validityMap)
    .map(([key, label]) => {
      const checked = data.passValidity === key
      return `<span style="margin-right:18px;white-space:nowrap;"><span style="display:inline-block;width:14px;height:14px;border:1.5px solid #333;text-align:center;line-height:13px;font-size:11px;vertical-align:middle;">${checked ? '&#10003;' : '&nbsp;'}</span>&nbsp;${label}</span>`
    })
    .join('')

  const filledItems = data.items.filter((it) => it.description.trim())
  const itemRows = filledItems
    .map(
      (item, i) => `
      <tr>
        <td style="border:1px solid #ccc;padding:6px 8px;text-align:center;color:#555;">${i + 1}</td>
        <td style="border:1px solid #ccc;padding:6px 8px;">${item.description}</td>
        <td style="border:1px solid #ccc;padding:6px 8px;text-align:center;">${item.quantity}</td>
        <td style="border:1px solid #ccc;padding:6px 8px;text-align:center;">${item.unit}</td>
        <td style="border:1px solid #ccc;padding:6px 8px;color:#555;">${item.condition}</td>
      </tr>`,
    )
    .join('')

  const totalItems = data.items.reduce((sum, it) => sum + (parseInt(it.quantity) || 0), 0)

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Gate Pass ${data.serial}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #111; padding: 28px; max-width: 820px; margin: 0 auto; }
    .header { text-align:center; border-bottom:2.5px solid #111; padding-bottom:14px; margin-bottom:16px; }
    .company-name { font-size:22px; font-weight:900; letter-spacing:2px; text-transform:uppercase; }
    .doc-title { font-size:13.5px; font-weight:700; margin-top:5px; letter-spacing:0.5px; text-transform:uppercase; color:#333; }
    .meta-row { display:flex; gap:20px; margin-bottom:10px; flex-wrap:wrap; font-size:12.5px; }
    .meta-item { flex:1; min-width:180px; }
    .ul { border-bottom:1px solid #666; display:inline-block; min-width:160px; padding-bottom:1px; }
    .section { margin-bottom:14px; }
    .section-title { font-size:11.5px; font-weight:700; background:#efefef; padding:5px 10px; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.5px; border-left:3px solid #444; }
    .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:6px 20px; }
    .field-row { margin-bottom:5px; }
    .field-label { font-size:11px; color:#666; margin-bottom:2px; }
    .field-value { border-bottom:1px solid #888; min-height:18px; font-size:12.5px; padding-bottom:1px; }
    table { width:100%; border-collapse:collapse; font-size:12px; }
    th { background:#efefef; border:1px solid #ccc; padding:6px 8px; text-align:left; font-size:11px; font-weight:700; text-transform:uppercase; }
    .sig-row { display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; margin-top:20px; }
    .sig-block { border:1px solid #ccc; padding:10px 12px 12px; border-radius:3px; }
    .sig-title { font-size:10.5px; font-weight:700; margin-bottom:6px; text-transform:uppercase; color:#444; }
    .sig-line { border-bottom:1px solid #aaa; margin-top:22px; }
    .sig-sub { font-size:10.5px; color:#777; margin-top:3px; }
    .validity-row { margin-bottom:12px; font-size:12.5px; }
    .footer { text-align:center; margin-top:14px; font-size:10.5px; color:#999; border-top:1px solid #ddd; padding-top:8px; }
    @media print { body { padding:16px; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="company-name">${data.companyName}</div>
    <div class="doc-title">Wooden Furniture Delivery &mdash; Gate Pass</div>
  </div>

  <div class="meta-row">
    <div class="meta-item"><b>Pass Serial Number:</b>&nbsp;<span class="ul">&nbsp;${data.serial}&nbsp;</span></div>
    <div class="meta-item"><b>Date of Issue:</b>&nbsp;<span class="ul">&nbsp;${formatDateDisplay(data.dateOfIssue)}&nbsp;</span></div>
    <div class="meta-item"><b>Time of Entry/Exit:</b>&nbsp;<span class="ul">&nbsp;${data.timeOfIssue ? data.timeOfIssue + ' ' + data.timeAmPm : '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'}&nbsp;</span></div>
  </div>

  <div class="validity-row"><b>Pass Validity:</b>&nbsp;&nbsp;${checkboxes}</div>

  <div class="section">
    <div class="section-title">1. Transport &amp; Driver Details</div>
    <div class="grid-2">
      <div class="field-row"><div class="field-label">Driver Full Name:</div><div class="field-value">${data.driverName}</div></div>
      <div class="field-row"><div class="field-label">Driver ID / License No.:</div><div class="field-value">${data.driverIdLicense}</div></div>
      <div class="field-row"><div class="field-label">Driver Contact No.:</div><div class="field-value">${data.driverContact}</div></div>
      <div class="field-row"><div class="field-label">Transport Company / Logistics Partner:</div><div class="field-value">${data.transportCompany}</div></div>
      <div class="field-row"><div class="field-label">Vehicle Model &amp; Color:</div><div class="field-value">${data.vehicleModel}</div></div>
      <div class="field-row"><div class="field-label">Vehicle License Plate:</div><div class="field-value">${data.vehiclePlate}</div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">2. Shipment &amp; Item Details</div>
    <div class="field-row" style="margin-bottom:10px;">
      <div class="field-label">Invoice / Delivery Order (DO) Number:</div>
      <div class="field-value">${data.invoiceDoNumber}</div>
    </div>
    <table>
      <thead>
        <tr>
          <th style="width:38px;">S.No</th>
          <th>Item Description (Type of Wood / Finish / Furniture Type)</th>
          <th style="width:70px;">Quantity</th>
          <th style="width:80px;">Unit</th>
          <th style="width:130px;">Condition / Remarks</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows || '<tr><td colspan="5" style="border:1px solid #ccc;padding:8px;text-align:center;color:#aaa;font-style:italic;">No items listed</td></tr>'}
      </tbody>
    </table>
    <div style="margin-top:8px;font-size:12px;">
      <b>Total Number of Packages / Items:</b>&nbsp;<span class="ul">&nbsp;${totalItems || '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'}&nbsp;</span>
    </div>
  </div>

  <div class="section">
    <div class="section-title">3. Delivery Address &amp; Customer Details</div>
    <div class="field-row"><div class="field-label">Customer / Client Name:</div><div class="field-value">${data.customerName}</div></div>
    <div class="field-row"><div class="field-label">Delivery Address:</div><div class="field-value">${data.deliveryAddress}</div></div>
    <div class="field-row"><div class="field-label">Customer Contact No.:</div><div class="field-value">${data.customerContact}</div></div>
  </div>

  <div class="section">
    <div class="section-title">4. Authorization &amp; Signatures</div>
    <div class="sig-row">
      <div class="sig-block">
        <div class="sig-title">Prepared By<br><span style="font-weight:400;text-transform:none;">(Dispatch Officer)</span></div>
        <div class="sig-line"></div><div class="sig-sub">Name: ______________________</div>
        <div class="sig-line" style="margin-top:28px;"></div><div class="sig-sub">Signature: ___________________</div>
      </div>
      <div class="sig-block">
        <div class="sig-title">Verified By<br><span style="font-weight:400;text-transform:none;">(Security Gate Officer)</span></div>
        <div class="sig-line"></div><div class="sig-sub">Name: ______________________</div>
        <div class="sig-line" style="margin-top:28px;"></div><div class="sig-sub">Signature: ___________________</div>
      </div>
      <div class="sig-block">
        <div class="sig-title">Received By<br><span style="font-weight:400;text-transform:none;">(Driver / Carrier)</span></div>
        <div class="sig-line"></div><div class="sig-sub">Name: ______________________</div>
        <div class="sig-line" style="margin-top:28px;"></div><div class="sig-sub">Signature: ___________________</div>
      </div>
    </div>
  </div>

  <div class="footer">
    ${data.projectRef ? `Project Ref: <b>${data.projectRef}</b>&nbsp;&nbsp;|&nbsp;&nbsp;` : ''}Serial: <b>${data.serial}</b>&nbsp;&nbsp;|&nbsp;&nbsp;Issued: ${new Date().toLocaleString('en-GB')}
  </div>
</body>
</html>`
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

  const [dateOfIssue, setDateOfIssue] = useState(() => new Date().toISOString().slice(0, 10))
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

  function getPrintData(serial: string): PrintData {
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

    const itemsText = items
      .filter((it) => it.description.trim())
      .map((it, i) => `${i + 1}. ${it.description} — Qty: ${it.quantity} ${it.unit}${it.condition ? ` (${it.condition})` : ''}`)
      .join('\n')

    try {
      const res = await fetch('/api/gate-passes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: [project.id],
          itemsDescription: itemsText || 'See gate pass document',
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

    const html = buildGatePassHtml(getPrintData(generatedSerial))

    // Parse the generated HTML and inject its content directly into this page's DOM.
    // A @media print style hides everything else, so only the gate pass prints.
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')

    const container = document.createElement('div')
    container.id = '__gp_print__'
    container.innerHTML = doc.body.innerHTML

    const gpStyles = document.createElement('style')
    gpStyles.id = '__gp_styles__'
    gpStyles.innerHTML = Array.from(doc.head.querySelectorAll('style'))
      .map((s) => s.innerHTML)
      .join('\n')

    const printOverride = document.createElement('style')
    printOverride.id = '__gp_override__'
    printOverride.innerHTML =
      '@media print { body > *:not(#__gp_print__) { display:none !important; } #__gp_print__ { display:block !important; } }'

    document.body.appendChild(container)
    document.head.appendChild(gpStyles)
    document.head.appendChild(printOverride)

    const cleanup = () => {
      container.remove()
      gpStyles.remove()
      printOverride.remove()
      setPrinting(false)
      window.removeEventListener('afterprint', cleanup)
    }

    window.addEventListener('afterprint', cleanup)
    // Fallback cleanup if browser doesn't fire afterprint
    setTimeout(cleanup, 60_000)

    window.print()
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
