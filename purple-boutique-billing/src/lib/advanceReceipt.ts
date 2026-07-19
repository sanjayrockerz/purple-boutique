import { jsPDF } from 'jspdf'
import { BRAND_ADDRESS, BRAND_EN, BRAND_PHONE_DISPLAY } from './brand'
import { formatCurrency } from './retail'
import type { AdvanceOrder } from '../services/advanceOrderService'

const esc = (value: string) => value.replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] || char))

export function advanceReceiptPdf(order: AdvanceOrder) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  doc.setFillColor('#7e22ce'); doc.rect(0, 0, 210, 5, 'F')
  doc.setTextColor('#4c1d95'); doc.setFont('helvetica', 'bold'); doc.setFontSize(19); doc.text(BRAND_EN.toUpperCase(), 16, 23)
  doc.setTextColor('#6b7280'); doc.setFontSize(8); doc.text('ADVANCE RECEIPT â€” NOT A TAX INVOICE', 16, 30)
  doc.setFont('helvetica', 'normal'); doc.text(BRAND_ADDRESS, 194, 20, { align: 'right', maxWidth: 76 }); doc.text(BRAND_PHONE_DISPLAY, 194, 30, { align: 'right' })
  doc.setDrawColor('#7e22ce'); doc.line(16, 38, 194, 38)
  doc.setTextColor('#111827'); doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text(order.deposit_id, 16, 51)
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor('#6b7280'); doc.text(`Created: ${new Date(order.created_at).toLocaleString('en-IN')}`, 194, 51, { align: 'right' })
  const rows = [
    ['Customer', order.customer_name], ['Phone', order.phone], ['Address', order.address || '-'], ['Product', order.product_name],
    ['Category', order.category || '-'], ['Expected delivery', new Date(`${order.expected_delivery_date}T00:00:00`).toLocaleDateString('en-IN')],
  ]
  let y = 66
  rows.forEach(([label, value]) => { doc.setFont('helvetica', 'bold'); doc.setTextColor('#6b7280'); doc.text(label.toUpperCase(), 16, y); doc.setFont('helvetica', 'normal'); doc.setTextColor('#111827'); doc.text(String(value), 64, y, { maxWidth: 126 }); y += 10 })
  y += 4; doc.setFillColor('#f5f3ff'); doc.roundedRect(16, y, 178, 42, 3, 3, 'F')
  const money = [[ 'Total order amount', order.total_amount ], [ 'Deposit paid', order.deposit_amount ], [ 'Remaining balance', order.remaining_balance ]] as const
  money.forEach(([label, value], index) => { const rowY = y + 11 + index * 11; doc.setFont('helvetica', index === 2 ? 'bold' : 'normal'); doc.setTextColor(index === 2 ? '#4c1d95' : '#374151'); doc.text(label, 22, rowY); doc.text(formatCurrency(value), 188, rowY, { align: 'right' }) })
  doc.setFont('helvetica', 'bold'); doc.setTextColor('#b45309'); doc.setFontSize(9); doc.text('This receipt records an advance payment only. It is not a final invoice.', 105, y + 55, { align: 'center' })
  return new File([doc.output('blob')], `Advance-Receipt-${order.deposit_id}.pdf`, { type: 'application/pdf' })
}

export function printAdvanceReceipt(order: AdvanceOrder) {
  const frame = document.createElement('iframe'); frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0'; document.body.appendChild(frame)
  const doc = frame.contentWindow?.document; if (!doc) return
  doc.open(); doc.write(`<!doctype html><html><head><title>Advance Receipt ${esc(order.deposit_id)}</title><style>@page{size:80mm auto;margin:0}body{font:12px Arial,sans-serif;width:72mm;padding:4mm;color:#111}.c{text-align:center}.r{display:flex;justify-content:space-between;gap:10px;margin:7px 0}.line{border-top:1px dashed #555;margin:10px 0}.big{font-size:16px;font-weight:bold}.warn{font-size:10px;font-weight:bold;margin-top:14px}</style></head><body><div class="c big">${esc(BRAND_EN)}</div><div class="c">${esc(BRAND_ADDRESS)}</div><div class="c">${esc(BRAND_PHONE_DISPLAY)}</div><div class="line"></div><div class="c big">ADVANCE RECEIPT</div><div class="c">Not a final tax invoice</div><div class="line"></div><div><b>${esc(order.deposit_id)}</b></div><div>${new Date(order.created_at).toLocaleString('en-IN')}</div><div class="line"></div><div><b>Customer:</b> ${esc(order.customer_name)}</div><div><b>Phone:</b> ${esc(order.phone)}</div><div><b>Product:</b> ${esc(order.product_name)}</div><div><b>Delivery:</b> ${esc(new Date(`${order.expected_delivery_date}T00:00:00`).toLocaleDateString('en-IN'))}</div><div class="line"></div><div class="r"><span>Total Amount</span><b>${esc(formatCurrency(order.total_amount))}</b></div><div class="r"><span>Deposit Paid</span><b>${esc(formatCurrency(order.deposit_amount))}</b></div><div class="r big"><span>Balance</span><span>${esc(formatCurrency(order.remaining_balance))}</span></div><div class="line"></div><div class="c warn">ADVANCE PAYMENT ONLY â€” NOT A FINAL INVOICE</div></body></html>`); doc.close()
  setTimeout(() => { frame.contentWindow?.focus(); frame.contentWindow?.print(); setTimeout(() => frame.remove(), 1000) }, 250)
}

export function downloadFile(file: File) { const url = URL.createObjectURL(file); const link = document.createElement('a'); link.href = url; link.download = file.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 500) }

