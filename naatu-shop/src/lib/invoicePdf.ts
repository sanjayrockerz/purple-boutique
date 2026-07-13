import { generatePDFInvoice } from './pdfInvoice'
import { normalizeStructuredOrderItem } from './retail'

export type InvoicePdfData = {
  invoiceNo: string
  date: string
  customerName: string
  phone: string
  address: string
  items: Array<Record<string, unknown>>
  subtotal: number
  shipping: number
  total: number
  discountAmount?: number
  manualDiscountAmount?: number
  gstAmount?: number
  couponCode?: string | null
  paymentMode?: string
}

export function invoicePdfFile(data: InvoicePdfData): File {
  const items = data.items.map(raw => {
    const item = normalizeStructuredOrderItem(raw)
    return { name: item.name, qty: item.quantity, rate: item.base_price, lineTotal: item.line_total }
  })
  const blob = generatePDFInvoice({
    invoiceNo: data.invoiceNo,
    date: data.date,
    customerName: data.customerName,
    phone: data.phone,
    address: data.address,
    items,
    subtotal: data.subtotal,
    couponDiscount: data.discountAmount,
    manualDiscountAmount: data.manualDiscountAmount,
    shipping: data.shipping,
    gstAmount: data.gstAmount,
    total: data.total,
    paymentMode: data.paymentMode,
  })
  return new File([blob], `Invoice-${data.invoiceNo}.pdf`, { type: 'application/pdf' })
}
