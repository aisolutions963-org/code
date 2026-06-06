export interface GatePassPrintData {
  serial: string
  projectRef?: string
  projectName?: string
  dateOfIssue: string
  timeOfIssue?: string
  timeAmPm?: string
  passValidity?: string
  driverName?: string
  driverIdLicense?: string
  driverContact?: string
  transportCompany?: string
  vehicleModel?: string
  vehiclePlate?: string
  invoiceDoNumber?: string
  items?: { description: string; quantity: string; unit: string; condition: string }[]
  itemsDescriptionFallback?: string
  customerName?: string
  deliveryAddress?: string
  customerContact?: string
  companyName?: string
}

function fmtDate(iso: string) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d} / ${m} / ${y}`
}

function buildHtml(data: GatePassPrintData): string {
  const company = (data.companyName || 'WOODWINGS').toUpperCase()

  const validityMap: Record<string, string> = {
    'single-entry': 'Single Entry',
    'single-exit': 'Single Exit',
    'returnable': 'Returnable',
    'non-returnable': 'Non-Returnable',
  }
  const checkboxes = Object.entries(validityMap)
    .map(([key, label]) => {
      const checked = data.passValidity === key
      return `<span style="margin-right:16px;white-space:nowrap;">
        <span style="display:inline-block;width:13px;height:13px;border:1.5px solid #333;
          text-align:center;line-height:12px;font-size:10px;vertical-align:middle;">
          ${checked ? '&#10003;' : '&nbsp;'}
        </span>&nbsp;${label}</span>`
    })
    .join('')

  let itemRows = ''
  if (data.items && data.items.filter(i => i.description.trim()).length > 0) {
    itemRows = data.items
      .filter(i => i.description.trim())
      .map((item, i) => `<tr>
        <td style="border:1px solid #bbb;padding:5px 7px;text-align:center;">${i + 1}</td>
        <td style="border:1px solid #bbb;padding:5px 7px;">${item.description}</td>
        <td style="border:1px solid #bbb;padding:5px 7px;text-align:center;">${item.quantity}</td>
        <td style="border:1px solid #bbb;padding:5px 7px;text-align:center;">${item.unit}</td>
        <td style="border:1px solid #bbb;padding:5px 7px;">${item.condition}</td>
      </tr>`)
      .join('')
  } else if (data.itemsDescriptionFallback) {
    itemRows = data.itemsDescriptionFallback.split('\n').filter(Boolean)
      .map((line, i) => `<tr>
        <td style="border:1px solid #bbb;padding:5px 7px;text-align:center;">${i + 1}</td>
        <td colspan="4" style="border:1px solid #bbb;padding:5px 7px;">${line}</td>
      </tr>`)
      .join('')
  }

  const totalItems = (data.items ?? []).reduce((s, it) => s + (parseInt(it.quantity) || 0), 0)

  const field = (label: string, value: string) => `
    <div style="margin-bottom:6px;">
      <div style="font-size:10.5px;color:#666;margin-bottom:2px;">${label}</div>
      <div style="border-bottom:1px solid #999;min-height:18px;font-size:12.5px;padding-bottom:1px;">${value}</div>
    </div>`

  const sigBlock = (title: string, sub: string) => `
    <div style="border:1px solid #ccc;padding:10px 12px 14px;border-radius:3px;flex:1;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#444;margin-bottom:6px;">${title}<br>
        <span style="font-weight:400;text-transform:none;">${sub}</span></div>
      <div style="border-bottom:1px solid #bbb;margin-top:22px;"></div>
      <div style="font-size:10px;color:#777;margin-top:3px;">Name: ______________________</div>
      <div style="border-bottom:1px solid #bbb;margin-top:26px;"></div>
      <div style="font-size:10px;color:#777;margin-top:3px;">Signature: _________________</div>
    </div>`

  const sectionTitle = (n: string) => `
    <div style="font-size:11px;font-weight:700;background:#efefef;padding:4px 9px;margin-bottom:8px;
      text-transform:uppercase;letter-spacing:.4px;border-left:3px solid #444;">${n}</div>`

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#111;max-width:820px;margin:0 auto;">
      <!-- Header -->
      <div style="text-align:center;border-bottom:2.5px solid #111;padding-bottom:12px;margin-bottom:14px;">
        <div style="font-size:22px;font-weight:900;letter-spacing:2px;">${company}</div>
        <div style="font-size:13px;font-weight:700;margin-top:4px;letter-spacing:.5px;text-transform:uppercase;color:#333;">
          Wooden Furniture Delivery &mdash; Gate Pass
        </div>
      </div>

      <!-- Meta row -->
      <div style="display:flex;gap:18px;margin-bottom:9px;flex-wrap:wrap;font-size:12px;">
        <div style="flex:1;min-width:150px;"><b>Pass Serial:</b>&nbsp;
          <span style="border-bottom:1px solid #666;display:inline-block;min-width:140px;">&nbsp;${data.serial}&nbsp;</span>
        </div>
        <div style="flex:1;min-width:150px;"><b>Date of Issue:</b>&nbsp;
          <span style="border-bottom:1px solid #666;display:inline-block;min-width:130px;">&nbsp;${fmtDate(data.dateOfIssue)}&nbsp;</span>
        </div>
        <div style="flex:1;min-width:150px;"><b>Time:</b>&nbsp;
          <span style="border-bottom:1px solid #666;display:inline-block;min-width:130px;">&nbsp;${data.timeOfIssue ? data.timeOfIssue + ' ' + (data.timeAmPm ?? '') : ''}&nbsp;</span>
        </div>
      </div>

      <!-- Validity -->
      <div style="margin-bottom:12px;font-size:12px;"><b>Pass Validity:</b>&nbsp;&nbsp;${checkboxes}</div>

      <!-- Section 1 -->
      <div style="margin-bottom:12px;">
        ${sectionTitle('1. Transport &amp; Driver Details')}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 18px;">
          ${field('Driver Full Name:', data.driverName ?? '')}
          ${field('Driver ID / License No.:', data.driverIdLicense ?? '')}
          ${field('Driver Contact No.:', data.driverContact ?? '')}
          ${field('Transport Company / Logistics Partner:', data.transportCompany ?? '')}
          ${field('Vehicle Model &amp; Color:', data.vehicleModel ?? '')}
          ${field('Vehicle License Plate:', data.vehiclePlate ?? '')}
        </div>
      </div>

      <!-- Section 2 -->
      <div style="margin-bottom:12px;">
        ${sectionTitle('2. Shipment &amp; Item Details')}
        ${field('Invoice / DO Number:', data.invoiceDoNumber ?? '')}
        <table style="width:100%;border-collapse:collapse;font-size:11.5px;margin-top:6px;">
          <thead>
            <tr style="background:#efefef;">
              <th style="border:1px solid #bbb;padding:5px 7px;width:36px;text-align:left;font-size:10.5px;text-transform:uppercase;">S.No</th>
              <th style="border:1px solid #bbb;padding:5px 7px;text-align:left;font-size:10.5px;text-transform:uppercase;">Item Description</th>
              <th style="border:1px solid #bbb;padding:5px 7px;width:66px;text-align:left;font-size:10.5px;text-transform:uppercase;">Qty</th>
              <th style="border:1px solid #bbb;padding:5px 7px;width:70px;text-align:left;font-size:10.5px;text-transform:uppercase;">Unit</th>
              <th style="border:1px solid #bbb;padding:5px 7px;width:120px;text-align:left;font-size:10.5px;text-transform:uppercase;">Condition</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows || '<tr><td colspan="5" style="border:1px solid #bbb;padding:8px;text-align:center;color:#bbb;font-style:italic;">—</td></tr>'}
          </tbody>
        </table>
        <div style="margin-top:6px;font-size:11.5px;">
          <b>Total Packages / Items:</b>&nbsp;
          <span style="border-bottom:1px solid #666;display:inline-block;min-width:80px;">&nbsp;${totalItems || ''}&nbsp;</span>
        </div>
      </div>

      <!-- Section 3 -->
      <div style="margin-bottom:12px;">
        ${sectionTitle('3. Delivery Address &amp; Customer Details')}
        ${field('Customer / Client Name:', data.customerName ?? '')}
        ${field('Delivery Address:', data.deliveryAddress ?? '')}
        ${field('Customer Contact No.:', data.customerContact ?? '')}
      </div>

      <!-- Section 4 -->
      <div style="margin-bottom:12px;">
        ${sectionTitle('4. Authorization &amp; Signatures')}
        <div style="display:flex;gap:10px;margin-top:4px;">
          ${sigBlock('Prepared By', '(Dispatch Officer)')}
          ${sigBlock('Verified By', '(Security Gate Officer)')}
          ${sigBlock('Received By', '(Driver / Carrier)')}
        </div>
      </div>

      <!-- Footer -->
      <div style="text-align:center;margin-top:12px;font-size:10px;color:#aaa;border-top:1px solid #ddd;padding-top:7px;">
        ${data.projectRef ? `Project Ref: <b>${data.projectRef}</b>&nbsp;|&nbsp;` : ''}
        ${data.projectName ? `${data.projectName}&nbsp;|&nbsp;` : ''}
        Serial: <b>${data.serial}</b>&nbsp;|&nbsp;Issued: ${new Date().toLocaleString('en-GB')}
      </div>
    </div>`
}

const OVERLAY_ID = '__gp_overlay__'

export function triggerPrint(data: GatePassPrintData): void {
  // Remove any leftover overlay
  document.getElementById(OVERLAY_ID)?.remove()

  const overlay = document.createElement('div')
  overlay.id = OVERLAY_ID
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:99999', 'background:white',
    'overflow-y:auto', 'padding:32px', 'box-sizing:border-box',
  ].join(';')

  // Gate pass content
  const content = document.createElement('div')
  content.innerHTML = buildHtml(data)
  overlay.appendChild(content)

  // Action bar (hidden on actual print)
  const bar = document.createElement('div')
  bar.className = '__gp_bar__'
  bar.style.cssText = [
    'position:sticky', 'top:0', 'z-index:2', 'display:flex', 'gap:10px',
    'justify-content:flex-end', 'padding:10px 0 14px', 'background:white',
  ].join(';')
  bar.innerHTML = `
    <button onclick="window.print()"
      style="background:#1a56db;color:#fff;border:none;padding:8px 22px;border-radius:6px;font-size:14px;cursor:pointer;font-family:Arial;">
      🖨 Print / Save as PDF
    </button>
    <button onclick="document.getElementById('${OVERLAY_ID}').remove()"
      style="background:#f3f4f6;color:#374151;border:1px solid #d1d5db;padding:8px 18px;border-radius:6px;font-size:14px;cursor:pointer;font-family:Arial;">
      Close
    </button>`
  overlay.insertBefore(bar, content)

  // Hide the action bar when printing
  const printStyle = document.createElement('style')
  printStyle.innerHTML = `@media print { .__gp_bar__ { display:none !important; } }`
  overlay.appendChild(printStyle)

  document.body.appendChild(overlay)
}
