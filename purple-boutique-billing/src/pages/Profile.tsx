import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../store/store'
import { useLangStore } from '../store/langStore'
import { Package, User, LogOut, ChevronDown, ChevronUp, ShoppingBag, Settings, Edit2, Check, X, Camera } from 'lucide-react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { formatCurrency, formatQuantityDisplay, normalizeStructuredOrderItem } from '../lib/retail'

const PHONE_RE = /^[6-9]\d{9}$/

interface ProfileOrderItem {
  product_id: string | null   // UUID — Supabase products.id is UUID
  quantity: number
  unit: string
  unit_type: 'unit' | 'weight' | 'volume' | 'bundle'
  base_quantity: number
  base_price: number
  line_total: number
  name: string
  tamil_name?: string | null
  image_url?: string | null
}

interface ProfileOrder {
  id: string
  invoice_no: string
  order_type: string
  customer_name: string
  phone: string
  address: string
  subtotal: number
  shipping: number
  total: number
  status: string
  created_at: string
  items: ProfileOrderItem[]
}

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: '#FEF3C7', text: '#92400E', label: 'Pending' },
  processing: { bg: '#DBEAFE', text: '#1E40AF', label: 'Processing' },
  completed: { bg: '#D1FAE5', text: '#065F46', label: 'Completed' },
  responded: { bg: '#DBEAFE', text: '#1E40AF', label: 'Responded' },
  cancelled: { bg: '#FEE2E2', text: '#991B1B', label: 'Cancelled' },
}

export default function Profile() {
  const { user, logout, setAuth } = useAuthStore()
  const { lang } = useLangStore()
  const navigate = useNavigate()
  const [orders, setOrders] = useState<ProfileOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'orders' | 'info'>('orders')

  // ── Inline profile edit ───────────────────────────────────────
  const [editing, setEditing]     = useState(false)
  const [editName, setEditName]   = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [saveErr, setSaveErr]     = useState('')
  const [saving, setSaving]       = useState(false)

  // ── Avatar upload ─────────────────────────────────────────────
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl || null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  const startEdit = () => {
    setEditName(user?.name || '')
    setEditPhone(user?.mobile || '')
    setSaveErr(''); setEditing(true)
  }

  const cancelEdit = () => { setEditing(false); setSaveErr('') }

  const handleAvatarUpload = async (file: File) => {
    if (!user || !isSupabaseConfigured) return
    if (file.size > 5_000_000) {
      console.error('Avatar upload rejected: file exceeds 5 MB')
      return
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      console.error('Avatar upload rejected: only JPEG, PNG, or WebP images are accepted')
      return
    }
    setAvatarUploading(true)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${user.id}/avatar.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
      const publicUrl = urlData.publicUrl + `?t=${Date.now()}`

      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id)
      setAvatarUrl(publicUrl)
      setAuth({ ...user, avatarUrl: publicUrl })
    } catch (err) {
      console.error('Avatar upload failed', err)
    } finally {
      setAvatarUploading(false)
    }
  }

  const handleSaveProfile = async () => {
    const trimName  = editName.trim()
    const trimPhone = editPhone.replace(/\D/g, '')
    if (!trimName || trimName.length < 2) { setSaveErr('Name must be at least 2 characters.'); return }
    if (trimPhone && !PHONE_RE.test(trimPhone)) { setSaveErr('Enter a valid 10-digit Indian mobile number.'); return }
    if (!user) return

    setSaving(true); setSaveErr('')
    const { error } = await supabase
      .from('profiles')
      .update({ name: trimName, mobile: trimPhone })
      .eq('id', user.id)

    if (error) { setSaveErr(error.message); setSaving(false); return }

    // Update local store so Navbar / other components reflect new values immediately
    setAuth({ ...user, name: trimName, mobile: trimPhone })
    setSaving(false); setEditing(false)
  }

  const parseOrderItems = (value: unknown): ProfileOrderItem[] => {
    if (!Array.isArray(value)) return []

    return value.map((item) => normalizeStructuredOrderItem(
      item && typeof item === 'object' ? (item as Record<string, unknown>) : {},
    ))
  }

  useEffect(() => {
    if (!user) { navigate('/login'); return }
    if (user.role === 'admin') { setLoading(false); return }

    if (!isSupabaseConfigured) {
      setOrders([])
      setLoading(false)
      return
    }

    const loadOrders = async () => {
      try {
        const { data: authData } = await supabase.auth.getUser()
        if (!authData.user) {
          navigate('/login')
          return
        }

        const phoneDigits = (user.mobile || '').replace(/\D/g, '')

        // Fetch orders linked by user_id OR by phone in a single query
        const orFilter = phoneDigits
          ? `user_id.eq.${authData.user.id},phone.eq.${phoneDigits}`
          : `user_id.eq.${authData.user.id}`

        const { data: ordersData, error: ordersError } = await supabase
          .from('orders')
          .select('id, invoice_no, customer_name, phone, address, items, subtotal, shipping, total, status, created_at, order_type')
          .or(orFilter)
          .order('created_at', { ascending: false })

        if (ordersError) {
          throw ordersError
        }

        if (!ordersData || ordersData.length === 0) {
          setOrders([])
          return
        }

        const mappedOrders: ProfileOrder[] = ordersData.map((order) => ({
          id: String(order.id || ''),
          invoice_no: String(order.invoice_no || ''),
          order_type: String(order.order_type || 'pos_sale'),
          customer_name: String(order.customer_name || ''),
          phone: String(order.phone || ''),
          address: String(order.address || ''),
          subtotal: Number(order.subtotal),
          shipping: Number(order.shipping),
          total: Number(order.total),
          status: String(order.status || 'pending'),
          created_at: String(order.created_at || new Date().toISOString()),
          items: parseOrderItems(order.items),
        }))

        setOrders(mappedOrders)
      } catch {
        setOrders([])
      } finally {
        setLoading(false)
      }
    }

    void loadOrders()

    // Filter the realtime subscription to only this user's orders so other
    // customers placing orders don't trigger an unnecessary re-fetch here.
    const channel = supabase
      .channel(`profile-orders-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `user_id=eq.${user.id}` },
        () => { void loadOrders() },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user, navigate])

  if (!user) return null

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  return (
    <div className="mobile-page-shell py-10">
      <div className="max-w-5xl mx-auto px-4">
        <h1 className="text-2xl sm:text-3xl font-bold font-headline text-textMain mb-6 sm:mb-8">My Account</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Sidebar */}
          <div className="md:col-span-1">
            <div className="surface-panel p-6">
              {/* Avatar */}
              <div className="flex flex-col items-center text-center mb-6 pb-6 border-b border-sand">
                <div className="relative mb-3">
                  <div className="w-20 h-20 rounded-full overflow-hidden bg-gradient-to-br from-sage to-sageDark flex items-center justify-center">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt={user.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-white text-3xl font-bold">{user.name.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  {isSupabaseConfigured && (
                    <button
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={avatarUploading}
                      className="absolute bottom-0 right-0 w-7 h-7 bg-sageDark hover:bg-sageDeep text-white rounded-full flex items-center justify-center shadow-md transition-colors disabled:opacity-60"
                      title="Change profile photo"
                    >
                      {avatarUploading
                        ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        : <Camera size={13} />
                      }
                    </button>
                  )}
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) void handleAvatarUpload(f) }}
                  />
                </div>
                <h2 className="text-lg font-bold text-textMain">{user.name}</h2>
                <p className="text-sm text-textMuted">{user.email}</p>
                {user.mobile && <p className="text-sm text-textMuted">{user.mobile}</p>}
                <span className={`mt-2 px-3 py-0.5 rounded-full text-xs font-bold ${user.role === 'admin' ? 'bg-sageDark/20 text-sageDark' : 'bg-blue-100 text-blue-700'}`}>
                  {user.role === 'admin' ? '⚡ Admin' : '🛒 Customer'}
                </span>
              </div>

              {/* Nav */}
              <div className="space-y-2">
                <button onClick={() => setActiveTab('orders')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-colors ${activeTab === 'orders' ? 'bg-sageDark/10 text-sageDark' : 'text-textMuted hover:bg-bgMain'}`}>
                  <Package size={16} /> Order History
                </button>
                <button onClick={() => setActiveTab('info')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-colors ${activeTab === 'info' ? 'bg-sageDark/10 text-sageDark' : 'text-textMuted hover:bg-bgMain'}`}>
                  <User size={16} /> Account Info
                </button>
                {user.role === 'admin' && (
                  <>
                    <button onClick={() => navigate('/dashboard')}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm text-textMuted hover:bg-bgMain transition-colors">
                      <Settings size={16} /> Dashboard
                    </button>
                    <button onClick={() => navigate('/pos')}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm text-textMuted hover:bg-bgMain transition-colors">
                      <ShoppingBag size={16} /> POS Billing
                    </button>
                  </>
                )}
                <button onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm text-red-500 hover:bg-red-50 transition-colors">
                  <LogOut size={16} /> Logout
                </button>
              </div>
            </div>
          </div>

          {/* Main */}
          <div className="md:col-span-2">
            {/* Account Info */}
            {activeTab === 'info' && (
              <div className="surface-panel p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-textMain flex items-center gap-2">
                    <User size={20} className="text-sageDark" /> Account Information
                  </h2>
                  {isSupabaseConfigured && !editing && (
                    <button onClick={startEdit}
                      className="flex items-center gap-1.5 text-[12px] font-bold text-sageDark hover:text-sageDeep transition-colors">
                      <Edit2 size={13} /> Edit
                    </button>
                  )}
                </div>

                {/* View mode */}
                {!editing && (
                  <div className="space-y-3">
                    {[
                      { label: 'Full Name',     value: user.name           },
                      { label: 'Email',         value: user.email || '—'   },
                      { label: 'Mobile',        value: user.mobile || '—'  },
                      { label: 'Account Type',  value: user.role === 'admin' ? 'Administrator' : 'Customer' },
                    ].map(item => (
                      <div key={item.label} className="flex items-start gap-4 p-4 bg-bgMain rounded-xl">
                        <div>
                          <p className="text-[10px] font-bold text-textMuted uppercase tracking-wide">{item.label}</p>
                          <p className="font-bold text-textMain mt-0.5">{item.value}</p>
                        </div>
                      </div>
                    ))}
                    {!user.mobile && (
                      <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 px-4 py-3 rounded-xl">
                        📱 Add your mobile number so we can reach you about orders.
                        <button onClick={startEdit} className="ml-1.5 font-bold underline">Add now →</button>
                      </p>
                    )}
                  </div>
                )}

                {/* Edit mode */}
                {editing && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[11px] font-bold text-textMuted uppercase tracking-wide mb-1.5">
                        Full Name *
                      </label>
                      <input
                        type="text"
                        autoFocus
                        className="w-full px-4 py-3 rounded-xl border-2 border-sand focus:border-sageDark outline-none text-[13px]"
                        value={editName}
                        onChange={e => { setEditName(e.target.value); setSaveErr('') }}
                        placeholder="Your full name"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-textMuted uppercase tracking-wide mb-1.5">
                        Mobile Number
                        <span className="ml-1 font-normal normal-case text-[10px] text-gray-400">10-digit Indian mobile</span>
                      </label>
                      <div className="flex gap-2">
                        <span className="flex items-center px-3 py-3 bg-[#F9FAFB] border-2 border-sand rounded-xl text-[13px] font-bold text-textMuted shrink-0 select-none">
                          🇮🇳 +91
                        </span>
                        <input
                          type="tel"
                          maxLength={10}
                          className="flex-1 px-4 py-3 rounded-xl border-2 border-sand focus:border-sageDark outline-none text-[13px]"
                          value={editPhone}
                          onChange={e => { setEditPhone(e.target.value.replace(/\D/g, '')); setSaveErr('') }}
                          placeholder="9876543210"
                        />
                      </div>
                    </div>

                    <div className="p-3 bg-[#F9FAFB] rounded-xl text-[12px] text-textMuted">
                      <strong>Email:</strong> {user.email || '—'}
                      <span className="ml-2 text-[11px] text-gray-400">(cannot be changed here)</span>
                    </div>

                    {saveErr && (
                      <p className="text-[12px] text-red-500 font-medium">⚠ {saveErr}</p>
                    )}

                    <div className="flex gap-3 pt-1">
                      <button onClick={handleSaveProfile} disabled={saving}
                        className="flex items-center gap-1.5 px-5 py-2.5 bg-sageDark hover:bg-sageDeep text-white font-bold rounded-xl text-[13px] disabled:opacity-60 transition-colors">
                        {saving
                          ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving…</>
                          : <><Check size={14} /> Save Changes</>
                        }
                      </button>
                      <button onClick={cancelEdit} disabled={saving}
                        className="flex items-center gap-1.5 px-5 py-2.5 border-2 border-sand text-textMuted font-bold rounded-xl text-[13px] hover:bg-bgMain transition-colors">
                        <X size={14} /> Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Orders */}
            {activeTab === 'orders' && (
              <div className="surface-panel p-6">
                <h2 className="text-xl font-bold text-textMain mb-6 flex items-center gap-2">
                  <Package size={20} className="text-sageDark" /> Order History
                  <span className="ml-auto text-sm font-normal text-textMuted">{orders.length} orders</span>
                </h2>

                {loading ? (
                  <div className="flex items-center justify-center py-16">
                    <span className="w-8 h-8 border-4 border-sand border-t-sageDark rounded-full animate-spin" />
                  </div>
                ) : orders.length === 0 ? (
                  <div className="text-center py-16">
                    <ShoppingBag size={48} className="mx-auto text-textMuted opacity-30 mb-4" />
                    <p className="font-bold text-textMain mb-2">No orders yet</p>
                    <p className="text-sm text-textMuted mb-6">Start shopping to see your orders here</p>
                    <Link to="/products"
                      className="inline-block bg-sageDark hover:bg-sageDeep text-white font-bold px-6 py-3 rounded-xl transition-colors">
                      Browse Products
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {orders.map((o) => {
                      const isOnlineRequest = o.order_type === 'online_request'
                      const statusKey = isOnlineRequest && (o.status === 'completed' || o.status === 'paid')
                        ? 'responded'
                        : o.status
                      const statusInfo = STATUS_COLORS[statusKey] || STATUS_COLORS.pending
                      const isExpanded = expanded === o.id
                      return (
                        <div key={o.id} className="border border-sand rounded-xl overflow-hidden">
                          <div
                            onClick={() => setExpanded(isExpanded ? null : o.id)}
                            className="flex flex-wrap gap-4 items-center justify-between p-4 cursor-pointer hover:bg-bgMain transition-colors"
                          >
                            <div>
                              <p className="font-bold text-sm text-textMain">
                                {o.order_type === 'online_request' ? `WhatsApp Request: ${o.id}` : `Bill No: ${o.invoice_no}`}
                              </p>
                              <p className="text-xs text-textMuted mt-0.5">
                                {new Date(o.created_at).toLocaleDateString('en-GB')} · {o.items?.length || 0} items
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: statusInfo.bg, color: statusInfo.text }}>
                                {statusInfo.label}
                              </span>
                              <span className="font-bold text-textMain">RM{o.total}</span>
                              {isExpanded ? <ChevronUp size={16} className="text-textMuted" /> : <ChevronDown size={16} className="text-textMuted" />}
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="border-t border-sand bg-white p-4">
                              <div className="mb-4 pb-4 border-b border-sand/50 text-sm grid grid-cols-2 gap-3">
                                <div>
                                  <p className="text-xs text-textMuted font-bold uppercase mb-1">Customer</p>
                                  <p className="font-medium text-textMain">{o.customer_name}</p>
                                  <p className="text-textMuted">{o.phone}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-textMuted font-bold uppercase mb-1">Address</p>
                                  <p className="text-textMuted">{o.address}</p>
                                </div>
                              </div>

                              <div className="overflow-x-auto">
                                <table className="w-full min-w-[520px] text-sm">
                                  <thead className="text-left text-textMuted border-b border-sand">
                                  <tr>
                                    <th className="pb-2 font-medium">Item</th>
                                    <th className="pb-2 font-medium text-center">Qty</th>
                                    <th className="pb-2 font-medium text-right">Price</th>
                                  </tr>
                                </thead>
                                  <tbody className="divide-y divide-sand/30">
                                  {(o.items || []).map((item, i: number) => {
                                      const pName = lang === 'ta' && item.tamil_name ? item.tamil_name : item.name
                                    return (
                                      <tr key={i}>
                                        <td className="py-2 font-medium text-textMain">{pName}</td>
                                          <td className="py-2 text-center text-textMuted">{formatQuantityDisplay(item.quantity, item.unit, item.unit_type)}</td>
                                          <td className="py-2 text-right font-bold text-textMain">{formatCurrency(item.line_total)}</td>
                                      </tr>
                                    )
                                  })}
                                  </tbody>
                                </table>
                              </div>

                              <div className="mt-3 space-y-1">
                                {(o.items || []).map((item, i: number) => (
                                  <p key={`meta-${i}`} className="text-[11px] text-textMuted">
                                    {(lang === 'ta' && item.tamil_name ? item.tamil_name : item.name)}: {item.unit} • {formatCurrency(item.base_price)}
                                  </p>
                                ))}
                              </div>

                              <div className="mt-4 pt-4 border-t border-sand text-sm space-y-1 text-right">
                                  <p className="text-textMuted">Subtotal: {formatCurrency(o.subtotal)}</p>
                                  <p className="font-bold text-textMain text-base">Total: {formatCurrency(o.total)}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
