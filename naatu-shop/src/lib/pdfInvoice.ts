import { jsPDF } from 'jspdf'
import { formatCurrency } from './retail'
import { BRAND_EN, BRAND_ADDRESS } from './brand'

type PDFItem = { name: string; qty: number; rate: number; lineTotal: number }
type PDFInvoiceInput = {
  invoiceNo: string; date: string; customerName: string; phone: string; address: string
  items: PDFItem[]; subtotal: number; couponDiscount?: number; manualDiscountAmount?: number
  shipping?: number; gstAmount?: number; total: number; paymentMode?: string
}

const PURPLE = '#7e22ce'
const PURPLE_DARK = '#4c1d95'
const INK = '#1f2937'
const MUTED = '#6b7280'
const PALE_PURPLE = '#f5f3ff'
const BORDER = '#e5e7eb'

const safeDate = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function generatePDFInvoice(input: PDFInvoiceInput): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageW = 210; const margin = 16; const contentW = pageW - margin * 2
  let y = margin
  const line = (pos: number, color = BORDER, width = 0.35) => { doc.setDrawColor(color); doc.setLineWidth(width); doc.line(margin, pos, pageW - margin, pos) }
  const money = (value: number) => formatCurrency(value)
  const text = (value: string, x: number, pos: number, size = 9, color = INK, bold = false) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(color); doc.text(value, x, pos) }

  // Purple Boutique A4 invoice header, based on the supplied reference layout.
  doc.setFillColor(PURPLE); doc.rect(0, 0, pageW, 4, 'F')
  text(BRAND_EN.toUpperCase(), margin, y + 5, 18, PURPLE_DARK, true)
  text('OFFICIAL SALES INVOICE', margin, y + 11, 7.5, MUTED, true)
  text(BRAND_ADDRESS, pageW - margin, y + 4, 8, INK, true)
  doc.setFontSize(7.5); doc.setTextColor(MUTED); doc.text(BRAND_EN, pageW - margin, y + 14, { align: 'right' })
  y += 24; line(y, PURPLE, 0.8); y += 10

  text('INVOICE', margin, y, 16, PURPLE, true)
  text(`Invoice No: ${input.invoiceNo}`, margin, y + 6, 8.5, MUTED)
  text('INVOICE DETAILS', pageW - margin, y, 7.5, MUTED, true)
  doc.setFontSize(8.5); doc.setTextColor(INK); doc.text(`Date: ${safeDate(input.date)}`, pageW - margin, y + 6, { align: 'right' })
  doc.setTextColor('#15803d'); doc.text('Status: PAID', pageW - margin, y + 12, { align: 'right' }); y += 24

  doc.setFillColor(PALE_PURPLE); doc.roundedRect(margin, y - 4, contentW, 28, 2, 2, 'F')
  text('BILL TO', margin + 6, y + 3, 7.5, PURPLE, true)
  text(input.customerName || 'Walk-in Customer', margin + 6, y + 10, 10, INK, true)
  text(input.phone || '-', margin + 6, y + 16, 8.5, MUTED)
  if (input.address) { doc.setFontSize(8.5); doc.setTextColor(MUTED); doc.text(input.address, pageW - margin - 6, y + 10, { align: 'right' }) }
  y += 36

  const columns = { no: margin + 5, product: margin + 17, qty: 122, rate: 153, amount: pageW - margin - 5 }
  doc.setFillColor(PURPLE); doc.roundedRect(margin, y - 5, contentW, 10, 1.5, 1.5, 'F')
  text('#', columns.no, y + 1, 8, '#ffffff', true); text('PRODUCT DESCRIPTION', columns.product, y + 1, 8, '#ffffff', true)
  doc.setFontSize(8); doc.setTextColor('#ffffff'); doc.text('QTY', columns.qty, y + 1, { align: 'center' }); doc.text('RATE', columns.rate, y + 1, { align: 'right' }); doc.text('AMOUNT', columns.amount, y + 1, { align: 'right' }); y += 12

  input.items.forEach((item, index) => {
    const wrapped = doc.splitTextToSize(item.name || 'Product', 82) as string[]; const rowH = Math.max(9, wrapped.length * 4.5 + 4)
    if (y + rowH > 242) { doc.addPage(); y = margin; text(`${BRAND_EN} — INVOICE ${input.invoiceNo}`, margin, y, 8, MUTED, true); y += 10 }
    text(String(index + 1), columns.no, y + 1, 8.5, MUTED)
    wrapped.forEach((part, lineIndex) => text(part, columns.product, y + 1 + lineIndex * 4.5, 8.8, INK, lineIndex === 0))
    doc.setFontSize(8.5); doc.setTextColor(INK); doc.text(String(item.qty), columns.qty, y + 1, { align: 'center' }); doc.text(money(item.rate), columns.rate, y + 1, { align: 'right' }); doc.setFont('helvetica', 'bold'); doc.text(money(item.lineTotal), columns.amount, y + 1, { align: 'right' }); line(y + rowH - 1); y += rowH
  })

  y += 7; const labelX = 125; const valueX = pageW - margin
  const totalRow = (label: string, value: string, color = INK, bold = false) => { text(label, labelX, y, 9, color, bold); doc.setFontSize(9); doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setTextColor(color); doc.text(value, valueX, y, { align: 'right' }); y += 6 }
  totalRow('Subtotal', money(input.subtotal))
  if ((input.couponDiscount || 0) > 0) totalRow('Coupon Discount', `-${money(input.couponDiscount || 0)}`, '#15803d')
  if ((input.manualDiscountAmount || 0) > 0) totalRow('Manual Discount', `-${money(input.manualDiscountAmount || 0)}`, '#15803d')
  if ((input.gstAmount || 0) > 0) totalRow('GST', money(input.gstAmount || 0))
  if ((input.shipping || 0) > 0) totalRow('Delivery Charges', money(input.shipping || 0))
  y += 2; line(y, PURPLE, 0.8); y += 9; totalRow('TOTAL AMOUNT', money(input.total), PURPLE_DARK, true); y += 3; text(`Payment Mode: ${input.paymentMode || 'POS'}`, labelX, y, 8.5, MUTED)

  const footerY = 274; line(footerY, BORDER, 0.5); text('Thank you for shopping with Purple Boutique!', pageW / 2, footerY + 8, 9, PURPLE_DARK, true)
  doc.setFontSize(7.5); doc.setTextColor(MUTED); doc.text('This is a computer-generated invoice.', pageW / 2, footerY + 20, { align: 'center' }); doc.text('Page 1', pageW - margin, footerY + 20, { align: 'right' })
  return doc.output('blob')
}
