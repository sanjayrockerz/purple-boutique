import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { Invoice } from '../components/Invoice'
import { Printer, ArrowLeft, Receipt } from 'lucide-react'
import { printThermalReceipt } from '../lib/thermalPrint'

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
      <div className="min-h-screen bg-[#f9faf6] flex items-center justify-center">
        <span className="w-8 h-8 border-4 border-sand border-t-sageDark rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-[#f9faf6] flex flex-col items-center justify-center text-center p-6">
        <h1 className="text-2xl font-bold text-sageDark mb-2">Invoice Not Found</h1>
        <p className="text-gray-500 mb-6">{error}</p>
        <Link to="/" className="px-6 py-2 bg-sage text-white rounded-full font-bold hover:bg-sageDark transition">
          Return Home
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f9faf6] font-sans pb-12 print:bg-white print:pb-0">
      {/* Top action bar */}
      <div className="bg-[#f9faf6] p-4 sticky top-0 z-50 print:hidden flex items-center justify-between max-w-4xl mx-auto">
        <Link to="/" className="flex items-center gap-2 text-sageDark hover:text-[#2d5a27] font-semibold text-sm transition-colors bg-white border border-sand/40 px-4 py-2 rounded-full shadow-sm">
          <ArrowLeft size={16} /> Back
        </Link>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => window.print()}
            className="flex items-center gap-2 bg-[#881337] text-white px-5 py-2 rounded-full font-bold text-sm shadow-md hover:bg-[#6c0f2c] transition-colors"
          >
            <Printer size={16} /> PDF
          </button>
          <button 
            onClick={() => {
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
                subtotal: subtotal,
                shipping: invoice.delivery_charge || 0,
                couponDiscount: invoice.discount_amount || 0,
                totalGst: invoice.total_gst || 0,
                total: invoice.total
              })
            }}
            className="flex items-center gap-2 bg-sageDark text-white px-5 py-2 rounded-full font-bold text-sm shadow-md hover:bg-sageDeep transition-colors"
          >
            <Receipt size={16} /> Print Receipt
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto mt-4 print:mt-0 px-2 sm:px-0">
        <div className="bg-white shadow-xl rounded-2xl overflow-hidden print:shadow-none print:rounded-none border border-sand/20 print:border-none">
          <Invoice
            invoiceNo={invoice.invoice_no}
            date={invoice.created_at}
            customerName={invoice.customer_name}
            phone={invoice.phone}
            address={invoice.address}
            items={invoice.items || []}
            subtotal={invoice.total - (invoice.delivery_charge || 0) + (invoice.discount_amount || 0)}
            shipping={invoice.delivery_charge || 0}
            discountAmount={invoice.discount_amount || 0}
            couponCode={invoice.coupon_code}
            total={invoice.total}
            status={invoice.status}
          />
        </div>
      </div>
    </div>
  )
}
