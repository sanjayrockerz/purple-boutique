import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { CalendarDays, CheckCircle2, Clock3, Download, Eye, FileText, IndianRupee, MessageCircle, PackageCheck, Plus, Printer, RefreshCw, Search, X } from 'lucide-react'
import { isSupabaseConfigured } from '../lib/supabase'
import { formatCurrency } from '../lib/retail'
import { invoicePdfFile } from '../lib/invoicePdf'
import { printThermalReceipt } from '../lib/thermalPrint'
import { buildAdvanceDepositWhatsAppMessage, buildProfessionalWhatsAppMessage, publicInvoiceUrl } from '../lib/whatsappMessage'
import { toWhatsAppUrl } from '../lib/phone'
import { advanceReceiptPdf, downloadFile, printAdvanceReceipt } from '../lib/advanceReceipt'
import { useAdminAuthStore, useProductStore } from '../store/store'
import {
  addAdvanceEvent, completeAdvanceOrder, createAdvanceOrder, getAdvanceOrderHistory, listAdvanceOrders, updateAdvanceStatus,
  type AdvanceOrder, type AdvancePayment, type AdvancePaymentMethod, type AdvanceStatus, type AdvanceTimeline,
} from '../services/advanceOrderService'

type DateFilter = 'all' | 'today' | 'week' | 'month'
type StatusFilter = 'all' | 'pending' | 'ready' | 'completed' | 'cancelled'

const STATUS_LABELS: Record<AdvanceStatus, string> = {
  pending_deposit: 'Pending Deposit', ready_for_delivery: 'Ready for Delivery', waiting_final_payment: 'Waiting for Final Payment', completed: 'Completed', cancelled: 'Cancelled',
}
const STATUS_STYLES: Record<AdvanceStatus, string> = {
  pending_deposit: 'bg-amber-50 text-amber-700 border-amber-200', ready_for_delivery: 'bg-blue-50 text-blue-700 border-blue-200',
  waiting_final_payment: 'bg-violet-50 text-violet-700 border-violet-200', completed: 'bg-emerald-50 text-emerald-700 border-emerald-200', cancelled: 'bg-red-50 text-red-700 border-red-200',
}
const initialForm = { customerName: '', phone: '', address: '', productName: '', category: '', description: '', totalAmount: '', depositAmount: '', expectedDeliveryDate: '', status: 'pending_deposit' as AdvanceStatus, remarks: '', paymentMethod: 'cash' as AdvancePaymentMethod }
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

type AdvanceOrdersProps = {
  onOrderCompleted?: (order?: AdvanceOrder) => void
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-[#6B7280]">{label}</span>{children}</label> }
const inputClass = 'w-full rounded-xl border border-[#E5E7EB] bg-white px-3.5 py-2.5 text-sm text-[#273126] outline-none transition focus:border-[#7e22ce] focus:ring-2 focus:ring-violet-100'

export default function AdvanceOrders({ onOrderCompleted }: AdvanceOrdersProps = {}) {
  const role = useAdminAuthStore(state => state.role)
  const products = useProductStore(state => state.products)
  const [orders, setOrders] = useState<AdvanceOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [selected, setSelected] = useState<AdvanceOrder | null>(null)
  const [timeline, setTimeline] = useState<AdvanceTimeline[]>([])
  const [payments, setPayments] = useState<AdvancePayment[]>([])
  const [paymentOrder, setPaymentOrder] = useState<AdvanceOrder | null>(null)
  const [paymentForm, setPaymentForm] = useState({ method: 'cash' as AdvancePaymentMethod, remarks: '' })

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setOrders(await listAdvanceOrders()) } catch (err) { setError(err instanceof Error ? err.message : 'Unable to load advance orders') } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const openDetails = async (order: AdvanceOrder) => {
    setSelected(order); setTimeline([]); setPayments([])
    try { const history = await getAdvanceOrderHistory(order.id); setTimeline(history.timeline); setPayments(history.payments) } catch (err) { setError(err instanceof Error ? err.message : 'Unable to load order details') }
  }

  const analytics = useMemo(() => ({
    total: orders.length,
    pending: orders.filter(o => o.status === 'pending_deposit' || o.status === 'waiting_final_payment').length,
    deposits: orders.filter(o => o.status !== 'cancelled').reduce((sum, o) => sum + o.deposit_amount, 0),
    outstanding: orders.filter(o => !['completed', 'cancelled'].includes(o.status)).reduce((sum, o) => sum + o.remaining_balance, 0),
    ready: orders.filter(o => o.status === 'ready_for_delivery').length,
    completed: orders.filter(o => o.status === 'completed').length,
  }), [orders])

  const filtered = useMemo(() => orders.filter(order => {
    const query = search.trim().toLowerCase()
    const searchable = [order.deposit_id, order.customer_name, order.phone, order.product_name, STATUS_LABELS[order.status]].join(' ').toLowerCase()
    if (query && !searchable.includes(query)) return false
    if (statusFilter === 'pending' && !['pending_deposit', 'waiting_final_payment'].includes(order.status)) return false
    if (statusFilter === 'ready' && order.status !== 'ready_for_delivery') return false
    if (statusFilter === 'completed' && order.status !== 'completed') return false
    if (statusFilter === 'cancelled' && order.status !== 'cancelled') return false
    if (dateFilter !== 'all') {
      const created = new Date(order.created_at); const now = new Date()
      if (dateFilter === 'today' && dateKey(created) !== dateKey(now)) return false
      if (dateFilter === 'week' && created < new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)) return false
      if (dateFilter === 'month' && (created.getMonth() !== now.getMonth() || created.getFullYear() !== now.getFullYear())) return false
    }
    return true
  }), [orders, search, statusFilter, dateFilter])

  const create = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(''); setNotice('')
    const total = Number(form.totalAmount); const deposit = Number(form.depositAmount)
    if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(deposit) || deposit <= 0 || deposit >= total) { setError('Deposit must be greater than ₹0 and less than the total order amount.'); setSaving(false); return }
    try {
      const created = await createAdvanceOrder({ ...form, totalAmount: total, depositAmount: deposit, createdByName: role || 'Staff', products: [{ name: form.productName, category: form.category, description: form.description, quantity: 1, base_price: total, line_total: total, unit: 'piece', unit_type: 'unit', source: 'advance_order' }] })
      setOrders(current => [created, ...current]); setForm(initialForm); setCreateOpen(false); setNotice(`${created.deposit_id} created. Deposit is tracked separately and has not been added to revenue.`)

      // Redirect to WhatsApp with advance deposit receipt
      const advanceMsg = buildAdvanceDepositWhatsAppMessage({
        customerName: created.customer_name,
        depositId: created.deposit_id,
        productName: created.product_name,
        totalAmount: created.total_amount,
        depositAmount: created.deposit_amount,
        remainingBalance: created.remaining_balance,
        expectedDeliveryDate: created.expected_delivery_date,
        paymentMethod: form.paymentMethod,
      })
      window.open(toWhatsAppUrl(created.phone, advanceMsg), '_blank', 'noopener,noreferrer')
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to create advance order') } finally { setSaving(false) }
  }

  const changeStatus = async (order: AdvanceOrder, status: AdvanceStatus) => {
    if (status === 'completed') { setPaymentOrder(order); return }
    try { const updated = await updateAdvanceStatus(order.id, status); setOrders(rows => rows.map(row => row.id === order.id ? updated : row)); if (selected?.id === order.id) void openDetails(updated) } catch (err) { setError(err instanceof Error ? err.message : 'Unable to update status') }
  }

  const receivePayment = async (event: FormEvent) => {
    event.preventDefault(); if (!paymentOrder) return; setSaving(true); setError('')
    try {
      const result = await completeAdvanceOrder(paymentOrder.id, paymentForm.method, paymentForm.remarks)
      const completed: AdvanceOrder = { ...paymentOrder, status: 'completed', remaining_balance: paymentOrder.remaining_balance, completed_at: result.completed_at, completed_order_id: result.order_id, invoice_number: result.invoice_no, final_payment_method: paymentForm.method }
      setOrders(rows => rows.map(row => row.id === completed.id ? completed : row)); onOrderCompleted?.(completed); setPaymentOrder(null); setPaymentForm({ method: 'cash', remarks: '' }); setNotice(`${result.invoice_no} generated once. The full ${formatCurrency(completed.total_amount)} is now recognized as revenue.`)

      // Redirect to WhatsApp with final invoice URL + Instagram + Feedback form
      whatsappInvoice(completed)
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to complete payment') } finally { setSaving(false) }
  }

  const productRows = (order: AdvanceOrder) => order.products.length ? order.products : [{ name: order.product_name, quantity: 1, base_price: order.total_amount, line_total: order.total_amount, unit: 'piece', unit_type: 'unit' }]
  const invoiceFile = (order: AdvanceOrder) => invoicePdfFile({ invoiceNo: order.invoice_number || order.deposit_id, date: order.completed_at || new Date().toISOString(), customerName: order.customer_name, phone: order.phone, address: order.address, items: productRows(order), subtotal: order.total_amount, shipping: 0, total: order.total_amount, paymentMode: order.final_payment_method || 'Paid' })
  const printFinal = (order: AdvanceOrder) => printThermalReceipt({ invoiceNo: order.invoice_number || order.deposit_id, date: order.completed_at || new Date().toISOString(), customerName: order.customer_name, phone: order.phone, items: productRows(order).map(item => ({ name: String(item.name || 'Product'), qty: Number(item.quantity || 1), unit: String(item.unit || 'piece'), price: Number(item.base_price || 0), line_total: Number(item.line_total || 0) })), subtotal: order.total_amount, shipping: 0, total: order.total_amount })
  
  const whatsappDepositReceipt = (order: AdvanceOrder) => {
    const message = buildAdvanceDepositWhatsAppMessage({
      customerName: order.customer_name,
      depositId: order.deposit_id,
      productName: order.product_name,
      totalAmount: order.total_amount,
      depositAmount: order.deposit_amount,
      remainingBalance: order.remaining_balance,
      expectedDeliveryDate: order.expected_delivery_date,
    })
    window.open(toWhatsAppUrl(order.phone, message), '_blank', 'noopener,noreferrer')
  }

  const whatsappInvoice = (order: AdvanceOrder) => {
    const invNum = order.invoice_number || order.deposit_id
    const message = buildProfessionalWhatsAppMessage({
      customerName: order.customer_name,
      phone: order.phone,
      invoiceNumber: invNum,
      invoiceUrl: publicInvoiceUrl(invNum),
    })
    window.open(toWhatsAppUrl(order.phone, message), '_blank', 'noopener,noreferrer')
  }

  const addEvent = async (order: AdvanceOrder, eventType: string, label: string) => {
    try { await addAdvanceEvent(order.id, eventType, label); await openDetails(order); setNotice(`${label} added to ${order.deposit_id}.`) } catch (err) { setError(err instanceof Error ? err.message : 'Unable to add timeline event') }
  }

  const cards = [
    ['Total Deposits', analytics.total, FileText, 'text-violet-700 bg-violet-50'], ['Pending Deposit Orders', analytics.pending, Clock3, 'text-amber-700 bg-amber-50'],
    ['Total Deposit Amount', formatCurrency(analytics.deposits), IndianRupee, 'text-fuchsia-700 bg-fuchsia-50'], ['Outstanding Balance', formatCurrency(analytics.outstanding), IndianRupee, 'text-red-700 bg-red-50'],
    ['Ready For Collection', analytics.ready, PackageCheck, 'text-blue-700 bg-blue-50'], ['Completed Deposit Orders', analytics.completed, CheckCircle2, 'text-emerald-700 bg-emerald-50'],
  ] as const

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.18em] text-violet-600">Separate from sales</p><h2 className="text-2xl font-black text-[#273126]">Advance Orders</h2><p className="mt-1 text-sm text-[#6B7280]">Deposits never count as revenue. Full order value is recognized only after final payment.</p></div><div className="flex gap-2"><button onClick={() => void load()} className="rounded-xl border bg-white p-3 text-[#647064]" title="Refresh"><RefreshCw size={18}/></button><button onClick={() => setCreateOpen(true)} className="flex items-center gap-2 rounded-xl bg-[#7e22ce] px-4 py-3 text-sm font-black text-white shadow"><Plus size={18}/> Create Advance Order</button></div></div>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}
    {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{notice}</div>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{cards.map(([label, value, Icon, color]) => <div key={label} className="rounded-2xl border border-[#ECE9E2] bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-[11px] font-black uppercase tracking-wide text-[#879086]">{label}</p><p className="mt-2 text-2xl font-black text-[#273126]">{value}</p></div><div className={`rounded-xl p-3 ${color}`}><Icon size={21}/></div></div></div>)}</div>
    <div className="rounded-2xl border border-[#ECE9E2] bg-white p-4 shadow-sm"><div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]"><label className="relative"><Search className="absolute left-3 top-3 text-[#9CA3AF]" size={17}/><input className={`${inputClass} pl-10`} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search Deposit ID, customer, phone, product or status"/></label><div className="flex flex-wrap gap-2">{(['all','pending','ready','completed','cancelled'] as StatusFilter[]).map(value => <button key={value} onClick={() => setStatusFilter(value)} className={`rounded-lg px-3 py-2 text-xs font-black capitalize ${statusFilter === value ? 'bg-[#7e22ce] text-white' : 'bg-[#F5F3F7] text-[#626B61]'}`}>{value}</button>)}</div><select className={inputClass} value={dateFilter} onChange={e => setDateFilter(e.target.value as DateFilter)}><option value="all">All Dates</option><option value="today">Today</option><option value="week">This Week</option><option value="month">This Month</option></select></div></div>
    <div className="overflow-hidden rounded-2xl border border-[#ECE9E2] bg-white shadow-sm"><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-[#F8F7F4] text-[10px] font-black uppercase tracking-wide text-[#737B72]"><tr>{['Deposit ID / Created','Customer','Product','Total / Deposit / Balance','Delivery','Status','Actions'].map(h => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead><tbody className="divide-y divide-[#F0EEE9]">{loading ? <tr><td colSpan={7} className="px-4 py-12 text-center text-[#6B7280]">Loading advance orders...</td></tr> : filtered.length === 0 ? <tr><td colSpan={7} className="px-4 py-12 text-center text-[#6B7280]">No advance orders match these filters.</td></tr> : filtered.map(order => <tr key={order.id} className="hover:bg-violet-50/30"><td className="px-4 py-3"><p className="font-black text-violet-700">{order.deposit_id}</p><p className="text-[11px] text-[#8B9389]">{new Date(order.created_at).toLocaleDateString('en-IN')} - {new Date(order.created_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</p></td><td className="px-4 py-3"><p className="font-bold text-[#273126]">{order.customer_name}</p><p className="text-xs text-[#727970]">{order.phone}</p></td><td className="max-w-[190px] px-4 py-3"><p className="truncate font-semibold">{order.product_name}</p><p className="truncate text-xs text-[#858C83]">{order.category || 'Uncategorised'}</p></td><td className="px-4 py-3 text-xs"><p>Total <b>{formatCurrency(order.total_amount)}</b></p><p className="text-violet-700">Paid <b>{formatCurrency(order.deposit_amount)}</b></p><p className="text-red-600">Balance <b>{formatCurrency(order.remaining_balance)}</b></p></td><td className="px-4 py-3"><div className="flex items-center gap-1.5"><CalendarDays size={14}/>{new Date(`${order.expected_delivery_date}T00:00:00`).toLocaleDateString('en-IN')}</div></td><td className="px-4 py-3"><select disabled={order.status === 'completed'} value={order.status} onChange={e => void changeStatus(order, e.target.value as AdvanceStatus)} className={`rounded-lg border px-2 py-1.5 text-xs font-black ${STATUS_STYLES[order.status]}`}><option value="pending_deposit">Pending Deposit</option><option value="ready_for_delivery">Ready for Delivery</option><option value="waiting_final_payment">Waiting for Final Payment</option><option value="completed">Completed (receive payment)</option><option value="cancelled">Cancelled</option></select></td><td className="px-4 py-3"><div className="flex flex-wrap gap-1.5"><button onClick={() => void openDetails(order)} className="rounded-lg bg-[#F4F2F6] p-2 text-violet-700" title="Details"><Eye size={16}/></button>{order.status !== 'completed' && order.status !== 'cancelled' && <button onClick={() => setPaymentOrder(order)} className="rounded-lg bg-emerald-600 px-2.5 py-2 text-[11px] font-black text-white">Receive Balance</button>}{order.status !== 'completed' && <><button onClick={() => printAdvanceReceipt(order)} className="rounded-lg bg-amber-50 p-2 text-amber-700" title="Print advance receipt"><Printer size={16}/></button><button onClick={() => downloadFile(advanceReceiptPdf(order))} className="rounded-lg bg-amber-50 p-2 text-amber-700" title="Download advance receipt"><Download size={16}/></button><button onClick={() => whatsappDepositReceipt(order)} className="rounded-lg bg-emerald-50 p-2 text-emerald-700" title="WhatsApp advance receipt"><MessageCircle size={16}/></button></>}{order.status === 'completed' && <><button onClick={() => downloadFile(invoiceFile(order))} className="rounded-lg bg-violet-50 p-2 text-violet-700" title="PDF invoice"><Download size={16}/></button><button onClick={() => printFinal(order)} className="rounded-lg bg-violet-50 p-2 text-violet-700" title="Print receipt"><Printer size={16}/></button><button onClick={() => whatsappInvoice(order)} className="rounded-lg bg-emerald-50 p-2 text-emerald-700" title="WhatsApp invoice"><MessageCircle size={16}/></button></>}</div></td></tr>)}</tbody></table></div></div>

    {createOpen && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4"><form onSubmit={create} className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"><div className="mb-5 flex items-center justify-between"><div><h3 className="text-xl font-black">Create Advance Order</h3><p className="text-xs text-amber-700">Creates an advance receipt only - no revenue or final invoice.</p></div><button type="button" onClick={() => setCreateOpen(false)}><X/></button></div><div className="grid gap-4 md:grid-cols-2"><Field label="Customer Name *"><input required className={inputClass} value={form.customerName} onChange={e=>setForm({...form,customerName:e.target.value})}/></Field><Field label="Phone Number *"><input required className={inputClass} value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></Field><Field label="Address"><textarea className={inputClass} value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/></Field><Field label="Product Name *"><input required list="advance-products" className={inputClass} value={form.productName} onChange={e=>{const product=products.find(p=>p.name===e.target.value);setForm({...form,productName:e.target.value,category:product?.category||form.category})}}/><datalist id="advance-products">{products.map(p=><option key={p.id} value={p.name}/>)}</datalist></Field><Field label="Category"><input className={inputClass} value={form.category} onChange={e=>setForm({...form,category:e.target.value})}/></Field><Field label="Description"><textarea className={inputClass} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></Field><Field label="Total Order Amount *"><input required min="0.01" step="0.01" type="number" className={inputClass} value={form.totalAmount} onChange={e=>setForm({...form,totalAmount:e.target.value})}/></Field><Field label="Deposit Amount Received *"><input required min="0" step="0.01" type="number" className={inputClass} value={form.depositAmount} onChange={e=>setForm({...form,depositAmount:e.target.value})}/></Field><Field label="Remaining Balance (automatic)"><div className="rounded-xl bg-violet-50 px-4 py-3 font-black text-violet-800">{formatCurrency(Math.max(0, Number(form.totalAmount||0)-Number(form.depositAmount||0)))}</div></Field><Field label="Deposit Payment Method"><select className={inputClass} value={form.paymentMethod} onChange={e=>setForm({...form,paymentMethod:e.target.value as AdvancePaymentMethod})}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option></select></Field><Field label="Expected Delivery Date *"><input required type="date" className={inputClass} value={form.expectedDeliveryDate} onChange={e=>setForm({...form,expectedDeliveryDate:e.target.value})}/></Field><Field label="Order Status"><select disabled className={inputClass} value="pending_deposit"><option value="pending_deposit">Pending Deposit</option></select></Field><div className="md:col-span-2"><Field label="Remarks"><textarea className={inputClass} value={form.remarks} onChange={e=>setForm({...form,remarks:e.target.value})}/></Field></div></div><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={()=>setCreateOpen(false)} className="rounded-xl border px-5 py-2.5 font-bold">Cancel</button><button disabled={saving} className="rounded-xl bg-[#7e22ce] px-5 py-2.5 font-black text-white disabled:opacity-50">{saving?'Creating...':'Create & Save Advance Receipt'}</button></div></form></div>}

    {paymentOrder && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4"><form onSubmit={receivePayment} className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"><div className="mb-4 flex justify-between"><div><p className="text-xs font-black text-violet-600">{paymentOrder.deposit_id}</p><h3 className="text-xl font-black">Receive Remaining Payment</h3></div><button type="button" onClick={()=>setPaymentOrder(null)}><X/></button></div><div className="mb-5 rounded-2xl bg-emerald-50 p-5 text-center"><p className="text-xs font-black uppercase text-emerald-700">Remaining Amount</p><p className="mt-1 text-3xl font-black text-emerald-800">{formatCurrency(paymentOrder.remaining_balance)}</p></div><div className="space-y-4"><Field label="Payment Method"><select className={inputClass} value={paymentForm.method} onChange={e=>setPaymentForm({...paymentForm,method:e.target.value as AdvancePaymentMethod})}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option></select></Field><Field label="Remarks"><textarea className={inputClass} value={paymentForm.remarks} onChange={e=>setPaymentForm({...paymentForm,remarks:e.target.value})}/></Field></div><p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800">Confirmation marks the order Completed, creates one official invoice, and recognizes the full {formatCurrency(paymentOrder.total_amount)} as revenue.</p><button disabled={saving} className="mt-5 w-full rounded-xl bg-emerald-600 py-3 font-black text-white disabled:opacity-50">{saving?'Processing...':'Confirm Final Payment'}</button></form></div>}

    {selected && <div className="fixed inset-0 z-[75] flex justify-end bg-black/45"><div className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-xs font-black text-violet-600">{selected.deposit_id}</p><h3 className="text-2xl font-black">Order Details</h3></div><button onClick={()=>setSelected(null)}><X/></button></div><div className="mt-5 grid grid-cols-2 gap-3">{[['Customer',selected.customer_name],['Phone',selected.phone],['Address',selected.address||'-'],['Product',selected.product_name],['Category',selected.category||'-'],['Total',formatCurrency(selected.total_amount)],['Deposit Paid',formatCurrency(selected.deposit_amount)],['Remaining Balance',formatCurrency(selected.remaining_balance)],['Delivery Date',new Date(`${selected.expected_delivery_date}T00:00:00`).toLocaleDateString('en-IN')],['Created Date',new Date(selected.created_at).toLocaleDateString('en-IN')],['Created Time',new Date(selected.created_at).toLocaleTimeString('en-IN')],['Created By',selected.created_by_name||'-'],['Current Status',STATUS_LABELS[selected.status]],['Invoice Number',selected.invoice_number||'Not generated']].map(([k,v])=><div key={k} className="rounded-xl bg-[#F8F7F4] p-3"><p className="text-[10px] font-black uppercase text-[#858C83]">{k}</p><p className="mt-1 break-words text-sm font-bold">{v}</p></div>)}</div>{selected.description&&<div className="mt-3 rounded-xl border p-3"><p className="text-[10px] font-black uppercase text-[#858C83]">Description</p><p className="text-sm">{selected.description}</p></div>}<div className="mt-6"><h4 className="font-black">Quick Timeline Updates</h4><div className="mt-2 flex flex-wrap gap-2">{[['tailoring_started','Tailoring Started'],['tailoring_completed','Tailoring Completed'],['customer_contacted','Customer Contacted'],['delivered','Delivered']].map(([type,label])=><button key={type} onClick={()=>void addEvent(selected,type,label)} className="rounded-lg border border-violet-200 px-3 py-2 text-xs font-black text-violet-700">+ {label}</button>)}</div></div><div className="mt-6"><h4 className="font-black">Payment History</h4><div className="mt-2 space-y-2">{payments.map(payment=><div key={payment.id} className="flex justify-between rounded-xl bg-emerald-50 p-3 text-sm"><span className="font-bold capitalize">{payment.payment_type} - {payment.payment_method}</span><span className="font-black">{formatCurrency(Number(payment.amount))}</span></div>)}</div></div><div className="mt-6"><h4 className="font-black">Order Timeline</h4><div className="mt-3 border-l-2 border-violet-200 pl-4">{timeline.map(event=><div key={event.id} className="relative pb-5 before:absolute before:-left-[21px] before:top-1 before:h-3 before:w-3 before:rounded-full before:bg-violet-600"><p className="text-sm font-black">{event.label}</p><p className="text-xs text-[#81887F]">{new Date(event.created_at).toLocaleString('en-IN')}</p>{event.remarks&&<p className="mt-1 text-xs">{event.remarks}</p>}</div>)}</div></div></div></div>}
  </div>
}
