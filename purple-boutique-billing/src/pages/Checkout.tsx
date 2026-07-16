import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useCartStore, useAuthStore } from '../store/store'
import { useLangStore } from '../store/langStore'
import { ArrowLeft, MessageCircle, CheckCircle, ShoppingBag, Tag, X } from 'lucide-react'
import { createOrderWithStock } from '../services/orderService'
import { validateCoupon } from '../services/couponService'
import { BRAND_WHATSAPP, BRAND_WHATSAPP_LINK } from '../lib/brand'
import { normalizeIndianPhone, isValidIndianPhone, getSubscriberDigits } from '../lib/phone'
import { PLACEHOLDER as PRODUCT_PLACEHOLDER } from '../lib/productImages'
import {
  buildStructuredOrderItem,
  formatCurrency,
  formatQuantityDisplay,
} from '../lib/retail'
import { buildProfessionalWhatsAppMessage } from '../lib/whatsappMessage'


const toProductId = (value: string | number): string | null => {
  const str = String(value ?? '').trim()
  return str || null
}

interface BookedOrderSnapshot {
  requestId: string
  orderId: string
  name: string
  phone: string
  address: string
  itemCount: number
  subtotal: number
  discountAmount: number
  total: number
  couponCode?: string
}

export default function Checkout() {
  const { items, clear, total } = useCartStore()
  const { user } = useAuthStore()
  const { lang } = useLangStore()
  const navigate = useNavigate()

  const subtotal = total()

  const [form, setForm]       = useState({ name: '', phone: '', address: '' })
  const [loading, setLoading] = useState(false)
  const [booked, setBooked]   = useState<BookedOrderSnapshot | null>(null)
  const [error, setError]     = useState('')

  // Coupon state
  const [couponInput, setCouponInput]   = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; percentage: number; discount: number } | null>(null)
  const [couponError, setCouponError]   = useState('')
  const [couponLoading, setCouponLoading] = useState(false)

  const discountAmount = appliedCoupon?.discount || 0
  const finalTotal     = Math.max(0, subtotal - discountAmount)

  useEffect(() => {
    if (items.length === 0 && !booked) navigate('/cart')
    if (user) {
      setForm(f => ({
        ...f,
        name:  f.name  || user.name,
        phone: f.phone || user.mobile || '',
      }))
    }
  }, [items.length, user, navigate, booked])

  // ── Coupon validation ────────────────────────────────────────
  const applyCoupon = async () => {
    const code = couponInput.trim().toUpperCase()
    if (!code) { setCouponError('Enter a coupon code'); return }

    setCouponLoading(true)
    setCouponError('')
    setAppliedCoupon(null)

    const { data, error } = await validateCoupon(code, subtotal)
    if (error) {
      setCouponError(error)
    } else if (data) {
      setAppliedCoupon(data)
    }
    setCouponLoading(false)
  }

  const removeCoupon = () => {
    setAppliedCoupon(null)
    setCouponInput('')
    setCouponError('')
  }

  // ── WhatsApp message builder ─────────────────────────────────
  const buildWhatsAppMessage = (
    snapshot: BookedOrderSnapshot,
    cartItems: typeof items,
  ) => {
    return encodeURIComponent(buildProfessionalWhatsAppMessage({
      customerName: snapshot.name,
      phone: snapshot.phone,
      invoiceNumber: snapshot.requestId,
      paymentMode: 'Online Request',
      items: cartItems.map((i) => ({
        name: lang === 'ta' && i.nameTa ? i.nameTa : i.name,
        qty: i.qty,
        unit: i.selectedUnit,
        unitType: i.unitType,
        rate: i.basePrice,
        lineTotal: i.lineTotal,
      })),
      subtotal: snapshot.subtotal,
      couponDiscount: snapshot.discountAmount,
      total: snapshot.total,
    }))
  }

  // ── Place order ──────────────────────────────────────────────
  const handleCheckout = async () => {
    if (!user) {
      navigate('/login?redirect=/checkout')
      return
    }

    if (!form.name.trim()) {
      setError('Please enter your full name')
      return
    }

    if (!isValidIndianPhone(form.phone)) {
      setError('Please enter a valid Indian WhatsApp number (e.g. 9876543210 or +91 9876543210)')
      return
    }

    if (!form.address.trim()) {
      setError('Please enter your delivery address')
      return
    }

    const normalizedPhone = normalizeIndianPhone(form.phone)!
    const phoneDigits = getSubscriberDigits(form.phone)!

    setLoading(true)
    setError('')

    const itemsSnapshot   = [...items]
    const structuredItems = itemsSnapshot.map((item) => buildStructuredOrderItem({
      productId:    item.parentProductId ? item.parentProductId : toProductId(item.id),
      variantId:    item.variantId   ?? null,
      variantName:  item.variantName ?? null,
      name:         item.name,
      tamilName:    item.tamilName || item.nameTa || null,
      quantity:     item.qty,
      unit:         item.selectedUnit,
      unitType:     item.unitType,
      baseQuantity: item.baseQuantity,
      basePrice:    item.basePrice,
      imageUrl:     item.imageUrl || item.image || null,
    }))

    try {
      const created = await createOrderWithStock({
        customerName:     form.name.trim(),
        phone:            normalizedPhone,
        address:          form.address.trim() || '',
        items:            structuredItems,
        shipping:         0,
        status:           'pending',
        orderMode:        'online',
        orderType:        'online_request',
        deliveryCharge:   0,
        discountAmount,
        couponCode:       appliedCoupon?.code,
        couponPercentage: appliedCoupon?.percentage,
      })

      const snapshot: BookedOrderSnapshot = {
        requestId:     created.orderId,
        orderId:       created.orderId,
        name:          form.name.trim(),
        phone:         phoneDigits,  // 10-digit display form
        address:       form.address.trim(),
        itemCount:     itemsSnapshot.length,
        subtotal,
        discountAmount,
        total:         finalTotal,
        couponCode:    appliedCoupon?.code,
      }

      const waText = buildWhatsAppMessage(snapshot, itemsSnapshot)
      clear()
      setBooked(snapshot)
      window.open(`${BRAND_WHATSAPP_LINK}?text=${waText}`, '_blank')
    } catch (err: unknown) {
      const msg = err instanceof Error
        ? err.message
        : (err && typeof err === 'object' && 'message' in err)
          ? String((err as Record<string, unknown>).message)
          : String(err || 'Failed to place order. Please try again.')
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  // ── Request confirmed screen ─────────────────────────────────
  if (booked) {
    const waText = encodeURIComponent(
      buildProfessionalWhatsAppMessage({
        customerName: booked.name,
        phone: booked.phone,
        invoiceNumber: booked.requestId,
        paymentMode: 'Online Request',
        items: items.map((i) => ({
          name: lang === 'ta' && i.nameTa ? i.nameTa : i.name,
          qty: i.qty,
          unit: i.selectedUnit,
          unitType: i.unitType,
          rate: i.basePrice,
          lineTotal: i.lineTotal,
        })),
        subtotal: booked.subtotal,
        couponDiscount: booked.discountAmount,
        total: booked.total,
      })
    )

    return (
      <div className="mobile-page-shell py-16">
        <div className="max-w-lg mx-auto px-4">
          <div className="surface-panel p-8 text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <CheckCircle size={44} className="text-green-500" />
            </div>
            <h1 className="text-2xl font-bold font-headline text-textMain mb-2">Request Sent!</h1>
            <p className="text-textMuted text-sm mb-1">Your WhatsApp request has been saved.</p>
            <p className="font-bold text-sageDark text-base mb-1">WhatsApp Request: {booked.requestId}</p>
            <p className="text-textMuted text-xs mb-4">{booked.itemCount} item(s)</p>

            {/* Summary */}
            <div className="bg-[#F9FAFB] rounded-xl p-4 mb-4 text-sm text-left space-y-1.5">
              <div className="flex justify-between text-textMuted">
                <span>Subtotal</span><span>{formatCurrency(booked.subtotal)}</span>
              </div>
              {booked.discountAmount > 0 && (
                <div className="flex justify-between text-green-700">
                  <span>Discount ({booked.couponCode})</span>
                  <span>−{formatCurrency(booked.discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-textMain text-base border-t border-sand pt-2 mt-2">
                <span>Total</span><span>{formatCurrency(booked.total)}</span>
              </div>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-6 text-left">
              <div className="flex items-center gap-2 mb-2">
                <MessageCircle size={18} className="text-green-600" />
                <p className="font-bold text-green-800 text-sm">WhatsApp Opened</p>
              </div>
              <p className="text-green-700 text-xs leading-relaxed">
                A WhatsApp chat with our store ({BRAND_WHATSAPP}) should have opened. Tap below if it didn't.
              </p>
            </div>

            <div className="space-y-3">
              <a
                href={`${BRAND_WHATSAPP_LINK}?text=${waText}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3.5 rounded-xl transition-colors"
              >
                <MessageCircle size={18} /> Open WhatsApp Chat
              </a>
              {user && (
                <Link to="/profile"
                  className="flex items-center justify-center gap-2 w-full bg-sageDark hover:bg-sageDeep text-white font-bold py-3.5 rounded-xl transition-colors">
                  <ShoppingBag size={18} /> View My Interactions
                </Link>
              )}
              <Link to="/products"
                className="flex items-center justify-center gap-2 w-full border-2 border-sand hover:border-sageDark text-textMain font-bold py-3.5 rounded-xl transition-colors">
                Continue Browsing
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Checkout form ────────────────────────────────────────────
  return (
    <div className="mobile-page-shell min-h-screen py-4 sm:py-10 pb-28 sm:pb-10">
      <div className="max-w-4xl mx-auto px-4">
        <button onClick={() => navigate('/cart')} className="touch-target flex items-center gap-2 mb-4 sm:mb-6 text-sageDark font-bold">
          <ArrowLeft size={16} /> Back to Cart
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8">
          {/* ── Customer Details Form ── */}
          <div className="surface-panel p-4 sm:p-6 h-fit">
            <h2 className="text-xl font-bold text-textMain mb-2">Your Details</h2>
            <p className="text-sm text-textMuted mb-5">We'll send your order summary to WhatsApp</p>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm mb-4">{error}</div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-textMain mb-1.5">Full Name *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Priya Krishnamurthy"
                  className="w-full px-4 py-2.5 sm:py-3 border-2 border-sand focus:border-sageDark rounded-xl outline-none transition-colors" required />
              </div>

              {/* Phone — prominent mandatory field */}
              <div>
                <label className="block text-sm font-bold text-textMain mb-1.5">
                  WhatsApp Number *
                </label>
                <div className="flex gap-2">
                  <span className="flex items-center px-3 py-3 bg-[#F9FAFB] border-2 border-sand rounded-xl text-[13px] font-bold text-textMuted shrink-0">
                    🇮🇳 +91
                  </span>
                  <input
                    value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                    placeholder="9876543210 or +91 9876543210"
                    className={`flex-1 px-4 py-2.5 sm:py-3 border-2 rounded-xl outline-none transition-colors ${
                      form.phone && !isValidIndianPhone(form.phone)
                        ? 'border-red-400 focus:border-red-500'
                        : form.phone && isValidIndianPhone(form.phone)
                          ? 'border-green-400 focus:border-green-500'
                          : 'border-sand focus:border-sageDark'
                    }`}
                    required
                  />
                </div>
                {form.phone && !isValidIndianPhone(form.phone) && (
                  <p className="mt-1 text-xs text-red-500 font-medium">Invalid number — enter 10 digits or full number with +91</p>
                )}
                {form.phone && isValidIndianPhone(form.phone) && (
                  <p className="mt-1 text-xs text-green-600 font-medium">✓ Valid Indian mobile number</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-textMain mb-1.5">
                  Delivery Address *
                </label>
                <textarea value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
                  rows={3} placeholder="House no., street, city, pincode"
                  required
                  className="w-full px-4 py-2.5 sm:py-3 border-2 border-sand focus:border-sageDark rounded-xl outline-none transition-colors resize-none" />
              </div>

              {/* Coupon code */}
              <div>
                <label className="block text-sm font-bold text-textMain mb-1.5 flex items-center gap-1.5">
                  <Tag size={14} /> Coupon Code <span className="font-normal text-textMuted">(optional)</span>
                </label>
                {appliedCoupon ? (
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-green-50 border-2 border-green-300 rounded-xl">
                    <Tag size={14} className="text-green-600 shrink-0" />
                    <div className="flex-1">
                      <p className="text-green-800 font-bold text-sm">{appliedCoupon.code} — {appliedCoupon.percentage}% off</p>
                      <p className="text-green-700 text-xs">You save {formatCurrency(appliedCoupon.discount)}</p>
                    </div>
                    <button onClick={removeCoupon} className="text-green-600 hover:text-red-500 transition-colors">
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      value={couponInput}
                      onChange={e => { setCouponInput(e.target.value.toUpperCase()); setCouponError('') }}
                      placeholder="e.g. FEST10"
                      className="flex-1 px-4 py-2.5 border-2 border-sand focus:border-sageDark rounded-xl outline-none transition-colors text-sm font-bold tracking-wider"
                      onKeyDown={e => e.key === 'Enter' && void applyCoupon()}
                    />
                    <button
                      onClick={() => void applyCoupon()}
                      disabled={couponLoading || !couponInput.trim()}
                      className="px-4 py-2.5 bg-sageDark hover:bg-sageDeep text-white font-bold rounded-xl text-sm transition-colors disabled:opacity-50 shrink-0"
                    >
                      {couponLoading ? '…' : 'Apply'}
                    </button>
                  </div>
                )}
                {couponError && <p className="text-red-500 text-xs mt-1.5 font-medium">{couponError}</p>}
              </div>

              <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-xl text-sm">
                <div className="flex items-center gap-2 mb-1">
                  <MessageCircle size={15} className="shrink-0" />
                  <strong>Continue on WhatsApp</strong>
                </div>
                <p className="text-xs leading-relaxed">After sending your request, you'll be connected to WhatsApp ({BRAND_WHATSAPP}) to confirm delivery and payment details.</p>
              </div>

              {!user && (
                <div className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-xl text-sm">
                  <strong>Sign in required.</strong>{' '}
                  <Link to="/login?redirect=/checkout" className="font-bold underline">Sign in or create account →</Link>
                </div>
              )}

              <button onClick={handleCheckout} disabled={loading}
                className="hidden lg:flex w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3.5 sm:py-4 rounded-xl transition-colors disabled:opacity-60 items-center justify-center gap-2 mt-2">
                {loading ? (
                  <><span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Sending…</>
                ) : (
                  <><MessageCircle size={18} /> Send via WhatsApp</>
                )}
              </button>
            </div>
          </div>

          {/* ── Your Items ── */}
          <div className="surface-panel p-4 sm:p-6">
            <h2 className="text-xl font-bold text-textMain mb-5">Your Items</h2>
            <div className="space-y-4 divide-y divide-sand/30">
              {items.map(item => {
                const pName = lang === 'ta' && item.nameTa ? item.nameTa : item.name
                return (
                  <div key={item.id} className="flex items-center gap-3 pt-4 first:pt-0">
                    <div className="w-14 h-14 rounded-xl overflow-hidden bg-sand/20 shrink-0">
                      <img src={item.image} alt={item.name} loading="lazy"
                        onError={e => { (e.target as HTMLImageElement).src = PRODUCT_PLACEHOLDER }}
                        className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-grow min-w-0">
                      <p className="font-bold text-sm text-textMain truncate">{pName}</p>
                      <p className="text-xs text-textMuted">{formatQuantityDisplay(item.qty, item.selectedUnit, item.unitType)}</p>
                    </div>
                    <p className="font-bold text-sm text-textMain shrink-0">{formatCurrency(item.lineTotal)}</p>
                  </div>
                )
              })}
            </div>

            {/* Totals breakdown */}
            <div className="mt-6 pt-5 border-t border-sand space-y-2 text-sm">
              <div className="flex justify-between text-textMuted">
                <span>Subtotal</span><span className="font-medium">{formatCurrency(subtotal)}</span>
              </div>
              {appliedCoupon && (
                <div className="flex justify-between text-green-700">
                  <span>Discount ({appliedCoupon.code})</span>
                  <span className="font-bold">−{formatCurrency(appliedCoupon.discount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-textMain text-base border-t border-sand pt-3 mt-2">
                <span>Total</span><span>{formatCurrency(finalTotal)}</span>
              </div>
              <p className="text-xs text-textMuted bg-bgMain px-3 py-2 rounded-lg">
                🚚 Delivery charges will be confirmed via WhatsApp before dispatch.
              </p>
            </div>

          </div>

          {/* ── Mobile sticky CTA bar ── */}
          <div className="lg:hidden fixed inset-x-0 bottom-0 z-20 mobile-cta-bar px-4 py-3">
            <div className="mx-auto flex max-w-4xl items-center gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-textMuted">Payable</p>
                <p className="text-lg font-black text-textMain leading-tight">{formatCurrency(finalTotal)}</p>
                {form.phone && (
                  <p className="text-[10px] text-textMuted leading-none mt-0.5 truncate">
                    📱 {form.phone}
                  </p>
                )}
              </div>
              <button onClick={handleCheckout} disabled={loading}
                className="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-3 rounded-2xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                {loading ? 'Sending…' : 'Send via WhatsApp'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
