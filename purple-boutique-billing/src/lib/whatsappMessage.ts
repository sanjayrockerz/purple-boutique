import { BRAND_ADDRESS, BRAND_EMAIL, BRAND_EN, BRAND_PHONE_DISPLAY } from './brand'
import { formatCurrency } from './retail'

export type WhatsAppLineItem = {
  name: string
  qty: number
  unit: string
  unitType: 'unit' | 'weight' | 'volume' | 'bundle'
  rate: number
  lineTotal: number
}

type BuildWhatsAppMessageInput = {
  customerName?: string
  phone?: string
  invoiceNumber: string
  invoiceDate?: string
  invoiceUrl?: string
  paymentMode?: string
  items: WhatsAppLineItem[]
  subtotal: number
  couponDiscount?: number
  manualDiscountAmount?: number
  shipping?: number
  gstAmount?: number
  total: number
}

export const publicInvoiceUrl = (invoiceNumber: string) =>
  `${window.location.origin}/invoice/${encodeURIComponent(invoiceNumber)}`

export const buildProfessionalWhatsAppMessage = (input: BuildWhatsAppMessageInput) => {
  const date = input.invoiceDate ? new Date(input.invoiceDate) : new Date()
  const dateStr = Number.isNaN(date.getTime())
    ? String(input.invoiceDate || '')
    : date.toLocaleString('en-MY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const customerName = input.customerName?.trim() || 'Valued Customer'
  const phone = input.phone?.trim() || '-'
  const paymentMode = input.paymentMode?.trim() || 'POS'

  const itemLines = input.items.flatMap((item, index) => [
    `${index + 1}. ${item.name}`,
    `   Qty: ${item.qty} ${item.unit} x ${formatCurrency(item.rate)}`,
    `   Amount: ${formatCurrency(item.lineTotal)}`,
  ])

  const summaryLines = [
    `Subtotal: ${formatCurrency(input.subtotal)}`,
    (input.couponDiscount || 0) > 0 ? `Coupon discount: -${formatCurrency(input.couponDiscount || 0)}` : '',
    (input.manualDiscountAmount || 0) > 0 ? `Manual discount: -${formatCurrency(input.manualDiscountAmount || 0)}` : '',
    (input.gstAmount || 0) > 0 ? `GST: ${formatCurrency(input.gstAmount || 0)}` : '',
    (input.shipping || 0) > 0 ? `Delivery: ${formatCurrency(input.shipping || 0)}` : '',
  ].filter(Boolean)

  return [
    `*Thank you for shopping with ${BRAND_EN}!*`,
    '',
    `Dear *${customerName}*,`,
    'We appreciate your purchase. Here is your invoice summary.',
    '',
    '*INVOICE SUMMARY*',
    input.invoiceUrl ? `Download Invoice PDF: ${input.invoiceUrl}` : '',
    `Invoice No: ${input.invoiceNumber}`,
    `Date: ${dateStr}`,
    `Customer: ${customerName}`,
    `Phone: ${phone}`,
    '',
    '*ITEMS PURCHASED*',
    ...itemLines,
    '',
    '*BILL SUMMARY*',
    ...summaryLines,
    `*Grand Total: ${formatCurrency(input.total)}*`,
    `Payment Mode: ${paymentMode}`,
    '',
    `We look forward to serving you again at *${BRAND_EN}*.`,
    BRAND_ADDRESS,
    `Phone: ${BRAND_PHONE_DISPLAY}`,
    `Email: ${BRAND_EMAIL}`,
  ].join('\n')
}
