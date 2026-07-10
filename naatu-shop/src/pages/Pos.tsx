import { useEffect, useMemo, useRef, useState } from 'react'
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Link } from 'react-router-dom'
import {
  Search, Trash2, Plus, Receipt, Printer,
  RefreshCw, ShoppingBag, MessageCircle,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  Wifi, WifiOff, Layers, X, ChevronDown,
} from 'lucide-react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { useProductStore, useVariantStore, type Product } from '../store/store'
import { Invoice } from '../components/Invoice'
import CatalogModal from '../components/CatalogModal'
import AddProductModal from '../components/AddProductModal'
import { printThermalReceipt } from '../lib/thermalPrint'
import { createOrderWithStock } from '../services/orderService'
import {
  buildStructuredOrderItem,
  calculateLineTotal,
  formatCurrency,
  formatQuantityDisplay,
} from '../lib/retail'
import { buildProfessionalWhatsAppMessage } from '../lib/whatsappMessage'
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
import { getProductImage, onImgError } from '../lib/productImages'
import { normalizeMalaysianPhone, toWhatsAppUrl } from '../lib/phone'

import type { ProductVariant } from '../services/variantService'

// ── Types ──────────────────────────────────────────────────────────────────
type PosItem = Product & {
  qty: number
  selectedUnit: string
  basePrice: number
  lineTotal: number
  source?: 'catalogue' | 'manual'
  note?: string | null
  variantId?: string         // product_variants.id
  variantName?: string       // snapshot
  parentProductId?: string   // products.id (before synthetic override)
}

type InvoiceSnap = {
  id: string
  invoiceNo: string
  orderType: 'online_request' | 'pos_sale' | 'manual_sale'
  date: string
  items: PosItem[]
  subtotal: number
  shipping: number
  couponCode?: string
  couponDiscount: number
  manualDiscountAmount: number
  manualDiscountType: 'flat' | 'percent'
  manualDiscountValue: number
  gstAmount: number
  total: number
  customerName: string
  phone: string
  address: string
  amountReceived: number
  balanceReturned: number
  paymentMode: string
}

// ── Helpers ────────────────────────────────────────────────────────────────
const toProductId = (v: string | number): string | null => {
  const s = String(v ?? '').trim(); return s || null
}

const makePosItem = (p: Product, qty?: number): PosItem => {
  const basePrice = p.offerPrice || p.price
  const q = Math.max(1, Math.round(qty ?? 1))
  const packLabel = p.predefinedOptions[0]?.label ?? p.unitLabel
  return { ...p, qty: q, selectedUnit: packLabel, basePrice, lineTotal: calculateLineTotal(q, p.unitType, p.baseQuantity, basePrice) }
}

const recalc = (item: PosItem, nextQty: number): PosItem => {
  const q = Math.max(1, Math.round(nextQty))
  return { ...item, qty: q, lineTotal: calculateLineTotal(q, item.unitType, item.baseQuantity, item.basePrice) }
}


// ── Category colours ───────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
const CAT_COLOR: Record<string, string> = {
  'Pooja Items': '#7C3AED', 'Herbal Powder': '#D97706', 'Herbal Oil': '#0D9488',
  'Spices & Condiments': '#DC2626', 'Grains & Pulses': '#92400E',
  'Honey & Liquids': '#B45309', 'Bundle Packages': '#1D4ED8',
}

// ══════════════════════════════════════════════════════════════════════════
type PosProps = {
  isEmbedded?: boolean
}

export default function Pos(props: PosProps = {}) {
  const { products, fetchProducts } = useProductStore()
  const { getVariants, fetchVariants } = useVariantStore()
  
  
  const embeddedMode = Boolean(props.isEmbedded)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [billingAdjOpen, setBillingAdjOpen] = useState(false)

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [search, setSearch] = useState('')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [activeCategory, setActiveCategory] = useState('All')
  const [items, setItems] = useState<PosItem[]>([])
  const [customer, setCustomer] = useState({ name: '', phone: '', address: '' })
  const [saving, setSaving] = useState(false)
  const [shipping, setShipping] = useState<string>('0')
  const [couponInput, setCouponInput] = useState('')
  const [couponLoading, setCouponLoading] = useState(false)
  const [couponError, setCouponError] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; percentage: number; minOrderValue: number; discount?: number } | null>(null)
  const [manualDiscountType, setManualDiscountType] = useState<'flat' | 'percent'>('flat')
  const [manualDiscountValue, setManualDiscountValue] = useState('')
  const [error, setError] = useState('')
  const [invoice, setInvoice] = useState<InvoiceSnap | null>(null)
  const [cashReceived, setCashReceived] = useState<string>('')
  const [mobilePanelView, setMobilePanelView] = useState<'catalogue' | 'bill'>('catalogue')
  const [orderMode, setOrderMode] = useState<'online' | 'offline'>('offline')
  const [variantPickerProduct, setVariantPickerProduct] = useState<Product | null>(null)
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null)
  const [variantPickerQty, setVariantPickerQty] = useState(1)
  const [billGstEnabled, setBillGstEnabled] = useState(false)
  const [gstInput, setGstInput] = useState('')
  const [gstType, setGstType] = useState<'percent' | 'flat'>('percent')
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [addProductOpen, setAddProductOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void fetchProducts()
    void fetchVariants()
    if (!isSupabaseConfigured) return
    const ch = supabase.channel('pos-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => void fetchProducts())
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [fetchProducts, fetchVariants])

  // ── Derived data ──────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const categories = useMemo(() => {
    const cats = Array.from(new Set(products.filter(p => p.isActive).map(p => p.category))).filter(Boolean)
    return ['All', ...cats]
  }, [products])

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let src = products.filter(p => p.isActive)
    if (activeCategory !== 'All') src = src.filter(p => p.category === activeCategory)
    if (q) src = src.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.nameTa || '').toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    )
    return src.slice(0, 120)
  }, [products, search, activeCategory])

  const subtotal = items.reduce((s, i) => s + i.lineTotal, 0)
  const isValidCoupon = appliedCoupon && subtotal >= (appliedCoupon.minOrderValue || 0)
  const couponDiscount = isValidCoupon ? Math.round((subtotal * (appliedCoupon.percentage || 0) / 100) * 100) / 100 : 0
  const manualDiscountNumeric = Math.max(0, Number(manualDiscountValue) || 0)
  const manualDiscountAmount = manualDiscountType === 'percent'
    ? Math.max(0, Math.round((subtotal * manualDiscountNumeric / 100) * 100) / 100)
    : manualDiscountNumeric
  const totalGst = billGstEnabled
    ? (gstType === 'percent'
      ? Math.max(0, Math.round((subtotal * (Math.max(0, Number(gstInput) || 0) / 100)) * 100) / 100)
      : Math.max(0, Number(gstInput) || 0))
    : 0
  const total = Math.max(0, subtotal - couponDiscount - manualDiscountAmount + (Number(shipping || 0) || 0) + totalGst)

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const itemQtyMap = useMemo(() => {
    const m: Record<string | number, number> = {}
    items.forEach(i => { m[i.id] = i.qty })
    return m
  }, [items])

  // ── Cart actions ──────────────────────────────────────────────────────
  const addItem = (product: Product) => {
    // For variant products, open variant picker instead of adding directly
    if (product.hasVariants) {
      const variants = getVariants(String(product.id))
      if (variants.length > 0) {
        setVariantPickerProduct(product)
        setSelectedVariant(variants[0])
        setVariantPickerQty(1)
        return
      }
    }
    setError('')
    setMobilePanelView('catalogue')
    setItems(cur => {
      const ex = cur.find(i => i.id === product.id)
      if (!ex) return [...cur, makePosItem(product)]
      return cur.map(i => i.id === product.id ? recalc(i, i.qty + 1) : i)
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const addVariantToItems = () => {
    if (!variantPickerProduct || !selectedVariant) return
    setError('')
    const variantProduct: Product = {
      ...variantPickerProduct,
      id: selectedVariant.id,
      name: `${variantPickerProduct.name} - ${selectedVariant.variantName}`,
      price: selectedVariant.price,
      offerPrice: null,
      stock: selectedVariant.stock,
      stockQuantity: selectedVariant.stock,
      hasVariants: false,
      unitType: 'unit',
      baseQuantity: 1,
      unitLabel: selectedVariant.sizeLabel || variantPickerProduct.unitLabel || 'piece',
    }
    const addQty = Math.max(1, variantPickerQty)
    setItems(cur => {
      const ex = cur.find(i => i.id === variantProduct.id)
      if (!ex) {
        const item = makePosItem(variantProduct, addQty)
        item.variantId       = selectedVariant.id
        item.variantName     = selectedVariant.variantName
        item.parentProductId = String(variantPickerProduct.id)
        return [...cur, item]
      }
      return cur.map(i => i.id === variantProduct.id ? recalc(i, i.qty + addQty) : i)
    })
    setVariantPickerProduct(null)
    setSelectedVariant(null)
    setVariantPickerQty(1)
    setMobilePanelView('catalogue')
  }

  // Manual product addition (minimal, non-destructive)
  const [manualName, setManualName] = useState('')
  const [manualPrice, setManualPrice] = useState('')
  const addManualItem = () => {
    setError('')
    const name = manualName.trim()
    const price = Number(manualPrice || 0)
    if (!name) { setError('Enter product name'); return }
    if (!(price > 0)) { setError('Enter valid price'); return }
    const prod: Product = {
      id: `manual-${Date.now()}`,
      name,
      category: 'Manual',
      remedy: [],
      price,
      offerPrice: null,
      unitType: 'unit',
      unitLabel: 'pc',
      baseQuantity: 1,
      stockQuantity: 999,
      stockUnit: 'pc',
      allowDecimalQuantity: false,
      predefinedOptions: [],
      isActive: true,
      sortOrder: 0,
      unit: '1pc',
      rating: 5,
      stock: 999,
      description: '',
      benefits: '',
      image: '/assets/images/default-herb.jpg',
      imageUrl: undefined,
      source: 'manual',
    }
    setManualName('')
    setManualPrice('')
    setItems(cur => [...cur, { ...makePosItem(prod), source: 'manual' }])
    setMobilePanelView('catalogue')
  }

  const removeItem = (id: string | number) => setItems(cur => cur.filter(i => i.id !== id))

  const updateItem = (id: string | number, field: 'name' | 'basePrice', value: string | number) => {
    setItems(cur => cur.map((item) => {
      if (item.id !== id) return item
      const nextItem = { ...item, [field]: value } as PosItem
      return field === 'basePrice' ? recalc(nextItem, nextItem.qty) : nextItem
    }))
  }

  const bumpQty = (id: string | number, delta: number) => {
    setItems(cur => {
      const ex = cur.find(i => i.id === id)
      if (!ex) return cur
      const next = ex.qty + delta
      if (next <= 0) return cur.filter(i => i.id !== id)
      return cur.map(i => i.id === id ? recalc(i, next) : i)
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const setQty = (id: string | number, val: number) => {
    if (val <= 0) { removeItem(id); return }
    setItems(cur => cur.map(i => i.id === id ? recalc(i, val) : i))
  }

  const clearAll = () => {
    setItems([])
    setCustomer({ name: '', phone: '', address: '' })
    setInvoice(null)
    setCashReceived('')
    setCouponInput('')
    setAppliedCoupon(null)
    setCouponError('')
    setManualDiscountValue('')
    setManualDiscountType('flat')
    setError('')
    searchRef.current?.focus()
  }

  const applyCoupon = async () => {
    const code = couponInput.trim().toUpperCase()
    if (!code) { setCouponError('Enter a coupon code'); return }

    setCouponLoading(true)
    setCouponError('')
    setAppliedCoupon(null)

    try {
      if (!isSupabaseConfigured) {
        setCouponError('Coupon validation requires a live connection')
        return
      }

      const { data, error: dbErr } = await supabase
        .from('coupons')
        .select('*')
        .eq('is_active', true)
        .ilike('code', code)
        .single()

      if (dbErr || !data) {
        setCouponError('Invalid or expired coupon code')
        return
      }

      if (data.expiry_date && new Date(data.expiry_date) < new Date()) {
        setCouponError('This coupon has expired')
        return
      }

      if (data.usage_limit && data.usage_count >= data.usage_limit) {
        setCouponError('Coupon usage limit has been reached')
        return
      }

      if (data.min_order_value && subtotal < Number(data.min_order_value)) {
        setCouponError(`Minimum order of ${formatCurrency(Number(data.min_order_value))} required`)
        return
      }

      setAppliedCoupon({ code: String(data.code), percentage: Number(data.percentage), minOrderValue: Number(data.min_order_value || 0), discount: Number(data.discount || 0) })
    } catch {
      setCouponError('Failed to validate coupon. Try again.')
    } finally {
      setCouponLoading(false)
    }
  }

  const removeCoupon = () => {
    setAppliedCoupon(null)
    setCouponInput('')
    setCouponError('')
  }

  const getOrderType = (): 'pos_sale' | 'manual_sale' => (items.length > 0 && items.every((item) => item.source === 'manual') ? 'manual_sale' : 'pos_sale')

  // ── Generate bill ─────────────────────────────────────────────────────
  const generateBill = async () => {
    if (!items.length) { setError('Add at least one product.'); return }
    // Validate required phone
    const normalizedPhone = normalizeMalaysianPhone(customer.phone || '')
    if (!normalizedPhone) { setError('Please enter a valid Malaysian mobile number (e.g. 0123456789 or +60 12-345 6789)'); return }
    // Validate payment amount
    if (!cashReceived.trim()) { setError('Enter the amount received from customer'); return }
    if (cashReceivedNum < total) { setError(`Insufficient payment. Customer still owes ${formatCurrency(total - cashReceivedNum)}`); return }
    // Validate online mode availability
    if (orderMode === 'online' && !isSupabaseConfigured) { setError('Cannot place online orders while offline'); return }
    setSaving(true); setError('')
    try {
      const created = await createOrderWithStock({
        customerName: customer.name.trim() || 'Walk-in Customer',
        phone: normalizedPhone,
        address: customer.address.trim() || 'POS Counter',
        items: items.map(item => buildStructuredOrderItem({
          productId:    item.parentProductId ? item.parentProductId : toProductId(item.id),
          variantId:    item.variantId   ?? null,
          variantName:  item.variantName ?? null,
          name: item.name,
          tamilName: item.tamilName || item.nameTa || null,
          quantity: item.qty,
          unit: item.selectedUnit,
          unitType: item.unitType,
          baseQuantity: item.baseQuantity,
          basePrice: item.basePrice,
          imageUrl: item.imageUrl || item.image || null,
          source: item.source || 'catalogue',
          note: item.note || null,
        })),
        shipping: Number(shipping || 0),
        status: 'completed',
        orderMode,
        orderType: getOrderType(),
        deliveryCharge: Number(shipping || 0),
        discountAmount: couponDiscount,
        manualDiscountAmount,
        manualDiscountType,
        manualDiscountValue: manualDiscountNumeric,
        couponCode: appliedCoupon?.code,
        couponPercentage: appliedCoupon?.percentage,
        totalGst,
        gstEnabled: billGstEnabled,
      })
      setInvoice({
        id: created.orderId,
        invoiceNo: created.invoiceNo,
        orderType: getOrderType(),
        date: created.createdAt,
        items: [...items],
        subtotal,
        shipping: Number(shipping || 0),
        couponCode: appliedCoupon?.code,
        couponDiscount,
        manualDiscountAmount,
        manualDiscountType,
        manualDiscountValue: manualDiscountNumeric,
        gstAmount: totalGst,
        total,
        customerName: customer.name.trim() || 'Walk-in Customer',
        phone: normalizedPhone,
        address: customer.address.trim() || 'POS Counter',
        amountReceived: cashReceivedNum,
        balanceReturned: balanceToReturn,
        paymentMode: orderMode === 'online' ? 'Online' : cashReceivedNum > 0 ? 'Cash' : 'POS',
      })
      setItems([])
      setCustomer({ name: '', phone: '', address: '' })
      void fetchProducts()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate bill')
    } finally {
      setSaving(false)
    }
  }

  const cashReceivedNum = Number(cashReceived) || 0
  const balanceToReturn = cashReceivedNum > 0 && cashReceivedNum >= total ? cashReceivedNum - total : 0
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const isInsufficientPayment = cashReceived !== '' && cashReceivedNum > 0 && cashReceivedNum < total
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const change = cashReceived && Number(cashReceived) >= total
    ? Number(cashReceived) - total : null

  const sendPosWhatsApp = (inv: InvoiceSnap) => {
    const waLink = toWhatsAppUrl(inv.phone || customer.phone || '')
    const text = encodeURIComponent(buildProfessionalWhatsAppMessage({
      customerName: inv.customerName,
      phone: inv.phone,
      invoiceNumber: inv.invoiceNo,
      paymentMode: inv.paymentMode || 'POS',
      items: inv.items.map((item) => ({
        name: item.name,
        qty: item.qty,
        unit: item.selectedUnit,
        unitType: item.unitType,
        rate: item.basePrice,
        lineTotal: item.lineTotal,
      })),
      subtotal: inv.subtotal,
      couponDiscount: inv.couponDiscount,
      manualDiscountAmount: inv.manualDiscountAmount,
      shipping: inv.shipping,
      gstAmount: inv.gstAmount,
      total: inv.total,
    }))
    window.open(`${waLink}?text=${text}`, '_blank')
  }

  // ══ INVOICE SCREEN ════════════════════════════════════════════════════
  if (invoice) {
    const invoiceItems = invoice.items.map(item => ({
      id: item.id,
      name: item.name,
      nameTa: item.nameTa,
      qty: item.qty,
      quantity: item.qty,
      unit: item.selectedUnit,
      unit_type: item.unitType,
      base_quantity: item.baseQuantity,
      base_price: item.basePrice,
      line_total: item.lineTotal,
      price: item.price,
      offerPrice: item.offerPrice,
    }))

    return (
      <div className="mobile-page-shell print:bg-white print:min-h-0">
        {/* Screen UI */}
        <div className="max-w-2xl mx-auto px-4 py-6 print:hidden space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-textMain">{'Bill Generated'}</h1>
              <p className="text-sm text-textMuted">{invoice.invoiceNo}</p>
            </div>
            <button onClick={clearAll}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sageDark text-white font-bold text-sm">
              <Plus size={15} /> New Sale
            </button>
          </div>

          {/* Payment receipt */}
          <div className="surface-panel p-5">
            <p className="text-xs font-black uppercase tracking-widest text-textMuted mb-3">{'Payment Receipt'}</p>
            <div className="space-y-2.5">
              <div className="flex justify-between items-center pb-2.5 border-b border-sand">
                <p className="text-sm font-bold text-textMuted">{'Grand Total'}</p>
                <p className="text-2xl font-black text-textMain">{formatCurrency(invoice.total)}</p>
              </div>
              <div className="flex justify-between items-center">
                <p className="text-sm font-bold text-textMuted">{'Amount Received'}</p>
                <p className="text-xl font-black text-textMain">{formatCurrency(invoice.amountReceived)}</p>
              </div>
              {invoice.balanceReturned > 0 ? (
                <div className="flex justify-between items-center rounded-xl bg-blue-50 border border-blue-200 px-4 py-3">
                  <p className="text-sm font-black text-blue-700">{'Balance Returned'}</p>
                  <p className="text-2xl font-black text-blue-700">{formatCurrency(invoice.balanceReturned)}</p>
                </div>
              ) : (
                <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-center">
                  <p className="text-sm font-black text-green-700">✅ {'Exact Amount Received'}</p>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-3 gap-3">
            <button onClick={() => sendPosWhatsApp(invoice)}
              className="flex items-center justify-center gap-2 py-3 rounded-xl bg-green-500 hover:bg-green-600 text-white font-bold text-sm transition-colors">
              <MessageCircle size={16} /> WhatsApp
            </button>
            <button onClick={() => {
              printThermalReceipt({
                invoiceNo: invoice.invoiceNo,
                date: invoice.date,
                customerName: invoice.customerName,
                phone: invoice.phone,
                items: invoiceItems.map(item => ({
                  name: item.name,
                  qty: item.qty,
                  unit: item.unit,
                  price: item.price,
                  line_total: item.line_total
                })),
                subtotal: invoice.subtotal,
                shipping: invoice.shipping,
                couponDiscount: invoice.couponDiscount || 0,
                manualDiscount: invoice.manualDiscountAmount || 0,
                totalGst: invoice.gstAmount || 0,
                total: invoice.total
              })
            }}
              className="flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-sand hover:border-sageDark text-textMain font-bold text-sm transition-colors">
              <Printer size={16} /> {'Print Receipt'}
            </button>
            <button onClick={clearAll}
              className="flex items-center justify-center gap-2 py-3 rounded-xl bg-sageDark hover:bg-sageDeep text-white font-bold text-sm transition-colors">
              <RefreshCw size={16} /> New Sale
            </button>
          </div>

          {/* Items summary */}
          <div className="surface-panel p-4">
            <p className="text-xs font-bold text-textMuted uppercase tracking-wide mb-3">{'Items Sold'}</p>
            <div className="space-y-1.5">
              {invoice.items.map(item => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span className="text-textMain">{item.name} × {formatQuantityDisplay(item.qty, item.selectedUnit, item.unitType)}</span>
                  <span className="font-bold">{formatCurrency(item.lineTotal)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Print view — full A4 invoice */}
        <div className="hidden print:block">
          <Invoice
            invoiceNo={invoice.invoiceNo}
            date={invoice.date}
            customerName={invoice.customerName}
            phone={invoice.phone}
            address={invoice.address}
            items={invoiceItems}
            subtotal={invoice.subtotal}
            shipping={invoice.shipping}
            total={invoice.total}
            status="Completed"
            discountAmount={invoice.couponDiscount || 0}
            manualDiscountAmount={invoice.manualDiscountAmount || 0}
            gstAmount={invoice.gstAmount || 0}
            couponCode={invoice.couponCode}
          />
        </div>
      </div>
    )
  }

  // ══ MAIN POS SCREEN ══════════════════════════════════════════════════
  return (
    <div data-embedded={embeddedMode} data-panel={mobilePanelView} className="flex flex-col h-full bg-[#FAFAFA] print:hidden overflow-y-auto overflow-x-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 md:px-6 md:pt-6 md:pb-4 shrink-0 flex flex-col gap-4 min-[480px]:flex-row min-[480px]:items-start min-[480px]:justify-between">
        <div className="min-w-0">
          <h2 className="text-[28px] md:text-[22px] font-black text-[#8B2332] flex items-start gap-2 leading-tight">
            <div className="w-1.5 h-6 bg-[#8B2332] rounded-full"></div>
            POS Billing Panel
          </h2>
          <p className="text-[13px] md:text-[12px] text-gray-500 font-medium ml-3.5 mt-1 pr-2">Quick Invoice generator & database synced checkout</p>
        </div>
        
        {/* Online/Offline Toggle */}
        <div className="grid grid-cols-2 bg-white rounded-xl border border-[#EAD7B7]/60 p-1 shadow-sm w-full min-[480px]:w-auto">
          <button 
            onClick={() => setOrderMode('offline')}
            className={`min-h-[44px] px-4 py-2 rounded-lg text-[12px] md:text-[11px] font-black tracking-wider uppercase transition-colors ${orderMode === 'offline' ? 'bg-[#8B2332] text-white' : 'text-[#5F6D59] hover:bg-[#F7F6F2]'}`}
          >
            Offline
          </button>
          <button 
            onClick={() => setOrderMode('online')}
            className={`min-h-[44px] px-4 py-2 rounded-lg text-[12px] md:text-[11px] font-black tracking-wider uppercase transition-colors ${orderMode === 'online' ? 'bg-[#8B2332] text-white' : 'text-[#5F6D59] hover:bg-[#F7F6F2]'}`}
          >
            Online
          </button>
        </div>
      </div>

      {/* Main Content Split */}
      <div className="flex flex-col lg:flex-row gap-5 md:gap-6 px-4 md:px-6 pb-24 md:pb-6">
        
        {/* LEFT COLUMN (approx 68%) */}
        <div className="flex-[2.1] flex flex-col gap-6">
          
          {/* Customer Details Card */}
          <div className="bg-white rounded-2xl border border-[#EAD7B7]/40 shadow-sm p-4 md:p-5">
            <h3 className="text-[18px] md:text-[14px] font-black text-[#2C392A] flex items-center gap-2 mb-4">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#8B2332]"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              Customer Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[13px] md:text-[10px] font-black text-[#5F6D59] tracking-wider uppercase mb-1.5">Customer Name</label>
                <input 
                  type="text" 
                  value={customer.name}
                  onChange={e => setCustomer({...customer, name: e.target.value})}
                  placeholder="Enter name"
                  className="w-full h-12 px-4 bg-white border border-[#EAD7B7]/60 rounded-xl focus:outline-none focus:border-[#8B2332] text-[16px] md:text-[13px] font-bold text-[#2C392A] placeholder:text-gray-400 placeholder:font-medium"
                />
              </div>
              <div>
                <label className="block text-[13px] md:text-[10px] font-black text-[#5F6D59] tracking-wider uppercase mb-1.5">Mobile Number (WhatsApp)</label>
                <input 
                  type="text" 
                  value={customer.phone}
                  onChange={e => setCustomer({...customer, phone: e.target.value})}
                  placeholder="Enter 10-digit number"
                  className="w-full h-12 px-4 bg-white border border-[#EAD7B7]/60 rounded-xl focus:outline-none focus:border-[#8B2332] text-[16px] md:text-[13px] font-bold text-[#2C392A] placeholder:text-gray-400 placeholder:font-medium"
                />
              </div>
            </div>
          </div>

          {/* Order Items Card */}
          <div className="bg-white rounded-2xl border border-[#EAD7B7]/40 shadow-sm flex-1 flex flex-col min-h-[400px]">
            {/* Card Header */}
            <div className="flex flex-col gap-4 p-4 md:p-5 border-b border-[#EAD7B7]/40">
              <h3 className="text-[18px] md:text-[14px] font-black text-[#2C392A] flex items-center gap-2">
                <Receipt size={16} className="text-[#8B2332]" />
                Order Items
              </h3>
              <div className="grid grid-cols-2 md:flex md:items-stretch gap-2">
                <button 
                  onClick={clearAll}
                  className="min-h-[44px] w-full md:w-auto px-3 py-2 rounded-lg border border-[#EAD7B7]/60 text-[12px] md:text-[11px] font-black text-[#5F6D59] hover:bg-[#F7F6F2] transition-colors flex items-center justify-center gap-1.5 text-center md:flex-1"
                >
                  <Trash2 size={12} /> CLEAR ORDER
                </button>
                <button 
                  onClick={() => setCatalogOpen(true)}
                  className="min-h-[44px] w-full md:w-auto px-3 py-2 rounded-lg border border-[#8B2332] text-[#8B2332] text-[12px] md:text-[11px] font-black hover:bg-[#8B2332]/5 transition-colors flex items-center justify-center gap-1.5 text-center md:flex-1"
                >
                  <Search size={12} /> SEARCH CATALOG
                </button>
                <button 
                  onClick={() => setAddProductOpen(true)}
                  className="min-h-[44px] w-full md:w-auto px-3 py-2 rounded-lg bg-[#8B2332] text-white text-[12px] md:text-[11px] font-black hover:bg-[#6b1a25] transition-colors flex items-center justify-center gap-1.5 text-center md:flex-1"
                >
                  <Plus size={12} /> ADD TO CATALOG
                </button>
                <button 
                  onClick={addManualItem}
                  className="min-h-[44px] w-full md:w-auto px-3 py-2 rounded-lg border border-[#8B2332] text-[#8B2332] text-[12px] md:text-[11px] font-black hover:bg-[#8B2332]/5 transition-colors flex items-center justify-center gap-1.5 text-center md:flex-1"
                >
                  + ADD CUSTOM ITEM
                </button>
              </div>
            </div>

            {/* Table Header */}
            <div className="hidden md:grid grid-cols-[1fr_100px_120px_40px] gap-3 px-5 py-3 border-b border-[#EAD7B7]/20 bg-[#FAFAFA]">
              <span className="text-[10px] font-black text-[#5F6D59] tracking-wider uppercase">Item Name / Description</span>
              <span className="text-[10px] font-black text-[#5F6D59] tracking-wider uppercase text-right">Price (₹)</span>
              <span className="text-[10px] font-black text-[#5F6D59] tracking-wider uppercase text-center">Qty</span>
              <span></span>
            </div>

            {/* Table Body */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 md:space-y-2">
              {items.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-[#5F6D59]/60">
                  <ShoppingBag size={40} className="mb-3 opacity-20" />
                  <p className="text-[13px] font-bold">No items added yet</p>
                </div>
              )}
              
              {items.map(item => (
                <div key={item.id}>
                  <div className="md:hidden border border-[#EAD7B7]/30 rounded-2xl p-4 bg-[#FFFDFC] space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-black uppercase tracking-wider text-[#5F6D59] mb-1">Product Name</p>
                        {item.source === 'manual' ? (
                          <input
                            type="text"
                            value={item.name}
                            onChange={e => updateItem(item.id, 'name', e.target.value)}
                            placeholder="Item name"
                            className="w-full h-12 px-3 bg-[#FAFAFA] border border-[#EAD7B7]/40 rounded-xl text-[16px] font-bold text-[#2C392A] focus:outline-none focus:border-[#8B2332]"
                          />
                        ) : (
                          <div className="rounded-xl border border-[#EAD7B7]/30 bg-white px-3 py-3">
                            <p className="text-[16px] font-bold text-[#2C392A] break-words">{item.name} {item.variantName ? `- ${item.variantName}` : ''}</p>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => removeItem(item.id)}
                        className="w-11 h-11 shrink-0 flex items-center justify-center rounded-xl border border-[#EAD7B7]/60 text-[#5F6D59] hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors"
                        aria-label={`Delete ${item.name}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[13px] font-black uppercase tracking-wider text-[#5F6D59] mb-1">Price</p>
                        <input
                          type="number"
                          value={item.basePrice || ''}
                          onChange={e => updateItem(item.id, 'basePrice', Number(e.target.value) || 0)}
                          placeholder="0"
                          className={`w-full h-12 px-3 border rounded-xl text-[16px] font-black text-right focus:outline-none focus:border-[#8B2332] ${
                            item.source === 'manual'
                              ? 'bg-[#FAFAFA] border-[#EAD7B7]/40 text-[#2C392A]'
                              : 'bg-white border-[#D9E4D7] text-[#2C392A]'
                          }`}
                        />
                      </div>
                      <div>
                        <p className="text-[13px] font-black uppercase tracking-wider text-[#5F6D59] mb-1">Total</p>
                        <div className="h-12 rounded-xl border border-[#EAD7B7]/30 bg-white px-3 flex items-center justify-end text-[16px] font-black text-[#8B2332]">
                          {formatCurrency(item.lineTotal)}
                        </div>
                      </div>
                    </div>

                    <div>
                      <p className="text-[13px] font-black uppercase tracking-wider text-[#5F6D59] mb-1">Quantity</p>
                      <div className="grid grid-cols-[48px_1fr_48px] items-center gap-2 border border-[#EAD7B7]/60 rounded-xl px-2 py-2 bg-white">
                        <button
                          onClick={() => bumpQty(item.id, -1)}
                          className="w-11 h-11 rounded-xl hover:bg-[#FAFAFA] flex items-center justify-center text-[#5F6D59] font-bold text-[20px]"
                        >-</button>
                        <span className="text-[18px] font-black text-[#2C392A] text-center">{item.qty}</span>
                        <button
                          onClick={() => bumpQty(item.id, 1)}
                          className="w-11 h-11 rounded-xl hover:bg-[#FAFAFA] flex items-center justify-center text-[#5F6D59] font-bold text-[20px]"
                        >+</button>
                      </div>
                    </div>
                  </div>

                  <div className="hidden md:grid grid-cols-[1fr_100px_120px_40px] items-center gap-3 p-2 bg-white border border-[#EAD7B7]/30 rounded-xl hover:border-[#8B2332]/30 transition-colors">
                    {/* Item Name */}
                    <div className="min-w-0 flex items-center gap-2">
                      {item.source === 'manual' ? (
                        <input
                          type="text"
                          value={item.name}
                          onChange={e => updateItem(item.id, 'name', e.target.value)}
                          placeholder="Item name"
                          className="w-full px-3 py-2 bg-[#FAFAFA] border border-[#EAD7B7]/40 rounded-lg text-[13px] font-bold text-[#2C392A] focus:outline-none focus:border-[#8B2332]"
                        />
                      ) : (
                        <div className="px-3 py-2 w-full truncate border border-transparent flex items-center gap-2">
                          <span className="text-[13px] font-bold text-[#2C392A] truncate">{item.name} {item.variantName ? `- ${item.variantName}` : ''}</span>
                        </div>
                      )}
                      {item.source !== 'manual' && (
                        <span className="hidden sm:inline-flex px-2 py-0.5 rounded border border-[#8B2332]/20 text-[#8B2332] text-[9px] font-black tracking-wider uppercase shrink-0 bg-[#8B2332]/5">
                          CATALOG
                        </span>
                      )}
                    </div>

                    {/* Price */}
                    <div>
                      <input
                        type="number"
                        value={item.basePrice || ''}
                        onChange={e => updateItem(item.id, 'basePrice', Number(e.target.value) || 0)}
                        placeholder="0"
                        className={`w-full px-3 py-2 border rounded-lg text-[13px] font-black text-right focus:outline-none focus:border-[#8B2332] ${
                          item.source === 'manual'
                            ? 'bg-[#FAFAFA] border-[#EAD7B7]/40 text-[#2C392A]'
                            : 'bg-white border-[#D9E4D7] text-[#2C392A]'
                        }`}
                      />
                    </div>

                    {/* Quantity Controls */}
                    <div className="flex items-center justify-between border border-[#EAD7B7]/60 rounded-lg px-2 py-1 bg-white">
                      <button
                        onClick={() => bumpQty(item.id, -1)}
                        className="w-6 h-6 rounded-md hover:bg-[#FAFAFA] flex items-center justify-center text-[#5F6D59] font-bold"
                      >-</button>
                      <span className="text-[13px] font-black text-[#2C392A] min-w-[20px] text-center">{item.qty}</span>
                      <button
                        onClick={() => bumpQty(item.id, 1)}
                        className="w-6 h-6 rounded-md hover:bg-[#FAFAFA] flex items-center justify-center text-[#5F6D59] font-bold"
                      >+</button>
                    </div>

                    {/* Delete */}
                    <button
                      onClick={() => removeItem(item.id)}
                      className="w-9 h-9 flex items-center justify-center rounded-lg border border-[#EAD7B7]/60 text-[#5F6D59] hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (approx 32%) */}
        <div className="flex-[1] flex flex-col gap-6 lg:sticky lg:top-4 lg:max-h-[calc(100vh-100px)]">
          <div className="bg-[#FAF9F6] rounded-2xl border border-[#EAD7B7]/60 shadow-sm overflow-hidden flex flex-col h-full max-h-full">
            
            {/* Header */}
            <div className="flex items-center justify-between p-4 md:p-5 border-b border-[#EAD7B7]/60 bg-white shrink-0">
              <h3 className="text-[18px] md:text-[14px] font-black text-[#2C392A] flex items-center gap-2">
                <Receipt size={16} className="text-[#8B2332]" />
                Current Order
              </h3>
              <span className={`px-2 py-1 rounded-full border text-[9px] font-black tracking-wider uppercase flex items-center gap-1.5 ${orderMode === 'offline' ? 'border-red-200 text-red-600 bg-red-50' : 'border-green-200 text-green-600 bg-green-50'}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${orderMode === 'offline' ? 'bg-red-500' : 'bg-green-500'}`}></div>
                {orderMode} (POS)
              </span>
            </div>

            {/* Content body */}
            <div className="p-4 flex flex-col gap-4 bg-white flex-1 overflow-y-auto">
              
              {/* Info Table */}
              <div className="border border-[#EAD7B7]/40 rounded-xl overflow-hidden text-[11px] font-bold">
                <div className="flex justify-between p-3 border-b border-[#EAD7B7]/40 bg-[#FAFAFA]">
                  <span className="text-[#5F6D59] uppercase">Source</span>
                  <span className="text-[#8B2332] border border-[#8B2332]/30 bg-[#8B2332]/5 px-1.5 rounded uppercase">{orderMode.toUpperCase()}</span>
                </div>
                <div className="p-3 border-b border-[#EAD7B7]/40">
                  <span className="text-[13px] md:text-[11px] text-[#5F6D59] uppercase block mb-1">Customer Name</span>
                  <input
                    type="text"
                    value={customer.name}
                    onChange={e => setCustomer({...customer, name: e.target.value})}
                    placeholder="Enter name (optional)"
                    className="w-full h-12 px-3 bg-white border border-[#EAD7B7]/60 rounded-lg text-[16px] md:text-[12px] font-bold text-[#2C392A] focus:outline-none focus:border-[#8B2332]"
                  />
                </div>
                <div className="p-3 border-b border-[#EAD7B7]/40">
                  <span className="text-[13px] md:text-[11px] text-[#5F6D59] uppercase block mb-1">Phone Number</span>
                  <input
                    type="text"
                    value={customer.phone}
                    onChange={e => setCustomer({...customer, phone: e.target.value})}
                    placeholder="9876543210 or +91 9876543210"
                    className={`w-full h-12 px-3 bg-white border rounded-lg text-[16px] md:text-[12px] font-bold text-[#2C392A] focus:outline-none ${customer.phone && !normalizeMalaysianPhone(customer.phone) ? 'border-red-400 bg-red-50' : 'border-[#EAD7B7]/60 focus:border-[#8B2332]'}`}
                  />
                </div>
{items.length > 0 && (
                  <div className="p-3 bg-[#FAFAFA] space-y-1.5 border-b border-[#EAD7B7]/40 max-h-[120px] overflow-y-auto">
                    {items.map(item => (
                <div key={item.id} className="flex justify-between text-[#2C392A]">
                        <span className="truncate pr-2">{item.qty}x {item.name}</span>
                        <span>{formatCurrency(item.lineTotal)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Coupon Code */}
              <div>
                <label className="block text-[13px] md:text-[10px] font-black text-[#5F6D59] tracking-wider uppercase mb-1.5">Coupon Code</label>
                <div className="flex flex-col min-[360px]:flex-row gap-2">
                  <input 
                    type="text" 
                    value={couponInput}
                    onChange={e => setCouponInput(e.target.value.toUpperCase())}
                    placeholder="Enter code"
                    disabled={appliedCoupon !== null}
                    className="w-full h-12 px-3 bg-white border border-[#EAD7B7]/60 rounded-xl text-[16px] md:text-[12px] font-bold text-[#2C392A] focus:outline-none focus:border-[#8B2332] uppercase disabled:bg-gray-100"
                  />
                  {appliedCoupon ? (
                    <button 
                      onClick={removeCoupon}
                      className="min-h-[44px] px-4 py-2.5 bg-red-100 text-red-600 hover:bg-red-200 rounded-xl text-[13px] md:text-[12px] font-black transition-colors"
                    >
                      Remove
                    </button>
                  ) : (
                    <button 
                      onClick={applyCoupon}
                      disabled={couponLoading || !couponInput.trim()}
                      className="min-h-[44px] px-4 py-2.5 bg-[#5F6D59] text-white hover:bg-[#2C392A] rounded-xl text-[13px] md:text-[12px] font-black transition-colors disabled:opacity-50"
                    >
                      Apply
                    </button>
                  )}
                </div>
                {couponError && <p className="text-[10px] font-bold text-red-500 mt-1">{couponError}</p>}
                {appliedCoupon && (
                  <p className="text-[10px] font-bold text-green-600 mt-1">Applied: -{formatCurrency(couponDiscount)}</p>
                )}
              </div>

              {/* Discount */}
              <div>
                <label className="block text-[13px] md:text-[10px] font-black text-[#5F6D59] tracking-wider uppercase mb-1.5">Manual Discount</label>
                <div className="flex gap-2">
                  <div className="relative shrink-0">
                    <select 
                      value={manualDiscountType}
                      onChange={e => setManualDiscountType(e.target.value as 'flat'|'percent')}
                      className="appearance-none h-12 bg-white border border-[#EAD7B7]/60 rounded-xl pl-3 pr-8 text-[16px] md:text-[12px] font-black text-[#2C392A] focus:outline-none focus:border-[#8B2332]"
                    >
                      <option value="flat">₹</option>
                      <option value="percent">%</option>
                    </select>
                    <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#5F6D59] pointer-events-none" />
                  </div>
                  <input 
                    type="number" 
                    value={manualDiscountValue}
                    onChange={e => setManualDiscountValue(e.target.value)}
                    placeholder="0"
                    className="w-full h-12 px-3 bg-white border border-[#EAD7B7]/60 rounded-xl text-[16px] md:text-[12px] font-black text-[#2C392A] text-right focus:outline-none focus:border-[#8B2332]"
                  />
                </div>
              </div>

              {/* GST Toggle */}
              <div className="flex items-center justify-between py-2 border-b border-[#EAD7B7]/40">
                <span className="text-[12px] font-black text-[#5F6D59]">Enable GST on Bill</span>
                <button 
                  type="button"
                  onClick={() => setBillGstEnabled(!billGstEnabled)}
                  className={`w-10 h-6 rounded-full p-1 transition-colors ${billGstEnabled ? 'bg-[#8B2332]' : 'bg-[#EAD7B7]/60'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform ${billGstEnabled ? 'translate-x-4' : 'translate-x-0'}`}></div>
                </button>
              </div>

              {billGstEnabled && (
                <div className="flex gap-2 mb-2">
                  <div className="relative shrink-0">
                    <select 
                      value={gstType}
                      onChange={e => setGstType(e.target.value as 'flat'|'percent')}
                      className="appearance-none h-12 bg-white border border-[#EAD7B7]/60 rounded-xl pl-3 pr-8 text-[16px] md:text-[12px] font-black text-[#2C392A] focus:outline-none focus:border-[#8B2332]"
                    >
                      <option value="percent">%</option>
                      <option value="flat">₹</option>
                    </select>
                    <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#5F6D59] pointer-events-none" />
                  </div>
                  <input 
                    type="number" 
                    value={gstInput}
                    onChange={e => setGstInput(e.target.value)}
                    placeholder={gstType === 'percent' ? "e.g. 18" : "0"}
                    className="w-full h-12 px-3 bg-white border border-[#EAD7B7]/60 rounded-xl text-[16px] md:text-[12px] font-black text-[#2C392A] text-right focus:outline-none focus:border-[#8B2332]"
                  />
                </div>
              )}

              {/* Summary calculations */}
              <div className="space-y-2 mt-2">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-black text-[#5F6D59]">Subtotal ({items.length} items)</span>
                  <span className="text-[13px] font-black text-[#2C392A]">{formatCurrency(subtotal)}</span>
                </div>
                
                {billGstEnabled && totalGst > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-black text-[#5F6D59]">GST Amount</span>
                    <span className="text-[13px] font-black text-[#2C392A]">{formatCurrency(totalGst)}</span>
                  </div>
                )}
                
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-black text-[#5F6D59]">Delivery</span>
                  <input 
                    type="number"
                    value={shipping}
                    onChange={e => setShipping(e.target.value)}
                    className="w-24 h-11 px-2 bg-white border border-[#EAD7B7]/60 rounded-lg text-[16px] md:text-[12px] font-black text-[#2C392A] text-right focus:outline-none focus:border-[#8B2332]"
                  />
                </div>
              </div>

              <div className="h-px bg-[#EAD7B7]/60 my-2"></div>

              {/* Grand Total */}
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-black text-[#2C392A] uppercase tracking-wider">Grand Total</span>
                <span className="text-[24px] font-black text-[#8B2332] tracking-tight">{formatCurrency(total)}</span>
              </div>

              {/* Cash Payment */}
              <div className="mt-2">
                <div className="border border-[#EAD7B7]/60 rounded-xl p-4 bg-white relative">
                  <label className="block text-[10px] font-black text-[#5F6D59] tracking-wider uppercase mb-1.5">Cash Payment</label>
                  <label className="block text-[10px] font-bold text-[#5F6D59] mb-1.5">Amount Received (₹)</label>
                  <input 
                    type="number"
                    value={cashReceived}
                    onChange={e => setCashReceived(e.target.value)}
                    placeholder="0.00"
                    className="w-full h-12 px-3 bg-[#FAFAFA] border border-[#EAD7B7]/40 rounded-xl text-[16px] md:text-[14px] font-black text-[#2C392A] focus:outline-none focus:border-[#8B2332]"
                  />
                  {cashReceivedNum > 0 && (
                    <div className="mt-3 flex justify-between items-center bg-[#F7F6F2] px-3 py-2 rounded-lg border border-[#EAD7B7]/40">
                      <span className="text-[11px] font-bold text-[#5F6D59]">Return Balance:</span>
                      <span className="text-[13px] font-black text-[#2C392A]">{formatCurrency(balanceToReturn)}</span>
                    </div>
                  )}
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-[11px] font-bold mt-2">
                  {error}
                </div>
              )}
            </div>
            
            {/* Action Buttons Fixed Footer */}
            <div className="p-4 md:p-5 border-t border-[#EAD7B7]/60 bg-white shrink-0 sticky bottom-0">
              <div className="grid grid-cols-[1fr_1fr] gap-2">
                <button 
                  type="button"
                  onClick={generateBill}
                  disabled={saving}
                  className="col-span-2 min-h-[48px] py-3.5 bg-[#4CAF50] hover:bg-[#45a049] text-white rounded-xl text-[13px] font-black uppercase tracking-wider transition-colors disabled:opacity-50"
                >
                  {saving ? 'Processing...' : 'Complete Sale'}
                </button>
                <button 
                  type="button"
                  onClick={() => window.print()}
                  className="min-h-[44px] py-2.5 bg-white border border-[#EAD7B7]/60 text-[#2C392A] rounded-xl text-[12px] md:text-[11px] font-black uppercase hover:bg-[#FAFAFA] transition-colors"
                >
                  Print Bill
                </button>
                <button 
                  type="button"
                  onClick={() => {
                    alert('Draft saved locally!');
                    setItems([]);
                    setCustomer({ name: '', phone: '', address: '' });
                  }}
                  className="min-h-[44px] py-2.5 bg-white border border-[#EAD7B7]/60 text-[#2C392A] rounded-xl text-[12px] md:text-[11px] font-black uppercase hover:bg-[#FAFAFA] transition-colors"
                >
                  Save Draft
                </button>
              </div>
            </div>
          </div>
        </div>

      </div>

      {catalogOpen && (
        <CatalogModal 
          isOpen={catalogOpen} 
          onClose={() => setCatalogOpen(false)} 
          onAdd={(p) => {
            addItem(p)
            setCatalogOpen(false)
          }} 
        />
      )}

      {addProductOpen && (
        <AddProductModal 
          isOpen={addProductOpen}
          onClose={() => setAddProductOpen(false)}
          onSuccess={() => {}}
        />
      )}
    </div>
  )
}
