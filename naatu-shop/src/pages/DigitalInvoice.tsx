import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { Invoice } from '../components/Invoice'
import { Printer, ArrowLeft, MessageCircle } from 'lucide-react'
import { printThermalReceipt } from '../lib/thermalPrint'
import { invoicePdfFile } from '../lib/invoicePdf'
import { normalizeStructuredOrderItem } from '../lib/retail'
import { buildProfessionalWhatsAppMessage, publicInvoiceUrl } from '../lib/whatsappMessage'
import { toWhatsAppUrl } from '../lib/phone'

export default function DigitalInvoice() {
  const { id } = useParams()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [invoice, setInvoice] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadInvoice() {
      if (!isSupabaseConfigured) {
        setError('Database connection not configured')
        setLoading(false)
        return
      }
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('*')
          .eq('invoice_no', id)
          .single()

        if (error) throw error
        if (!data) throw new Error('Invoice not found')

        setInvoice(data)
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message)
        } else {
          setError('Invoice not found')
        }
      } finally {
        setLoading(false)
      }
    }
    if (id) loadInvoice()
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen bg-bgMain flex items-center justify-center">
        <span className="w-8 h-8 border-4 border-sand border-t-sageDark rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-bgMain flex flex-col items-center justify-center text-center p-6">
        <h1 className="text-2xl font-bold text-primary mb-2">Invoice Not Found</h1>
        <p className="text-gray-500 mb-6">{error}</p>
        <Link to="/" className="px-6 py-2 bg-primary text-white rounded-full font-bold hover:bg-primary-dark transition">
          Return Home
        </Link>
      </div>
    )
  }

const invoiceItems = (Array.isArray(invoice.items) ? invoice.items : [])
    .map((item: Record<string, unknown>) => normalizeStructuredOrderItem(item))
  const subtotal = invoiceItems.reduce((sum: number, item: ReturnType<typeof normalizeStructuredOrderItem>) => sum + item.line_total, 0)

  const downloadPdf = () => {
    const file = invoicePdfFile({
      invoiceNo: invoice.invoice_no,
      date: invoice.created_at,
      customerName: invoice.customer_name,
      phone: invoice.phone,
      address: invoice.address,
      items: invoiceItems as unknown as Array<Record<string, unknown>>,
      subtotal,
      shipping: Number(invoice.delivery_charge || 0),
      total: Number(invoice.total || 0),
      discountAmount: Number(invoice.discount_amount || 0),
      manualDiscountAmount: Number(invoice.manual_discount_amount || 0),
      gstAmount: Number(invoice.total_gst || invoice.gst_amount || 0),
      couponCode: invoice.coupon_code || undefined,
      paymentMode: invoice.payment_mode || invoice.payment_method || undefined,
    })
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = url
    link.download = file.name
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const shareViaWhatsApp = async () => {
    const items = invoiceItems.map((item: ReturnType<typeof normalizeStructuredOrderItem>) => ({
      name: item.name,
      qty: item.quantity,
      unit: item.unit,
      unitType: item.unit_type,
      rate: item.base_price,
      lineTotal: item.line_total,
    }))
    const message = buildProfessionalWhatsAppMessage({
      customerName: invoice.customer_name,
      phone: invoice.phone,
      invoiceNumber: invoice.invoice_no,
      invoiceDate: invoice.created_at,
      invoiceUrl: publicInvoiceUrl(invoice.invoice_no),
      items,
      subtotal,
      couponDiscount: invoice.discount_amount,
      manualDiscountAmount: invoice.manual_discount_amount,
      shipping: invoice.delivery_charge,
      gstAmount: invoice.total_gst || invoice.gst_amount || 0,
      total: invoice.total,
      paymentMode: invoice.payment_mode || invoice.payment_method,
    })

    window.open(toWhatsAppUrl(invoice.phone, message), '_blank', 'noopener,noreferrer')
  }

  const printReceipt = () => {
    const subtotal = invoice.total - (invoice.delivery_charge || 0) + (invoice.discount_amount || 0)
    printThermalReceipt({
      invoiceNo: invoice.invoice_no,
      date: invoice.created_at,
      customerName: invoice.customer_name,
      phone: invoice.phone,
      items: (invoice.items || []).map((item: any) => ({
        name: item.name || item.product_name,
        qty: item.qty || item.quantity,
        unit: item.unit,
        price: item.price || item.base_price || 0,
        line_total: item.line_total
      })),
      subtotal,
      shipping: invoice.delivery_charge || 0,
      couponDiscount: invoice.discount_amount || 0,
      totalGst: invoice.total_gst || 0,
      total: invoice.total
    })
  }

  return (
    <div className="min-h-screen bg-bgMain font-sans pb-12 print:bg-white print:pb-0">
      {/* Top action bar */}
      <div className="bg-bgMain p-4 sticky top-0 z-50 print:hidden flex items-center justify-between max-w-4xl mx-auto">
        <Link to="/" className="flex items-center gap-2 text-primary hover:text-primary-dark font-semibold text-sm transition-colors bg-white border border-borderLight px-4 py-2 rounded-full shadow-sm">
          <ArrowLeft size={16} /> Back
        </Link>
<div className="flex items-center gap-2">
          <button
            onClick={downloadPdf}
            className="flex items-center gap-2 bg-primary text-white px-5 py-2 rounded-full font-bold text-sm shadow-md hover:bg-primary-dark transition-colors"
          >
            <Printer size={16} /> PDF
          </button>
          <button
            onClick={shareViaWhatsApp}
            className="flex items-center gap-2 bg-green-500 text-white px-5 py-2 rounded-full font-bold text-sm shadow-md hover:bg-green-600 transition-colors"
          >
            <MessageCircle size={16} /> WhatsApp
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto mt-4 print:mt-0 px-2 sm:px-0">
        <div className="bg-white shadow-xl rounded-2xl overflow-hidden print:shadow-none print:rounded-none border border-borderLight print:border-none">
          <Invoice
            invoiceNo={invoice.invoice_no}
            date={invoice.created_at}
            customerName={invoice.customer_name}
            phone={invoice.phone}
            address={invoice.address}
            items={invoice.items || []}
            subtotal={subtotal}
            shipping={invoice.delivery_charge || 0}
            discountAmount={invoice.discount_amount || 0}
            manualDiscountAmount={invoice.manual_discount_amount || 0}
            gstAmount={invoice.total_gst || invoice.gst_amount || 0}
            couponCode={invoice.coupon_code}
            total={invoice.total}
            status={invoice.status}
            paymentMode={invoice.payment_mode || invoice.payment_method}
            onPrintReceipt={printReceipt}
          />
        </div>
      </div>
    </div>
  )
}
