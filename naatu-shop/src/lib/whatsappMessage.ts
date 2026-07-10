import { BRAND_PHONE_DISPLAY } from './brand'
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
  paymentMode?: string
  items: WhatsAppLineItem[]
  subtotal: number
  couponDiscount?: number
  manualDiscountAmount?: number
  shipping?: number
  gstAmount?: number
  total: number
}

export const buildProfessionalWhatsAppMessage = (input: BuildWhatsAppMessageInput) => {
  const dateStr = input.invoiceDate || new Date().toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const customerName = input.customerName || 'Valued Customer'
  const phone = input.phone || '-'
  const paymentMode = input.paymentMode || 'POS'

  const itemLines = input.items.map(item => (
    `• ${item.name}\n  Qty : ${item.qty} × ${formatCurrency(item.rate)}\n  Amount : ${formatCurrency(item.lineTotal)}`
  ))

  const couponLine = (input.couponDiscount || 0) > 0
    ? `Coupon Discount    : -${formatCurrency(input.couponDiscount || 0)}` : ''

  const manualLine = (input.manualDiscountAmount || 0) > 0
    ? `Manual Discount    : -${formatCurrency(input.manualDiscountAmount || 0)}` : ''

  const gstLine = (input.gstAmount || 0) > 0
    ? `GST                : ${formatCurrency(input.gstAmount || 0)}` : ''

  const deliveryLine = (input.shipping || 0) > 0
    ? `Delivery Charges   : ${formatCurrency(input.shipping || 0)}` : ''

  return [
    `🛍️ *Thank you for shopping with Purple Boutique!*`,
    '',
    `Dear *${customerName}*,`,
    '',
    `We truly appreciate your purchase and hope you enjoyed your shopping experience with us.`,
    '',
    `━━━━━━━━━━━━━━━━━━`,
    `🧾 *INVOICE SUMMARY*`,
    `━━━━━━━━━━━━━━━━━━`,
    '',
    `Invoice No : ${input.invoiceNumber}`,
    `Date : ${dateStr}`,
    '',
    `Customer : ${customerName}`,
    `Phone : ${phone}`,
    '',
    `━━━━━━━━━━━━━━━━━━`,
    `🛒 *ITEMS PURCHASED*`,
    `━━━━━━━━━━━━━━━━━━`,
    '',
    ...itemLines,
    '',
    `━━━━━━━━━━━━━━━━━━`,
    `💰 *BILL SUMMARY*`,
    `━━━━━━━━━━━━━━━━━━`,
    '',
    `Subtotal           : ${formatCurrency(input.subtotal)}`,
    couponLine,
    manualLine,
    gstLine,
    deliveryLine,
    '',
    `━━━━━━━━━━━━━━━━━━`,
    `*Grand Total : ${formatCurrency(input.total)}*`,
    `━━━━━━━━━━━━━━━━━━`,
    '',
    `Payment Mode : ${paymentMode}`,
    '',
    `We sincerely thank you for choosing *Purple Boutique*. ❤️`,
    '',
    `We look forward to serving you again.`,
    '',
    `📍 *Purple Boutique*`,
    `Kuala Lumpur, Malaysia`,
    '',
    `📞 ${BRAND_PHONE_DISPLAY}`,
    '',
    `Have a wonderful day! 😊`,
  ].filter(Boolean).join('\n')
}
