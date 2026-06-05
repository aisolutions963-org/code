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

function fmt(iso: string) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d} / ${m} / ${y}`
}

export function buildGatePassHtml(data: GatePassPrintData): string {
  const company = data.companyName || 'WOODWINGS'

  const validityMap: Record<string, string> = {
    'single-entry': 'Single Entry',
    'single-exit': 'Single Exit',
    'returnable': 'Returnable',
    'non-returnable': 'Non-Returnable',
  }
  const checkboxes = Object.entries(validityMap)
    .map(([key, label]) => {
      const checked = data.passValidity === key
      return `<span style="margin-right:16px;white-space:nowrap;"><span style="display:inline-block;width:13px;height:13px;border:1.5px solid #333;text-align:center;line-height:12px;font-size:10px;vertical-align:middle;">${checked ? '&#10003;' : '&nbsp;'}</span>&nbsp;${label}</span>`
    })
    .join('')

  let itemRows = ''
  if (data.items && data.items.length > 0) {
    const filled = data.items.filter((it) => it.description.trim())
    itemRows = filled
      .map(
        (item, i) => `<tr>
        <td style="border:1px solid #ccc;padding:5px 7px;text-align:center;color:#666;">${i + 1}</td>
        <td style="border:1px solid #ccc;padding:5px 7px;">${item.description}</td>
        <td style="border:1px solid #ccc;padding:5px 7px;text-align:center;">${item.quantity}</td>
        <td style="border:1px solid #ccc;padding:5px 7px;text-align:center;">${item.unit}</td>
        <td style="border:1px solid #ccc;padding:5px 7px;color:#666;">${item.condition}</td>
      </tr>`,
      )
      .join('')
  } else if (data.itemsDescriptionFallback) {
    // Render free-text items description as a single spanning row
    const lines = data.itemsDescriptionFallback.split('\n').filter(Boolean)
    itemRows = lines
      .map(
        (line, i) => `<tr>
        <td style="border:1px solid #ccc;padding:5px 7px;text-align:center;color:#666;">${i + 1}</td>
        <td style="border:1px solid #ccc;padding:5px 7px;" colspan="4">${line}</td>
      </tr>`,
      )
      .join('')
  }

  const totalItems = (data.items ?? []).reduce((s, it) => s + (parseInt(it.quantity) || 0), 0)

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Gate Pass ${data.serial}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#111;padding:24px;max-width:820px;margin:0 auto;}
  .hdr{text-align:center;border-bottom:2.5px solid #111;padding-bottom:12px;margin-bottom:14px;}
  .co{font-size:21px;font-weight:900;letter-spacing:2px;text-transform:uppercase;}
  .dt{font-size:13px;font-weight:700;margin-top:4px;letter-spacing:.5px;text-transform:uppercase;color:#333;}
  .meta{display:flex;gap:18px;margin-bottom:9px;flex-wrap:wrap;font-size:12px;}
  .mi{flex:1;min-width:160px;}
  .ul{border-bottom:1px solid #666;display:inline-block;min-width:150px;padding-bottom:1px;}
  .sec{margin-bottom:12px;}
  .st{font-size:11px;font-weight:700;background:#eee;padding:4px 9px;margin-bottom:7px;text-transform:uppercase;letter-spacing:.4px;border-left:3px solid #444;}
  .g2{display:grid;grid-template-columns:1fr 1fr;gap:5px 18px;}
  .fr{margin-bottom:4px;}
  .fl{font-size:10.5px;color:#666;margin-bottom:1px;}
  .fv{border-bottom:1px solid #999;min-height:17px;font-size:12px;padding-bottom:1px;}
  table{width:100%;border-collapse:collapse;font-size:11.5px;}
  th{background:#eee;border:1px solid #ccc;padding:5px 7px;text-align:left;font-size:10.5px;font-weight:700;text-transform:uppercase;}
  .sr{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:16px;}
  .sb{border:1px solid #ccc;padding:9px 11px 11px;border-radius:3px;}
  .sbt{font-size:10px;font-weight:700;margin-bottom:5px;text-transform:uppercase;color:#444;}
  .sl{border-bottom:1px solid #bbb;margin-top:20px;}
  .ss{font-size:10px;color:#777;margin-top:2px;}
  .vr{margin-bottom:10px;font-size:12px;}
  .ft{text-align:center;margin-top:12px;font-size:10px;color:#aaa;border-top:1px solid #ddd;padding-top:7px;}
  @media print{body{padding:14px;}}
</style>
</head>
<body>
<div class="hdr">
  <div class="co">${company}</div>
  <div class="dt">Wooden Furniture Delivery &mdash; Gate Pass</div>
</div>

<div class="meta">
  <div class="mi"><b>Pass Serial:</b>&nbsp;<span class="ul">&nbsp;${data.serial}&nbsp;</span></div>
  <div class="mi"><b>Date of Issue:</b>&nbsp;<span class="ul">&nbsp;${fmt(data.dateOfIssue)}&nbsp;</span></div>
  <div class="mi"><b>Time of Entry/Exit:</b>&nbsp;<span class="ul">&nbsp;${data.timeOfIssue ? data.timeOfIssue + ' ' + (data.timeAmPm ?? '') : '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'}&nbsp;</span></div>
</div>

<div class="vr"><b>Pass Validity:</b>&nbsp;&nbsp;${checkboxes}</div>

<div class="sec">
  <div class="st">1. Transport &amp; Driver Details</div>
  <div class="g2">
    <div class="fr"><div class="fl">Driver Full Name:</div><div class="fv">${data.driverName ?? ''}</div></div>
    <div class="fr"><div class="fl">Driver ID / License No.:</div><div class="fv">${data.driverIdLicense ?? ''}</div></div>
    <div class="fr"><div class="fl">Driver Contact No.:</div><div class="fv">${data.driverContact ?? ''}</div></div>
    <div class="fr"><div class="fl">Transport Company / Logistics Partner:</div><div class="fv">${data.transportCompany ?? ''}</div></div>
    <div class="fr"><div class="fl">Vehicle Model &amp; Color:</div><div class="fv">${data.vehicleModel ?? ''}</div></div>
    <div class="fr"><div class="fl">Vehicle License Plate:</div><div class="fv">${data.vehiclePlate ?? ''}</div></div>
  </div>
</div>

<div class="sec">
  <div class="st">2. Shipment &amp; Item Details</div>
  <div class="fr" style="margin-bottom:8px;"><div class="fl">Invoice / DO Number:</div><div class="fv">${data.invoiceDoNumber ?? ''}</div></div>
  <table>
    <thead><tr>
      <th style="width:36px;">S.No</th>
      <th>Item Description (Type of Wood / Finish / Furniture Type)</th>
      <th style="width:66px;">Quantity</th>
      <th style="width:76px;">Unit</th>
      <th style="width:120px;">Condition / Remarks</th>
    </tr></thead>
    <tbody>
      ${itemRows || '<tr><td colspan="5" style="border:1px solid #ccc;padding:7px;text-align:center;color:#bbb;font-style:italic;">—</td></tr>'}
    </tbody>
  </table>
  <div style="margin-top:6px;font-size:11.5px;">
    <b>Total Packages / Items:</b>&nbsp;<span class="ul">&nbsp;${totalItems || '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'}&nbsp;</span>
  </div>
</div>

<div class="sec">
  <div class="st">3. Delivery Address &amp; Customer Details</div>
  <div class="fr"><div class="fl">Customer / Client Name:</div><div class="fv">${data.customerName ?? ''}</div></div>
  <div class="fr"><div class="fl">Delivery Address:</div><div class="fv">${data.deliveryAddress ?? ''}</div></div>
  <div class="fr"><div class="fl">Customer Contact No.:</div><div class="fv">${data.customerContact ?? ''}</div></div>
</div>

<div class="sec">
  <div class="st">4. Authorization &amp; Signatures</div>
  <div class="sr">
    <div class="sb">
      <div class="sbt">Prepared By<br><span style="font-weight:400;text-transform:none;">(Dispatch Officer)</span></div>
      <div class="sl"></div><div class="ss">Name: ____________________</div>
      <div class="sl" style="margin-top:26px;"></div><div class="ss">Signature: ________________</div>
    </div>
    <div class="sb">
      <div class="sbt">Verified By<br><span style="font-weight:400;text-transform:none;">(Security Gate Officer)</span></div>
      <div class="sl"></div><div class="ss">Name: ____________________</div>
      <div class="sl" style="margin-top:26px;"></div><div class="ss">Signature: ________________</div>
    </div>
    <div class="sb">
      <div class="sbt">Received By<br><span style="font-weight:400;text-transform:none;">(Driver / Carrier)</span></div>
      <div class="sl"></div><div class="ss">Name: ____________________</div>
      <div class="sl" style="margin-top:26px;"></div><div class="ss">Signature: ________________</div>
    </div>
  </div>
</div>

<div class="ft">
  ${data.projectRef ? `Project Ref: <b>${data.projectRef}</b>&nbsp;|&nbsp;` : ''}${data.projectName ? `${data.projectName}&nbsp;|&nbsp;` : ''}Serial: <b>${data.serial}</b>&nbsp;|&nbsp;Issued: ${new Date().toLocaleString('en-GB')}
</div>
</body>
</html>`
}

export function triggerPrint(data: GatePassPrintData): void {
  const html = buildGatePassHtml(data)

  const CONTAINER_ID = '__gp_print_container__'
  const STYLE_ID = '__gp_print_style__'

  // Clean up any leftover from a previous print
  document.getElementById(CONTAINER_ID)?.remove()
  document.getElementById(STYLE_ID)?.remove()

  // Parse the HTML and inject body content into a fixed container
  const parser = new DOMParser()
  const parsed = parser.parseFromString(html, 'text/html')

  const container = document.createElement('div')
  container.id = CONTAINER_ID
  container.innerHTML = parsed.body.innerHTML
  container.style.cssText = 'display:none;'

  // Collect styles from parsed head
  const styleContent = Array.from(parsed.head.querySelectorAll('style'))
    .map((s) => s.innerHTML)
    .join('\n')

  const styleEl = document.createElement('style')
  styleEl.id = STYLE_ID
  // Use visibility technique — works across all Next.js DOM structures
  styleEl.innerHTML = `
    ${styleContent}
    @media print {
      * { visibility: hidden !important; }
      #${CONTAINER_ID}, #${CONTAINER_ID} * { visibility: visible !important; }
      #${CONTAINER_ID} {
        display: block !important;
        position: fixed;
        top: 0; left: 0; right: 0;
        background: white;
        z-index: 99999;
        padding: 0;
      }
    }
  `

  document.head.appendChild(styleEl)
  document.body.appendChild(container)

  const cleanup = () => {
    document.getElementById(CONTAINER_ID)?.remove()
    document.getElementById(STYLE_ID)?.remove()
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)
  setTimeout(cleanup, 60_000)

  window.print()
}
