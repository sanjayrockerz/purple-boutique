import { BRAND_ADDRESS, BRAND_EN, BRAND_LOGO, BRAND_WHATSAPP } from './brand'
import { formatCurrency, formatInvoiceNo } from './retail'

export interface ThermalReceiptItem {
  name: string
  nameTa?: string
  qty: number
  unit?: string
  price: number
  line_total?: number
}

export interface ThermalReceiptData {
  invoiceNo: string
  date: string
  customerName?: string
  phone?: string
  items: ThermalReceiptItem[]
  subtotal: number
  shipping?: number
  couponDiscount?: number
  manualDiscount?: number
  totalGst?: number
  total: number
  storeName?: string
  storePhone?: string
  storeAddress?: string
}

export function printThermalReceipt(data: ThermalReceiptData) {
  const printWindow = window.open('', '_blank', 'width=400,height=600')
  if (!printWindow) return

  const dateStr = data.date ? new Date(data.date).toLocaleString('en-IN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  }) : ''

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Receipt - ${data.invoiceNo}</title>
        <style>
          @page { size: 80mm auto; margin: 0; }
          body { font-family: monospace; width: 72mm; margin: 0 auto; padding: 4mm 0; font-size: 12px; color: #000; }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .text-left { text-left: left; }
          .font-bold { font-weight: bold; }
          .mb-2 { margin-bottom: 8px; }
          .mt-2 { margin-top: 8px; }
          .border-bottom { border-bottom: 1px dashed #000; padding-bottom: 4px; margin-bottom: 4px; }
          .border-top { border-top: 1px dashed #000; padding-top: 4px; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 2px 0; vertical-align: top; }
          .item-name { font-size: 11px; padding-right: 4px; }
        </style>
      </head>
      <body>
        <div class="text-center mb-2">
          <div style="margin-bottom: 6px;"><img src="${BRAND_LOGO}" alt="${BRAND_EN}" style="width: 60px; height: 60px; object-fit: contain; display: block; margin: 0 auto; border-radius: 8px;" /></div>
          <div class="font-bold" style="font-size: 16px;">${data.storeName || BRAND_EN}</div>
          <div style="font-size: 11px; margin-top: 2px;">${data.storeAddress || BRAND_ADDRESS}</div>
          <div class="mt-2" style="font-size: 11px;">Ph: ${data.storePhone || BRAND_WHATSAPP}</div>
        </div>
        
        <div class="border-bottom border-top" style="font-size: 11px;">
          <div>Inv: #${formatInvoiceNo(data.invoiceNo)}</div>
          <div>Date: ${dateStr}</div>
          ${data.customerName ? `<div>Name: ${data.customerName}</div>` : ''}
          ${data.phone ? `<div>Tel: ${data.phone}</div>` : ''}
        </div>

        <table class="border-bottom">
          <thead>
            <tr style="font-size: 10px; border-bottom: 1px dashed #000;">
              <th class="text-left">Item</th>
              <th class="text-right">Qty</th>
              <th class="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            ${data.items.map(item => {
              const lineTotal = item.line_total ?? (item.qty * item.price)
              const unit = item.unit && item.unit !== 'unit' && item.unit !== 'piece' ? item.unit : ''
              return `
                <tr>
                  <td class="text-left item-name">
                    ${item.name} <br/>
                    <span style="font-size: 9px;">${formatCurrency(item.price)} ${unit ? ` / ${unit}` : ''}</span>
                  </td>
                  <td class="text-right">${item.qty}</td>
                  <td class="text-right">${formatCurrency(lineTotal)}</td>
                </tr>
              `
            }).join('')}
          </tbody>
        </table>

        <div class="border-bottom" style="font-size: 12px;">
          <table style="width: 100%;">
            ${data.subtotal !== data.total ? `
              <tr>
                <td class="text-left">Subtotal</td>
                <td class="text-right">${formatCurrency(data.subtotal)}</td>
              </tr>
            ` : ''}
            ${(data.couponDiscount || 0) > 0 ? `
              <tr>
                <td class="text-left">Coupon</td>
                <td class="text-right">-${formatCurrency(data.couponDiscount || 0)}</td>
              </tr>
            ` : ''}
            ${(data.manualDiscount || 0) > 0 ? `
              <tr>
                <td class="text-left">Manual Disc.</td>
                <td class="text-right">-${formatCurrency(data.manualDiscount || 0)}</td>
              </tr>
            ` : ''}
            ${(data.totalGst || 0) > 0 ? `
              <tr>
                <td class="text-left">SST</td>
                <td class="text-right">+${formatCurrency(data.totalGst || 0)}</td>
              </tr>
            ` : ''}
            ${(data.shipping || 0) > 0 ? `
              <tr>
                <td class="text-left">Delivery</td>
                <td class="text-right">${formatCurrency(data.shipping || 0)}</td>
              </tr>
            ` : ''}
            <tr class="font-bold" style="font-size: 14px;">
              <td class="text-left">Total</td>
              <td class="text-right">${formatCurrency(data.total)}</td>
            </tr>
          </table>
        </div>

        <div class="text-center mt-2" style="font-size: 11px;">
          <div class="font-bold">Thank you for visiting!</div>
          <div>Visit again</div>
        </div>
      </body>
    </html>
  `

  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()

  setTimeout(() => {
    printWindow.focus()
    printWindow.print()
  }, 250)
}
