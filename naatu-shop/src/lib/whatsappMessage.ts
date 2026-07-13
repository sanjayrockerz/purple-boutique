import { BRAND_ADDRESS, BRAND_EN, BRAND_PHONE_DISPLAY } from './brand'
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
  const date = input.invoiceDate || new Date().toISOString()
  const customerName = input.customerName || 'Valued Customer'
  const paymentMode = input.paymentMode || 'POS'
  const itemLines = input.items.map(item =>
    `- ${item.name} Qty : ${item.qty} x ${formatCurrency(item.rate)} Amount : ${formatCurrency(item.lineTotal)}`
  )
  const optionalLines = [
    input.couponDiscount ? `Coupon Discount : -${formatCurrency(input.couponDiscount)}` : '',
    input.manualDiscountAmount ? `Manual Discount : -${formatCurrency(input.manualDiscountAmount)}` : '',
    input.gstAmount ? `GST : ${formatCurrency(input.gstAmount)}` : '',
    input.shipping ? `Delivery : ${formatCurrency(input.shipping)}` : '',
  ].filter(Boolean)

  return [
    `Thank you for shopping with ${BRAND_EN}!`,
    `Dear *${customerName}*,`,
    input.invoiceUrl ? `*Download Invoice PDF:* ${input.invoiceUrl}` : '',
    '',
    `We truly appreciate your purchase and hope you enjoyed your shopping experience with us.`,
    '------------------',
    '*INVOICE SUMMARY*',
    '------------------',
    `Invoice No : ${input.invoiceNumber}`,
    `Date : ${date}`,
    `Customer : ${customerName}`,
    `Phone : ${input.phone || '-'}`,
    '------------------',
    '*ITEMS PURCHASED*',
    '------------------',
    ...itemLines,
    '------------------',
    '*BILL SUMMARY*',
    '------------------',
    `Subtotal : ${formatCurrency(input.subtotal)}`,
    ...optionalLines,
    `*Grand Total : ${formatCurrency(input.total)}*`,
    `Payment Mode : ${paymentMode}`,
    '',
    `We sincerely thank you for choosing *${BRAND_EN}*.`,
    `We look forward to serving you again.`,
    `*${BRAND_EN}*`,
    BRAND_ADDRESS,
    BRAND_PHONE_DISPLAY,
    'Have a wonderful day!',
  ].filter(Boolean).join('\n')
}

export const BUSINESS_PHONE = '60123456789'
