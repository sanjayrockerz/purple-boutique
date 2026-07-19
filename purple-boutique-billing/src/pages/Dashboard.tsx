import React, { useCallback, useEffect, useState, useMemo, useRef, type FormEvent } from 'react'
import {
  BarChart2, Trash2, Edit2, List, ShoppingCart, LayoutDashboard,
  Box, AlertCircle, ArrowUp, ArrowDown, Power, Download, TrendingUp,
  Package, BadgeDollarSign, Search, RefreshCw, ShieldCheck, ShieldOff, Trophy,
  MessageCircle, ChevronDown, Eye, FileText, Printer, MoreVertical, X,
} from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { debounce } from '../lib/debounce'
import { useAuthStore, useProductStore, useAdminAuthStore, type Product } from '../store/store'
import { uploadProductImage } from '../lib/storage'
import { formatCurrency, normalizeOrderMode, normalizeUnitType, toNumber, type UnitType } from '../lib/retail'
import { normalizeStructuredOrderItem } from '../lib/retail'
import { Invoice } from '../components/Invoice'
import { printThermalReceipt } from '../lib/thermalPrint'
import { buildProfessionalWhatsAppMessage } from '../lib/whatsappMessage'
import { invoicePdfFile } from '../lib/invoicePdf'
// toWhatsAppUrl removed - using direct link building in handlers
import { createVariant, updateVariant, deleteVariant, setDefaultVariant, type ProductVariant } from '../services/variantService'
import { useVariantStore } from '../store/store'
import Pos from './Pos'
import AdvanceOrders from './AdvanceOrders'
import type { AdvanceOrder } from '../services/advanceOrderService'
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  BarChart,
  Bar,
} from 'recharts'

type Category = { id: string | number; name_en: string; name_ta: string; is_active?: boolean; sort_order?: number }
type DashboardOrder = {
  id: string; invoice_no: string; customer_name: string; phone: string; address: string
  created_at: string; total: number; status: string; order_mode: string; order_type: string; user_id: string | null; items: unknown
  coupon_code: string; discount_amount: number; manual_discount_amount: number; delivery_charge: number
  total_gst: number; payment_mode: string; payment_method?: string; invoice_pdf_url: string
}
type DashboardOrderItem = { order_id: string; product_name: string; category?: string; quantity: number; line_total: number; is_manual?: boolean | null }
type DashboardCoupon = {
  id: number
  code: string
  percentage: number
  is_active: boolean
  expiry_date: string | null
  usage_limit: number | null
  usage_count: number
  min_order_value: number
}
type TabKey = 'overview' | 'whatsapp' | 'pos_analytics' | 'billing' | 'advance_orders' | 'products' | 'categories' | 'coupons' | 'users' | 'history'
type PosAnalyticsTab = 'revenue' | 'today' | 'products' | 'categories' | 'coupons'
type ProfileUser = { id: string; email: string; name: string; mobile: string; role: string; created_at: string }

const normalizeStatus = (v: unknown) => String(v || '').trim().toLowerCase()
const normalizeOrderType = (v: unknown) => String(v || '').trim().toLowerCase() || 'pos_sale'
const isCompletedStatus = (v: unknown) => {
  const status = normalizeStatus(v)
  return status === 'completed' || status === 'paid'
}
const parseOrderItems = (items: unknown): Record<string, unknown>[] => {
  if (Array.isArray(items)) return items.filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
  if (typeof items === 'string') { try { const p = JSON.parse(items); return Array.isArray(p) ? p : [] } catch { return [] } }
  return []
}

const emptyForm = {
  name: '', nameTa: '', category: '', categoryId: null as string | number | null,
  remedy: [] as string[], price: 0, offerPrice: '' as string | number,
  purchasePrice: '' as string | number, mrp: '' as string | number,
  sku: '', barcode: '',
  unitType: 'unit' as UnitType, unitLabel: 'piece', baseQuantity: 1,
  stockQuantity: 100, stockUnit: 'piece', allowDecimalQuantity: false,
  predefinedOptionsText: '', isActive: true, sortOrder: 0, stock: 100,
  description: '', descriptionTa: '', benefits: '', benefitsTa: '', image: '',
  hasVariants: false,
}

const exportCSV = (orders: DashboardOrder[]) => {
  const header = ['Order Ref', 'Customer', 'Phone', 'Date', 'Total (RM)', 'Order Type', 'Status']
  const rows = orders.map(o => [
    o.order_type === 'online_request' ? o.id : o.invoice_no, o.customer_name, o.phone,
    new Date(o.created_at).toLocaleDateString('en-MY'),
    toNumber(o.total, 0).toFixed(2), o.order_type, o.status,
  ])
  const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `orders_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

const UNIT_TYPE_OPTIONS: { value: UnitType; label: string; hint: string }[] = [
  { value: 'unit',   label: 'Unit (piece)',    hint: 'e.g. Blouse, earrings, perfume' },
  { value: 'weight', label: 'Weight (g / kg)', hint: 'For weight-based boutique items' },
  { value: 'volume', label: 'Volume (ml / L)', hint: 'e.g. Perfume or liquid products' },
  { value: 'bundle', label: 'Bundle / Set',    hint: 'e.g. Pooja kit, Herbal pack' },
]

const DEFAULT_OPTIONS_FOR_TYPE: Record<UnitType, string> = {
  unit:   '',
  weight: '100g, 250g, 500g, 1kg',
  volume: '250ml, 500ml, 1L',
  bundle: '',
}

export default function Dashboard() {
  const { user } = useAuthStore()
  const { products, fetchProducts } = useProductStore()
  const location = useLocation()
  const navigate = useNavigate()
  const [tab, setTab] = useState<TabKey>(() => {
    if (location.pathname === '/whatsapp-center') return 'whatsapp'
    if (location.pathname === '/pos-analytics') return 'pos_analytics'
    if (location.pathname === '/advance-orders') return 'advance_orders'
    return 'billing'
  })
  const [posAnalyticsTab, setPosAnalyticsTab] = useState<PosAnalyticsTab>('revenue')
  const [inventorySearch, setInventorySearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [imageUploading, setImageUploading] = useState(false)
  const [productNotice, setProductNotice] = useState('')
  const [cats, setCats]     = useState<Category[]>([])
  const [orders, setOrders] = useState<DashboardOrder[]>([])
  const [orderItems, setOrderItems] = useState<DashboardOrderItem[]>([])
  const [editingProd, setEditingProd] = useState<Product | null>(null)
  const [prodForm, setProdForm] = useState(emptyForm)
  const [newCat, setNewCat] = useState({ name_en: '', name_ta: '' })
  const [editingCategoryId, setEditingCategoryId] = useState<string | number | null>(null)
  const [categoryNotice, setCategoryNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false)
  const [openCategoryMenuId, setOpenCategoryMenuId] = useState<string | number | null>(null)
  const [coupons, setCoupons] = useState<DashboardCoupon[]>([])
  const [couponForm, setCouponForm] = useState({ code: '', percentage: 10, expiry_date: '', usage_limit: '', min_order_value: '' })
  const [couponSaveError, setCouponSaveError] = useState('')
  const [couponSaveSuccess, setCouponSaveSuccess] = useState('')
  const [editingCouponId, setEditingCouponId] = useState<number | null>(null)

  // Variant management state
  const { getVariants, refetchVariants } = useVariantStore()
  const [variantForm, setVariantForm] = useState({ name: '', sizeLabel: '', price: '', purchasePrice: '', mrp: '', sku: '', barcode: '', stock: '50', weightValue: '', weightUnit: '', isDefault: false })
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null)
  const [variantNotice, setVariantNotice] = useState('')
  const [variantLoading, setVariantLoading] = useState(false)

  const [analyticsTab, setAnalyticsTab] = useState('revenue')

  const [invoicePreviewOrder, setInvoicePreviewOrder] = useState<DashboardOrder | null>(null)

  // WA detail expansion
  const [waExpandedId, setWaExpandedId] = useState<string | null>(null)

  // Search & date filter
  const [search, setSearch] = useState({ invoiceNo: '', phone: '', customerName: '', dateFrom: '', dateTo: '' })
  const [datePreset, setDatePreset] = useState<'today' | 'week' | 'month' | 'custom' | ''>('')
  const [searchResults, setSearchResults] = useState<DashboardOrder[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [todayBillsSearch, setTodayBillsSearch] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem('dashboard-sidebar-collapsed') === '1'
    } catch {
      return false
    }
  })

  // Categories are a master list. Products reference this list through
  // category_id; product text is only a legacy display fallback.
  const activeCategories = useMemo(
    () => cats.filter(category => category.is_active !== false),
    [cats]
  )

  // Analytics global date filter
  const [analyticsDatePreset, setAnalyticsDatePreset] = useState<'all' | 'today' | 'week' | 'month' | 'year' | 'custom'>('all')
  const [analyticsDateFrom, setAnalyticsDateFrom] = useState('')
  const [analyticsDateTo, setAnalyticsDateTo] = useState('')

  // Order Management bill type filter
  const [billTypeFilter, setBillTypeFilter] = useState<'all' | 'offline' | 'online' | 'manual'>('all')

  // Users tab
  const [allUsers, setAllUsers] = useState<ProfileUser[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState('')
  const [userSearch, setUserSearch] = useState('')
  const [roleUpdating, setRoleUpdating] = useState<string | null>(null)

  const isAdmin = true // bypassed for local demo
  const l = (en: string, _ta?: string) => en

  const toErr = (err: unknown, fb: string) =>
    err instanceof Error ? err.message
    : (err && typeof err === 'object' && 'message' in err) ? String((err as {message?:unknown}).message) || fb : fb

  const handleTabClick = (tabKey: TabKey) => {
    setTab(tabKey)
  }

  const toDashboardOrder = (row: Record<string, unknown>): DashboardOrder => ({
    id: String(row.id || ''), invoice_no: String(row.invoice_no || ''),
    customer_name: String(row.customer_name || ''), phone: String(row.phone || ''),
    address: String(row.address || ''),
    created_at: String(row.created_at || ''), total: toNumber(row.total, 0),
    status: String(row.status || 'pending'),
    order_mode: normalizeOrderMode(row.order_mode),
    order_type: normalizeOrderType(row.order_type),
    user_id: typeof row.user_id === 'string' ? row.user_id : null,
    items: row.items,
    coupon_code: String(row.coupon_code || ''),
    discount_amount: toNumber(row.discount_amount, 0),
    manual_discount_amount: toNumber(row.manual_discount_amount, 0),
    delivery_charge: toNumber(row.delivery_charge, 0),
    total_gst: toNumber(row.total_gst ?? row.gst_amount, 0),
    payment_mode: String(row.payment_mode || row.payment_method || ''),
    invoice_pdf_url: String(row.invoice_pdf_url || ''),
  })

  const handleAdvanceOrderCompleted = useCallback((advance: AdvanceOrder) => {
    if (!advance.completed_order_id || !advance.invoice_number) return
    const createdAt = advance.completed_at || new Date().toISOString()
    const item = {
      name: advance.product_name,
      category: advance.category,
      quantity: 1,
      base_price: advance.total_amount,
      line_total: advance.total_amount,
      unit: 'piece',
      unit_type: 'unit',
      source: 'advance_order',
    }
    const completed: DashboardOrder = {
      id: advance.completed_order_id,
      invoice_no: advance.invoice_number,
      customer_name: advance.customer_name,
      phone: advance.phone,
      address: advance.address,
      created_at: createdAt,
      total: advance.total_amount,
      status: 'completed',
      order_mode: 'offline',
      order_type: 'advance_order',
      user_id: user?.id || null,
      items: [item],
      coupon_code: '',
      discount_amount: 0,
      manual_discount_amount: 0,
      delivery_charge: 0,
      total_gst: 0,
      payment_mode: advance.final_payment_method || '',
      payment_method: advance.final_payment_method || '',
      invoice_pdf_url: '',
    }
    setOrders(current => [completed, ...current.filter(order => order.id !== completed.id)])
    setSearchResults(current => [completed, ...current.filter(order => order.id !== completed.id)].slice(0, 100))
    setOrderItems(current => [{ order_id: completed.id, product_name: advance.product_name, category: advance.category, quantity: 1, line_total: advance.total_amount, is_manual: false }, ...current.filter(row => row.order_id !== completed.id)])
  }, [user?.id])

  // Analytics (date-aware)
  const analytics = useMemo(() => {
    // Apply global date filter
    let dated = orders
    if (analyticsDateFrom) dated = dated.filter(o => o.created_at >= `${analyticsDateFrom}T00:00:00`)
    if (analyticsDateTo)   dated = dated.filter(o => o.created_at <= `${analyticsDateTo}T23:59:59`)

    // Classify
    const nonCancelled = dated.filter(o => normalizeStatus(o.status) !== 'cancelled')
    const completedOrders = nonCancelled.filter(o => isCompletedStatus(o.status))
    const pendingOrders   = nonCancelled.filter(o => normalizeStatus(o.status) === 'pending')

    // WhatsApp = online_request type (all statuses, no revenue)
    const waOrders = dated.filter(o => normalizeOrderType(o.order_type) === 'online_request')

    // Billable = completed and NOT online_request
    const billableCompleted = completedOrders.filter(o => normalizeOrderType(o.order_type) !== 'online_request')
    // The trend charts are fixed calendar views. The period selector filters
    // KPIs/tables, but must not change the year/week bars underneath them.
    const allBillableCompleted = orders
      .filter(o => normalizeStatus(o.status) !== 'cancelled')
      .filter(o => isCompletedStatus(o.status))
      .filter(o => normalizeOrderType(o.order_type) !== 'online_request')
    // Channel is determined by order_mode. Older orders can use a different
    // order_type, so requiring exactly `pos_sale` hides valid online bills.
    const offlinePOS  = billableCompleted.filter(o => normalizeOrderMode(o.order_mode) === 'offline' && normalizeOrderType(o.order_type) !== 'manual_sale')
    const onlinePOS   = billableCompleted.filter(o => normalizeOrderMode(o.order_mode) === 'online')
    const manualSales = billableCompleted.filter(o => normalizeOrderType(o.order_type) === 'manual_sale')

    // Revenue (WhatsApp never included)
    const completedRevenue   = billableCompleted.reduce((s, o) => s + toNumber(o.total, 0), 0)
    const averageRevenuePerBill = billableCompleted.length > 0 ? completedRevenue / billableCompleted.length : 0
    const posRevenue         = offlinePOS.reduce((s, o) => s + toNumber(o.total, 0), 0)
    const onlinePosRevenue   = onlinePOS.reduce((s, o) => s + toNumber(o.total, 0), 0)
    const manualRevenue      = manualSales.reduce((s, o) => s + toNumber(o.total, 0), 0)

    const toLocalDateKey = (value: string | Date) => {
      const date = value instanceof Date ? value : new Date(value)
      if (Number.isNaN(date.getTime())) return ''
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
    const toLocalMonthKey = (value: string | Date) => toLocalDateKey(value).slice(0, 7)

    const todayKey  = toLocalDateKey(new Date())
    const monthKey  = todayKey.slice(0, 7)
    const todaySales   = orders.filter(o => isCompletedStatus(o.status) && o.order_type !== 'whatsapp_request' && toLocalDateKey(o.created_at) === todayKey).reduce((s, o) => s + toNumber(o.total, 0), 0)

    // Today-specific analytics (for TODAY'S SALES tab)
    const todayOrders = billableCompleted.filter(o => toLocalDateKey(o.created_at) === todayKey)
    const todayCompletedOrdersCount = todayOrders.length
    const todayItemsSold = todayOrders.reduce((s, o) => {
      const items = parseOrderItems(o.items)
      return s + items.reduce((sum, item) => sum + toNumber(item.quantity ?? item.qty, 0), 0)
    }, 0)
    const todayAvgOrderValue = todayCompletedOrdersCount > 0 ? todaySales / todayCompletedOrdersCount : 0

    // Hourly trend for today
    const hourlyMap = new Map<string, number>()
    todayOrders.forEach(o => {
      const hour = String(new Date(o.created_at).getHours()).padStart(2, '0')
      hourlyMap.set(hour, (hourlyMap.get(hour) || 0) + toNumber(o.total, 0))
    })
    const todayHourlyTrend = Array.from({ length: 24 }, (_, i) => {
      const h = String(i).padStart(2, '0')
      // Use 12-hour format
      const ampm = i < 12 ? 'AM' : 'PM'
      const h12 = i === 0 ? 12 : i > 12 ? i - 12 : i
      return { hour: `${h12} ${ampm}`, key: h, revenue: hourlyMap.get(h) || 0 }
    })

    // Today's top products
    const todayProductMap = new Map<string, { name: string; qty: number; revenue: number }>()
    todayOrders.forEach(o => {
      parseOrderItems(o.items).forEach(item => {
        const name = String(item.product_name || item.name || 'Product').trim()
        const qty = toNumber(item.quantity ?? item.qty, 0)
        const rev = toNumber(item.line_total ?? item.lineTotal, 0)
        const p = todayProductMap.get(name) || { name, qty: 0, revenue: 0 }
        p.qty += qty; p.revenue += rev
        todayProductMap.set(name, p)
      })
    })
    const todayTopProducts = Array.from(todayProductMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5)
    const todayBills = todayOrders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 10)

    // Today's channel breakdown
    const todayOffline = todayOrders.filter(o => normalizeOrderType(o.order_type) === 'pos_sale' && normalizeOrderMode(o.order_mode) !== 'online')
    const todayOnline = todayOrders.filter(o => normalizeOrderType(o.order_type) === 'pos_sale' && normalizeOrderMode(o.order_mode) === 'online')
    const todayManual = todayOrders.filter(o => normalizeOrderType(o.order_type) === 'manual_sale')
    const todayOfflineRevenue = todayOffline.reduce((s, o) => s + toNumber(o.total, 0), 0)
    const todayOnlineRevenue = todayOnline.reduce((s, o) => s + toNumber(o.total, 0), 0)
    const todayManualRevenue = todayManual.reduce((s, o) => s + toNumber(o.total, 0), 0)

    // Product hourly trend (products sold per hour today)
    const productHourlyMap = new Map<string, number>()
    todayOrders.forEach(o => {
      const hour = String(new Date(o.created_at).getHours()).padStart(2, '0')
      const totalQty = parseOrderItems(o.items).reduce((s, item) => s + toNumber(item.quantity ?? item.qty, 0), 0)
      productHourlyMap.set(hour, (productHourlyMap.get(hour) || 0) + totalQty)
    })
    const todayProductHourlyTrend = Array.from({ length: 24 }, (_, i) => {
      const h = String(i).padStart(2, '0')
      const ampm = i < 12 ? 'AM' : 'PM'
      const h12 = i === 0 ? 12 : i > 12 ? i - 12 : i
      return { hour: `${h12} ${ampm}`, key: h, qty: productHourlyMap.get(h) || 0 }
    })

    const monthlyRevenue = billableCompleted.filter(o => toLocalMonthKey(o.created_at) === monthKey).reduce((s, o) => s + toNumber(o.total, 0), 0)

    // Item-level analytics
    const completedIds = new Set(billableCompleted.map(o => o.id))
    const completedItems = orderItems.length > 0
      ? orderItems.filter(item => completedIds.has(item.order_id))
      : completedOrders.flatMap(order => parseOrderItems(order.items).map(row => ({
          order_id: order.id,
          product_name: String((row as Record<string,unknown>).product_name || (row as Record<string,unknown>).name || 'Product'),
          category: String((row as Record<string,unknown>).category || ''),
          quantity: toNumber((row as Record<string,unknown>).quantity ?? (row as Record<string,unknown>).qty, 0),
          line_total: toNumber((row as Record<string,unknown>).line_total ?? (row as Record<string,unknown>).lineTotal, 0),
          is_manual: (row as Record<string,unknown>).is_manual === true || (row as Record<string,unknown>).source === 'manual',
        })))

    const productMap    = new Map<string, { name: string; variant: string; qty: number; revenue: number; billCount: number }>()
    const productOrders = new Map<string, Set<string>>()
    const categoryMap   = new Map<string, { name: string; qty: number; revenue: number }>()
    const prodCatLookup = new Map(products.map(p => [String(p.name || '').trim().toLowerCase(), p.category || 'Uncategorized']))

    let totalProductsSold = 0
    let totalManualRevenue = 0

    completedItems.forEach(({ product_name, category, quantity, line_total, order_id, is_manual }) => {
      const qty = toNumber(quantity, 0)
      const rev = toNumber(line_total, 0)
      totalProductsSold += qty

      const rawKey  = String(product_name || 'Product').trim() || 'Product'
      const dashIdx = rawKey.indexOf(' - ')
      const mainName   = dashIdx > 0 ? rawKey.slice(0, dashIdx) : rawKey
      const variantName = dashIdx > 0 ? rawKey.slice(dashIdx + 3) : ''

      const pc = productMap.get(rawKey) || { name: mainName, variant: variantName, qty: 0, revenue: 0, billCount: 0 }
      pc.qty += qty; pc.revenue += rev; productMap.set(rawKey, pc)

      if (!productOrders.has(rawKey)) productOrders.set(rawKey, new Set())
      productOrders.get(rawKey)!.add(order_id)

      const catName = category || prodCatLookup.get(mainName.toLowerCase()) || 'Uncategorized'
      const cc = categoryMap.get(catName) || { name: catName, qty: 0, revenue: 0 }
      cc.qty += qty; cc.revenue += rev; categoryMap.set(catName, cc)

      if (is_manual) totalManualRevenue += rev
    })

    for (const [key, orderSet] of productOrders) {
      const p = productMap.get(key); if (p) { p.billCount = orderSet.size; productMap.set(key, p) }
    }

    const topProducts   = Array.from(productMap.values()).sort((a, b) => b.qty - a.qty)
    const topCategories = Array.from(categoryMap.values()).sort((a, b) => b.revenue - a.revenue)
    const bestProduct   = topProducts[0]?.name || 'No sales yet'
    const bestCategory  = topCategories[0]?.name || 'No sales yet'

    // Average items per bill
    const avgItemsPerBill = billableCompleted.length > 0
      ? totalProductsSold / billableCompleted.length : 0
    const averageProductRevenue = totalProductsSold > 0
      ? completedRevenue / totalProductsSold : 0

    // Category distribution for chart
    const categoryDist = Array.from(categoryMap.entries()).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 8)
      .map(([name, data]) => ({ name, value: data.revenue }))

    // Trend charts
    const chartYear = new Date().getFullYear()
    const monthlyRevenueMap = new Map<string, number>()
    allBillableCompleted.forEach(o => {
      const k = toLocalMonthKey(o.created_at)
      monthlyRevenueMap.set(k, (monthlyRevenueMap.get(k) || 0) + toNumber(o.total, 0))
    })
    const monthlyTrend = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(chartYear, i, 1)
      const k = toLocalMonthKey(d)
      return { key: k, month: d.toLocaleDateString('en-IN', { month: 'short' }), revenue: monthlyRevenueMap.get(k) || 0 }
    })

    const weeklyRevenueMap = new Map<string, number>()
    allBillableCompleted.forEach(o => {
      const k = toLocalDateKey(o.created_at)
      weeklyRevenueMap.set(k, (weeklyRevenueMap.get(k) || 0) + toNumber(o.total, 0))
    })

    const currentDayOfWeek = new Date().getDay() || 7 // 1: Mon, ..., 7: Sun
    const mondayDate = new Date()
    mondayDate.setDate(mondayDate.getDate() - currentDayOfWeek + 1)

    const weeklySales = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(mondayDate)
      d.setDate(d.getDate() + i)
      const k = toLocalDateKey(d)
      // Force short weekday names in English to match Mon, Tue, Wed, Thu, Fri, Sat, Sun exactly
      const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(d)
      return { day: dayName, date: k, revenue: weeklyRevenueMap.get(k) || 0 }
    })

    const statusDistribution = [
      { name: 'WA Requests', value: waOrders.length, color: '#3b82f6' },
      { name: 'POS Pending', value: pendingOrders.filter(o => normalizeOrderType(o.order_type) !== 'online_request').length, color: '#f59e0b' },
      { name: 'Completed',   value: billableCompleted.length, color: '#10b981' },
    ]
    const channelDistribution = [
      { name: 'Offline Bills', value: posRevenue, color: '#f97316' },
      { name: 'Online Bills',  value: onlinePosRevenue, color: '#3b82f6' },
      { name: 'Manual Sales',  value: manualRevenue || totalManualRevenue, color: '#8b5cf6' },
    ]

    const couponMap = new Map<string, { code: string; usage: number; discounts: number }>()
    billableCompleted.forEach(order => {
      const code = String((order as Record<string,unknown>).coupon_code || '').trim(); if (!code) return
      const u = couponMap.get(code) || { code, usage: 0, discounts: 0 }
      u.usage += 1; u.discounts += toNumber((order as Record<string,unknown>).discount_amount, 0)
      couponMap.set(code, u)
    })
    const topCoupons = Array.from(couponMap.values()).sort((a, b) => b.usage - a.usage)
    const totalCouponDiscounts = topCoupons.reduce((s, c) => s + c.discounts, 0)
    const totalCouponOrders = topCoupons.reduce((s, c) => s + c.usage, 0)
    const couponUsageRate = billableCompleted.length > 0
      ? (totalCouponOrders / billableCompleted.length) * 100 : 0

    // Coupon daily trend (last 7 days)
    const couponDailyMap = new Map<string, { orders: number; discounts: number }>()
    billableCompleted.forEach(order => {
      const code = String((order as Record<string,unknown>).coupon_code || '').trim()
      if (!code) return
      const k = toLocalDateKey(order.created_at)
      const d = couponDailyMap.get(k) || { orders: 0, discounts: 0 }
      d.orders += 1
      d.discounts += toNumber((order as Record<string,unknown>).discount_amount, 0)
      couponDailyMap.set(k, d)
    })
    const couponDailyTrend = Array.from({ length: 7 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (6 - i))
      const k = toLocalDateKey(d)
      const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(d)
      const data = couponDailyMap.get(k) || { orders: 0, discounts: 0 }
      return { day: dayName, date: k, orders: data.orders, discounts: data.discounts }
    })

    // WhatsApp analytics (zero revenue - status changes never affect revenue)
    const waRequests  = waOrders.length
    const waPending   = waOrders.filter(o => normalizeStatus(o.status) === 'pending').length
    const waContacted = waOrders.filter(o => normalizeStatus(o.status) === 'contacted').length
    const waCompleted = waOrders.filter(o => isCompletedStatus(o.status)).length

    const waProductMap = new Map<string, number>()
    waOrders.forEach(order => {
      parseOrderItems(order.items).forEach(item => {
        const n = String((item as Record<string,unknown>).name || (item as Record<string,unknown>).product_name || '').trim()
        if (n) waProductMap.set(n, (waProductMap.get(n) || 0) + 1)
      })
    })
    const topWAProducts = Array.from(waProductMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([name, count]) => ({ name, count }))

    const waCategoryMap = new Map<string, number>()
    waOrders.forEach(order => {
      parseOrderItems(order.items).forEach(item => {
        const n = String((item as Record<string,unknown>).name || (item as Record<string,unknown>).product_name || '').trim()
        if (n) {
          const mainName = n.includes(' - ') ? n.split(' - ')[0] : n
          const catName = prodCatLookup.get(mainName.toLowerCase()) || 'Uncategorized'
          waCategoryMap.set(catName, (waCategoryMap.get(catName) || 0) + 1)
        }
      })
    })
    const topWACategories = Array.from(waCategoryMap.entries())
      .sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([name, count]) => ({ name, count }))

    return {
      totalCompletedRevenue: completedRevenue,
      averageRevenuePerBill,
      todaySales,
      todayCompletedOrdersCount,
      todayItemsSold,
      todayAvgOrderValue,
      todayHourlyTrend,
      todayTopProducts,
      todayBills,
      todayOfflineRevenue,
      todayOnlineRevenue,
      todayManualRevenue,
      todayProductHourlyTrend,
      avgItemsPerBill,
      averageProductRevenue,
      categoryDist,
      totalCouponDiscounts,
      totalCouponOrders,
      couponUsageRate,
      couponDailyTrend,
      pendingOrders: pendingOrders.length,
      onlineRequests: waRequests,
      onlineRequestOrders: waOrders,
      completedOrders: billableCompleted.length,
      posRevenue,
      onlinePosRevenue,
      // Keep the bill count separate from revenue so the TOTAL ONLINE BILLS
      // card stays visible and always reflects the current completed orders.
      onlineBillCount: onlinePOS.length,
      offlineOrderCount: offlinePOS.length,
      manualRevenue: manualRevenue || totalManualRevenue,
      monthlyRevenue,
      totalProductsSold,
      bestCategory,
      bestProduct,
      monthlyTrend,
      chartYear,
      channelDistribution,
      statusDistribution,
      topCoupons,
      topCategories,
      weeklySales,
      topProducts,
      waRequests,
      waPending,
      waContacted,
      waCompleted,
      topWAProducts,
      topWACategories,
    }
  }, [orders, orderItems, products, analyticsDateFrom, analyticsDateTo])

  // Bill-type filtered results for Order Management table (client-side, instant)
  const filteredSearchResults = useMemo(() => {
    if (billTypeFilter === 'all') return searchResults
    return searchResults.filter(o => {
      const type = normalizeOrderType(o.order_type)
      const mode = normalizeOrderMode(o.order_mode)
      if (billTypeFilter === 'manual')  return type === 'manual_sale'
      if (billTypeFilter === 'offline') return type === 'pos_sale' && mode !== 'online'
      if (billTypeFilter === 'online')  return type === 'pos_sale' && mode === 'online'
      return true
    })
  }, [searchResults, billTypeFilter])

  // Load dashboard data
  const loadData = useCallback(async () => {
    if (!isSupabaseConfigured) return
    setLoading(true)
    try {
      const productsPromise = fetchProducts(true)
      const [cRes, oRes, couponRes] = await Promise.all([
        supabase.from('categories').select('id, name_en, name_ta, is_active, sort_order').order('sort_order'),
        supabase.from('orders')
          .select('id, invoice_no, customer_name, phone, address, created_at, total, status, order_mode, order_type, user_id, items, coupon_code, discount_amount, manual_discount_amount, delivery_charge, total_gst, gst_amount, payment_mode, payment_method, invoice_pdf_url')
          .order('created_at', { ascending: false })
          .limit(1000),
        supabase.from('coupons')
          .select('id, code, percentage, is_active, expiry_date, usage_limit, usage_count, min_order_value')
          .order('created_at', { ascending: false }),
      ])
      if (cRes.error) throw cRes.error
      if (oRes.error) throw oRes.error
      const mappedOrders = (oRes.data || []).map(r => toDashboardOrder(r as Record<string, unknown>))
      setCats((cRes.data || []) as Category[])
      setOrders(mappedOrders)
      setSearchResults(mappedOrders.filter(o => normalizeOrderType(o.order_type) !== 'online_request').slice(0, 100))
      setCoupons((couponRes.data || []) as DashboardCoupon[])

      const orderIds = mappedOrders.map(o => o.id).filter(Boolean)
      if (orderIds.length > 0) {
        let oi: unknown[] | null = null
        let orderItemsError: unknown = null
        const orderItemsResult = await supabase
          .from('order_items').select('order_id,product_name,category,quantity,line_total,is_manual')
          .in('order_id', orderIds)
        oi = orderItemsResult.data
        orderItemsError = orderItemsResult.error

        if (orderItemsError) {
          const fallbackItemsResult = await supabase
            .from('order_items').select('order_id,product_name,quantity,line_total')
            .in('order_id', orderIds)
          oi = fallbackItemsResult.data
        }

        setOrderItems((oi || []).map(r => ({
          order_id: String((r as Record<string,unknown>).order_id || ''),
          product_name: String((r as Record<string,unknown>).product_name || 'Product'),
          category: String((r as Record<string,unknown>).category || ''),
          quantity: toNumber((r as Record<string,unknown>).quantity, 0),
          line_total: toNumber((r as Record<string,unknown>).line_total, 0),
          is_manual: Boolean((r as Record<string,unknown>).is_manual),
        })))
      }

      await productsPromise
    } catch (err) { console.error('Dashboard load error', err) }
    finally { setLoading(false) }
  }, [fetchProducts])

  const loadUsers = useCallback(async () => {
    if (!isSupabaseConfigured) return
    setUsersLoading(true); setUsersError('')
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, name, mobile, role, created_at')
      .order('created_at', { ascending: false })
    if (error) { setUsersError(error.message) }
    else { setAllUsers((data || []) as ProfileUser[]) }
    setUsersLoading(false)
  }, [])

  const loadCoupons = useCallback(async () => {
    if (!isSupabaseConfigured) return
    const { data } = await supabase
      .from('coupons')
      .select('id, code, percentage, is_active, expiry_date, usage_limit, usage_count, min_order_value')
      .order('created_at', { ascending: false })
    setCoupons((data || []) as DashboardCoupon[])
  }, [])

  const toggleUserRole = async (u: ProfileUser) => {
    const newRole = u.role === 'admin' ? 'customer' : 'admin'
    setRoleUpdating(u.id)
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', u.id)
    if (!error) {
      setAllUsers(prev => prev.map(p => p.id === u.id ? { ...p, role: newRole } : p))
    }
    setRoleUpdating(null)
  }

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    await supabase.from('orders').update({ status: newStatus }).eq('id', orderId)
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o))
    setSearchResults(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o))
  }

  const deleteOrder = async (orderId: string, invoiceNo: string) => {
    if (!window.confirm(`Are you sure you want to completely delete order ${invoiceNo}? This cannot be undone.`)) return
    const { error } = await supabase.from('orders').delete().eq('id', orderId)
    if (error) {
      alert(`Error deleting order: ${error.message}`)
      return
    }
    setOrders(prev => prev.filter(o => o.id !== orderId))
    setSearchResults(prev => prev.filter(o => o.id !== orderId))
  }

  const getOrderWhatsAppPreview = (order: DashboardOrder) => {
    const rawItems = parseOrderItems(order.items)
    const fallbackItems = orderItems
      .filter(item => item.order_id === order.id)
      .map(item => ({ name: item.product_name, quantity: item.quantity, line_total: item.line_total }))
    const items = (rawItems.length ? rawItems : fallbackItems).map(normalizeStructuredOrderItem)
    if (!items.length) return null

    const subtotal = items.reduce((sum, item) => sum + toNumber(item.line_total, 0), 0)
    const message = buildProfessionalWhatsAppMessage({
      customerName: order.customer_name,
      phone: order.phone,
      invoiceNumber: order.invoice_no || order.id,
      invoiceDate: order.created_at,
      items: items.map(item => ({
        name: item.name,
        qty: item.quantity,
        unit: item.unit,
        unitType: item.unit_type,
        rate: item.base_price,
        lineTotal: item.line_total,
      })),
      subtotal,
      couponDiscount: order.discount_amount,
      shipping: order.delivery_charge,
      total: order.total,
    })
    return { items, subtotal, message, fileName: `Invoice-${order.invoice_no || order.id}.pdf` }
  }


  const handlePrintReceipt = (order: DashboardOrder) => {
    const preview = getOrderWhatsAppPreview(order)
    if (!preview) { alert('This order has no invoice details available.'); return }
    const subtotal = order.total - (order.delivery_charge || 0) + (order.discount_amount || 0)

    printThermalReceipt({
      invoiceNo: order.invoice_no || order.id,
      date: order.created_at,
      customerName: order.customer_name,
      phone: order.phone,
      items: (preview.items as Array<{
        name?: string
        product_name?: string
        qty?: number
        quantity?: number
        unit?: string
        price?: number
        base_price?: number
        line_total?: number
      }>).map((item) => ({
        name: item.name || item.product_name || '',
        qty: item.qty || item.quantity || 0,
        unit: item.unit || '',
        price: item.price || item.base_price || 0,
        line_total: item.line_total || 0
      })),
      subtotal,
      shipping: order.delivery_charge || 0,
      couponDiscount: order.discount_amount || 0,
      totalGst: order.total_gst || 0,
      total: order.total
    })
  }

  const openOrderInvoice = async (order: DashboardOrder, mode: 'view' | 'download' | 'print') => {
    if (mode === 'view') {
      setInvoicePreviewOrder(order)
      return
    }

    if (order.invoice_pdf_url) {
      const link = document.createElement('a')
      link.href = order.invoice_pdf_url
      if (mode === 'download') link.download = `Invoice-${order.invoice_no || order.id}.pdf`
      if (mode === 'download') { link.click(); return }
      const opened = window.open(order.invoice_pdf_url, '_blank', 'noopener,noreferrer')
      if (mode === 'print') opened?.addEventListener('load', () => opened.print())
      return
    }
    const preview = getOrderWhatsAppPreview(order)
    if (!preview) { alert('This order has no invoice details available.'); return }
    const file = invoicePdfFile({
      invoiceNo: order.invoice_no || order.id,
      date: order.created_at,
      customerName: order.customer_name,
      phone: order.phone,
      address: order.address,
      items: preview.items as unknown as Array<Record<string, unknown>>,
      subtotal: preview.subtotal,
      shipping: order.delivery_charge,
      discountAmount: order.discount_amount,
      manualDiscountAmount: order.manual_discount_amount,
      gstAmount: order.total_gst,
      paymentMode: order.payment_mode,
      total: order.total,
    })
    const url = URL.createObjectURL(file)
    if (mode === 'download') {
      const link = document.createElement('a'); link.href = url; link.download = file.name; link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      return
    }
    const opened = window.open(url, '_blank', 'noopener,noreferrer')
    if (mode === 'print') opened?.addEventListener('load', () => opened.print())
  }

  const generateCouponCode = () => {
    const prefixes = ['SAVE', 'STYLE', 'BOUTIQUE', 'SHOP', 'SPECIAL', 'FASHION', 'NEW']
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)]
    const suffix = Math.floor(Math.random() * 90 + 10)
    setCouponForm(f => ({ ...f, code: `${prefix}${suffix}` }))
    setCouponSaveError('')
    setCouponSaveSuccess('')
  }

  const saveCoupon = async (e: FormEvent) => {
    e.preventDefault()
    setCouponSaveError('')
    setCouponSaveSuccess('')
    if (!couponForm.code.trim()) { setCouponSaveError('Coupon code is required'); return }
    if (!(toNumber(couponForm.percentage, 0) > 0 && toNumber(couponForm.percentage, 0) <= 100)) {
      setCouponSaveError('Discount must be between 1% and 100%'); return
    }
    const code = couponForm.code.trim().toUpperCase()
    const payload = {
      code,
      percentage: toNumber(couponForm.percentage, 0),
      is_active: true,
      expiry_date: couponForm.expiry_date || null,
      usage_limit: couponForm.usage_limit ? toNumber(couponForm.usage_limit, 0) : null,
      min_order_value: toNumber(couponForm.min_order_value, 0),
    }
    let error: unknown = null
    if (editingCouponId !== null) {
      // Update existing - don't change code (it's the PK equivalent)
      const res = await supabase.from('coupons').update({ ...payload }).eq('id', editingCouponId)
      error = res.error
    } else {
      // Insert new coupon - UNIQUE constraint on code catches duplicates
      const res = await supabase.from('coupons').insert(payload)
      error = res.error
    }
    if (error) {
      const msg = (error as { message?: string }).message || 'Failed to save coupon'
      if (msg.toLowerCase().includes('row-level security')) {
        setCouponSaveError('Coupon save was blocked by Supabase RLS. Confirm your user has the admin role and apply the Purple Boutique migrations.')
      } else {
        setCouponSaveError(msg.includes('unique') || msg.includes('duplicate') ? `Coupon code "${code}" already exists` : msg)
      }
    } else {
      setCouponForm({ code: '', percentage: 10, expiry_date: '', usage_limit: '', min_order_value: '' })
      setEditingCouponId(null)
      setCouponSaveSuccess(editingCouponId !== null ? 'Coupon updated!' : 'Coupon created!')
      await loadCoupons()
    }
  }

  const startEditCoupon = (coupon: DashboardCoupon) => {
    setEditingCouponId(coupon.id)
    setCouponForm({
      code: coupon.code,
      percentage: coupon.percentage,
      expiry_date: coupon.expiry_date ? coupon.expiry_date.slice(0, 10) : '',
      usage_limit: coupon.usage_limit !== null ? String(coupon.usage_limit) : '',
      min_order_value: coupon.min_order_value ? String(coupon.min_order_value) : '',
    })
    setCouponSaveError('')
    setCouponSaveSuccess('')
  }

  const cancelEditCoupon = () => {
    setEditingCouponId(null)
    setCouponForm({ code: '', percentage: 10, expiry_date: '', usage_limit: '', min_order_value: '' })
    setCouponSaveError('')
    setCouponSaveSuccess('')
  }

  const deleteCoupon = async (coupon: DashboardCoupon) => {
    if (!window.confirm(`Delete coupon "${coupon.code}"? This cannot be undone.`)) return
    await supabase.from('coupons').delete().eq('id', coupon.id)
    await loadCoupons()
  }

  const toggleCoupon = async (coupon: DashboardCoupon) => {
    await supabase.from('coupons').update({ is_active: !coupon.is_active }).eq('id', coupon.id)
    await loadCoupons()
  }

  // Keep a stable ref to the debounced loader so realtime events don't
  // trigger a full data reload more than once every 4 seconds.
  const debouncedLoadRef = useRef<(() => void) | null>(null)
  useEffect(() => {
    debouncedLoadRef.current = debounce(() => void loadData(), 350)
  }, [loadData])

  useEffect(() => {
    if (!isAdmin) return
    void loadData()
    if (!isSupabaseConfigured) return
    const handleChange = () => debouncedLoadRef.current?.()
    const ch = supabase.channel('dashboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, handleChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, handleChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, handleChange)
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [isAdmin, loadData])

  useEffect(() => {
    if (tab === 'users') void loadUsers()
    if (tab === 'coupons') void loadCoupons()
  }, [tab, loadUsers, loadCoupons])

  const applyAnalyticsPreset = (preset: 'all' | 'today' | 'week' | 'month' | 'year' | 'custom') => {
    setAnalyticsDatePreset(preset)
    if (preset === 'all')    { setAnalyticsDateFrom(''); setAnalyticsDateTo(''); return }
    if (preset === 'custom') return
    const today = new Date()
    const todayStr = today.toISOString().slice(0, 10)
    if (preset === 'today') {
      setAnalyticsDateFrom(todayStr); setAnalyticsDateTo(todayStr)
    } else if (preset === 'week') {
      const d = new Date(today); d.setDate(today.getDate() - 6)
      setAnalyticsDateFrom(d.toISOString().slice(0, 10)); setAnalyticsDateTo(todayStr)
    } else if (preset === 'month') {
      setAnalyticsDateFrom(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`)
      setAnalyticsDateTo(todayStr)
    } else if (preset === 'year') {
      setAnalyticsDateFrom(`${today.getFullYear()}-01-01`); setAnalyticsDateTo(todayStr)
    }
  }

  const applyDatePreset = (preset: 'today' | 'week' | 'month' | 'custom') => {
    setDatePreset(preset)
    if (preset === 'custom') { setSearch(s => ({ ...s, dateFrom: '', dateTo: '' })); return }
    const today = new Date()
    const todayStr = today.toISOString().slice(0, 10)
    if (preset === 'today') {
      setSearch(s => ({ ...s, dateFrom: todayStr, dateTo: todayStr }))
    } else if (preset === 'week') {
      const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 6)
      setSearch(s => ({ ...s, dateFrom: weekAgo.toISOString().slice(0, 10), dateTo: todayStr }))
    } else if (preset === 'month') {
      setSearch(s => ({ ...s, dateFrom: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`, dateTo: todayStr }))
    }
  }

  // Order search - POS bills only (online_request excluded)
  const runSearch = async (e?: FormEvent) => {
    e?.preventDefault()
    setSearchLoading(true)
    try {
      let q = supabase.from('orders')
        .select('id, invoice_no, customer_name, phone, address, created_at, total, status, order_mode, order_type, items, coupon_code, discount_amount, delivery_charge')
        .neq('order_type', 'online_request')
        .order('created_at', { ascending: false })
        .limit(500)
      if (search.invoiceNo.trim())    q = q.ilike('invoice_no', `%${search.invoiceNo.trim()}%`)
      if (search.phone.trim())        q = q.ilike('phone', `%${search.phone.trim()}%`)
      if (search.customerName.trim()) q = q.ilike('customer_name', `%${search.customerName.trim()}%`)
      if (search.dateFrom)        q = q.gte('created_at', `${search.dateFrom}T00:00:00`)
      if (search.dateTo)          q = q.lte('created_at', `${search.dateTo}T23:59:59`)
      if (billTypeFilter === 'manual')  q = q.eq('order_type', 'manual_sale')
      else if (billTypeFilter === 'offline') q = q.eq('order_type', 'pos_sale').eq('order_mode', 'offline')
      else if (billTypeFilter === 'online')  q = q.eq('order_type', 'pos_sale').eq('order_mode', 'online')

      const { data, error } = await q
      if (error) throw error
      setSearchResults((data || []).map(r => toDashboardOrder(r as Record<string,unknown>)))
    } catch (err) { console.error(err); setSearchResults([]) }
    finally { setSearchLoading(false) }
  }

  // ΓöÇΓöÇ Product CRUD ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  const handleSaveProd = async (e: FormEvent) => {
    e.preventDefault()
    setProductNotice('')
    setLoading(true)
    try {
      const unitType = normalizeUnitType(prodForm.unitType)

      // Parse predefined options from text
      let predefined_options: unknown[] = []
      if (prodForm.predefinedOptionsText.trim() && (unitType === 'weight' || unitType === 'volume')) {
        const baseUnit = unitType === 'weight' ? 'g' : 'ml'
        predefined_options = prodForm.predefinedOptionsText.split(',').map(s => s.trim()).filter(Boolean).map(raw => {
          const m = raw.match(/^([0-9.]+)\s*(g|kg|ml|l)?$/i)
          if (!m) return null
          let qty = parseFloat(m[1])
          const unit = (m[2] || baseUnit).toLowerCase()
          if (unit === 'kg') qty *= 1000
          if (unit === 'l')  qty *= 1000
          const label = unit === 'kg' ? `${parseFloat(m[1])}kg` : unit === 'l' ? `${parseFloat(m[1])}L` : `${qty}${baseUnit}`
          return { quantity: qty, unit: baseUnit, label }
        }).filter(Boolean)
      }

      const payload = {
        name: prodForm.name.trim(), name_ta: prodForm.nameTa.trim(), tamil_name: prodForm.nameTa.trim(),
        category: prodForm.category.trim(), category_id: prodForm.categoryId || null,
        remedy: prodForm.remedy, price: toNumber(prodForm.price, 0),
        offer_price: prodForm.offerPrice === '' ? null : toNumber(prodForm.offerPrice, 0),
        purchase_price: prodForm.purchasePrice === '' ? null : toNumber(prodForm.purchasePrice, 0),
        mrp: prodForm.mrp === '' ? null : toNumber(prodForm.mrp, 0),
        sku: prodForm.sku || null,
        barcode: prodForm.barcode || null,
        unit_type: unitType, unit_label: prodForm.unitLabel,
        base_quantity: toNumber(prodForm.baseQuantity, 1),
        stock_quantity: toNumber(prodForm.stockQuantity, 0),
        stock: Math.floor(toNumber(prodForm.stockQuantity, 0)),
        allow_decimal_quantity: prodForm.allowDecimalQuantity,
        predefined_options: predefined_options.length > 0 ? predefined_options : [],
        is_active: prodForm.isActive, sort_order: toNumber(prodForm.sortOrder, 0),
        has_variants: !!(prodForm as Record<string, unknown>).hasVariants,
        description: prodForm.description, benefits: prodForm.benefits,
        image_url: prodForm.image || '/product-placeholder.svg',
        image:     prodForm.image || '/product-placeholder.svg',
      }

      const { error } = editingProd
        ? await supabase.from('products').update(payload).eq('id', editingProd.id)
        : await supabase.from('products').insert(payload)
      if (error) throw error
      setProductNotice(editingProd ? 'Product updated!' : 'Product added!')
      setEditingProd(null); setProdForm(emptyForm)
      await loadData()
    } catch (err) { setProductNotice(toErr(err, 'Error saving product')) }
    finally { setLoading(false) }
  }

  const handleEdit = (p: Product) => {
    setEditingProd(p)
    const optText = (p.predefinedOptions || []).map(o => o.label).join(', ')
    setProdForm({
      name: p.name, nameTa: p.nameTa || p.tamilName || '', category: p.category,
      categoryId: p.categoryId ?? null, remedy: p.remedy || [],
      price: p.price, offerPrice: p.offerPrice || '',
      purchasePrice: p.purchasePrice || '', mrp: p.mrp || '',
      sku: p.sku || '', barcode: p.barcode || '',
      unitType: p.unitType,
      unitLabel: p.unitLabel, baseQuantity: p.baseQuantity,
      stockQuantity: p.stockQuantity || p.stock, stockUnit: p.stockUnit,
      allowDecimalQuantity: p.allowDecimalQuantity, predefinedOptionsText: optText,
      isActive: p.isActive, sortOrder: p.sortOrder, stock: p.stock,
      description: p.description, descriptionTa: p.descriptionTa || '',
      benefits: p.benefits || '', benefitsTa: p.benefitsTa || '',
      image: p.image || p.imageUrl || '',
      hasVariants: p.hasVariants ?? false,
    } as typeof prodForm)
    setVariantNotice('')
    setEditingVariantId(null)
    setVariantForm({ name: '', sizeLabel: '', price: '', purchasePrice: '', mrp: '', sku: '', barcode: '', stock: '50', weightValue: '', weightUnit: '', isDefault: false })
    setTab('products')
  }

  const handleToggleActive = async (p: Product) => {
    const { error } = await supabase.from('products').update({ is_active: !p.isActive }).eq('id', p.id)
    if (error) { setProductNotice(error.message); return }
    setProductNotice(`Product ${p.isActive ? 'deactivated' : 'activated'}`)
    await loadData()
  }

  const handleDeleteProd = async (id: string | number) => {
    if (!window.confirm('Permanently deactivate this product?')) return
    const { error } = await supabase.from('products').update({ is_active: false }).eq('id', id)
    if (error) { setProductNotice(error.message); return }
    setProductNotice('Product deactivated'); await loadData()
  }

  const handleSaveVariant = async (e: import('react').FormEvent) => {
    e.preventDefault()
    if (!editingProd) return
    setVariantLoading(true)
    setVariantNotice('')
    const price = Number(variantForm.price)
    const stock = Number(variantForm.stock)
    if (!variantForm.name.trim()) { setVariantNotice('Variant name required'); setVariantLoading(false); return }
    if (!(price > 0)) { setVariantNotice('Enter valid price'); setVariantLoading(false); return }
    try {
      const payload = {
        productId:   String(editingProd.id),
        variantName: variantForm.name.trim(),
        sizeLabel:   variantForm.sizeLabel.trim() || null,
        price,
        stock,
        purchasePrice: variantForm.purchasePrice ? Number(variantForm.purchasePrice) : null,
        mrp:         variantForm.mrp ? Number(variantForm.mrp) : null,
        sku:         variantForm.sku.trim() || null,
        barcode:     variantForm.barcode.trim() || null,
        weightValue: variantForm.weightValue ? Number(variantForm.weightValue) : null,
        weightUnit:  variantForm.weightUnit.trim() || null,
        isDefault:   variantForm.isDefault,
        sortOrder:   getVariants(String(editingProd.id)).length,
      }
      if (editingVariantId) {
        const { error } = await updateVariant(editingVariantId, payload)
        if (error) throw new Error(error)
        setVariantNotice('Variant updated!')
      } else {
        const { error } = await createVariant(payload)
        if (error) throw new Error(error)
        setVariantNotice('Variant added!')
        // Ensure product has_variants = true
        if (!editingProd.hasVariants) {
          await supabase.from('products').update({ has_variants: true }).eq('id', editingProd.id)
        }
      }
      setVariantForm({ name: '', sizeLabel: '', price: '', purchasePrice: '', mrp: '', sku: '', barcode: '', stock: '50', weightValue: '', weightUnit: '', isDefault: false })
      setEditingVariantId(null)
      await refetchVariants()
    } catch (err) { setVariantNotice(toErr(err, 'Error saving variant')) }
    finally { setVariantLoading(false) }
  }

  const handleDeleteVariant = async (variantId: string) => {
    if (!window.confirm('Remove this variant?')) return
    const { error } = await deleteVariant(variantId)
    if (error) { setVariantNotice(error); return }
    setVariantNotice('Variant removed')
    await refetchVariants()
  }

  const handleSetDefault = async (variantId: string) => {
    if (!editingProd) return
    const { error } = await setDefaultVariant(variantId, String(editingProd.id))
    if (!error) { setVariantNotice('Default updated'); await refetchVariants() }
  }

  const startEditVariant = (v: ProductVariant) => {
    setEditingVariantId(v.id)
    setVariantForm({
      name: v.variantName, sizeLabel: v.sizeLabel || '', price: String(v.price),
      purchasePrice: String(v.purchasePrice || ''), mrp: String(v.mrp || ''),
      sku: v.sku || '', barcode: v.barcode || '',
      stock: String(v.stock), weightValue: String(v.weightValue || ''), weightUnit: v.weightUnit || '', isDefault: !!v.isDefault
    })
    setVariantNotice('')
  }

  const handleUploadImage = async (file?: File) => {
    if (!file) return
    setImageUploading(true)
    try { const url = await uploadProductImage(file); setProdForm(p => ({ ...p, image: url })); setProductNotice('Image uploaded!') }
    catch (err) { setProductNotice(toErr(err, 'Upload failed')) }
    finally { setImageUploading(false) }
  }

  const onAddCat = async (e: FormEvent) => {
    e.preventDefault()
    if (!newCat.name_en.trim()) return
    const payload = { ...newCat, name_en: newCat.name_en.trim() }
    const { error } = editingCategoryId === null
      ? await supabase.from('categories').insert({ ...payload, is_active: true })
      : await supabase.from('categories').update(payload).eq('id', editingCategoryId)
    if (error) {
      setCategoryNotice({ type: 'error', text: error.message || 'Could not add category.' })
      return
    }
    const wasEditing = editingCategoryId !== null
    setNewCat({ name_en: '', name_ta: '' })
    setEditingCategoryId(null)
    setCategoryNotice({ type: 'success', text: wasEditing ? 'Category updated successfully.' : 'Category added successfully.' })
    await loadData()
  }

  const deleteCat = async (c: Category) => {
    if (!window.confirm(`Delete "${c.name_en}"? This cannot be undone.`)) return
    const { error: linkedProductsError } = await supabase
      .from('products')
      .update({ category: 'Uncategorized', category_id: null })
      .eq('category_id', c.id)
    if (linkedProductsError) {
      setCategoryNotice({ type: 'error', text: linkedProductsError.message || 'Could not unlink products from category.' })
      return
    }
    const { error: legacyProductsError } = await supabase
      .from('products')
      .update({ category: 'Uncategorized', category_id: null })
      .eq('category', c.name_en)
    if (legacyProductsError) {
      setCategoryNotice({ type: 'error', text: legacyProductsError.message || 'Could not sync products.' })
      return
    }
    const { error } = await supabase.from('categories').delete().eq('id', c.id)
    if (error) {
      setCategoryNotice({ type: 'error', text: error.message || 'Could not delete category.' })
      return
    }
    if (prodForm.categoryId === c.id || prodForm.category === c.name_en) {
      setProdForm(form => ({ ...form, category: '', categoryId: null }))
    }
    setCategoryNotice({ type: 'success', text: `"${c.name_en}" deleted.` })
    await loadData()
  }

  const toggleCat = async (c: Category) => {
    await supabase.from('categories').update({ is_active: !c.is_active }).eq('id', c.id); await loadData()
  }

  const moveCat = async (c: Category, dir: 'up' | 'down') => {
    const next = dir === 'up' ? Math.max(0, toNumber(c.sort_order, 0) - 1) : toNumber(c.sort_order, 0) + 1
    await supabase.from('categories').update({ sort_order: next }).eq('id', c.id); await loadData()
  }

  useEffect(() => {
    try {
      window.localStorage.setItem('dashboard-sidebar-collapsed', sidebarCollapsed ? '1' : '0')
    } catch {
      // Ignore persistence failures in private mode or restricted storage.
    }
  }, [sidebarCollapsed])

  // Auto-refresh analytics data every 30 seconds
  useEffect(() => {
    if (tab !== 'pos_analytics' || (posAnalyticsTab !== 'today' && posAnalyticsTab !== 'products' && posAnalyticsTab !== 'categories' && posAnalyticsTab !== 'coupons')) return
    const interval = setInterval(() => { void loadData() }, 30000)
    return () => clearInterval(interval)
  }, [tab, posAnalyticsTab, loadData])

  if (!isAdmin) return (
    <div className="min-h-screen bg-bgMain flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-3xl shadow-xl text-center max-w-sm">
        <AlertCircle className="mx-auto text-red-400 mb-4" size={48} />
        <h2 className="text-2xl font-black mb-2">{l('Unauthorized', 'அன� மதி இல� லை')}</h2>
        <Link to="/" className="px-6 py-3 bg-sageDark text-white rounded-xl font-bold inline-block mt-4">{l('Go Home', 'ம� கப� பிற� க� ')}</Link>
      </div>
    </div>
  )

  const navItems: Array<{ id: TabKey; icon: React.ReactNode; label: string }> = [
    { id: 'billing',       icon: <ShoppingCart size={20} />,     label: 'Billing Panel' },
    { id: 'advance_orders',icon: <FileText size={20} />,         label: 'Advance Orders' },
    { id: 'categories',    icon: <Package size={20} />,           label: 'Categories' },
    { id: 'history',       icon: <List size={20} />,             label: 'Order History' },
    { id: 'pos_analytics', icon: <BarChart2 size={20} />,        label: 'Analytics Dashboard' },
    { id: 'coupons',       icon: <Box size={20} />,              label: 'Coupons' },
  ]

  return (
    <div className="admin-shell h-full bg-bgMain flex flex-col lg:flex-row">
      {/* Sidebar */}
      <aside
        className={[
          'w-full bg-maroon-dark text-white border-b lg:border-b-0 lg:border-r border-maroon-dark flex flex-col shrink-0 lg:min-h-screen',
          'transition-[width] duration-300 ease-in-out overflow-hidden',
          sidebarCollapsed ? 'lg:w-[88px]' : 'lg:w-[260px]',
        ].join(' ')}
      >
        {/* Desktop brand header */}
        <div className={`hidden lg:flex items-center relative transition-all duration-300 ${sidebarCollapsed ? 'justify-center pt-6 pb-5 px-2' : 'px-5 py-5'}`}>
          <div className={`flex items-center gap-3 min-w-0 transition-all duration-300 ${sidebarCollapsed ? 'w-0 opacity-0 overflow-hidden' : 'opacity-100 flex-1'}`}>
            <div className="flex items-center justify-center shrink-0 w-12 h-12 rounded-xl bg-white shadow-[0_4px_12px_rgba(17,24,39,0.10)] overflow-hidden">
              <img src="/purple-boutique-mark.svg" alt="Purple Boutique logo" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-[20px] font-black text-white truncate tracking-tight">Purple Boutique</h1>
          </div>
          <button
            type="button"
            onClick={() => setSidebarCollapsed((state) => !state)}
            className={`flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-white/80 hover:bg-white/15 hover:text-white transition-colors shrink-0 ${sidebarCollapsed ? '' : ''}`}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <ChevronDown size={16} className={`transition-transform duration-300 ${sidebarCollapsed ? '-rotate-90' : 'rotate-90'}`} />
          </button>
        </div>
        {/* Mobile mini-header */}
        <div className="flex lg:hidden items-center justify-between px-4 py-4 border-b border-white/10">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shrink-0 overflow-hidden shadow-sm">
              <img src="/purple-boutique-mark.svg" alt="Purple Boutique logo" className="w-full h-full object-contain" />
            </div>
            <span className="text-[15px] font-black text-white truncate">Purple Boutique</span>
          </div>
        </div>
        {/* Nav */}
        <nav
          className={`flex overflow-x-auto overflow-y-hidden lg:flex-col lg:overflow-visible gap-2 px-3 py-3 lg:py-2 lg:flex-grow transition-all duration-300 hide-scrollbar ${sidebarCollapsed ? 'lg:px-2' : 'lg:px-4'}`}
        >
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => handleTabClick(item.id)}
              title={item.label}
              className={[
                'shrink-0 flex flex-col lg:flex-row items-center justify-center lg:justify-start',
                'gap-1 lg:gap-3',
                'h-[56px] w-[64px] lg:w-full lg:h-[48px]',
                sidebarCollapsed ? 'lg:w-[48px] lg:justify-center mx-auto' : 'lg:px-4',
                'px-0 py-1 lg:py-0',
                'rounded-xl font-medium text-[11px] lg:text-[14px] transition-all overflow-hidden',
                tab === item.id ? 'bg-white text-maroon-dark shadow-sm' : 'text-white/70 hover:bg-white/10 hover:text-white',
              ].join(' ')}
            >
              <span className="shrink-0 flex items-center gap-1">
                {item.icon}
              </span>
              <span className={`hidden lg:block truncate text-left transition-all duration-200 ${sidebarCollapsed ? 'w-0 opacity-0 overflow-hidden' : 'opacity-100 flex-1'}`}>
                {item.label}
              </span>
            </button>
          ))}
          {/* Logout button */}
          <button
            onClick={() => {
              useAdminAuthStore.getState().logout()
              navigate('/admin-login', { replace: true })
            }}
            className={[
              'shrink-0 flex flex-col lg:flex-row items-center justify-center lg:justify-start',
              'gap-1 lg:gap-3',
              'h-[56px] w-[64px] lg:w-full lg:h-[48px]',
              sidebarCollapsed ? 'lg:w-[48px] lg:justify-center mx-auto' : 'lg:px-4',
              'px-0 py-1 lg:py-0',
              'rounded-xl font-medium text-[11px] lg:text-[14px] transition-all text-white/70 hover:bg-white/10 hover:text-white lg:mt-auto mb-1 lg:mb-4 overflow-hidden',
            ].join(' ')}
          >
            <span className="shrink-0"><Power size={20} /></span>
            <span className={`hidden lg:block truncate text-left transition-all duration-200 ${sidebarCollapsed ? 'w-0 opacity-0 overflow-hidden' : 'opacity-100 flex-1'}`}>Logout</span>
          </button>
        </nav>

      </aside>

      {/* Main */}
      <main className="flex-grow flex flex-col overflow-hidden">
        <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-x-hidden overflow-y-auto">

        {/* ΓöÇΓöÇ ANALYTICS TAB ΓöÇΓöÇ */}

        {/* ── BUSINESS CONTROL CENTER ── */}
        {/* ── BUSINESS CONTROL CENTER ── */}
        {tab === 'overview' && (() => {
          const latestPOS = searchResults.slice(0, 10)
          return (
          <div className="space-y-6 rounded-[28px] bg-maroon-dark p-5 sm:p-6 lg:p-7 shadow-2xl border border-white/10 text-white">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-black text-[#111111]">{l('Analytics Dashboard', 'பகுப்பாய்வு தட்டு')}</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => void loadData()}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white border border-[#D1FAE5]/40 rounded-xl text-[12px] font-bold text-[#374151] hover:bg-[#F9FAFB]">
                  <RefreshCw size={13} /> {l('Refresh', 'புதுப்பி')}
                </button>
              </div>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2 border-b border-[#D1FAE5]/40">
              {[
                { id: 'revenue', label: 'Revenue' },
                { id: 'product', label: 'Product & Category' },
                { id: 'inventory', label: 'Inventory' },
                { id: 'customer', label: 'Customer' },
                { id: 'billing', label: 'Billing' },
              ].map(sub => (
                <button key={sub.id} onClick={() => setAnalyticsTab(sub.id)}
                  className={`px-4 py-2 rounded-xl text-[13px] font-bold whitespace-nowrap transition-colors ${analyticsTab === sub.id ? 'bg-[#111111] text-white' : 'bg-white border border-[#D1FAE5]/40 text-[#374151] hover:bg-[#F9FAFB]'}`}>
                  {sub.label}
                </button>
              ))}
            </div>

            {analyticsTab === 'revenue' && (
              <>

            {/* Revenue KPIs - 5 cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
              {[
                { label: l('Total Revenue', 'மொத்த வருவாய்'),    value: formatCurrency(analytics.totalCompletedRevenue), from: 'from-emerald-50 via-emerald-50/80 to-teal-50', iconBg: 'from-emerald-400 to-teal-500', icon: <BadgeDollarSign size={16} /> },
                { label: l("Today's Sales",  'இன்றைய விற்பனை'),  value: formatCurrency(analytics.todaySales),            from: 'from-blue-50 via-blue-50/80 to-indigo-50', iconBg: 'from-blue-400 to-indigo-500', icon: <TrendingUp size={16} /> },
                { label: l('Offline Revenue', 'ஆஃப்லைன் வருவாய்'), value: formatCurrency(analytics.posRevenue),           from: 'from-orange-50 via-orange-50/80 to-amber-50', iconBg: 'from-orange-400 to-amber-500', icon: <BadgeDollarSign size={16} /> },
                { label: l('Online Revenue',  'ஆன்லைன் வருவாய்'),  value: formatCurrency(analytics.onlinePosRevenue),     from: 'from-cyan-50 via-cyan-50/80 to-sky-50', iconBg: 'from-cyan-400 to-sky-500', icon: <BadgeDollarSign size={16} /> },
                { label: l('Manual Revenue',  'கைமுறை வருவாய்'),   value: formatCurrency(analytics.manualRevenue),        from: 'from-violet-50 via-violet-50/80 to-purple-50', iconBg: 'from-violet-400 to-purple-500', icon: <ShoppingCart size={16} /> },
              ].map((card, i) => (
                <div key={i} className={`bg-gradient-to-br ${card.from} rounded-2xl border border-white/40 p-4 shadow-sm backdrop-blur-sm`}>
                  <div className="flex items-center justify-between gap-1 mb-2">
                    <p className="text-[10px] uppercase font-black text-[#374151] tracking-wider leading-tight">{card.label}</p>
                    <div className={`w-7 h-7 rounded-xl bg-gradient-to-br ${card.iconBg} flex items-center justify-center text-white shrink-0 shadow-sm`}>{card.icon}</div>
                  </div>
                  <p className="text-[20px] font-black text-[#111111] break-words leading-tight">{card.value}</p>
                </div>
              ))}
            </div>

            {/* Latest POS Bills */}
            <div className="bg-white rounded-2xl border border-[#D1FAE5]/30 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-black text-[#111111]">{l('Latest POS Bills', 'POS பில்கள்')}</h3>
                <button onClick={() => setTab('billing')} className="text-[12px] font-bold text-[#10B981] hover:underline">{l('View All →', 'அனைத்தும் →')}</button>
              </div>
              {latestPOS.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-[#D1FAE5]/30">
                  <table className="w-full min-w-[480px] text-[12px]">
                    <thead className="bg-[#F9FAFB] text-[10px] uppercase tracking-wider text-[#374151]">
                      <tr>
                        <th className="px-3 py-2.5 font-black text-left">{l('Invoice', 'பில்')}</th>
                        <th className="px-3 py-2.5 font-black text-left">{l('Customer', 'வாடிக்கையாளர்')}</th>
                        <th className="px-3 py-2.5 font-black text-left">{l('Total', 'மொத்தம்')}</th>
                        <th className="px-3 py-2.5 font-black text-left">{l('Date', 'தேதி')}</th>
                        <th className="px-3 py-2.5 font-black text-left">{l('Type', 'வகை')}</th>
                        <th className="px-3 py-2.5 font-black text-left">{l('Status', 'நிலை')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#D1FAE5]/20">
                      {latestPOS.map(o => {
                        const btLabel = normalizeOrderType(o.order_type) === 'manual_sale' ? 'MANUAL' : normalizeOrderMode(o.order_mode) === 'online' ? 'ONLINE' : 'OFFLINE'
                        const btClass = normalizeOrderType(o.order_type) === 'manual_sale' ? 'bg-purple-100 text-purple-700' : normalizeOrderMode(o.order_mode) === 'online' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                        return (
                          <tr key={o.id} className="hover:bg-[#F9FAFB]/50">
                            <td className="px-3 py-2.5 font-bold text-[#10B981] text-[11px]">{o.invoice_no || '-'}</td>
                            <td className="px-3 py-2.5 font-semibold text-[#111111] max-w-[100px] truncate">{o.customer_name}</td>
                            <td className="px-3 py-2.5 font-black text-[#111111]">{formatCurrency(toNumber(o.total, 0))}</td>
                            <td className="px-3 py-2.5 text-[#7A846F] whitespace-nowrap">{new Date(o.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                            <td className="px-3 py-2.5"><span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${btClass}`}>{btLabel}</span></td>
                            <td className="px-3 py-2.5">
                              <span className={`text-[11px] font-black px-2 py-0.5 rounded-lg ${normalizeStatus(o.status) === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                {normalizeStatus(o.status)}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-[13px] text-[#374151] text-center py-4">{l('No bills yet', 'பில்கள் இல்லை')}</p>
              )}
            </div>
            </>
            )}

            {analyticsTab === 'product' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-2xl border border-[#D1FAE5]/30 p-5 shadow-sm">
                  <h3 className="text-base font-black text-[#111111] mb-4">Top Products by Volume</h3>
                  <div className="space-y-3">
                    {analytics.topProducts.slice(0, 10).map((p, i) => (
                      <div key={i} className="flex justify-between items-center bg-[#F9FAFB] p-3 rounded-xl">
                        <div>
                          <p className="text-[13px] font-bold text-[#111111]">{p.name}</p>
                          <p className="text-[11px] text-[#374151]">{p.billCount} bills</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[14px] font-black text-[#111111]">{p.qty}</p>
                          <p className="text-[11px] font-bold text-[#10B981]">{formatCurrency(p.revenue)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-[#D1FAE5]/30 p-5 shadow-sm">
                  <h3 className="text-base font-black text-[#111111] mb-4">Top Categories by Revenue</h3>
                  <div className="space-y-3">
                    {analytics.topCategories.slice(0, 10).map((c, i) => (
                      <div key={i} className="flex justify-between items-center bg-[#F9FAFB] p-3 rounded-xl">
                        <div>
                          <p className="text-[13px] font-bold text-[#111111]">{c.name}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[14px] font-black text-[#111111]">{formatCurrency(c.revenue)}</p>
                          <p className="text-[11px] text-[#374151]">{c.qty} sold</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {analyticsTab === 'inventory' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-2xl border border-[#D1FAE5]/30 p-5 shadow-sm">
                  <h3 className="text-base font-black text-[#111111] mb-4">Low Stock Alerts</h3>
                  <div className="space-y-3">
                    {products.filter(p => p.stock <= (p.lowStockAlert || 5)).slice(0, 10).map((p, i) => (
                      <div key={i} className="flex justify-between items-center bg-red-50 border border-red-100 p-3 rounded-xl">
                        <p className="text-[13px] font-bold text-red-900">{p.name}</p>
                        <p className="text-[14px] font-black text-red-700">{p.stock} left</p>
                      </div>
                    ))}
                    {products.filter(p => p.stock <= (p.lowStockAlert || 5)).length === 0 && (
                      <p className="text-[13px] text-[#374151]">No low stock alerts.</p>
                    )}
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-[#D1FAE5]/30 p-5 shadow-sm">
                  <h3 className="text-base font-black text-[#111111] mb-4">Total Inventory Value</h3>
                  <div className="bg-[#F9FAFB] p-5 rounded-xl">
                    <p className="text-[11px] uppercase tracking-wider font-bold text-[#374151] mb-1">Selling Value (MRP)</p>
                    <p className="text-[24px] font-black text-[#111111]">
                      {formatCurrency(products.reduce((acc, p) => acc + (p.stock * p.price), 0))}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {analyticsTab === 'customer' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-2xl border border-[#D1FAE5]/30 p-5 shadow-sm">
                  <h3 className="text-base font-black text-[#111111] mb-4">Customer Insights</h3>
                  <div className="bg-blue-50 border border-blue-100 p-5 rounded-xl mb-4">
                    <p className="text-[11px] uppercase tracking-wider font-bold text-blue-800 mb-1">Unique Customers</p>
                    <p className="text-[24px] font-black text-blue-900">
                      {new Set(searchResults.filter(o => o.phone).map(o => o.phone)).size}
                    </p>
                  </div>
                  <div className="bg-[#F9FAFB] p-5 rounded-xl">
                    <p className="text-[11px] uppercase tracking-wider font-bold text-[#374151] mb-1">Avg Order Value</p>
                    <p className="text-[24px] font-black text-[#111111]">
                      {formatCurrency(analytics.totalCompletedRevenue / (searchResults.filter(o => isCompletedStatus(o.status)).length || 1))}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {analyticsTab === 'billing' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-2xl border border-[#D1FAE5]/30 p-5 shadow-sm">
                  <h3 className="text-base font-black text-[#111111] mb-4">Billing Metrics</h3>
                  <div className="space-y-4">
                    <div className="bg-[#F9FAFB] p-4 rounded-xl flex justify-between items-center">
                      <span className="text-[13px] font-bold text-[#374151]">Total Invoices Generated</span>
                      <span className="text-[16px] font-black text-[#111111]">{searchResults.length}</span>
                    </div>
                    <div className="bg-[#F9FAFB] p-4 rounded-xl flex justify-between items-center">
                      <span className="text-[13px] font-bold text-[#374151]">Discounts Applied</span>
                      <span className="text-[16px] font-black text-[#10B981]">
                        {formatCurrency(searchResults.reduce((acc, o) => acc + (toNumber(o.discount_amount, 0)), 0))}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-[#D1FAE5]/30 p-5 shadow-sm">
                  <h3 className="text-base font-black text-[#111111] mb-4">Top Coupons</h3>
                  <div className="space-y-3">
                    {analytics.topCoupons.slice(0, 5).map((c, i) => (
                      <div key={i} className="flex justify-between items-center bg-[#F9FAFB] p-3 rounded-xl">
                        <span className="text-[13px] font-bold text-[#111111]">{c.code}</span>
                        <span className="text-[12px] font-bold text-[#10B981]">{c.usage} uses</span>
                      </div>
                    ))}
                    {analytics.topCoupons.length === 0 && <p className="text-[13px] text-[#374151]">No coupons used yet.</p>}
                  </div>
                </div>
              </div>
            )}
          </div>
          )
        })()}

        {/* ── WHATSAPP CENTER ── */}
        {tab === 'whatsapp' && (
          <div className="space-y-5">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-black text-[#111111]">{l('WhatsApp Center', 'வாட்ஸ் அப் மையம்')}</h2>
                {analytics.waPending > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[12px] font-black animate-pulse">
                    {analytics.waPending} {l('pending', 'நிலுவை')}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* Compact period filter */}
                <div className="flex gap-1">
                  {(['all', 'today', 'week', 'month'] as const).map(preset => (
                    <button key={preset} type="button" onClick={() => applyAnalyticsPreset(preset)}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-black transition-colors ${analyticsDatePreset === preset ? 'bg-[#111111] text-white' : 'bg-[#F9FAFB] text-[#374151] hover:bg-[#D1FAE5]/40'}`}>
                      {preset === 'all' ? l('All','எல்லாம்') : preset === 'today' ? l('Today','இன்று') : preset === 'week' ? l('Week','வாரம்') : l('Month','மாதம்')}
                    </button>
                  ))}
                </div>
                <button onClick={() => void loadData()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#D1FAE5]/40 rounded-lg text-[11px] font-bold text-[#374151] hover:bg-[#F9FAFB]">
                  <RefreshCw size={12} /> {l('Refresh', 'புதுப்பி')}
                </button>
              </div>
            </div>

            {/* Status summary cards */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: l('Total Requests', 'மொத்த கோரிக்கை'), val: analytics.waRequests,  bg: 'bg-blue-50',   color: 'text-blue-700',   border: 'border-blue-100' },
                { label: l('Pending', 'நிலுவை'),                 val: analytics.waPending,   bg: 'bg-amber-50',  color: 'text-amber-700',  border: 'border-amber-100' },
                { label: l('Contacted', 'தொடர்பு'),               val: analytics.waContacted, bg: 'bg-orange-50', color: 'text-orange-700', border: 'border-orange-100' },
                { label: l('Completed', 'முடிந்தது'),              val: analytics.waCompleted, bg: 'bg-green-50',  color: 'text-green-700',  border: 'border-green-100' },
              ].map(({ label, val, bg, color, border }) => (
                <div key={label} className={`${bg} border ${border} rounded-xl p-3 text-center`}>
                  <p className={`text-[10px] uppercase font-black ${color} tracking-wider mb-1`}>{label}</p>
                  <p className="text-[28px] font-black text-[#111111] leading-none">{val}</p>
                </div>
              ))}
            </div>

            {/* ═══ CUSTOMER REQUEST MANAGEMENT - PRIMARY SECTION ═══ */}
            <div className="bg-white rounded-2xl border border-blue-200 shadow-sm">
              <div className="flex items-center justify-between px-5 py-4 border-b border-blue-100">
                <div className="flex items-center gap-2">
                  <MessageCircle size={17} className="text-blue-600" />
                  <h3 className="text-base font-black text-[#111111]">{l('Customer Requests', 'வாடிக்கையாளர் கோரிக்கைகள்')}</h3>
                  <span className="text-[10px] font-bold text-[#9BAB9A] bg-[#F9FAFB] px-2 py-0.5 rounded-full">{l('RM0 revenue - status updates only', 'RM0 வருவாய் - நிலை மட்டும்')}</span>
                </div>
                <span className="text-[12px] text-[#374151] font-bold">{analytics.onlineRequestOrders.length} {l('requests', 'கோரிக்கைகள்')}</span>
              </div>

              {analytics.onlineRequestOrders.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px] min-w-[820px]">
                    <thead className="bg-blue-50 border-b border-blue-100 sticky top-0 z-10">
                      <tr className="text-left text-[#374151] font-black text-[10px] uppercase tracking-wider">
                        <th className="px-4 py-3">{l('Customer', 'வாடிக்கையாளர்')}</th>
                        <th className="px-4 py-3">{l('Phone', 'தொலைபேசி')}</th>
                        <th className="px-4 py-3">{l('Address', 'முகவரி')}</th>
                        <th className="px-4 py-3 text-center">{l('Products', 'பொருட்கள்')}</th>
                        <th className="px-4 py-3">{l('Est. Total', 'மதிப்பீடு')}</th>
                        <th className="px-4 py-3">{l('Date & Time', 'தேதி & நேரம்')}</th>
                        <th className="px-4 py-3">{l('Status', 'நிலை')}</th>
                        <th className="px-4 py-3 text-center">{l('Details', 'விவரம்')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-blue-50">
                      {analytics.onlineRequestOrders.map(order => {
                        const its = parseOrderItems(order.items)
                        const isExpanded = waExpandedId === order.id

                        const normalizedItems = its.map(raw => normalizeStructuredOrderItem(raw as Record<string, unknown>))
                        const waMsg = buildProfessionalWhatsAppMessage({
                          customerName: order.customer_name,
                          phone: order.phone,
                          invoiceNumber: order.invoice_no || order.id || '-',
                          invoiceDate: order.created_at,
                          items: normalizedItems.map(item => ({
                            name: item.name,
                            qty: item.quantity,
                            unit: item.unit,
                            unitType: item.unit_type,
                            rate: item.base_price,
                            lineTotal: item.line_total,
                          })),
                          subtotal: normalizedItems.reduce((sum, item) => sum + item.line_total, 0),
                          total: toNumber(order.total, 0),
                          paymentMode: order.payment_mode || order.payment_method,
                        })

                        return (
                          <React.Fragment key={order.id}>
                            <tr className={`hover:bg-blue-50/40 align-middle ${isExpanded ? 'bg-blue-50/30' : ''}`}>
                              <td className="px-4 py-3 font-bold text-[#111111] whitespace-nowrap">{order.customer_name || '-'}</td>
                              <td className="px-4 py-3 text-[#374151] whitespace-nowrap">{order.phone || '-'}</td>
                              <td className="px-4 py-3 text-[#7A846F] max-w-[140px] truncate" title={order.address || '-'}>{order.address || '-'}</td>
                              <td className="px-4 py-3 text-center">
                                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-[11px] font-black">{its.length}</span>
                              </td>
                              <td className="px-4 py-3 font-black text-[#111111]">{formatCurrency(toNumber(order.total, 0))}</td>
                              <td className="px-4 py-3 text-[#7A846F] whitespace-nowrap text-[11px]">
                                <div>{new Date(order.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                                <div className="text-[10px]">{new Date(order.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <select
                                    value={normalizeStatus(order.status)}
                                    onChange={e => void updateOrderStatus(order.id, e.target.value)}
                                    className={`text-[11px] font-black px-2 py-1.5 rounded-lg border cursor-pointer outline-none ${
                                      isCompletedStatus(order.status) ? 'bg-green-100 text-green-700 border-green-200'
                                      : normalizeStatus(order.status) === 'contacted' ? 'bg-orange-100 text-orange-700 border-orange-200'
                                      : 'bg-amber-100 text-amber-700 border-amber-200'
                                    }`}>
                                    <option value="pending">{l('Pending', 'நிலுவை')}</option>
                                    <option value="contacted">{l('Contacted', 'தொடர்பு')}</option>
                                    <option value="completed">{l('Completed', 'முடிந்தது')}</option>
                                  </select>
                                  <button onClick={() => void deleteOrder(order.id, order.invoice_no)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Delete Order">
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => setWaExpandedId(isExpanded ? null : order.id)}
                                  className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-colors whitespace-nowrap ${
                                    isExpanded ? 'bg-[#111111] text-white' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                  }`}>
                                  {isExpanded ? l('Close', 'மூடு') : l('View', 'பார்')}
                                </button>
                              </td>
                            </tr>

                            {/* Expanded detail row */}
                            {isExpanded && (
                              <tr>
                                <td colSpan={8} className="px-4 pb-5 pt-2 bg-blue-50/40">
                                  <div className="space-y-4">
                                    {/* Customer info bar */}
                                    <div className="flex flex-wrap gap-4 text-[12px] bg-white rounded-xl p-3 border border-blue-100">
                                      <div><span className="font-black text-[#374151]">{l('Name', 'பெயர்')}: </span><span className="font-bold text-[#111111]">{order.customer_name || '-'}</span></div>
                                      <div><span className="font-black text-[#374151]">{l('Name', 'பெயர்')}: </span><span className="font-bold text-[#111111]">{order.customer_name || '-'}</span></div>
                                      <div><span className="font-black text-[#374151]">{l('Phone', 'தொலைபேசி')}: </span><span className="font-bold text-[#111111]">{order.phone || '-'}</span></div>
                                      <div className="flex-1"><span className="font-black text-[#374151]">{l('Address', 'முகவரி')}: </span><span className="text-[#111111]">{order.address || '-'}</span></div>
                                    </div>

                                    {/* Items table */}
                                    {its.length > 0 && (
                                      <div className="overflow-x-auto">
                                        <table className="w-full text-[12px] min-w-[540px] bg-white rounded-xl overflow-hidden border border-blue-100">
                                          <thead className="bg-[#F9FAFB]">
                                            <tr className="text-left text-[#374151] font-black text-[10px] uppercase tracking-wider">
                                              <th className="px-4 py-2.5">{l('Product', 'பொருள்')}</th>
                                              <th className="px-4 py-2.5">{l('Variant', 'வகைப்படி')}</th>
                                              <th className="px-4 py-2.5">{l('Size / Weight', 'அளவு / எடை')}</th>
                                              <th className="px-4 py-2.5 text-center">{l('Qty', 'அளவு')}</th>
                                              <th className="px-4 py-2.5">{l('Unit Price', 'ஒரு விலை')}</th>
                                              <th className="px-4 py-2.5 text-right">{l('Line Total', 'வரி மொத்தம்')}</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-[#D1FAE5]/20">
                                            {its.map((raw, idx) => {
                                              const item = raw as Record<string, unknown>
                                              const fullName  = String(item.name || item.product_name || 'Product')
                                              const dashIdx   = fullName.indexOf(' - ')
                                              const prodName  = dashIdx > 0 ? fullName.slice(0, dashIdx) : fullName
                                              const variant   = dashIdx > 0 ? fullName.slice(dashIdx + 3) : '-'
                                              const qty       = toNumber(item.quantity ?? item.qty, 0)
                                              const basePrice = toNumber(item.base_price ?? item.basePrice ?? item.price, 0)
                                              const lineTotal = toNumber(item.line_total ?? item.lineTotal, 0)
                                              const unit      = String(item.unit || 'pc')
                                              const unitType  = String(item.unit_type || item.unitType || 'unit')
                                              const sizeLabel = unitType === 'weight'
                                                ? qty >= 1000 ? `${qty / 1000}kg` : `${qty}g`
                                                : unitType === 'volume'
                                                  ? qty >= 1000 ? `${qty / 1000}L` : `${qty}ml`
                                                  : `${qty} ${unit}`
                                              const priceLabel = formatCurrency(basePrice)
                                              return (
                                                <tr key={idx} className="hover:bg-blue-50/20">
                                                  <td className="px-4 py-2.5 font-bold text-[#111111]">{prodName}</td>
                                                  <td className="px-4 py-2.5 text-[#374151]">{variant}</td>
                                                  <td className="px-4 py-2.5 text-[#374151]">{sizeLabel}</td>
                                                  <td className="px-4 py-2.5 text-center font-bold">{qty}</td>
                                                  <td className="px-4 py-2.5 text-[#374151]">{priceLabel}</td>
                                                  <td className="px-4 py-2.5 font-black text-[#111111] text-right">{formatCurrency(lineTotal)}</td>
                                                </tr>
                                              )
                                            })}
                                          </tbody>
                                          <tfoot className="bg-[#F9FAFB] border-t border-[#D1FAE5]/30">
                                            <tr>
                                              <td colSpan={5} className="px-4 py-2.5 text-right font-black text-[#374151] text-[11px] uppercase tracking-wider">{l('Grand Total', 'மொத்த தொகை')}</td>
                                              <td className="px-4 py-2.5 text-right font-black text-[18px] text-[#111111]">{formatCurrency(toNumber(order.total, 0))}</td>
                                            </tr>
                                          </tfoot>
                                        </table>
                                      </div>
                                    )}

                                    {/* WhatsApp message */}
                                    <div className="bg-white rounded-xl border border-blue-100 p-4">
                                      <div className="flex items-center justify-between mb-2">
                                        <span className="text-[11px] font-black text-[#374151] uppercase tracking-wider">{l('WhatsApp Message', 'வாட்ஸ் அப் செய்தி')}</span>
                                        <button
                                          type="button"
                                          onClick={() => void navigator.clipboard.writeText(waMsg)}
                                          className="px-3 py-1 rounded-lg bg-[#25D366] text-white text-[11px] font-black hover:bg-[#1da851] transition-colors">
                                          {l('Copy Message', 'நகல் எடு')}
                                        </button>
                                      </div>
                                      <pre className="text-[12px] text-[#111111] bg-[#F9FAFB] rounded-xl p-3 whitespace-pre-wrap font-sans leading-relaxed select-all">{waMsg}</pre>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="px-5 py-12 text-center">
                  <MessageCircle size={40} className="mx-auto text-blue-200 mb-3" />
                  <p className="text-[14px] font-bold text-[#374151]">{l('No WhatsApp requests in selected period', 'தேர்ந்த காலத்தில் WA கோரிக்கை இல்லை')}</p>
                </div>
              )}
            </div>

            {/* ——— ANALYTICS - secondary, compact, bottom ——— */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Top Requested Products */}
              <div className="bg-white rounded-2xl border border-[#D1FAE5]/30 p-4 shadow-sm">
                <h3 className="text-[13px] font-black text-[#111111] mb-3">{l('Top Requested Products', 'அதிக தேவை')}</h3>
                {analytics.topWAProducts.length > 0 ? (
                  <div className="space-y-1.5">
                    {analytics.topWAProducts.slice(0, 6).map((item, i) => (
                      <div key={item.name} className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[9px] font-black flex items-center justify-center shrink-0">{i + 1}</span>
                        <span className="text-[11px] font-bold text-[#111111] truncate flex-1">{item.name}</span>
                        <span className="text-[11px] font-black text-blue-600 shrink-0">{item.count}x</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] text-[#9BAB9A] text-center py-3">{l('No data', 'தரவு இல்லை')}</p>
                )}
              </div>

              {/* Top Requested Categories */}
              <div className="bg-white rounded-2xl border border-[#D1FAE5]/30 p-4 shadow-sm">
                <h3 className="text-[13px] font-black text-[#111111] mb-3">{l('Top Categories', 'வகைகள்')}</h3>
                {analytics.topWACategories.length > 0 ? (
                  <div className="space-y-1.5">
                    {analytics.topWACategories.slice(0, 6).map((cat, i) => (
                      <div key={cat.name} className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-black flex items-center justify-center shrink-0">{i + 1}</span>
                        <span className="text-[11px] font-bold text-[#111111] truncate flex-1">{cat.name}</span>
                        <span className="text-[11px] font-black text-emerald-600 shrink-0">{cat.count}x</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] text-[#9BAB9A] text-center py-3">{l('No data', 'தரவு இல்லை')}</p>
                )}
              </div>

              {/* Status Distribution - compact bar */}
              <div className="bg-white rounded-2xl border border-[#D1FAE5]/30 p-4 shadow-sm">
                <h3 className="text-[13px] font-black text-[#111111] mb-3">{l('Status Distribution', 'நிலை விளக்கம்')}</h3>
                <div className="h-36">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.statusDistribution} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E8DFD0" />
                      <XAxis dataKey="name" tick={{ fill: '#6B7661', fontSize: 9 }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fill: '#6B7661', fontSize: 9 }} axisLine={false} tickLine={false} width={24} />
                      <Tooltip formatter={(value) => toNumber(value as number | string, 0)} />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={20}>
                        {analytics.statusDistribution.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ——— POS ANALYTICS ——— */}
        {tab === 'pos_analytics' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-[24px] font-bold text-[#111111]">POS Analytics</h2>
              <p className="text-[13px] text-[#6B7280]">Real time store & channel insights</p>
            </div>

            <div className="flex flex-col gap-4 border-b border-[#E7E7E7] pb-4 md:flex-row md:items-center md:justify-between">
              {/* Sub-tabs */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:flex md:gap-6">
                {([
                  { id: 'revenue' as const,    label: 'REVENUE' },
                  { id: 'today' as const,      label: 'TODAY\'S SALES' },
                  { id: 'products' as const,   label: 'PRODUCTS' },
                  { id: 'coupons' as const,    label: 'COUPONS' },
                ]).map(({ id, label }) => (
                  <button key={id} onClick={() => setPosAnalyticsTab(id as PosAnalyticsTab)}
                    className={`pb-2 md:pb-4 text-left text-[13px] font-bold tracking-wide transition-colors relative ${posAnalyticsTab === id ? 'text-maroon-dark' : 'text-[#6B7280] hover:text-[#111111]'}`}>
                    {label}
                    {posAnalyticsTab === id && <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-maroon-dark rounded-t-md" />}
                  </button>
                ))}
              </div>

              {/* Date filter */}
              <div className="flex flex-col gap-3 md:items-end">
                <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-[#F8F8F8] p-2">
                  <span className="text-[10px] font-bold uppercase text-[#6B7280] ml-1 mr-1">Period:</span>
                  {(['all', 'today', 'week', 'month', 'year'] as const).map(preset => (
                    <button key={preset} type="button" onClick={() => applyAnalyticsPreset(preset)}
                      className={`px-4 py-1.5 rounded-full text-[11px] font-bold uppercase transition-all ${analyticsDatePreset === preset ? 'bg-maroon-dark text-white shadow-sm' : 'text-[#6B7280] hover:text-[#111111]'}`}>
                      {preset === 'all' ? 'All Time' : preset === 'today' ? 'Today' : preset === 'week' ? 'This Week' : preset === 'month' ? 'This Month' : 'This Year'}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 w-full">
                  <div className="flex items-center border border-[#E7E7E7] rounded-xl px-3 py-2 bg-white min-w-0">
                    <span className="text-[10px] uppercase font-bold text-[#6B7280] mr-2">From:</span>
                    <input type="date" value={analyticsDateFrom} onChange={e => { setAnalyticsDateFrom(e.target.value); setAnalyticsDatePreset('custom'); }} className="w-full min-w-0 text-[12px] font-semibold text-[#111111] bg-transparent outline-none" />
                  </div>
                  <div className="flex items-center border border-[#E7E7E7] rounded-xl px-3 py-2 bg-white min-w-0">
                    <span className="text-[10px] uppercase font-bold text-[#6B7280] mr-2">To:</span>
                    <input type="date" value={analyticsDateTo} onChange={e => { setAnalyticsDateTo(e.target.value); setAnalyticsDatePreset('custom'); }} className="w-full min-w-0 text-[12px] font-semibold text-[#111111] bg-transparent outline-none" />
                  </div>
                </div>
              </div>
            </div>

            {/* Revenue sub-tab */}
            {posAnalyticsTab === 'revenue' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                  {[
                    { label: 'TOTAL REVENUE',    helper: 'POS + manual combined', value: formatCurrency(analytics.totalCompletedRevenue), icon: <BadgeDollarSign size={16} />, color: 'text-emerald-500', bg: 'bg-emerald-50' },
                    { label: 'COMPLETED BILLS',  helper: 'POS + manual bills',    value: analytics.completedOrders,                       icon: <Trophy size={16} />,      color: 'text-emerald-500', bg: 'bg-emerald-50' },
                    { label: 'OFFLINE BILLS',    helper: 'Walk-in POS sales',     value: formatCurrency(analytics.posRevenue),            icon: <BadgeDollarSign size={16} />, color: 'text-cyan-500',    bg: 'bg-cyan-50' },
                    { label: 'ONLINE BILLS',     helper: 'Online POS sales',      value: formatCurrency(analytics.onlinePosRevenue),      icon: <BadgeDollarSign size={16} />, color: 'text-indigo-500',  bg: 'bg-indigo-50' },
                  ].map((card, index) => (
                    <div key={index} className="bg-white rounded-card border border-borderLight p-5 shadow-soft">
                      <div className="flex items-start justify-between gap-2 mb-4">
                        <div>
                          <p className="text-[11px] font-bold text-[#111111] uppercase tracking-wider mb-1">{card.label}</p>
                        </div>
                        <div className={`w-8 h-8 rounded-full ${card.bg} flex items-center justify-center ${card.color}`}>{card.icon}</div>
                      </div>
                      <p className="text-[28px] font-bold text-[#111111] leading-none mb-2">{card.value}</p>
                      <p className="text-[12px] text-[#6B7280]">{card.helper}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
                  {[
                    { label: 'TOTAL OFFLINE BILLS', helper: 'Walk-in POS orders',    value: analytics.offlineOrderCount,                    icon: <LayoutDashboard size={16} />, color: 'text-red-500',    bg: 'bg-red-50' },
                    { label: 'TOTAL ONLINE BILLS',  helper: 'Live completed online bills', value: analytics.onlineBillCount,               icon: <Box size={16} />,             color: 'text-blue-500',   bg: 'bg-blue-50' },
                    { label: 'TOTAL ITEMS SOLD',    helper: 'From completed bills',  value: Math.round(analytics.totalProductsSold),         icon: <Box size={16} />,             color: 'text-purple-500', bg: 'bg-purple-50' },
                    { label: 'AVERAGE REVENUE PER BILL', helper: 'Average per Bill', value: formatCurrency(analytics.averageRevenuePerBill), icon: <BadgeDollarSign size={16} />, color: 'text-emerald-500', bg: 'bg-emerald-50' },
                    { label: 'TOP PRODUCT',         helper: 'Most sold item',        value: analytics.bestProduct || '-',                    icon: <Trophy size={16} />,          color: 'text-pink-500',   bg: 'bg-pink-50' },
                  ].map((card, index) => (
                    <div key={index} className="bg-white rounded-card border border-borderLight p-5 shadow-soft">
                      <div className="flex items-start justify-between gap-2 mb-4">
                        <div>
                          <p className="text-[11px] font-bold text-[#111111] uppercase tracking-wider mb-1">{card.label}</p>
                        </div>
                        <div className={`w-8 h-8 rounded-full ${card.bg} flex items-center justify-center ${card.color}`}>{card.icon}</div>
                      </div>
                      <p className="text-[22px] font-bold text-[#111111] leading-none mb-2 truncate">{card.value}</p>
                      <p className="text-[12px] text-[#6B7280]">{card.helper}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                  <div className="xl:col-span-2 bg-white rounded-card border border-borderLight p-6 shadow-soft">
                    <div className="flex items-center gap-3 mb-6">
                      <h3 className="text-[16px] font-bold text-[#111111]">Revenue Trend {analytics.chartYear}</h3>
                    </div>
                    <div className="flex items-end gap-4 mb-4">
                      <span className="text-[24px] font-bold text-[#111111]">{formatCurrency(analytics.totalCompletedRevenue)}</span>
                      <span className="text-[12px] font-bold text-maroon-dark bg-red-50 px-2 py-1 rounded-md mb-1">Avg {formatCurrency(analytics.monthlyRevenue || 0)}/mo</span>
                    </div>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analytics.monthlyTrend}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                          <XAxis dataKey="month" tick={{ fill: '#6B7280', fontSize: 9, fontWeight: 700 }} axisLine={false} tickLine={false} interval={0} angle={-45} textAnchor="end" height={60} />
                          <YAxis hide />
                          <Tooltip cursor={{ fill: '#F9FAFB' }} formatter={(value) => formatCurrency(toNumber(value as number | string, 0))} />
                          <Bar dataKey="revenue" fill="#047857" radius={[4, 4, 0, 0]} barSize={12} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="space-y-6">
                    <div className="bg-white rounded-card border border-borderLight p-6 shadow-soft">
                      <h3 className="text-[16px] font-bold text-[#111111] mb-6">Order Source</h3>
                      <div className="space-y-4">
                        <div>
                          <div className="flex justify-between text-[12px] font-bold mb-2">
                            <span className="text-maroon-dark uppercase">Offline</span>
                            <span className="text-[#111111]">{analytics.completedOrders}</span>
                          </div>
                          <div className="w-full bg-[#F3F4F6] rounded-full h-2.5">
                            <div className="bg-maroon-dark h-2.5 rounded-full" style={{ width: '100%' }}></div>
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between text-[12px] font-bold mb-2">
                            <span className="text-[#6B7280] uppercase">Online</span>
                            <span className="text-[#111111]">0</span>
                          </div>
                          <div className="w-full bg-[#F3F4F6] rounded-full h-2.5">
                            <div className="bg-[#E5E7EB] h-2.5 rounded-full" style={{ width: '0%' }}></div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white rounded-card border border-borderLight p-6 shadow-soft">
                      <h3 className="text-[16px] font-bold text-[#111111] mb-4">Top Items by Revenue</h3>
                      <div className="space-y-3">
                        {analytics.topProducts.slice(0, 3).map((p, i) => (
                          <div key={i} className="flex items-center justify-between text-[13px]">
                            <div className="flex items-center gap-3">
                              <span className="font-bold text-[#6B7280] w-4">{i + 1}</span>
                              <span className="font-bold text-[#111111] truncate max-w-[120px]">{p.name}</span>
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="font-bold text-maroon-dark">{formatCurrency(p.revenue)}</span>
                              <span className="text-[#6B7280] text-[11px] w-8 text-right">{Math.round(p.qty)} pcs</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                  <div className="xl:col-span-2 bg-white rounded-card border border-borderLight p-6 shadow-soft">
                    <div className="flex items-center justify-between gap-3 mb-6">
                      <div>
                        <h3 className="text-[16px] font-bold text-[#111111]">Revenue Trend This Week</h3>
                        <p className="mt-1 text-[12px] text-[#6B7280]">Monday to Sunday sales view for the current week.</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-[#F9FAFB] px-3 py-1 text-[11px] font-bold text-[#047857]">
                          Week {(() => { const now = new Date(); const start = new Date(now.getFullYear(), 0, 1); const diff = Math.floor((now.getTime() - start.getTime()) / 86400000); return Math.ceil((diff + start.getDay() + 1) / 7) })()} of {new Date().getFullYear()}
                        </span>
                        <span className="rounded-full bg-[#F9FAFB] px-3 py-1 text-[11px] font-bold text-[#047857]">
                          Today: {formatCurrency(analytics.todaySales)}
                        </span>
                      </div>
                    </div>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analytics.weeklySales}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                          <XAxis dataKey="day" tick={{ fill: '#6B7280', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
                          <YAxis hide />
                          <Tooltip
                            cursor={{ fill: '#F9FAFB' }}
                            formatter={(value) => formatCurrency(toNumber(value as number | string, 0))}
                            labelFormatter={(_, payload) => {
                              const point = payload?.[0]?.payload as { day?: string; date?: string } | undefined
                              return point ? `${point.day || 'Day'} - ${point.date || ''}` : 'Weekly Revenue'
                            }}
                          />
                          <Bar dataKey="revenue" fill="#111111" radius={[4, 4, 0, 0]} barSize={28} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-white rounded-card border border-borderLight p-6 shadow-soft">
                    <h3 className="text-[16px] font-bold text-[#111111] mb-4">Top Products This Week</h3>
                    <div className="space-y-3">
                      {analytics.topProducts.slice(0, 5).map((p, i) => (
                        <div key={`${p.name}-${i}`} className="flex items-center justify-between rounded-xl bg-[#F9FAFB] p-3">
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-bold text-[#111111]">{p.name}</p>
                            <p className="text-[11px] text-[#6B7280]">{p.billCount} bills</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[13px] font-black text-[#111111]">{Math.round(p.qty)}</p>
                            <p className="text-[11px] font-bold text-[#10B981]">{formatCurrency(p.revenue)}</p>
                          </div>
                        </div>
                      ))}
                      {analytics.topProducts.length === 0 && (
                        <p className="text-[13px] text-[#6B7280]">No completed product sales yet.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Today's Sales sub-tab */}
            {posAnalyticsTab === 'today' && (
              <div className="space-y-6">
                {/* Key metrics row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: "Today's Revenue", value: formatCurrency(analytics.todaySales), icon: <BadgeDollarSign size={18} />, from: 'from-emerald-500 to-teal-600', to: 'via-emerald-600/40' },
                    { label: 'Orders', value: String(analytics.todayCompletedOrdersCount), icon: <ShoppingCart size={18} />, from: 'from-blue-500 to-indigo-600', to: 'via-indigo-600/40' },
                    { label: 'Items Sold', value: String(Math.round(analytics.todayItemsSold)), icon: <Package size={18} />, from: 'from-violet-500 to-purple-600', to: 'via-purple-600/40' },
                    { label: 'Avg Order', value: formatCurrency(analytics.todayAvgOrderValue), icon: <TrendingUp size={18} />, from: 'from-amber-500 to-orange-600', to: 'via-orange-600/40' },
                  ].map((card, i) => (
                    <div key={i} className={`relative overflow-hidden rounded-2xl p-5 shadow-lg border border-white/20 bg-gradient-to-br ${card.from}`}>
                      <div className="absolute inset-0 bg-gradient-to-tl from-white/30 via-white/10 to-transparent" />
                      <div className="relative z-10">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-[10px] uppercase font-black text-white/80 tracking-wider">{card.label}</p>
                          <div className="w-9 h-9 rounded-xl bg-white/25 backdrop-blur-sm flex items-center justify-center text-white shadow-sm">{card.icon}</div>
                        </div>
                        <p className="text-[26px] font-extrabold text-white drop-shadow-sm">{card.value}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Hourly trend + Top products */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                  <div className="xl:col-span-2 bg-white rounded-2xl border border-[#D1FAE5]/30 p-5 shadow-sm">
                    <h3 className="text-[15px] font-bold text-[#111111] mb-4">Hourly Sales Trend</h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analytics.todayHourlyTrend.filter(h => h.revenue > 0)}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                          <XAxis dataKey="hour" tick={{ fill: '#6B7280', fontSize: 10, fontWeight: 600 }} axisLine={false} tickLine={false} interval={0} angle={-45} textAnchor="end" height={50} />
                          <YAxis hide />
                          <Tooltip cursor={{ fill: '#F9FAFB' }} formatter={(value) => formatCurrency(toNumber(value as number | string, 0))} />
                          <Bar dataKey="revenue" fill="url(#todayGrad)" radius={[4, 4, 0, 0]} barSize={20} />
                          <defs>
                            <linearGradient id="todayGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#10B981" />
                              <stop offset="100%" stopColor="#111111" />
                            </linearGradient>
                          </defs>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    {analytics.todayHourlyTrend.filter(h => h.revenue > 0).length === 0 && (
                      <p className="text-center text-[13px] text-[#374151] py-8">No sales recorded today yet.</p>
                    )}
                  </div>

                  <div className="bg-white rounded-2xl border border-[#D1FAE5]/30 p-5 shadow-sm">
                    <h3 className="text-[15px] font-bold text-[#111111] mb-4">Top Products Today</h3>
                    <div className="space-y-3">
                      {analytics.todayTopProducts.map((p, i) => (
                        <div key={i} className="flex items-center justify-between bg-[#F9FAFB] p-3 rounded-xl">
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-bold text-[#111111] truncate">{p.name}</p>
                            <p className="text-[11px] text-[#374151]">{Math.round(p.qty)} sold</p>
                          </div>
                          <p className="text-[13px] font-black text-[#10B981] ml-2">{formatCurrency(p.revenue)}</p>
                        </div>
                      ))}
                      {analytics.todayTopProducts.length === 0 && (
                        <p className="text-center text-[13px] text-[#374151] py-6">No products sold yet today.</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Today's latest bills */}
                <div className="bg-white rounded-2xl border border-[#D1FAE5]/30 p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[15px] font-bold text-[#111111]">Today's Bills</h3>
                    <span className="text-[11px] font-bold text-[#10B981]">{analytics.todayCompletedOrdersCount} orders</span>
                  </div>
                  <div className="mb-3">
                    <input
                      type="text"
                      placeholder="Search by invoice number..."
                      value={todayBillsSearch}
                      onChange={e => setTodayBillsSearch(e.target.value)}
                      className="w-full px-4 py-2.5 bg-[#F9FAFB] border border-[#D1FAE5]/60 rounded-xl text-[13px] font-bold text-[#111111] placeholder:text-[#8A9384] focus:outline-none focus:border-[#047857] transition-colors"
                    />
                  </div>
                  {(() => {
                    const filteredBills = analytics.todayBills.filter(b => !todayBillsSearch || b.invoice_no?.toLowerCase().includes(todayBillsSearch.toLowerCase()))
                    return filteredBills.length > 0 ? (
                    <div className="overflow-x-auto rounded-xl border border-[#D1FAE5]/30">
                      <table className="w-full min-w-[480px] text-[12px]">
                        <thead className="bg-[#F9FAFB] text-[10px] uppercase tracking-wider text-[#374151]">
                          <tr>
                            <th className="px-3 py-2.5 font-black text-left">Invoice</th>
                            <th className="px-3 py-2.5 font-black text-left">Customer</th>
                            <th className="px-3 py-2.5 font-black text-left">Total</th>
                            <th className="px-3 py-2.5 font-black text-left">Time</th>
                            <th className="px-3 py-2.5 font-black text-left">Type</th>
                            <th className="px-3 py-2.5 font-black text-left">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#D1FAE5]/20">
                          {filteredBills.map(o => {
                            const btLabel = normalizeOrderType(o.order_type) === 'manual_sale' ? 'MANUAL' : normalizeOrderMode(o.order_mode) === 'online' ? 'ONLINE' : 'OFFLINE'
                            const btClass = normalizeOrderType(o.order_type) === 'manual_sale' ? 'bg-purple-100 text-purple-700' : normalizeOrderMode(o.order_mode) === 'online' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                            return (
                              <tr key={o.id} className="hover:bg-[#F9FAFB]/50">
                                <td className="px-3 py-2.5 font-bold text-[#10B981] text-[11px]">{o.invoice_no || '-'}</td>
                                <td className="px-3 py-2.5 font-semibold text-[#111111] max-w-[100px] truncate">{o.customer_name}</td>
                                <td className="px-3 py-2.5 font-black text-[#111111]">{formatCurrency(toNumber(o.total, 0))}</td>
                                <td className="px-3 py-2.5 text-[#374151] whitespace-nowrap">{new Date(o.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</td>
                                <td className="px-3 py-2.5"><span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${btClass}`}>{btLabel}</span></td>
                                <td className="px-3 py-2.5">
                                  <button onClick={() => void openOrderInvoice(o, 'view')} className="inline-flex items-center gap-1 rounded-lg border border-[#D1FAE5]/60 px-2 py-1.5 text-[11px] font-black text-[#111111] hover:bg-[#F9FAFB]" title="View Invoice">
                                    <Eye size={13} /> View Invoice
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-[13px] text-[#374151] text-center py-4">{todayBillsSearch ? 'No bills match your search.' : 'No bills yet today.'}</p>
                  )})()}
                </div>
              </div>
            )}

            {/* Products sub-tab */}
            {posAnalyticsTab === 'products' && (
              <div className="space-y-6">
                {/* Key metrics row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: 'Total Products Sold', value: String(Math.round(analytics.totalProductsSold)), icon: <Package size={18} />, from: 'from-emerald-500 to-teal-600' },
                    { label: 'Total Revenue', value: formatCurrency(analytics.totalCompletedRevenue), icon: <BadgeDollarSign size={18} />, from: 'from-blue-500 to-indigo-600' },
                    { label: 'Average Product Revenue', value: `${formatCurrency(analytics.averageProductRevenue)} / Product`, icon: <BadgeDollarSign size={18} />, from: 'from-violet-500 to-purple-600' },
                    { label: 'Top Product', value: analytics.bestProduct.length > 15 ? analytics.bestProduct.slice(0, 15) + '...' : analytics.bestProduct, icon: <Trophy size={18} />, from: 'from-amber-500 to-orange-600' },
                  ].map((card, i) => (
                    <div key={i} className={`relative overflow-hidden rounded-2xl p-5 shadow-lg border border-white/20 bg-gradient-to-br ${card.from}`}>
                      <div className="absolute inset-0 bg-gradient-to-tl from-white/30 via-white/10 to-transparent" />
                      <div className="relative z-10">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-[10px] uppercase font-black text-white/80 tracking-wider">{card.label}</p>
                          <div className="w-9 h-9 rounded-xl bg-white/25 backdrop-blur-sm flex items-center justify-center text-white shadow-sm">{card.icon}</div>
                        </div>
                        <p className="text-[22px] font-extrabold text-white drop-shadow-sm truncate">{card.value}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Product hourly trend + Top categories */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                  <div className="xl:col-span-2 bg-white rounded-2xl border border-[#D1FAE5]/30 p-5 shadow-sm">
                    <h3 className="text-[15px] font-bold text-[#111111] mb-4">Product Sales Hourly Trend</h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analytics.todayProductHourlyTrend.filter(h => h.qty > 0)}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                          <XAxis dataKey="hour" tick={{ fill: '#6B7280', fontSize: 10, fontWeight: 600 }} axisLine={false} tickLine={false} interval={0} angle={-45} textAnchor="end" height={50} />
                          <YAxis hide />
                          <Tooltip cursor={{ fill: '#F9FAFB' }} formatter={(value) => [`${value} items`, 'Qty Sold']} />
                          <Bar dataKey="qty" fill="url(#prodGrad)" radius={[4, 4, 0, 0]} barSize={20} />
                          <defs>
                            <linearGradient id="prodGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#10B981" />
                              <stop offset="100%" stopColor="#111111" />
                            </linearGradient>
                          </defs>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    {analytics.todayProductHourlyTrend.filter(h => h.qty > 0).length === 0 && (
                      <p className="text-center text-[13px] text-[#374151] py-8">No product sales recorded today yet.</p>
                    )}
                  </div>

                  <div className="bg-white rounded-2xl border border-[#D1FAE5]/30 p-5 shadow-sm">
                    <h3 className="text-[15px] font-bold text-[#111111] mb-4">Top Categories</h3>
                    <div className="space-y-3">
                      {analytics.topCategories.slice(0, 6).map((c) => (
                        <div key={c.name} className="flex items-center justify-between bg-[#F9FAFB] p-3 rounded-xl">
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-bold text-[#111111] truncate">{c.name}</p>
                            <p className="text-[11px] text-[#374151]">{Math.round(c.qty)} sold</p>
                          </div>
                          <p className="text-[13px] font-black text-[#10B981] ml-2">{formatCurrency(c.revenue)}</p>
                        </div>
                      ))}
                      {analytics.topCategories.length === 0 && (
                        <p className="text-center text-[13px] text-[#374151] py-6">No categories yet.</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Full product table */}
                <div className="bg-white rounded-2xl border border-[#D1FAE5]/30 p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[15px] font-bold text-[#111111]">All Products</h3>
                    <span className="text-[11px] font-bold text-[#10B981]">{analytics.topProducts.length} products</span>
                  </div>
                  {analytics.topProducts.length > 0 ? (
                    <>
                    <div className="space-y-3 md:hidden">
                      {analytics.topProducts.slice(0, 50).map((p, i) => (
                        <div key={`${p.name}-${p.variant || i}`} className="rounded-2xl border border-[#D1FAE5]/30 bg-[#FBFAF6] p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[13px] font-black text-[#9BAB9A]">#{i + 1}</p>
                              <p className="text-[16px] font-bold text-[#111111] break-words">{p.name}</p>
                              <p className="text-[13px] text-[#374151]">{p.variant || 'No variant'}</p>
                            </div>
                            <p className="text-[14px] font-black text-emerald-700">{formatCurrency(p.revenue)}</p>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-3 text-[13px]">
                            <div>
                              <p className="text-[#9BAB9A] uppercase text-[11px] font-black">Qty Sold</p>
                              <p className="font-bold text-[#111111]">{Math.round(p.qty)}</p>
                            </div>
                            <div>
                              <p className="text-[#9BAB9A] uppercase text-[11px] font-black">Bills</p>
                              <p className="font-bold text-[#111111]">{p.billCount}</p>
                            </div>
                            <div>
                              <p className="text-[#9BAB9A] uppercase text-[11px] font-black">Avg Revenue/Bill</p>
                              <p className="font-bold text-[#111111]">{formatCurrency(p.billCount > 0 ? p.revenue / p.billCount : 0)}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="hidden md:block overflow-x-auto rounded-xl border border-[#D1FAE5]/30">
                      <table className="w-full min-w-[580px] text-left text-[12px]">
                        <thead className="bg-[#F9FAFB] text-[10px] uppercase tracking-wider text-[#374151]">
                          <tr>
                            <th className="px-4 py-2.5 font-black">#</th>
                            <th className="px-4 py-2.5 font-black">Product</th>
                            <th className="px-4 py-2.5 font-black">Variant</th>
                            <th className="px-4 py-2.5 font-black">Qty Sold</th>
                            <th className="px-4 py-2.5 font-black">Revenue</th>
                            <th className="px-4 py-2.5 font-black">Bills</th>
                            <th className="px-4 py-2.5 font-black">Avg Revenue/Bill</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#D1FAE5]/20">
                          {analytics.topProducts.slice(0, 50).map((p, i) => (
                            <tr key={`${p.name}-${p.variant || i}`} className="hover:bg-[#F9FAFB]/50">
                              <td className="px-4 py-2 text-[11px] text-[#9BAB9A] font-bold">{i + 1}</td>
                              <td className="px-4 py-2 font-bold text-[#111111]">{p.name}</td>
                              <td className="px-4 py-2 text-[#374151]">{p.variant || '-'}</td>
                              <td className="px-4 py-2 font-bold">{Math.round(p.qty)}</td>
                              <td className="px-4 py-2 font-bold text-emerald-700">{formatCurrency(p.revenue)}</td>
                              <td className="px-4 py-2 text-[#374151]">{p.billCount}</td>
                              <td className="px-4 py-2 font-bold text-[#111111]">{formatCurrency(p.billCount > 0 ? p.revenue / p.billCount : 0)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    </>
                  ) : (
                    <p className="text-center text-[13px] text-[#374151] py-6">No product sales in selected period</p>
                  )}
                </div>
              </div>
            )}

            {/* Categories sub-tab */}
            {posAnalyticsTab === 'categories' && (
              <div className="bg-white rounded-2xl border border-[#D1FAE5]/30 p-5 shadow-sm">
                <h3 className="text-base font-black text-[#111111] mb-4">{l('Category Analytics', 'வகை பகுப்பாய்வு')}</h3>
                {analytics.topCategories.length > 0 ? (
                  <>
                  <div className="space-y-3 md:hidden">
                    {analytics.topCategories.map((c, i) => (
                      <div key={c.name} className="rounded-2xl border border-[#D1FAE5]/30 bg-[#FBFAF6] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[13px] font-black text-[#9BAB9A]">#{i + 1}</p>
                            <p className="text-[16px] font-bold text-[#111111] break-words">{c.name}</p>
                          </div>
                          <p className="text-[14px] font-black text-emerald-700">{formatCurrency(c.revenue)}</p>
                        </div>
                        <div className="mt-3">
                          <p className="text-[#9BAB9A] uppercase text-[11px] font-black">Qty Sold</p>
                          <p className="font-bold text-[#111111]">{Math.round(c.qty)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="hidden md:block overflow-x-auto rounded-xl border border-[#D1FAE5]/30">
                    <table className="w-full text-left text-[13px]">
                      <thead className="bg-[#F9FAFB] text-[10px] uppercase tracking-wider text-[#374151]">
                        <tr>
                          <th className="px-4 py-2.5 font-black">#</th>
                          <th className="px-4 py-2.5 font-black">{l('Category', 'வகை')}</th>
                          <th className="px-4 py-2.5 font-black">{l('Revenue', 'வருவாய்')}</th>
                          <th className="px-4 py-2.5 font-black">{l('Qty Sold', 'விற்ற அளவு')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#D1FAE5]/20">
                        {analytics.topCategories.map((c, i) => (
                          <tr key={c.name} className="hover:bg-[#F9FAFB]/50">
                            <td className="px-4 py-2 text-[11px] text-[#9BAB9A] font-bold">{i + 1}</td>
                            <td className="px-4 py-2 font-bold text-[#111111]">{c.name}</td>
                            <td className="px-4 py-2 font-bold text-emerald-700">{formatCurrency(c.revenue)}</td>
                            <td className="px-4 py-2 text-[#374151]">{Math.round(c.qty)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  </>
                ) : (
                  <p className="text-center text-[13px] text-[#374151] py-6">{l('No data in selected period', 'தேர்ந்த காலத்தில் தரவு இல்லை')}</p>
                )}
              </div>
            )}

            {/* Coupons sub-tab */}
            {posAnalyticsTab === 'coupons' && (
              <div className="space-y-6">
                {/* Key metrics row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: 'Coupons Used', value: String(analytics.totalCouponOrders), icon: <ShoppingCart size={18} />, from: 'from-emerald-500 to-teal-600' },
                    { label: 'Total Discounts Given', value: formatCurrency(analytics.totalCouponDiscounts), icon: <BadgeDollarSign size={18} />, from: 'from-blue-500 to-indigo-600' },
                    { label: 'Usage Rate', value: `${analytics.couponUsageRate.toFixed(1)}%`, icon: <TrendingUp size={18} />, from: 'from-violet-500 to-purple-600' },
                    { label: 'Unique Coupons', value: String(analytics.topCoupons.length), icon: <Trophy size={18} />, from: 'from-amber-500 to-orange-600' },
                  ].map((card, i) => (
                    <div key={i} className={`relative overflow-hidden rounded-2xl p-5 shadow-lg border border-white/20 bg-gradient-to-br ${card.from}`}>
                      <div className="absolute inset-0 bg-gradient-to-tl from-white/30 via-white/10 to-transparent" />
                      <div className="relative z-10">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-[10px] uppercase font-black text-white/80 tracking-wider">{card.label}</p>
                          <div className="w-9 h-9 rounded-xl bg-white/25 backdrop-blur-sm flex items-center justify-center text-white shadow-sm">{card.icon}</div>
                        </div>
                        <p className="text-[22px] font-extrabold text-white drop-shadow-sm truncate">{card.value}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Coupon daily trend + Top coupons */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                  <div className="xl:col-span-2 bg-white rounded-2xl border border-[#D1FAE5]/30 p-5 shadow-sm">
                    <h3 className="text-[15px] font-bold text-[#111111] mb-4">Coupon Usage (Last 7 Days)</h3>
                    {analytics.couponDailyTrend.some(d => d.orders > 0) ? (
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={analytics.couponDailyTrend}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                            <XAxis dataKey="day" tick={{ fill: '#6B7280', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
                            <YAxis hide />
                            <Tooltip cursor={{ fill: '#F9FAFB' }} formatter={(value, name) => [value, name === 'orders' ? 'Orders' : 'Discounts']} />
                            <Bar dataKey="orders" fill="url(#couponGrad)" radius={[4, 4, 0, 0]} barSize={24} />
                            <defs>
                              <linearGradient id="couponGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#10B981" />
                                <stop offset="100%" stopColor="#111111" />
                              </linearGradient>
                            </defs>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <p className="text-center text-[13px] text-[#374151] py-12">No coupon usage in the last 7 days.</p>
                    )}
                  </div>

                  <div className="bg-white rounded-2xl border border-[#D1FAE5]/30 p-5 shadow-sm">
                    <h3 className="text-[15px] font-bold text-[#111111] mb-4">Top Coupons</h3>
                    <div className="space-y-3">
                      {analytics.topCoupons.slice(0, 8).map((coupon, i) => (
                        <div key={coupon.code} className="flex items-center justify-between gap-2 p-3 bg-[#F9FAFB] rounded-xl">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black text-[#9BAB9A]">{i + 1}</span>
                              <p className="text-[13px] font-bold text-[#111111] truncate">{coupon.code}</p>
                            </div>
                            <p className="text-[11px] text-[#374151] ml-5">{coupon.usage} order{coupon.usage > 1 ? 's' : ''}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[13px] font-black text-emerald-700">{formatCurrency(coupon.discounts)}</p>
                            <p className="text-[10px] text-[#374151]">discounted</p>
                          </div>
                        </div>
                      ))}
                      {analytics.topCoupons.length === 0 && (
                        <p className="text-center text-[13px] text-[#374151] py-6">No coupon usage yet</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Coupon detail table */}
                {analytics.topCoupons.length > 0 && (
                  <div className="bg-white rounded-2xl border border-[#D1FAE5]/30 p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-[15px] font-bold text-[#111111]">All Coupons Performance</h3>
                      <span className="text-[11px] font-bold text-[#10B981]">{analytics.topCoupons.length} coupons</span>
                    </div>
                    <div className="space-y-3 md:hidden">
                      {analytics.topCoupons.map((coupon, i) => (
                        <div key={coupon.code} className="rounded-2xl border border-[#D1FAE5]/30 bg-[#FBFAF6] p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[13px] font-black text-[#9BAB9A]">#{i + 1}</p>
                              <p className="text-[16px] font-bold text-[#111111] break-words">{coupon.code}</p>
                            </div>
                            <p className="text-[14px] font-black text-emerald-700">{formatCurrency(coupon.discounts)}</p>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-3 text-[13px]">
                            <div>
                              <p className="text-[#9BAB9A] uppercase text-[11px] font-black">Orders</p>
                              <p className="font-bold text-[#111111]">{coupon.usage}</p>
                            </div>
                            <div>
                              <p className="text-[#9BAB9A] uppercase text-[11px] font-black">Avg Discount</p>
                              <p className="font-semibold text-[#374151]">{coupon.usage > 0 ? formatCurrency(coupon.discounts / coupon.usage) : '-'}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="hidden md:block overflow-x-auto rounded-xl border border-[#D1FAE5]/30">
                      <table className="w-full min-w-[400px] text-left text-[12px]">
                        <thead className="bg-[#F9FAFB] text-[10px] uppercase tracking-wider text-[#374151]">
                          <tr>
                            <th className="px-4 py-2.5 font-black">#</th>
                            <th className="px-4 py-2.5 font-black">Code</th>
                            <th className="px-4 py-2.5 font-black">Orders</th>
                            <th className="px-4 py-2.5 font-black">Total Discount</th>
                            <th className="px-4 py-2.5 font-black">Avg Discount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#D1FAE5]/20">
                          {analytics.topCoupons.map((coupon, i) => (
                            <tr key={coupon.code} className="hover:bg-[#F9FAFB]/50">
                              <td className="px-4 py-2 text-[11px] text-[#9BAB9A] font-bold">{i + 1}</td>
                              <td className="px-4 py-2 font-bold text-[#111111]">{coupon.code}</td>
                              <td className="px-4 py-2 font-bold">{coupon.usage}</td>
                              <td className="px-4 py-2 font-bold text-emerald-700">{formatCurrency(coupon.discounts)}</td>
                              <td className="px-4 py-2 text-[#374151]">{coupon.usage > 0 ? formatCurrency(coupon.discounts / coupon.usage) : '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── BILLING PANEL ── */}
        {tab === 'billing' && (
          <div className="-m-4 sm:-m-6 lg:-m-8">
            <Pos isEmbedded />
          </div>
        )}

        {tab === 'advance_orders' && <AdvanceOrders onOrderCompleted={handleAdvanceOrderCompleted} />}

        {/* ── ORDER MANAGEMENT ── */}
        {tab === 'history' && (
          <div className="space-y-4 sm:space-y-6 rounded-[20px] sm:rounded-[28px] border border-[#D1FAE5]/60 bg-[#FBFAF6] p-3 sm:p-6 lg:p-7 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#10B981]">{l('Billing history', 'பில் வரலாறு')}</p>
                <h2 className="mt-1 text-xl font-black text-[#111111]">{l('Order Management', 'ஆர்டர் மேலாண்மை')} <span className="text-[11px] font-semibold text-[#374151]">({l('POS Bills only', 'POS பில்கள் மட்டுமே')})</span></h2>
              </div>
              <div className="flex gap-2">
                <Link to="/pos" className="inline-flex items-center gap-2 rounded-xl bg-[#111111] px-4 py-2 text-[13px] font-bold text-white shadow-sm hover:bg-[#1f281d]">
                  <ShoppingCart size={14} /> Open POS
                </Link>
              </div>
            </div>
            <div className="rounded-2xl border border-[#D1FAE5]/60 bg-white p-3 sm:p-6 shadow-sm">
              {/* Bill type filter */}
              <div className="flex flex-wrap gap-2 mb-4">
                {([
                  { v: 'all',     l: l('All Bills', 'அனைத்து') },
                  { v: 'offline', l: l('Offline', 'ஆஃப்லைன்') },
                  { v: 'online',  l: l('Online', 'ஆன்லைன்') },
                  { v: 'manual',  l: l('Manual', 'கைமுறை') },
                ] as const).map(({ v, l }) => (
                  <button key={v} type="button" onClick={() => setBillTypeFilter(v)}
                    className={`min-h-[44px] px-3 py-1.5 rounded-xl text-[12px] font-black transition-colors ${billTypeFilter === v ? 'bg-[#111111] text-white shadow-sm' : 'bg-[#F9FAFB] text-[#374151] hover:bg-[#D1FAE5]/40'}`}>
                    {l}
                  </button>
                ))}
              </div>
              <form onSubmit={runSearch} className="space-y-3 mb-4">
                <div className="flex flex-wrap gap-2 items-center">
                  {(['today', 'week', 'month', 'custom'] as const).map(preset => (
                    <button key={preset} type="button" onClick={() => applyDatePreset(preset)}
                      className={`min-h-[44px] px-3 py-1.5 rounded-xl text-[12px] font-black transition-colors ${datePreset === preset ? 'bg-[#047857] text-white shadow-sm' : 'bg-[#F9FAFB] text-[#374151] hover:bg-[#D1FAE5]/40'}`}>
                      {preset === 'today' ? l('Today','இன்று') : preset === 'week' ? l('This Week','இந்த வாரம்') : preset === 'month' ? l('This Month','இந்த மாதம்') : l('Custom Range','தேர்வு')}
                    </button>
                  ))}
                  {(search.dateFrom || search.dateTo || datePreset) && (
                    <button type="button" onClick={() => { setDatePreset(''); setSearch(s => ({ ...s, dateFrom: '', dateTo: '' })) }}
                      className="min-h-[44px] px-3 py-1.5 rounded-xl text-[12px] font-black text-[#047857] hover:bg-[#047857]/5">{l('Clear Dates', 'தேதி அழி')}</button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <input className="min-h-[48px] rounded-xl bg-[#F9FAFB] px-3 py-2.5 text-[16px] md:text-[13px] font-semibold text-[#111111] placeholder:text-[#8A9384] focus:outline-none focus:ring-2 focus:ring-[#047857]/15" placeholder={l('Invoice / Bill No', 'பில் எண்')}
                    value={search.invoiceNo} onChange={e => setSearch(s => ({ ...s, invoiceNo: e.target.value }))} />
                  <input className="min-h-[48px] rounded-xl bg-[#F9FAFB] px-3 py-2.5 text-[16px] md:text-[13px] font-semibold text-[#111111] placeholder:text-[#8A9384] focus:outline-none focus:ring-2 focus:ring-[#047857]/15" placeholder={l('Customer Name', 'வாடிக்கையாளர் பெயர்')}
                    value={search.customerName} onChange={e => setSearch(s => ({ ...s, customerName: e.target.value }))} />
                  <input className="min-h-[48px] rounded-xl bg-[#F9FAFB] px-3 py-2.5 text-[16px] md:text-[13px] font-semibold text-[#111111] placeholder:text-[#8A9384] focus:outline-none focus:ring-2 focus:ring-[#047857]/15" placeholder={l('Mobile Number', 'மொபைல் எண்')}
                    value={search.phone} onChange={e => setSearch(s => ({ ...s, phone: e.target.value }))} />
                  {datePreset === 'custom' ? (
                    <>
                      <input type="date" className="min-h-[48px] rounded-xl bg-[#F9FAFB] px-3 py-2.5 text-[16px] md:text-[13px] font-semibold text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#047857]/15"
                        value={search.dateFrom} onChange={e => setSearch(s => ({ ...s, dateFrom: e.target.value }))} />
                      <input type="date" className="min-h-[48px] rounded-xl bg-[#F9FAFB] px-3 py-2.5 text-[16px] md:text-[13px] font-semibold text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#047857]/15"
                        value={search.dateTo} onChange={e => setSearch(s => ({ ...s, dateTo: e.target.value }))} />
                    </>
                  ) : (
                    <button type="submit" disabled={searchLoading}
                      className="sm:col-span-2 min-h-[48px] flex items-center justify-center gap-2 rounded-xl bg-[#047857] py-2.5 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-[#065F46] disabled:opacity-60">
                      <Search size={14} /> {searchLoading ? l('Searching...','தேடுகிறது...') : l('Search Bills','தேடு')}
                    </button>
                  )}
                  {datePreset === 'custom' && (
                    <button type="submit" disabled={searchLoading}
                      className="sm:col-span-2 lg:col-span-4 min-h-[48px] flex items-center justify-center gap-2 rounded-xl bg-[#047857] py-2.5 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-[#065F46] disabled:opacity-60">
                      <Search size={14} /> {searchLoading ? l('Searching...','தேடுகிறது...') : l('Search Bills','தேடு')}
                    </button>
                  )}
                </div>
              </form>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-semibold text-[#374151]">{filteredSearchResults.length} {l('result(s)', 'முடிவுகள்')}</p>
                {filteredSearchResults.length > 0 && (
                  <button onClick={() => exportCSV(filteredSearchResults)}
                    className="flex items-center gap-1 text-[11px] font-bold text-[#047857] hover:underline">
                    <Download size={11} /> Export CSV
                  </button>
                )}
              </div>
              <div className="space-y-3 md:hidden">
                {filteredSearchResults.slice(0, 50).map(o => {
                  const billTypeLabel = normalizeOrderType(o.order_type) === 'manual_sale' ? 'MANUAL' : normalizeOrderMode(o.order_mode) === 'online' ? 'ONLINE' : 'OFFLINE'
                  const billTypeClass = normalizeOrderType(o.order_type) === 'manual_sale' ? 'bg-purple-50 text-purple-700' : normalizeOrderMode(o.order_mode) === 'online' ? 'bg-blue-50 text-blue-700' : 'bg-orange-50 text-orange-700'
                  return (
                    <div key={o.id} className="rounded-2xl border border-[#D1FAE5]/60 bg-[#FBFAF6] p-3 sm:p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[13px] font-black text-[#111111] break-words">{o.invoice_no || '—'}</p>
                          <p className="text-[13px] text-[#374151]">{new Date(o.created_at).toLocaleDateString('en-IN')}</p>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase ${billTypeClass}`}>{billTypeLabel}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:gap-3 text-[12px] sm:text-[13px]">
                        <div className="min-w-0">
                          <p className="text-[#9BAB9A] uppercase text-[10px] sm:text-[11px] font-black">Customer</p>
                          <p className="font-bold text-[#111111] truncate">{o.customer_name || '—'}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[#9BAB9A] uppercase text-[10px] sm:text-[11px] font-black">Phone</p>
                          <p className="font-semibold text-[#374151] truncate">{o.phone || '—'}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[#9BAB9A] uppercase text-[10px] sm:text-[11px] font-black">Total</p>
                          <p className="font-black text-[#111111]">{formatCurrency(toNumber(o.total, 0))}</p>
                        </div>
                        <div>
                          <p className="text-[#9BAB9A] uppercase text-[11px] font-black">Coupon</p>
                          <p className="font-semibold text-[#374151] break-words">{o.coupon_code || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[#9BAB9A] uppercase text-[11px] font-black">Discount</p>
                          <p className="font-semibold text-emerald-700">{o.discount_amount > 0 ? `-${formatCurrency(o.discount_amount)}` : '—'}</p>
                        </div>
                        <div>
                          <p className="text-[#9BAB9A] uppercase text-[11px] font-black">Delivery</p>
                          <p className="font-semibold text-[#111111]">{o.delivery_charge > 0 ? formatCurrency(o.delivery_charge) : '—'}</p>
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2 pt-1">
                        <div className="flex gap-2 w-full sm:flex-1">
                          <button onClick={() => void openOrderInvoice(o, 'view')} className="inline-flex h-10 sm:min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#D1FAE5]/60 px-2 sm:px-3 text-[12px] font-black text-[#111111] transition-colors hover:bg-white" title="View Invoice">
                            <Eye size={14} /> View
                          </button>
                          <button onClick={() => window.open(`/invoice/${o.id}`, '_blank')} className="inline-flex h-10 sm:min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-green-500 px-2 sm:px-3 text-[12px] font-black text-white transition-colors hover:bg-green-600" title="Invoice & Share">
                            <MessageCircle size={14} /> Share
                          </button>
                        </div>
                        <div className="flex gap-2 w-full sm:flex-1">
                        <select value={normalizeStatus(o.status)} onChange={e => void updateOrderStatus(o.id, e.target.value)}
                          className={`min-h-[44px] flex-1 cursor-pointer rounded-xl border px-3 py-2 text-[12px] font-black outline-none ${normalizeStatus(o.status) === 'completed' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                          <option value="pending">{l('Pending', 'நிலுவை')}</option>
                          <option value="completed">{l('Completed', 'முடிந்தது')}</option>
                        </select>
                        <button onClick={() => void deleteOrder(o.id, o.invoice_no)} className="h-10 w-10 sm:h-11 sm:w-11 shrink-0 rounded-xl border border-[#D1FAE5]/60 text-[#047857] transition-colors hover:bg-[#047857]/5" title="Delete Order">
                          <Trash2 size={14} className="mx-auto" />
                        </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {filteredSearchResults.length === 0 && (
                  <div className="rounded-2xl border border-[#D1FAE5]/60 bg-[#FBFAF6] px-4 py-8 text-center text-[#374151]">{l('No matching bills', 'பில்கள் இல்லை')}</div>
                )}
              </div>
              <div className="hidden md:block overflow-x-auto rounded-xl border border-[#D1FAE5]/60 bg-[#FBFAF6]">
                <table className="w-full min-w-[800px] text-left text-[13px]">
                  <thead className="bg-[#F9FAFB] text-[10px] uppercase tracking-wider text-[#374151]">
                    <tr>
                      {['Invoice No', 'Customer Name', 'Phone', 'Bill Type', 'Coupon', 'Discount', 'Delivery', 'Total', 'Date', 'Status', 'Actions'].map(h => (
                        <th key={h} className="px-3 py-3 font-black">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#D1FAE5]/30 bg-white">
                    {filteredSearchResults.slice(0, 50).map(o => {
                      const billTypeLabel = normalizeOrderType(o.order_type) === 'manual_sale' ? 'MANUAL' : normalizeOrderMode(o.order_mode) === 'online' ? 'ONLINE' : 'OFFLINE'
                      const billTypeClass = normalizeOrderType(o.order_type) === 'manual_sale' ? 'bg-purple-50 text-purple-700' : normalizeOrderMode(o.order_mode) === 'online' ? 'bg-blue-50 text-blue-700' : 'bg-orange-50 text-orange-700'
                      return (
                        <React.Fragment key={o.id}>
                        <tr key={o.id} className="hover:bg-[#F9FAFB]">
                          <td className="whitespace-nowrap px-3 py-3 text-[12px] font-bold text-[#111111]">{o.invoice_no || '—'}</td>
                          <td className="max-w-[110px] truncate px-3 py-3 text-[12px] font-semibold text-[#111111]">{o.customer_name}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-[12px] text-[#374151]">{o.phone}</td>
                          <td className="px-3 py-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${billTypeClass}`}>{billTypeLabel}</span></td>
                          <td className="px-3 py-3 text-[12px]">
                            {o.coupon_code ? <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">{o.coupon_code}</span> : <span className="text-[#9BAB9A]">—</span>}
                          </td>
                          <td className="px-3 py-3 text-[12px]">
                            {o.discount_amount > 0 ? <span className="font-bold text-emerald-700">-{formatCurrency(o.discount_amount)}</span> : <span className="text-[#9BAB9A]">—</span>}
                          </td>
                          <td className="px-3 py-3 text-[12px]">
                            {o.delivery_charge > 0 ? <span className="font-bold text-[#111111]">{formatCurrency(o.delivery_charge)}</span> : <span className="text-[#9BAB9A]">—</span>}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-[13px] font-bold text-[#111111]">{formatCurrency(toNumber(o.total, 0))}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-[12px] text-[#374151]">{new Date(o.created_at).toLocaleDateString('en-IN')}</td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2">
                              <select value={normalizeStatus(o.status)} onChange={e => void updateOrderStatus(o.id, e.target.value)}
                                className={`cursor-pointer rounded-lg border px-2 py-1 text-[11px] font-black outline-none ${normalizeStatus(o.status) === 'completed' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                                <option value="pending">{l('Pending', 'நிலுவை')}</option>
                                <option value="completed">{l('Completed', 'முடிந்தது')}</option>
                              </select>
                              <button onClick={() => void deleteOrder(o.id, o.invoice_no)} className="rounded-lg p-1 text-[#047857] transition-colors hover:bg-[#047857]/5" title="Delete Order">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1">
                              <button onClick={() => void openOrderInvoice(o, 'view')} className="rounded-lg p-1.5 text-[#111111] transition-colors hover:bg-[#F9FAFB]" title="View Invoice">
                                <Eye size={14} />
                              </button>
                              <button onClick={() => window.open(`/invoice/${o.id}`, '_blank')} className="rounded-lg p-1.5 text-green-600 transition-colors hover:bg-green-50" title="Invoice & Share">
                                <MessageCircle size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                        </React.Fragment>
                      )
                    })}
                    {filteredSearchResults.length === 0 && (
                      <tr><td colSpan={11} className="px-4 py-8 text-center text-[#374151]">{l('No matching bills', 'பில்கள் இல்லை')}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ΓöÇΓöÇ INVENTORY TAB ΓöÇΓöÇ */}
        {tab === 'products' && (
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
            {/* Product Form */}
            <div className="xl:col-span-2">
              <form onSubmit={handleSaveProd} className="bg-white rounded-2xl border border-borderLight p-6 shadow-sm space-y-5">
                <h3 className="text-[18px] font-black text-[#111111]">{editingProd ? l('Edit Product', 'திருத்து') : l('Add Product', 'சேர்க்கவும்')}</h3>

                {productNotice && (
                  <div className={`p-3 rounded-xl text-[13px] font-bold text-center ${productNotice.includes('!') && !productNotice.toLowerCase().includes('error') && !productNotice.toLowerCase().includes('fail') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {productNotice}
                  </div>
                )}

                {/* Product Type */}
                <div>
                  <label className="block text-[11px] font-black uppercase text-[#6B7280] tracking-wider mb-2">{l('Product Type', 'பொருள் வகை')} *</label>
                  <div className="grid grid-cols-2 gap-3">
                    {UNIT_TYPE_OPTIONS.map(opt => (
                      <button key={opt.value} type="button"
                        onClick={() => {
                          const defaults = DEFAULT_OPTIONS_FOR_TYPE[opt.value]
                          const unitLabel = opt.value === 'weight' ? 'g' : opt.value === 'volume' ? 'ml' : opt.value === 'bundle' ? 'bundle' : 'piece'
                          const baseQty = opt.value === 'weight' ? 100 : opt.value === 'volume' ? 250 : 1
                          setProdForm(f => ({ ...f, unitType: opt.value, unitLabel, baseQuantity: baseQty, predefinedOptionsText: defaults, allowDecimalQuantity: opt.value === 'weight' || opt.value === 'volume' }))
                        }}
                        className={`p-3 rounded-xl text-left border-2 transition-colors ${prodForm.unitType === opt.value ? 'border-maroon-dark bg-maroon-dark/5' : 'border-[#F3F4F6] hover:border-[#D1D5DB]'}`}>
                        <p className={`text-[13px] font-black ${prodForm.unitType === opt.value ? 'text-maroon-dark' : 'text-[#111111]'}`}>{opt.label}</p>
                        <p className="text-[11px] text-[#6B7280] leading-tight mt-1">{opt.hint}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-[11px] font-black uppercase text-[#6B7280] tracking-wider mb-1">{l('Product Name', 'பொருள் பெயர்')} *</label>
                    <input required className="w-full px-4 py-2.5 bg-[#FAFAFA] border border-[#F3F4F6] focus:border-maroon-dark rounded-xl text-[13px] font-bold outline-none transition-colors"
                      placeholder="e.g. Manjal Podi" value={prodForm.name} onChange={e => setProdForm(f => ({...f, name: e.target.value}))} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[11px] font-black uppercase text-[#6B7280] tracking-wider mb-1">{l('Tamil Name', 'தமிழ் பெயர்')}</label>
                    <input className="w-full px-4 py-2.5 bg-[#FAFAFA] border border-[#F3F4F6] focus:border-maroon-dark rounded-xl text-[13px] font-bold outline-none transition-colors"
                      placeholder="எ.கா. மஞ்சள் பொடி" value={prodForm.nameTa} onChange={e => setProdForm(f => ({...f, nameTa: e.target.value}))} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black uppercase text-[#6B7280] tracking-wider mb-1">{l('Price (RM)', 'விலை (RM)')} *</label>
                    <input required type="number" min="0" step="0.01"
                      className="w-full px-4 py-2.5 bg-[#FAFAFA] border border-[#F3F4F6] focus:border-maroon-dark rounded-xl text-[13px] font-bold outline-none transition-colors"
                      value={prodForm.price} onChange={e => setProdForm(f => ({...f, price: Number(e.target.value)}))} />
                    <p className="text-[11px] text-[#6B7280] mt-1">
                      {prodForm.unitType === 'weight' ? `Per ${prodForm.baseQuantity}g` : prodForm.unitType === 'volume' ? `Per ${prodForm.baseQuantity}ml` : 'Per piece/bundle'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-[11px] font-black uppercase text-[#6B7280] tracking-wider mb-1">{l('Purchase Price (RM)', 'வாங்கிய விலை')} *</label>
                    <input required type="number" min="0" step="0.01"
                      className="w-full px-4 py-2.5 bg-[#FAFAFA] border border-[#F3F4F6] focus:border-maroon-dark rounded-xl text-[13px] font-bold outline-none transition-colors"
                      value={prodForm.purchasePrice} onChange={e => setProdForm(f => ({...f, purchasePrice: Number(e.target.value)}))} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black uppercase text-[#6B7280] tracking-wider mb-1">{l('MRP (RM)', 'MRP (RM)')}</label>
                    <input type="number" min="0" step="0.01"
                      className="w-full px-4 py-2.5 bg-[#FAFAFA] border border-[#F3F4F6] focus:border-maroon-dark rounded-xl text-[13px] font-bold outline-none transition-colors"
                      placeholder="Maximum Retail Price"
                      value={prodForm.mrp} onChange={e => setProdForm(f => ({...f, mrp: e.target.value}))} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black uppercase text-[#6B7280] tracking-wider mb-1">{l('Offer Price (RM)', 'சலுகை விலை')}</label>
                    <input type="number" min="0" step="0.01"
                      className="w-full px-4 py-2.5 bg-[#FAFAFA] border border-[#F3F4F6] focus:border-maroon-dark rounded-xl text-[13px] font-bold outline-none transition-colors"
                      placeholder="Leave blank for no discount"
                      value={prodForm.offerPrice} onChange={e => setProdForm(f => ({...f, offerPrice: e.target.value}))} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black uppercase text-[#6B7280] tracking-wider mb-1">{l('SKU', 'SKU')}</label>
                    <input className="w-full px-4 py-2.5 bg-[#FAFAFA] border border-[#F3F4F6] focus:border-maroon-dark rounded-xl text-[13px] font-bold outline-none transition-colors"
                      placeholder="e.g. MP-100G" value={prodForm.sku} onChange={e => setProdForm(f => ({...f, sku: e.target.value}))} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black uppercase text-[#6B7280] tracking-wider mb-1">{l('Barcode', 'பார்கோடு')}</label>
                    <input className="w-full px-4 py-2.5 bg-[#FAFAFA] border border-[#F3F4F6] focus:border-maroon-dark rounded-xl text-[13px] font-bold outline-none transition-colors"
                      placeholder="e.g. 8901234567890" value={prodForm.barcode} onChange={e => setProdForm(f => ({...f, barcode: e.target.value}))} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black uppercase text-[#6B7280] tracking-wider mb-1">{l('Stock', 'இருப்பு')} *</label>
                    <input required type="number" min="0"
                      className="w-full px-4 py-2.5 bg-[#FAFAFA] border border-[#F3F4F6] focus:border-maroon-dark rounded-xl text-[13px] font-bold outline-none transition-colors"
                      value={prodForm.stockQuantity} onChange={e => setProdForm(f => ({...f, stockQuantity: Number(e.target.value)}))} />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-[11px] font-black uppercase text-[#6B7280] tracking-wider mb-1">{l('Category', 'வகை')} *</label>
                    <select required className="w-full min-w-0 h-11 px-4 py-2.5 bg-[#FAFAFA] border border-[#F3F4F6] focus:border-maroon-dark rounded-xl text-[13px] font-bold outline-none transition-colors touch-manipulation"
                      value={prodForm.category}
                      onChange={e => {
                        const sel = cats.find(c => c.name_en === e.target.value)
                        setProdForm(f => ({ ...f, category: e.target.value, categoryId: sel?.id || null }))
                      }}>
                      <option value="">{l('Select category...', 'வகை தேர்வு செய்யுங்கள்...')}</option>
                      {cats.map(c => <option key={c.id} value={c.name_en}>{c.name_en}</option>)}
                    </select>
                    <button
                      type="button"
                      onClick={() => setCategoryManagerOpen(open => !open)}
                      className="mt-2 text-[11px] font-black text-maroon-dark hover:underline"
                    >
                      {categoryManagerOpen ? 'Hide categories' : 'Manage categories'}
                    </button>
                    {categoryManagerOpen && (
                      <div className="mt-2 rounded-xl border border-[#D1FAE5]/60 bg-white p-2 space-y-1">
                        {cats.length === 0 ? (
                          <p className="px-2 py-1 text-[11px] text-[#6B7280]">No categories available.</p>
                        ) : activeCategories.map(c => (
                          <div key={c.id} className="relative flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-red-50">
                            <span className="truncate text-[12px] font-bold text-[#111111]">{c.name_en}</span>
                            <button
                              type="button"
                              onClick={() => setOpenCategoryMenuId(id => id === c.id ? null : c.id)}
                              className="shrink-0 rounded-lg p-1.5 text-[#6B7280] hover:bg-white hover:text-[#111111]"
                              aria-label={`Actions for ${c.name_en}`}
                            >
                              <MoreVertical size={14} />
                            </button>
                            {openCategoryMenuId === c.id && (
                              <div className="absolute right-2 top-9 z-20 min-w-28 rounded-xl border border-[#D1FAE5]/60 bg-white p-1 shadow-lg">
                                <button type="button" onClick={() => { setEditingCategoryId(c.id); setNewCat({ name_en: c.name_en, name_ta: c.name_ta || '' }); setOpenCategoryMenuId(null) }} className="block w-full rounded-lg px-3 py-2 text-left text-[11px] font-bold text-[#111111] hover:bg-[#F9FAFB]">Edit / Rename</button>
                                <button type="button" onClick={() => { setOpenCategoryMenuId(null); void deleteCat(c) }} className="block w-full rounded-lg px-3 py-2 text-left text-[11px] font-bold text-red-600 hover:bg-red-50">Delete</button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Predefined Options (weight/volume only) */}
                {(prodForm.unitType === 'weight' || prodForm.unitType === 'volume') && (
                  <div>
                    <label className="block text-[11px] font-black uppercase text-[#6B7280] tracking-wider mb-1">
                      Size Options (comma-separated)
                    </label>
                    <input className="w-full px-4 py-2.5 bg-[#FAFAFA] border border-[#F3F4F6] focus:border-maroon-dark rounded-xl text-[13px] font-bold outline-none transition-colors"
                      placeholder={prodForm.unitType === 'weight' ? '100g, 250g, 500g, 1kg' : '250ml, 500ml, 1L'}
                      value={prodForm.predefinedOptionsText}
                      onChange={e => setProdForm(f => ({...f, predefinedOptionsText: e.target.value}))} />
                    <p className="text-[11px] text-[#6B7280] mt-1">{l('These become the selectable size buttons on the product card.', 'இவை பொருள் அட்டையில் அளவு பொத்தான்களாக காட்டப்படும்.')}</p>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-black uppercase text-[#6B7280] tracking-wider mb-1">{l('Description', 'விளக்கம்')}</label>
                  <textarea rows={2} className="w-full px-4 py-2.5 bg-[#FAFAFA] border border-[#F3F4F6] focus:border-maroon-dark rounded-xl text-[13px] font-bold outline-none transition-colors resize-none"
                    placeholder="Short product description..." value={prodForm.description}
                    onChange={e => setProdForm(f => ({...f, description: e.target.value}))} />
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase text-[#6B7280] tracking-wider mb-1">{l('Benefits / Health Tags', 'நன்மைகள்')}</label>
                  <input className="w-full px-4 py-2.5 bg-[#FAFAFA] border border-[#F3F4F6] focus:border-maroon-dark rounded-xl text-[13px] font-bold outline-none transition-colors"
                    placeholder="Immunity, Digestion (comma-separated)"
                    value={prodForm.benefits}
                    onChange={e => setProdForm(f => ({...f, benefits: e.target.value}))} />
                </div>

                {/* Image */}
                <div className="space-y-3">
                  <label className="block text-[11px] font-black uppercase text-[#6B7280] tracking-wider">{l('Product Image', 'படம்')}</label>
                  <input className="w-full px-4 py-2.5 bg-[#FAFAFA] border border-[#F3F4F6] focus:border-maroon-dark rounded-xl text-[13px] font-bold outline-none transition-colors"
                    placeholder="https://... (image URL)"
                    value={prodForm.image} onChange={e => setProdForm(f => ({...f, image: e.target.value}))} />
                  <input type="file" accept="image/*"
                    className="w-full px-4 py-2 bg-[#FAFAFA] border border-[#F3F4F6] rounded-xl text-[12px] text-[#6B7280]"
                    onChange={e => void handleUploadImage(e.target.files?.[0])} />
                  {imageUploading && <p className="text-[12px] text-maroon-dark font-bold">{l('Uploading image...', 'படம் பதிவேற்றுகிறது...')}</p>}
                  {prodForm.image && (
                    <div className="w-20 h-20 rounded-xl overflow-hidden bg-[#FAFAFA] border border-borderLight shadow-sm">
                      <img src={prodForm.image} alt="preview" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <input type="checkbox" id="isActive" checked={prodForm.isActive}
                    onChange={e => setProdForm(f => ({...f, isActive: e.target.checked}))}
                    className="w-4 h-4 text-maroon-dark rounded focus:ring-maroon-dark accent-maroon-dark"
                  />
                  <label htmlFor="isActive" className="text-[14px] font-bold text-[#111111]">{l('Active (visible in store)', 'கடையில் காட்டு')}</label>
                </div>
                <div className="flex items-center gap-3">
                  <input type="checkbox" id="hasVariants"
                    checked={!!prodForm.hasVariants}
                    onChange={e => setProdForm(f => ({...f, hasVariants: e.target.checked} as typeof f))}
                    className="w-4 h-4 text-maroon-dark rounded focus:ring-maroon-dark accent-maroon-dark"
                  />
                  <label htmlFor="hasVariants" className="text-[14px] font-bold text-[#111111]">
                    {l('Has Variants (brands/sizes)', 'வகைகள் உள்ளன')}
                  </label>
                </div>

                <div className="flex gap-3 pt-3 border-t border-borderLight">
                  <button type="submit" disabled={loading}
                    className="flex-grow py-3 bg-maroon-dark hover:bg-[#721528] text-white font-black rounded-xl disabled:opacity-60 transition-colors shadow-sm text-[13px]">
                    {loading ? l('Saving...','சேமிக்கிறது...') : editingProd ? l('Update Product','புதுப்பி') : l('Add Product','சேர்க்கவும்')}
                  </button>
                  <button type="button" onClick={() => { setEditingProd(null); setProdForm(emptyForm); setProductNotice('') }}
                    className="px-6 py-3 bg-[#F3F4F6] text-[#111111] font-bold rounded-xl hover:bg-[#E5E7EB] transition-colors text-[13px]">
                    Reset
                  </button>
                </div>
              </form>
            </div>

            {/* Product List */}
            <div className="xl:col-span-3">
              <div className="bg-white rounded-2xl border border-borderLight shadow-sm overflow-hidden flex flex-col h-full">
                <div className="px-6 py-5 border-b border-borderLight flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white">
                  <div>
                    <h3 className="text-[18px] font-black text-[#111111]">{l('Products', 'பொருட்கள்')} <span className="text-[#6B7280] font-medium text-[16px]">({products.length})</span></h3>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]" />
                      <input
                        type="text"
                        placeholder={l('Search items...', 'பொருட்களை தேட...')}
                        value={inventorySearch}
                        onChange={e => setInventorySearch(e.target.value)}
                        className="pl-10 pr-4 py-2 rounded-xl border border-[#F3F4F6] text-[13px] bg-[#FAFAFA] focus:bg-white outline-none focus:border-maroon-dark w-[180px] lg:w-[240px] transition-colors shadow-sm"
                      />
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto flex-1 bg-white">
                  <table className="w-full min-w-[640px] text-left border-collapse">
                    <thead className="bg-[#FAFAFA] text-[11px] uppercase tracking-wider text-[#6B7280] border-b border-borderLight">
                      <tr>
                        <th className="px-6 py-4 font-black">{l('Product Name', 'பொருள்')}</th>
                        <th className="px-4 py-4 font-black">{l('Type', 'வகை')}</th>
                        <th className="px-4 py-4 font-black">{l('Stock', 'இருப்பு')}</th>
                        <th className="px-4 py-4 font-black">{l('Price', 'விலை')}</th>
                        <th className="px-6 py-4 font-black text-right">{l('Actions', 'நடவடிக்கை')}</th>
                      </tr>
                    </thead>
                    <tbody className="text-[14px] divide-y divide-[#F3F4F6] bg-white">
                      {products.filter(p => !inventorySearch || p.name.toLowerCase().includes(inventorySearch.toLowerCase()) || p.tamilName?.toLowerCase().includes(inventorySearch.toLowerCase()) || p.category?.toLowerCase().includes(inventorySearch.toLowerCase())).map(p => (
                        <tr key={p.id} className={`hover:bg-[#FAFAFA] transition-colors cursor-pointer ${!p.isActive ? 'opacity-60' : ''}`}>
                          <td className="px-6 py-4" onClick={() => handleEdit(p)}>
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-xl overflow-hidden bg-[#FAFAFA] border border-[#F3F4F6] shrink-0 shadow-sm">
                                <img src={p.image || p.imageUrl || ''} alt={p.name}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                              </div>
                              <div className="min-w-0">
                                <p className="font-bold text-[#111111] truncate max-w-[200px]">{p.name}</p>
                                <p className="text-[12px] text-[#6B7280] mt-0.5">{p.category}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider ${
                              p.unitType === 'weight' ? 'bg-[#E0F2FE] text-[#0369A1]' :
                              p.unitType === 'volume' ? 'bg-[#F3E8FF] text-[#7E22CE]' :
                              p.unitType === 'bundle' ? 'bg-[#FFEDD5] text-[#C2410C]' :
                              'bg-[#F3F4F6] text-[#4B5563]'
                            }`}>{p.unitType}</span>
                          </td>
                          <td className="px-4 py-4 font-bold">
                            <span className={toNumber(p.stockQuantity ?? p.stock, 0) < 10 ? 'text-red-500 bg-red-50 px-2 py-0.5 rounded-md' : 'text-[#111111]'}>
                              {toNumber(p.stockQuantity ?? p.stock, 0)}
                            </span>
                          </td>
                          <td className="px-4 py-4 font-bold text-[#111111]">{formatCurrency(p.price)}</td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => handleEdit(p)} title="Edit product" className="p-2 text-[#6B7280] hover:text-maroon-dark hover:bg-maroon-dark/5 rounded-lg transition-colors shadow-sm bg-white border border-[#F3F4F6]">
                                <Edit2 size={16} />
                              </button>
                              <button onClick={() => void handleToggleActive(p)} title={p.isActive ? 'Deactivate' : 'Activate'} className={`p-2 rounded-lg transition-colors shadow-sm bg-white border border-[#F3F4F6] ${p.isActive ? 'text-amber-500 hover:bg-amber-50' : 'text-green-600 hover:bg-green-50'}`}>
                                <Power size={16} />
                              </button>
                              <button onClick={() => void handleDeleteProd(p.id)} title="Delete product" className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shadow-sm bg-white border border-[#F3F4F6]">
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Variant Management Panel - shown when editing a variant product */}
            {editingProd && (
              <div className="xl:col-span-5 bg-white rounded-2xl border border-borderLight p-6 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-[18px] font-black text-[#111111]">
                    {l('Variants', 'வகைகள்')} - <span className="text-[#6B7280]">{editingProd.name}</span>
                    {!editingProd.hasVariants && (
                      <span className="ml-3 text-[12px] font-bold text-amber-700 bg-amber-50 px-3 py-1 rounded-full">
                        {l('Enable "Has Variants" above to manage variants', '"வகைகள் உள்ளன" இயக்கவும்')}
                      </span>
                    )}
                  </h3>
                  {variantNotice && (
                    <span className={`text-[13px] font-bold px-3 py-1.5 rounded-xl ${variantNotice.toLowerCase().includes('error') || variantNotice.toLowerCase().includes('required') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                      {variantNotice}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                  {/* Add / Edit variant form */}
                  <form onSubmit={handleSaveVariant} className="space-y-4 bg-[#FAFAFA] rounded-2xl p-5 border border-[#F3F4F6]">
                    <h4 className="text-[13px] font-black uppercase tracking-wider text-[#111111]">
                      {editingVariantId ? l('Edit Variant', 'வகை திருத்து') : l('Add Variant', 'வகை சேர்')}
                    </h4>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <label className="block text-[11px] font-black uppercase tracking-wider text-[#6B7280] mb-1">{l('Variant Name *', 'வகை பெயர் *')}</label>
                        <input required
                          className="w-full px-4 py-2.5 bg-white rounded-xl border border-[#D1D5DB] text-[13px] font-bold outline-none focus:border-maroon-dark transition-colors shadow-sm"
                          placeholder={l('e.g. Cycle Brand / 25g', 'e.g. Cycle Brand / 25g')}
                          value={variantForm.name}
                          onChange={e => setVariantForm(f => ({...f, name: e.target.value}))} />
                      </div>
                      <div>
                        <label className="block text-[11px] font-black uppercase tracking-wider text-[#6B7280] mb-1">{l('Size Label', 'அளவு பட்டை')}</label>
                        <input
                          className="w-full px-4 py-2.5 bg-white rounded-xl border border-[#D1D5DB] text-[13px] font-bold outline-none focus:border-maroon-dark transition-colors shadow-sm"
                          placeholder="25g / 250ml / 1 pack"
                          value={variantForm.sizeLabel}
                          onChange={e => setVariantForm(f => ({...f, sizeLabel: e.target.value}))} />
                      </div>
                      <div>
                        <label className="block text-[11px] font-black uppercase tracking-wider text-[#6B7280] mb-1">{l('Purchase Price (RM)', 'வாங்கிய விலை')}</label>
                        <input type="number" min="0" step="0.01"
                          className="w-full px-4 py-2.5 bg-white rounded-xl border border-[#D1D5DB] text-[13px] font-bold outline-none focus:border-maroon-dark transition-colors shadow-sm"
                          placeholder="30"
                          value={variantForm.purchasePrice}
                          onChange={e => setVariantForm(f => ({...f, purchasePrice: e.target.value}))} />
                      </div>
                      <div>
                        <label className="block text-[11px] font-black uppercase tracking-wider text-[#6B7280] mb-1">{l('MRP (RM)', 'MRP (RM)')}</label>
                        <input type="number" min="0" step="0.01"
                          className="w-full px-4 py-2.5 bg-white rounded-xl border border-[#D1D5DB] text-[13px] font-bold outline-none focus:border-maroon-dark transition-colors shadow-sm"
                          placeholder="50"
                          value={variantForm.mrp}
                          onChange={e => setVariantForm(f => ({...f, mrp: e.target.value}))} />
                      </div>
                      <div>
                        <label className="block text-[11px] font-black uppercase tracking-wider text-[#6B7280] mb-1">{l('Selling Price (RM) *', 'விற்பனை விலை *')}</label>
                        <input required type="number" min="0" step="0.01"
                          className="w-full px-4 py-2.5 bg-white rounded-xl border border-[#D1D5DB] text-[13px] font-bold outline-none focus:border-maroon-dark transition-colors shadow-sm"
                          placeholder="40"
                          value={variantForm.price}
                          onChange={e => setVariantForm(f => ({...f, price: e.target.value}))} />
                      </div>
                      <div>
                        <label className="block text-[11px] font-black uppercase tracking-wider text-[#6B7280] mb-1">{l('SKU', 'SKU')}</label>
                        <input className="w-full px-4 py-2.5 bg-white rounded-xl border border-[#D1D5DB] text-[13px] font-bold outline-none focus:border-maroon-dark transition-colors shadow-sm"
                          placeholder="SKU-123"
                          value={variantForm.sku}
                          onChange={e => setVariantForm(f => ({...f, sku: e.target.value}))} />
                      </div>
                      <div>
                        <label className="block text-[11px] font-black uppercase tracking-wider text-[#6B7280] mb-1">{l('Barcode', 'பார்கோடு')}</label>
                        <input className="w-full px-4 py-2.5 bg-white rounded-xl border border-[#D1D5DB] text-[13px] font-bold outline-none focus:border-maroon-dark transition-colors shadow-sm"
                          placeholder="890..."
                          value={variantForm.barcode}
                          onChange={e => setVariantForm(f => ({...f, barcode: e.target.value}))} />
                      </div>
                      <div>
                        <label className="block text-[11px] font-black uppercase tracking-wider text-[#6B7280] mb-1">{l('Stock *', 'இருப்பு *')}</label>
                        <input required type="number" min="0"
                          className="w-full px-4 py-2.5 bg-white rounded-xl border border-[#D1D5DB] text-[13px] font-bold outline-none focus:border-maroon-dark transition-colors shadow-sm"
                          placeholder="50"
                          value={variantForm.stock}
                          onChange={e => setVariantForm(f => ({...f, stock: e.target.value}))} />
                      </div>
                      <div>
                        <label className="block text-[11px] font-black uppercase tracking-wider text-[#6B7280] mb-1">{l('Weight/Vol Value', 'எடை மதிப்பு')}</label>
                        <input type="number" min="0" step="0.001"
                          className="w-full px-4 py-2.5 bg-white rounded-xl border border-[#D1D5DB] text-[13px] font-bold outline-none focus:border-maroon-dark transition-colors shadow-sm"
                          placeholder="250"
                          value={variantForm.weightValue}
                          onChange={e => setVariantForm(f => ({...f, weightValue: e.target.value}))} />
                      </div>
                      <div>
                        <label className="block text-[11px] font-black uppercase tracking-wider text-[#6B7280] mb-1">{l('Unit', 'அலகு')}</label>
                        <select
                          className="w-full px-4 py-2.5 bg-white rounded-xl border border-[#D1D5DB] text-[13px] font-bold outline-none focus:border-maroon-dark transition-colors shadow-sm appearance-none"
                          value={variantForm.weightUnit}
                          onChange={e => setVariantForm(f => ({...f, weightUnit: e.target.value}))}>
                          <option value="">-</option>
                          <option value="g">g (grams)</option>
                          <option value="kg">kg</option>
                          <option value="ml">ml</option>
                          <option value="L">L (litres)</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                      <input type="checkbox" id="varIsDefault" checked={variantForm.isDefault}
                        onChange={e => setVariantForm(f => ({...f, isDefault: e.target.checked}))}
                        className="w-4 h-4 text-maroon-dark rounded focus:ring-maroon-dark accent-maroon-dark"
                      />
                      <label htmlFor="varIsDefault" className="text-[13px] font-bold text-[#111111]">{l('Default variant (shown first)', 'முதல் வகை (முதலில் காட்டு)')}</label>
                    </div>

                    <div className="flex gap-3 pt-2">
                      <button type="submit" disabled={variantLoading}
                        className="flex-grow py-3 bg-[#111111] hover:bg-[#333333] text-white font-black text-[13px] rounded-xl disabled:opacity-60 transition-colors shadow-sm">
                        {variantLoading ? l('Saving...', 'சேமிக்கிறது...') : editingVariantId ? l('Update Variant', 'புதுப்பி') : l('Add Variant', 'சேர்')}
                      </button>
                      {editingVariantId && (
                        <button type="button"
                          onClick={() => { setEditingVariantId(null); setVariantForm({ name: '', sizeLabel: '', price: '', purchasePrice: '', mrp: '', sku: '', barcode: '', stock: '50', weightValue: '', weightUnit: '', isDefault: false }); setVariantNotice('') }}
                          className="px-6 py-3 bg-white border border-[#D1D5DB] text-[#111111] font-bold text-[13px] rounded-xl hover:bg-[#F3F4F6] transition-colors shadow-sm">
                          {l('Cancel', 'ரத்து')}
                        </button>
                      )}
                    </div>
                  </form>

                  {/* Current variants list */}
                  <div className="bg-[#FAFAFA] rounded-2xl p-5 border border-[#F3F4F6]">
                    <h4 className="text-[13px] font-black uppercase tracking-wider text-[#111111] mb-4">
                      {l('Current Variants', 'தற்போதைய வகைகள்')} <span className="text-[#6B7280]">({getVariants(String(editingProd.id)).length})</span>
                    </h4>
                    {getVariants(String(editingProd.id)).length === 0 ? (
                      <p className="text-[13px] text-[#6B7280] text-center py-8 bg-white border border-[#F3F4F6] rounded-xl">
                        {l('No variants yet - add one using the form.', 'வகைகள் இல்லை - படிவத்தில் சேர்க்கவும்.')}
                      </p>
                    ) : (
                      <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                        {getVariants(String(editingProd.id)).map((v: ProductVariant) => (
                          <div key={v.id}
                            className={`flex items-center justify-between gap-3 p-4 rounded-xl border transition-colors bg-white shadow-sm ${editingVariantId === v.id ? 'border-maroon-dark ring-1 ring-maroon-dark/20' : 'border-[#F3F4F6] hover:border-[#D1D5DB]'}`}>
                            <div className="flex items-center gap-3 min-w-0">
                              {v.isDefault && (
                                <span className="w-5 h-5 rounded-full bg-maroon-dark text-white text-[10px] font-black flex items-center justify-center shrink-0">★</span>
                              )}
                              <div className="min-w-0">
                                <p className="text-[14px] font-bold text-[#111111] truncate">{v.variantName}</p>
                                <p className="text-[12px] text-[#6B7280] mt-0.5">
                                  <span className="font-bold text-[#111111]">{formatCurrency(v.price)}</span>{v.sizeLabel ? ` · ${v.sizeLabel}` : ''} · {l('Stock', 'இருப்பு')}: <span className="font-bold">{v.stock}</span>
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {!v.isDefault && (
                                <button onClick={() => void handleSetDefault(v.id)}
                                  className="px-2 py-1.5 text-[#6B7280] hover:text-maroon-dark hover:bg-maroon-dark/5 rounded-lg text-[10px] font-black uppercase transition-colors">
                                  {l('Set Default', 'முதல்')}
                                </button>
                              )}
                              <button onClick={() => startEditVariant(v)}
                                className="p-2 text-[#6B7280] hover:text-[#111111] hover:bg-[#F3F4F6] rounded-lg transition-colors">
                                <Edit2 size={16} />
                              </button>
                              <button onClick={() => void handleDeleteVariant(v.id)}
                                className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── CATEGORIES TAB ── */}
        {tab === 'categories' && (
          <div className="w-full max-w-3xl space-y-6">
            <div className="bg-white rounded-2xl border border-borderLight p-4 sm:p-6 shadow-sm">
              <h3 className="text-[18px] font-black text-[#111111] mb-5">{l('Product Categories', 'பொருள் வகைகள்')}</h3>
              {categoryNotice && (
                <div className={`mb-4 rounded-xl px-3 py-2.5 text-[12px] font-bold ${categoryNotice.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {categoryNotice.text}
                </div>
              )}
              <form onSubmit={onAddCat} className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(120px,0.45fr)_auto]">
                <input className="min-w-0 w-full px-4 py-3 bg-[#FAFAFA] border border-[#F3F4F6] focus:border-maroon-dark outline-none rounded-xl text-[13px] font-bold transition-colors shadow-sm"
                  placeholder={l('Category name (English)', 'வகை பெயர் (English)')} value={newCat.name_en}
                  onChange={e => setNewCat(c => ({...c, name_en: e.target.value}))} />
                <input className="min-w-0 w-full px-4 py-3 bg-[#FAFAFA] border border-[#F3F4F6] focus:border-maroon-dark outline-none rounded-xl text-[13px] font-bold transition-colors shadow-sm"
                  placeholder={l('Tamil', 'தமிழ்')} value={newCat.name_ta}
                  onChange={e => setNewCat(c => ({...c, name_ta: e.target.value}))} />
                <button type="submit" className="px-5 py-3 bg-[#111111] hover:bg-[#333333] transition-colors shadow-sm text-white font-black rounded-xl text-[13px]">{editingCategoryId === null ? l('Add', 'சேர்') : 'Save'}</button>
                {editingCategoryId !== null && (
                  <button type="button" onClick={() => { setEditingCategoryId(null); setNewCat({ name_en: '', name_ta: '' }) }} className="px-3 py-3 text-[#6B7280] font-black rounded-xl text-[12px] hover:bg-[#F3F4F6]">Cancel</button>
                )}
              </form>
              <div className="space-y-3">
                {cats.map(c => (
                  <div key={c.id} className="flex flex-col gap-3 p-4 bg-white border border-[#F3F4F6] shadow-sm rounded-xl transition-colors hover:border-[#D1D5DB] sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-[14px] font-bold text-[#111111]">{c.name_en}</p>
                      <p className="text-[12px] text-[#6B7280]">{c.name_ta}</p>
                      <span className={`text-[10px] font-black uppercase tracking-wider ${c.is_active ? 'text-green-600' : 'text-red-500'}`}>
                        {c.is_active ? 'Active' : l('Inactive', 'நிறுத்தம்')}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0">
                      <button onClick={() => { setEditingCategoryId(c.id); setNewCat({ name_en: c.name_en, name_ta: c.name_ta || '' }); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="p-2 text-[#6B7280] hover:text-[#111111] hover:bg-[#F3F4F6] transition-colors rounded-lg" title="Edit category"><Edit2 size={16} /></button>
                      <button onClick={() => void moveCat(c, 'up')} className="p-2 text-[#6B7280] hover:text-[#111111] hover:bg-[#F3F4F6] transition-colors rounded-lg"><ArrowUp size={16} /></button>
                      <button onClick={() => void moveCat(c, 'down')} className="p-2 text-[#6B7280] hover:text-[#111111] hover:bg-[#F3F4F6] transition-colors rounded-lg"><ArrowDown size={16} /></button>
                      <button onClick={() => void toggleCat(c)} className={`p-2 rounded-lg transition-colors ${c.is_active ? 'text-amber-500 hover:bg-amber-50' : 'text-green-600 hover:bg-green-50'}`}><Power size={16} /></button>
                      <button onClick={() => void deleteCat(c)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors rounded-lg"><Trash2 size={16} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── COUPONS TAB ── */}
        {/* ── COUPONS TAB ── */}
        {tab === 'coupons' && (
          <div className="space-y-4">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <h2 className="text-[22px] lg:text-[24px] leading-none font-black text-[#111111]">{l('Coupon Management', 'கூப்பன் மேலாண்மை')}</h2>
                  <p className="max-w-2xl text-[12px] lg:text-[12px] font-medium text-[#6C665C]">
                    {l('Create and manage discount codes. Applies to product subtotal only.', 'பொருட்களின் subtotal-க்கு மட்டும் கூப்பன் தள்ளுபடி பொருந்தும்.')}
                  </p>
                </div>
                <button
                  onClick={() => void loadCoupons()}
                  className="inline-flex items-center gap-2 rounded-full border border-[#D1FAE5] bg-[#FBFAF6] px-3 py-2 text-[11px] font-black text-[#047857] shadow-sm transition-colors hover:bg-[#F7F1E7]"
                >
                  <RefreshCw size={12} />
                  Refresh
                </button>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className="rounded-xl border border-[#D1FAE5] bg-[#FBFAF6] px-3 py-3 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#047857]">Total Coupons</p>
                  <p className="mt-1 text-[20px] font-black text-[#111111]">{coupons.length}</p>
                </div>
                <div className="rounded-xl border border-[#D1FAE5] bg-[#FBFAF6] px-3 py-3 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#047857]">Active</p>
                  <p className="mt-1 text-[20px] font-black text-[#047857]">{coupons.filter(c => c.is_active).length}</p>
                </div>
                <div className="rounded-xl border border-[#D1FAE5] bg-[#FBFAF6] px-3 py-3 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#047857]">Used</p>
                  <p className="mt-1 text-[20px] font-black text-[#111111]">{coupons.reduce((acc, c) => acc + (c.usage_count || 0), 0)}</p>
                </div>
              </div>

              <div className="rounded-xl border border-[#E7CFAA] bg-[#FFF6E7] px-3 py-2 text-[11px] font-bold text-[#047857] shadow-sm">
                {l('Coupon discount applies to product subtotal only - not delivery charge.', 'கூப்பன் தள்ளுபடி பொருட்களின் subtotal-க்கு மட்டும் பொருந்தும்.')}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
              <form onSubmit={saveCoupon} className="rounded-2xl border border-[#D1FAE5] bg-[#FFFCF6] p-4 shadow-sm space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#047857]">{editingCouponId !== null ? 'Edit mode' : 'New coupon'}</p>
                    <h3 className="mt-1 text-[17px] font-black text-[#111111]">
                      {editingCouponId !== null ? l('Edit Coupon', 'கூப்பனை திருத்து') : l('Create Coupon', 'புதிய கூப்பன்')}
                    </h3>
                  </div>
                  {editingCouponId !== null && (
                    <button
                      type="button"
                      onClick={cancelEditCoupon}
                      className="rounded-full border border-[#E7CFAA] bg-[#FFF6E7] px-2.5 py-1 text-[11px] font-black text-[#047857] transition-colors hover:bg-[#FBEBD3]"
                    >
                      Cancel
                    </button>
                  )}
                </div>

                {couponSaveError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-bold text-red-700">
                    {couponSaveError}
                  </div>
                )}
                {couponSaveSuccess && (
                  <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-[12px] font-bold text-green-700">
                    {couponSaveSuccess}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-[#6B7280]">{l('Coupon Code', 'கூப்பன் குறியீடு')} *</label>
                  <div className="flex gap-2">
                    <input
                      className="flex-1 rounded-xl border border-[#A7F3D0] bg-white px-3 py-2.5 text-[12px] font-black uppercase tracking-[0.12em] text-[#111111] outline-none transition-colors focus:border-[#047857]"
                      placeholder="WELCOME10"
                      value={couponForm.code}
                      disabled={editingCouponId !== null}
                      onChange={e => { setCouponForm(f => ({ ...f, code: e.target.value.toUpperCase() })); setCouponSaveError(''); setCouponSaveSuccess('') }}
                    />
                    {editingCouponId === null && (
                      <button
                        type="button"
                        onClick={generateCouponCode}
                        className="shrink-0 rounded-xl border border-[#047857] bg-[#047857] px-3 py-2.5 text-[11px] font-black text-white transition-colors hover:bg-[#741D2A]"
                      >
                        Generate
                      </button>
                    )}
                  </div>
                  {editingCouponId !== null && (
                    <p className="text-[10px] font-medium text-[#6B7280]">{l('Code cannot be changed when editing', 'திருத்தும்போது குறியீட்டை மாற்ற முடியாது')}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-[#6B7280]">{l('Discount %', 'தள்ளுபடி %')} *</label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      className="w-full rounded-xl border border-[#A7F3D0] bg-white px-3 py-2.5 text-[12px] font-bold text-[#111111] outline-none transition-colors focus:border-[#047857]"
                      placeholder="10"
                      value={couponForm.percentage}
                      onChange={e => setCouponForm(f => ({ ...f, percentage: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-[#6B7280]">{l('Min Order (RM)', 'குறைந்த ஆர்டர் (RM)')}</label>
                    <input
                      type="number"
                      min="0"
                      className="w-full rounded-xl border border-[#A7F3D0] bg-white px-3 py-2.5 text-[12px] font-bold text-[#111111] outline-none transition-colors focus:border-[#047857]"
                      placeholder="0 = no minimum"
                      value={couponForm.min_order_value}
                      onChange={e => setCouponForm(f => ({ ...f, min_order_value: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-[#6B7280]">{l('Expiry Date', 'காலாவதி தேதி')}</label>
                    <input
                      type="date"
                      className="w-full rounded-xl border border-[#A7F3D0] bg-white px-3 py-2.5 text-[12px] font-bold text-[#111111] outline-none transition-colors focus:border-[#047857]"
                      value={couponForm.expiry_date}
                      onChange={e => setCouponForm(f => ({ ...f, expiry_date: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-[#6B7280]">{l('Usage Limit', 'பயன்பாட்டு வரம்பு')}</label>
                    <input
                      type="number"
                      min="1"
                      className="w-full rounded-xl border border-[#A7F3D0] bg-white px-3 py-2.5 text-[12px] font-bold text-[#111111] outline-none transition-colors focus:border-[#047857]"
                      placeholder="Unlimited"
                      value={couponForm.usage_limit}
                      onChange={e => setCouponForm(f => ({ ...f, usage_limit: e.target.value }))}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full rounded-xl bg-[#047857] py-3 text-[13px] font-black text-white shadow-sm transition-colors hover:bg-[#741D2A]"
                >
                  {editingCouponId !== null ? l('Update Coupon', 'கூப்பனை புதுப்பி') : l('Create Coupon', 'கூப்பனை உருவாக்கு')}
                </button>
              </form>

              <div className="rounded-2xl border border-[#D1FAE5] bg-[#FFFCF6] p-4 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#6B7280]">{l('Coupon List', 'கூப்பன் பட்டியல்')}</p>
                    <h3 className="mt-1 text-[17px] font-black text-[#111111]">
                      {l('All Coupons', 'அனைத்து கூப்பன்கள்')} <span className="text-[#6B7280]">({coupons.length})</span>
                    </h3>
                  </div>
                  <span className="rounded-full border border-[#E7CFAA] bg-[#FFF6E7] px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.15em] text-[#047857]">
                    {l('Admin only', 'அட்மின் மட்டும்')}
                  </span>
                </div>

                <div className="space-y-2 max-h-[30rem] overflow-y-auto pr-1">
                  {coupons.map((coupon) => {
                    const isExpired = coupon.expiry_date ? new Date(coupon.expiry_date) < new Date() : false
                    const isExhausted = coupon.usage_limit !== null && coupon.usage_count >= coupon.usage_limit
                    const isEditing = editingCouponId === coupon.id
                    return (
                      <div
                        key={coupon.id}
                        className={`rounded-xl border p-3 shadow-sm transition-all ${
                          isEditing
                            ? 'border-[#047857] bg-[#FFF8F3] ring-1 ring-[#047857]/15'
                            : 'border-[#F0E2C8] bg-white hover:border-[#D8BA8A]'
                        }`}
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="truncate text-[15px] font-black uppercase tracking-[0.14em] text-[#111111]">{coupon.code}</p>
                              <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] ${coupon.is_active ? 'bg-[#FCE7EA] text-[#047857]' : 'bg-[#F8EDD9] text-[#9A6700]'}`}>
                                {coupon.is_active ? l('Active', 'செயலில்') : l('Inactive', 'செயலற்ற')}
                              </span>
                              {isExpired && (
                                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-red-700">
                                  Expired
                                </span>
                              )}
                              {!isExpired && isExhausted && (
                                <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-orange-700">
                                  Limit reached
                                </span>
                              )}
                            </div>

                            <p className="text-[12px] font-semibold text-[#047857]">
                              {coupon.percentage}% off
                              {coupon.min_order_value > 0 && ` • min RM${coupon.min_order_value}`}
                            </p>

                            <p className="text-[11px] text-[#6C665C]">
                              Used {coupon.usage_count}{coupon.usage_limit ? `/${coupon.usage_limit}` : ''} times
                              {coupon.expiry_date ? ` • expires ${new Date(coupon.expiry_date).toLocaleDateString('en-IN')}` : ''}
                            </p>
                          </div>

                          <div className="flex shrink-0 items-center gap-1.5">
                            <button
                              onClick={() => void toggleCoupon(coupon)}
                              className={`rounded-full px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] transition-colors ${
                                coupon.is_active ? 'bg-[#FCE7EA] text-[#047857] hover:bg-[#F8D7DD]' : 'bg-[#F8EDD9] text-[#9A6700] hover:bg-[#F2E0B9]'
                              }`}
                            >
                              {coupon.is_active ? l('Active', 'செயலில்') : l('Off', 'ஆஃப்')}
                            </button>
                            <button
                              onClick={() => startEditCoupon(coupon)}
                              className="rounded-full border border-[#A7F3D0] bg-white p-2 text-[#047857] transition-colors hover:border-[#D8BA8A] hover:text-[#741D2A]"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => void deleteCoupon(coupon)}
                              className="rounded-full border border-[#F4D4D4] bg-white p-2 text-red-500 transition-colors hover:bg-red-50 hover:text-red-700"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  {coupons.length === 0 && (
                    <div className="rounded-[22px] border border-dashed border-[#E7CFAA] bg-[#FFF8F3] py-12 text-center text-[14px] font-bold text-[#047857]">
                      {l('No coupons yet. Create your first coupon!', 'இன்னும் கூப்பன் இல்லை. முதல் கூப்பனை உருவாக்குங்கள்!')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}        {tab === 'users' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[20px] font-black text-[#111111]">{l('User Management', 'பயனர் மேலாண்மை')}</h2>
              <button onClick={() => void loadUsers()}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-[#F3F4F6] rounded-xl text-[13px] font-bold text-[#111111] hover:bg-[#FAFAFA] transition-colors shadow-sm">
                <RefreshCw size={14} /> Refresh
              </button>
            </div>

            {/* Search */}
            <div className="relative max-w-sm">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7280]" />
              <input
                className="w-full pl-11 pr-4 py-3 bg-white border border-[#D1D5DB] rounded-xl text-[13px] font-bold text-[#111111] placeholder-[#6B7280] focus:outline-none focus:border-maroon-dark transition-colors shadow-sm"
                placeholder={l('Search by name or email...', 'பெயர் அல்லது மின்னஞ்சலால் தேடுக...')}
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
              />
            </div>

            {usersError && (
              <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-[13px] text-red-700 font-bold shadow-sm">
                <AlertCircle size={15} /> {usersError}
              </div>
            )}

            <div className="bg-white rounded-2xl border border-borderLight shadow-sm overflow-hidden">
              {usersLoading ? (
                <div className="p-10 text-center text-[13px] font-bold text-[#6B7280]">{l('Loading users...', 'பயனர்கள் ஏற்றுகிறது...')}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[14px]">
                    <thead>
                      <tr className="bg-[#FAFAFA] border-b border-borderLight uppercase tracking-wider text-[11px] text-[#6B7280]">
                        <th className="text-left px-6 py-4 font-black">{l('Name', 'பெயர்')}</th>
                        <th className="text-left px-6 py-4 font-black">{l('Email', 'மின்னஞ்சல்')}</th>
                        <th className="text-left px-6 py-4 font-black">{l('Mobile', 'மொபைல்')}</th>
                        <th className="text-left px-6 py-4 font-black">{l('Joined', 'சேர்ந்த தேதி')}</th>
                        <th className="text-center px-6 py-4 font-black">{l('Role', 'பங்கு')}</th>
                        <th className="text-center px-6 py-4 font-black">{l('Action', 'நடவடிக்கை')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F3F4F6]">
                      {allUsers
                        .filter(u => {
                          if (!userSearch.trim()) return true
                          const q = userSearch.toLowerCase()
                          return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
                        })
                        .map(u => (
                          <tr key={u.id} className="hover:bg-[#FAFAFA] transition-colors">
                            <td className="px-6 py-4 font-bold text-[#111111]">{u.name || '-'}</td>
                            <td className="px-6 py-4 text-[#6B7280]">{u.email || '-'}</td>
                            <td className="px-6 py-4 text-[#6B7280]">{u.mobile || '-'}</td>
                            <td className="px-6 py-4 text-[#6B7280] text-[12px]">
                              {u.created_at ? new Date(u.created_at).toLocaleDateString('en-IN') : '-'}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider ${
                                u.role === 'admin'
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-[#F3F4F6] text-[#4B5563]'
                              }`}>
                                {u.role === 'admin' ? <ShieldCheck size={12} /> : <ShieldOff size={12} />}
                                {u.role === 'admin' ? l('Admin', 'நிர்வாகி') : l('Customer', 'வாடிக்கையாளர்')}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              {u.id === user?.id ? (
                                <span className="text-[12px] text-[#6B7280] font-bold uppercase tracking-wider">{l('You', 'நீங்கள்')}</span>
                              ) : (
                                <button
                                  onClick={() => void toggleUserRole(u)}
                                  disabled={roleUpdating === u.id}
                                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-colors disabled:opacity-50 ${
                                    u.role === 'admin'
                                      ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
                                      : 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'
                                  }`}
                                >
                                  {u.role === 'admin' ? <><ShieldOff size={12} /> Remove Admin</> : <><ShieldCheck size={12} /> {l('Make Admin', 'நிர்வாகி ஆக்கு')}</>}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {allUsers.length === 0 && !usersLoading && (
                    <p className="p-10 text-center text-[14px] font-bold text-[#6B7280] bg-[#FAFAFA]">{l('No users found.', 'பயனர் இல்லை.')}</p>
                  )}
                </div>
              )}
            </div>

            <p className="text-[12px] text-[#6B7280] font-bold">
              - {l('Role changes take effect upon next login.', 'பங்கு மாற்றம் அடுத்த முறை உள்நுழைந்தால் நடைமுறைக்கு வரும்.')}
            </p>
          </div>
        )}
        </div>
        {/* Footer */}
        <div className="shrink-0 border-t border-gray-100 bg-white/80 py-2 text-center text-[12px] font-semibold text-[#7A8A78] tracking-wide print:hidden">
          Powered by Cenexa Systems © 2026
        </div>
      </main>


      {invoicePreviewOrder && (() => {
        const preview = getOrderWhatsAppPreview(invoicePreviewOrder)
        if (!preview) return null

        return (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-3 sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-label={`Invoice ${invoicePreviewOrder.invoice_no || invoicePreviewOrder.id}`}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setInvoicePreviewOrder(null)
            }}
          >
            <div className="flex max-h-[95vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-[#F9FAFB] shadow-2xl">
              <div className="flex shrink-0 items-center justify-between border-b border-[#D1FAE5]/60 bg-white px-4 py-3 sm:px-6">
                <div>
                  <h2 className="text-base font-black text-[#111111]">Invoice Preview</h2>
                  <p className="text-xs font-semibold text-[#6B7280]">{invoicePreviewOrder.invoice_no || invoicePreviewOrder.id}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handlePrintReceipt(invoicePreviewOrder)}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#D1FAE5]/70 px-3 text-xs font-black text-[#111111] hover:bg-[#F9FAFB]"
                  >
                    <Printer size={15} /> Print
                  </button>
                  <button
                    type="button"
                    onClick={() => void openOrderInvoice(invoicePreviewOrder, 'download')}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-maroon-dark px-3 text-xs font-black text-white hover:bg-maroon"
                  >
                    <Download size={15} /> Download
                  </button>
                  <button
                    type="button"
                    onClick={() => setInvoicePreviewOrder(null)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-[#6B7280] hover:bg-[#F9FAFB] hover:text-[#111111]"
                    aria-label="Close invoice preview"
                  >
                    <X size={19} />
                  </button>
                </div>
              </div>
              <div className="overflow-y-auto p-2 sm:p-5">
                <div className="mx-auto max-w-3xl overflow-hidden rounded-xl bg-white shadow-sm">
                  <Invoice
                    invoiceNo={invoicePreviewOrder.invoice_no || invoicePreviewOrder.id}
                    date={invoicePreviewOrder.created_at}
                    customerName={invoicePreviewOrder.customer_name}
                    phone={invoicePreviewOrder.phone}
                    address={invoicePreviewOrder.address}
                    items={preview.items as unknown as import('../components/Invoice').InvoiceItem[]}
                    subtotal={preview.subtotal}
                    shipping={invoicePreviewOrder.delivery_charge}
                    deliveryCharge={invoicePreviewOrder.delivery_charge}
                    discountAmount={invoicePreviewOrder.discount_amount}
                    manualDiscountAmount={invoicePreviewOrder.manual_discount_amount}
                    gstAmount={invoicePreviewOrder.total_gst}
                    paymentMode={invoicePreviewOrder.payment_mode}
                    total={invoicePreviewOrder.total}
                    status={invoicePreviewOrder.status}
                  />
                </div>
              </div>
            </div>
          </div>
        )
      })()}

    </div>
  )
}
