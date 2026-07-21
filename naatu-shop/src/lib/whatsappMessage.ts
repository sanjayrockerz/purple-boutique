export type WhatsAppLineItem = {
  name: string
  qty: number
  unit: string
  unitType: 'unit' | 'weight' | 'volume' | 'bundle'
  rate: number
  lineTotal: number
}

export type BuildWhatsAppMessageInput = {
  customerName?: string
  phone?: string
  invoiceNumber: string
  invoiceDate?: string
  invoiceUrl?: string
  paymentMode?: string
  items?: WhatsAppLineItem[]
  subtotal?: number
  couponDiscount?: number
  manualDiscountAmount?: number
  shipping?: number
  gstAmount?: number
  total?: number
}

export const publicInvoiceUrl = (invoiceNumber: string) => {
  const origin =
    typeof window !== 'undefined' && window.location?.origin && !window.location.origin.includes('localhost')
      ? window.location.origin
      : 'https://purple-boutique.vercel.app'
  return `${origin}/invoice/${encodeURIComponent(invoiceNumber)}`
}

export const buildProfessionalWhatsAppMessage = (input: BuildWhatsAppMessageInput) => {
  const customerName = input.customerName?.trim() || 'Valued Customer'
  const invoiceUrl = input.invoiceUrl || publicInvoiceUrl(input.invoiceNumber)

  return `💚 Thank You for Shopping with Purple Boutique! 💚

Dear ${customerName},

✨ Thank you for choosing Purple Boutique. We truly appreciate your support.

🧾 Download Your Invoice & Receipt 👇
📄 ${invoiceUrl}

.

.

📸 Follow us on Instagram for our latest collections, exclusive offers & updates:
https://www.instagram.com/purple_boutique05?igsh=N3NqaWljMTFvMmQ=r

💬 We'd love your feedback! Your review helps us improve and means the world to us. 💚

⭐ Leave your feedback here:
https://forms.gle/JcTw9uVkH4K9YbcD8

.

💚 Thank you, and we hope to see you again soon!
🙏 நன்றி! மீண்டும் சந்திப்போம்`
}

export const BUSINESS_PHONE = '60123456789'

