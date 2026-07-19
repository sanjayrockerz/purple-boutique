import { supabase } from '../lib/supabase'

export type AdvanceStatus = 'pending_deposit' | 'ready_for_delivery' | 'waiting_final_payment' | 'completed' | 'cancelled'
export type AdvancePaymentMethod = 'cash' | 'upi' | 'card'

export type AdvanceOrder = {
  id: string
  deposit_id: string
  customer_name: string
  phone: string
  address: string
  product_name: string
  category: string
  description: string
  total_amount: number
  deposit_amount: number
  remaining_balance: number
  expected_delivery_date: string
  status: AdvanceStatus
  remarks: string
  created_by_name: string
  created_at: string
  updated_at: string
  completed_at: string | null
  completed_order_id: string | null
  invoice_number: string | null
  final_payment_method: string | null
}

export type AdvanceTimeline = { id: number; advance_order_id: string; event_type: string; label: string; remarks: string; created_at: string }
export type AdvancePayment = { id: string; advance_order_id: string; payment_type: 'deposit' | 'remaining'; amount: number; payment_method: string; remarks: string; received_at: string }

const normalizeOrder = (row: Record<string, unknown>): AdvanceOrder => ({
  ...row,
  id: String(row.id || ''), deposit_id: String(row.deposit_id || ''), customer_name: String(row.customer_name || ''),
  phone: String(row.phone || ''), address: String(row.address || ''), product_name: String(row.product_name || ''),
  category: String(row.category || ''), description: String(row.description || ''), total_amount: Number(row.total_amount || 0),
  deposit_amount: Number(row.deposit_amount || 0), remaining_balance: Number(row.remaining_balance || 0),
  expected_delivery_date: String(row.expected_delivery_date || ''), status: String(row.status || 'pending_deposit') as AdvanceStatus,
  remarks: String(row.remarks || ''), created_by_name: String(row.created_by_name || ''), created_at: String(row.created_at || ''),
  updated_at: String(row.updated_at || ''), completed_at: row.completed_at ? String(row.completed_at) : null,
  completed_order_id: row.completed_order_id ? String(row.completed_order_id) : null,
  invoice_number: row.invoice_number ? String(row.invoice_number) : null,
  final_payment_method: row.final_payment_method ? String(row.final_payment_method) : null,
}) as AdvanceOrder

const fail = (error: { message?: string } | null, fallback: string) => {
  if (error) throw new Error(error.message || fallback)
}
const rpcRow = (data: unknown) => (Array.isArray(data) ? data[0] : data) as Record<string, unknown>

export async function listAdvanceOrders() {
  const { data, error } = await supabase.from('advance_orders').select('*').order('created_at', { ascending: false })
  fail(error, 'Unable to load advance orders')
  return (data || []).map(row => normalizeOrder(row as Record<string, unknown>))
}

export async function getAdvanceOrderHistory(orderId: string) {
  const [timeline, payments] = await Promise.all([
    supabase.from('advance_order_timeline').select('*').eq('advance_order_id', orderId).order('created_at'),
    supabase.from('advance_order_payments').select('*').eq('advance_order_id', orderId).order('received_at'),
  ])
  fail(timeline.error, 'Unable to load timeline'); fail(payments.error, 'Unable to load payments')
  return { timeline: (timeline.data || []) as AdvanceTimeline[], payments: (payments.data || []) as AdvancePayment[] }
}

export async function createAdvanceOrder(input: {
  customerName: string; phone: string; address: string; productName: string; category: string; description: string
  totalAmount: number; depositAmount: number; expectedDeliveryDate: string; remarks: string
  paymentMethod: AdvancePaymentMethod; createdByName: string
}) {
  const { data, error } = await supabase.rpc('create_advance_order', {
    p_customer_name: input.customerName, p_phone: input.phone, p_address: input.address, p_product_name: input.productName,
    p_category: input.category, p_description: input.description, p_total_amount: input.totalAmount,
    p_deposit_amount: input.depositAmount, p_expected_delivery_date: input.expectedDeliveryDate, p_remarks: input.remarks,
    p_payment_method: input.paymentMethod, p_created_by_name: input.createdByName,
  })
  fail(error, 'Unable to create advance order')
  return normalizeOrder(rpcRow(data || {}))
}

export async function updateAdvanceStatus(orderId: string, status: AdvanceStatus, remarks = '') {
  const { data, error } = await supabase.rpc('update_advance_order_status', { p_order_id: orderId, p_status: status, p_remarks: remarks })
  fail(error, 'Unable to update status')
  return normalizeOrder(rpcRow(data || {}))
}

export async function addAdvanceEvent(orderId: string, eventType: string, label: string, remarks = '') {
  const { error } = await supabase.rpc('add_advance_order_event', { p_order_id: orderId, p_event_type: eventType, p_label: label, p_remarks: remarks })
  fail(error, 'Unable to add timeline event')
}

export async function completeAdvanceOrder(orderId: string, paymentMethod: AdvancePaymentMethod, remarks = '') {
  const { data, error } = await supabase.rpc('complete_advance_order', { p_order_id: orderId, p_payment_method: paymentMethod, p_remarks: remarks })
  fail(error, 'Unable to receive final payment')
  const row = Array.isArray(data) ? data[0] : data
  return row as { order_id: string; invoice_no: string; completed_at: string }
}
