import React from 'react'
import { BRAND_ADDRESS, BRAND_EN, BRAND_PHONE_DISPLAY, BRAND_EMAIL, BRAND_LOCATION_LINK, BRAND_WHATSAPP, BRAND_WHATSAPP_LINK } from '../lib/brand'
import { formatCurrency, formatQuantityDisplay, normalizeStructuredOrderItem } from '../lib/retail'

export interface InvoiceItem {
  id?: number | string
  product_id?: number | null
  name: string
  nameTa?: string | null
  tamil_name?: string | null
  qty: number
  quantity?: number
  unit?: string
  unit_type?: 'unit' | 'weight' | 'volume' | 'bundle'
  base_quantity?: number
  base_price?: number
  line_total?: number
  price: number
  offerPrice?: number | null
}

export interface InvoiceProps {
  invoiceNo: string
  date: string
  customerName: string
  phone: string
  address: string
  items: InvoiceItem[]
  subtotal: number
  shipping: number
  total: number
  status?: string
  userId?: string
  deliveryCharge?: number
  discountAmount?: number
  couponCode?: string | null
  manualDiscountAmount?: number
  gstAmount?: number
}

export const Invoice: React.FC<InvoiceProps> = ({
  invoiceNo,
  date,
  customerName,
  phone,
  address,
  items,
  subtotal,
  shipping,
  total,
  status = 'Pending',
  userId,
  deliveryCharge = 0,
  discountAmount = 0,
  couponCode,
  manualDiscountAmount = 0,
  gstAmount = 0,
}) => {
  const dateStr = (() => {
    try { return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) }
    catch { return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) }
  })()

  const statusColor = status === 'completed' ? '#16a34a' : status === 'cancelled' ? '#dc2626' : '#d97706'
  const effectiveDelivery = deliveryCharge || shipping

  return (
    <div
      id="invoice-print-root"
      style={{
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        background: '#fff',
        color: '#1a1a2e',
        maxWidth: 680,
        margin: '0 auto',
        padding: '40px 48px',
        boxSizing: 'border-box',
        minHeight: '297mm',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ── HEADER ────────────────────────────────────────────────── */}
      <div style={{ textAlign: 'center', borderBottom: '1px solid #e5e7eb', paddingBottom: 24, marginBottom: 24 }}>
        <div style={{ width: 80, height: 80, margin: '0 auto', marginBottom: 12, borderRadius: 8, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src="/zera-logo.png" alt="ZERA Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        <div style={{ fontSize: 24, fontWeight: 900, color: '#8B2332', letterSpacing: -0.5, textTransform: 'uppercase' }}>
          {BRAND_EN}
        </div>
        <div style={{ fontSize: 12, color: '#4b5563', marginTop: 4, fontWeight: 500 }}>
          {BRAND_ADDRESS}
        </div>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#2C392A', marginTop: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          INVOICE: {invoiceNo}
        </div>
        <div style={{ fontSize: 11, color: '#4b5563', marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <span>📞 {BRAND_PHONE_DISPLAY}</span>
        </div>
        <div
          style={{
            display: 'inline-block', marginTop: 12, padding: '3px 12px', borderRadius: 99,
            background: statusColor + '18', color: statusColor,
            fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase',
          }}
        >
          {status}
        </div>
      </div>

      {/* ── META ROW ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 28, gap: 24 }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Order Date</div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{dateStr}</div>
          {userId && (
            <>
              <div style={{ fontSize: 9, fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, marginTop: 12 }}>User ID</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#555', wordBreak: 'break-all', maxWidth: 200 }}>{userId}</div>
            </>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Customer</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#1a1a2e' }}>{customerName}</div>
          <div style={{ fontSize: 12, color: '#555', marginTop: 3 }}>{phone}</div>
          <div style={{ fontSize: 11, color: '#777', marginTop: 4, maxWidth: 220, textAlign: 'right', lineHeight: 1.5 }}>{address}</div>
        </div>
      </div>

      {/* ── DIVIDER ──────────────────────────────────────────────── */}
      <div style={{ borderTop: '1px dashed #d0d0d0', marginBottom: 24 }} />

      {/* ── ITEMS TABLE ──────────────────────────────────────────── */}
      <div style={{ flexGrow: 1 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f3f8f3', borderRadius: 8 }}>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 800, color: '#2d5a27', textTransform: 'uppercase', letterSpacing: 0.8, width: 32 }}>#</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 800, color: '#2d5a27', textTransform: 'uppercase', letterSpacing: 0.8 }}>Product</th>
              <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: 10, fontWeight: 800, color: '#2d5a27', textTransform: 'uppercase', letterSpacing: 0.8, width: 50 }}>Qty</th>
              <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 10, fontWeight: 800, color: '#2d5a27', textTransform: 'uppercase', letterSpacing: 0.8, width: 80 }}>Rate</th>
              <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 10, fontWeight: 800, color: '#2d5a27', textTransform: 'uppercase', letterSpacing: 0.8, width: 90 }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const normalized = normalizeStructuredOrderItem(item as unknown as Record<string, unknown>)
              const displayName = normalized.tamil_name || item.nameTa || normalized.name
              return (
                <tr key={idx} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '12px', fontSize: 12, color: '#999', verticalAlign: 'top' }}>{idx + 1}</td>
                  <td style={{ padding: '12px', verticalAlign: 'top' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e' }}>{normalized.name}</div>
                    {displayName && displayName !== normalized.name && <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{displayName}</div>}
                    {item.offerPrice && item.price !== item.offerPrice && (
                      <div style={{ fontSize: 10, color: '#aaa', textDecoration: 'line-through', marginTop: 2 }}>MRP ₹{item.price}</div>
                    )}
                    <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>
                      {normalized.unit} · {formatCurrency(normalized.base_price)}
                    </div>
                  </td>
                  <td style={{ padding: '12px', fontSize: 13, fontWeight: 600, textAlign: 'center', verticalAlign: 'top' }}>{formatQuantityDisplay(normalized.quantity, normalized.unit, normalized.unit_type)}</td>
                  <td style={{ padding: '12px', fontSize: 13, fontWeight: 600, textAlign: 'right', verticalAlign: 'top', color: '#555' }}>{formatCurrency(normalized.base_price)}</td>
                  <td style={{ padding: '12px', fontSize: 14, fontWeight: 800, textAlign: 'right', verticalAlign: 'top', color: '#1a1a2e' }}>{formatCurrency(normalized.line_total)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── TOTALS ───────────────────────────────────────────────── */}
      <div style={{ marginTop: 28, borderTop: '2px solid #2d5a27', paddingTop: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ minWidth: 260 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: '#666' }}>Subtotal</span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{formatCurrency(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: '#16a34a' }}>
                  Coupon{couponCode ? ` (${couponCode})` : ''}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#16a34a' }}>−{formatCurrency(discountAmount)}</span>
              </div>
            )}
            {manualDiscountAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: '#16a34a' }}>Manual Discount</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#16a34a' }}>−{formatCurrency(manualDiscountAmount)}</span>
              </div>
            )}
            {gstAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: '#666' }}>GST</span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>+{formatCurrency(gstAmount)}</span>
              </div>
            )}
            {effectiveDelivery > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: '#666' }}>Delivery</span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{formatCurrency(effectiveDelivery)}</span>
              </div>
            )}
            {effectiveDelivery === 0 && discountAmount === 0 && manualDiscountAmount === 0 && gstAmount === 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: '#666' }}>Delivery</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#16a34a' }}>FREE</span>
              </div>
            )}
            <div
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                borderTop: '2px solid #2d5a27', paddingTop: 12,
              }}
            >
              <span style={{ fontSize: 16, fontWeight: 900, color: '#2d5a27', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total</span>
              <span style={{ fontSize: 22, fontWeight: 900, color: '#2d5a27' }}>{formatCurrency(total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── FOOTER ───────────────────────────────────────────────── */}
      <div
        style={{
          marginTop: 40, paddingTop: 20, borderTop: '1px dashed #d0d0d0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#2d5a27' }}>Thank you for shopping!</div>
          <div style={{ fontSize: 12, color: '#4a7c59', marginTop: 2 }}>இங்கு வாங்கியதற்கு மிக்க நன்றி!</div>
          <div style={{ fontSize: 10, color: '#aaa', marginTop: 6 }}>Contact: {BRAND_WHATSAPP} | Email: {BRAND_EMAIL}</div>
          <div style={{ fontSize: 10, color: '#aaa', marginTop: 4 }}>WhatsApp: {BRAND_WHATSAPP_LINK}</div>
          <div style={{ fontSize: 10, color: '#aaa', marginTop: 4 }}>Location: {BRAND_LOCATION_LINK}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: '#ccc', marginBottom: 6 }}>Authorised Signature</div>
          <div style={{ width: 120, borderTop: '1px solid #333' }} />
          <div style={{ fontSize: 10, color: '#666', marginTop: 4, fontWeight: 700 }}>{BRAND_EN}</div>
        </div>
      </div>
    </div>
  )
}
