import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { isSupabaseConfigured } from '../lib/supabase'
import { supabase } from '../lib/supabase'
import { fetchAllProducts } from '../services/productService'
import { fetchAllVariants, type ProductVariant } from '../services/variantService'
import {
  calculateLineTotal,
  getDefaultQuantityForProduct,
  normalizeSelectedQuantity,
  normalizeUnitType,
  toNumber,
  type QuantityOption,
  type UnitType,
} from '../lib/retail'

export type { ProductVariant }

/**
 * SRI SIDDHA HERBAL STORE - CORE STATE MANAGEMENT
 * Unified Store for Auth, Products, and Cart
 */

// --- Types ---
export interface Product {
  id: string | number // Support both legacy numeric IDs and new UUIDs
  name: string
  nameTa?: string
  tamilName?: string
  category: string
  categoryId?: number | string | null
  remedy: string[]
  price: number
  offerPrice?: number | null
  unitType: UnitType
  unitLabel: string
  baseQuantity: number
  stockQuantity: number
  stockUnit: string
  allowDecimalQuantity: boolean
  predefinedOptions: QuantityOption[]
  isActive: boolean
  sortOrder: number
  unit: string
  rating: number
  stock: number
  description: string
  descriptionTa?: string
  benefits: string
  benefitsTa?: string
  image: string
  imageUrl?: string
  source?: 'catalogue' | 'manual'
  note?: string | null
  hasVariants?: boolean

  // New ZERA POS fields
  sku?: string
  barcode?: string
  brand?: string
  purchasePrice?: number
  mrp?: number
  gstPercent?: number
  openingStock?: number
  lowStockAlert?: number
  supplier?: string
  size?: string
  color?: string
}

export interface CartItem extends Product {
  qty: number
  selectedUnit: string
  basePrice: number
  lineTotal: number
  variantId?: string      // UUID of the selected variant row
  variantName?: string    // display name e.g. "Cycle Brand"
  parentProductId?: string // original products.id when item was created from a variant
  
  // ZERA POS billing fields
  cartItemId: string
  discountType: 'amount' | 'percent'
  discountValue: number
  gstRate: number
  gstAmount: number
}

interface AuthUser {
  id: string
  name: string
  email: string
  mobile?: string
  role: 'admin' | 'customer'
  avatarUrl?: string
}

interface AuthState {
  user: AuthUser | null
  loading: boolean
  isAuthenticated: () => boolean
  isAdmin: () => boolean
  setAuth: (user: AuthUser | null) => void
  logout: () => Promise<void>
  login: (id: string, password: string) => boolean
  initialize: () => Promise<void>
}

interface ProductState {
  products: Product[]
  loading: boolean
  error: string | null
  lastFetch: number
  fetchProducts: (force?: boolean) => Promise<void>
  updateProductLocal: (id: string | number, patch: Partial<Product>) => void
}

interface CartState {
  items: CartItem[]
  addItem: (product: Product, quantity: number, unit: string, variantId?: string, variantName?: string, parentProductId?: string) => void
  removeItem: (productId: string | number) => void
  updateQuantity: (productId: string | number, quantity: number) => void
  clearCart: () => void
  totalItems: () => number
  cartSubtotal: () => number
  // Backward-compatible aliases used by existing UI
  add: (product: Product) => void
  remove: (productId: string | number) => void
  updateQty: (productId: string | number, quantity: number) => void
  clear: () => void
  count: () => number
  total: () => number
}

interface FavState {
  items: Product[]
  toggle: (product: Product) => void
  isFav: (productId: string | number) => boolean
  clear: () => void
}

interface ProductModalState {
  product: Product | null
  open: boolean
  openProduct: (product: Product) => void
  closeProduct: () => void
}

export interface StoreSettings {
  name: string
  ownerName: string
  phone: string
  address: string
  gstEnabled: boolean
}

interface SettingsState {
  settings: StoreSettings | null
  loading: boolean
  fetchSettings: () => Promise<void>
}

interface VariantStoreState {
  variantsMap: Record<string, ProductVariant[]>
  fetched: boolean
  fetchVariants: () => Promise<void>
  refetchVariants: () => Promise<void>
  getVariants: (productId: string) => ProductVariant[]
  getDefaultVariant: (productId: string) => ProductVariant | null
  hasVariants: (productId: string | number) => boolean
}

interface VariantModalState {
  product: Product | null
  open: boolean
  openVariantModal: (product: Product) => void
  closeVariantModal: () => void
}

type SessionFallback = {
  id?: string
  email?: string | null
  phone?: string | null
  user_metadata?: {
    name?: string
    mobile?: string
  }
}

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>
  }
  return {}
}

const readString = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback)

const toAuthUser = (profile: unknown, fallback?: SessionFallback): AuthUser => {
  const profileRow = asRecord(profile)
  const fallbackMeta = asRecord(fallback?.user_metadata)
  const email = String(profileRow.email || fallback?.email || '')
  const isAdmin = profileRow.role === 'admin'

  return {
    id: String(profileRow.id || fallback?.id || ''),
    name: String(profileRow.name || fallbackMeta.name || fallback?.email || 'Customer'),
    email,
    mobile: String(profileRow.mobile || fallbackMeta.mobile || fallback?.phone || ''),
    role: isAdmin ? 'admin' : 'customer',
    avatarUrl: readString(profileRow.avatar_url) || undefined,
  }
}

const mapDbProduct = (input: unknown): Product => {
  const p = asRecord(input)
  const stockQuantity = toNumber(p.stock_quantity, 0)
  const legacyStock = toNumber(p.stock, 0)
  const effectiveStockQuantity = stockQuantity > 0 ? stockQuantity : legacyStock
  const image = readString(p.image_url) || readString(p.image) || '/assets/images/default-herb.jpg'
  const remedy = Array.isArray(p.remedy)
    ? p.remedy.filter((entry): entry is string => typeof entry === 'string')
    : []

  return {
    id: String(p.id || ''),
    name: readString(p.name, 'Herbal Product'),
    nameTa: readString(p.name_ta) || readString(p.tamil_name),
    tamilName: readString(p.tamil_name) || readString(p.name_ta),
    category: readString(p.category, 'Herbal Product'),
    categoryId: typeof p.category_id === 'string' || typeof p.category_id === 'number' ? p.category_id : null,
    remedy,
    price: toNumber(p.price, 0),
    offerPrice: p.offer_price != null ? toNumber(p.offer_price, 0) : null,
    unitType: normalizeUnitType(p.unit_type, 'unit'),
    unitLabel: readString(p.unit_label, 'piece'),
    baseQuantity: toNumber(p.base_quantity, 1),
    stockQuantity: effectiveStockQuantity,
    stockUnit: readString(p.stock_unit, 'piece'),
    allowDecimalQuantity: Boolean(p.allow_decimal_quantity),
    predefinedOptions: Array.isArray(p.predefined_options) ? p.predefined_options as QuantityOption[] : [],
    isActive: p.is_active !== false,
    sortOrder: toNumber(p.sort_order, 0),
    unit: readString(p.unit, '100g'),
    rating: toNumber(p.rating, 4.7),
    stock: Math.floor(effectiveStockQuantity),
    description: readString(p.description),
    descriptionTa: readString(p.description_ta),
    benefits: readString(p.benefits),
    benefitsTa: readString(p.benefits_ta),
    image,
    imageUrl: image,
    hasVariants: Boolean(p.has_variants),
    
    // ZERA POS mapping
    sku: readString(p.sku),
    barcode: readString(p.barcode),
    brand: readString(p.brand),
    purchasePrice: toNumber(p.purchase_price, 0),
    mrp: toNumber(p.mrp, 0),
    gstPercent: toNumber(p.gst_percent, 0),
    openingStock: toNumber(p.opening_stock, 0),
    lowStockAlert: toNumber(p.low_stock_alert, 5),
    supplier: readString(p.supplier),
    size: readString(p.size),
    color: readString(p.color),
  }
}

// --- Auth Store ---
const SHOP_ID = 'shopname'
const SHOP_PASSWORD = 'cenexa'

const createAuthUser = (): AuthUser => ({
  id: SHOP_ID,
  name: 'Purple Boutique Admin',
  email: 'admin@purpleboutique.my',
  mobile: '+60 12-345 6789',
  role: 'admin' as const,
})

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get): AuthState => ({
      user: null,
      loading: true,
      isAuthenticated: () => !!get().user,
      isAdmin: () => get().user?.role === 'admin',
      setAuth: (user: AuthUser | null) => set({ user, loading: false }),
      logout: async () => {
        set({ user: null, loading: false })
      },
      login: (id: string, password: string) => {
        if (id === SHOP_ID && password === SHOP_PASSWORD) {
          const user = createAuthUser()
          set({ user, loading: false })
          return true
        }
        return false
      },
      initialize: async () => {
        set({ loading: true })
        // The shop currently uses the built-in password gate even when a
        // Supabase project is configured; no Supabase users are required.
        const localState = get()
        if (localState.user?.id === SHOP_ID) {
          set({ loading: false })
          return
        }
        if (isSupabaseConfigured) {
          const { data: { user } } = await supabase.auth.getUser()
          if (!user) {
            set({ user: null, loading: false })
            return
          }
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, name, mobile, email, role')
            .eq('id', user.id)
            .maybeSingle()
          set({
            user: {
              id: user.id,
              name: profile?.name || user.user_metadata?.name || user.email || '',
              mobile: profile?.mobile || user.user_metadata?.mobile || '',
              email: user.email || profile?.email || '',
              role: profile?.role === 'admin' ? 'admin' : 'customer',
            },
            loading: false,
          })
          return
        }
        // Local demo authentication is used only when Supabase is not configured.
        const state = get()
        if (state.user) {
          set({ loading: false })
        } else {
          set({ user: null, loading: false })
        }
      }
    }),
    { name: 'purple-boutique-auth' }
  )
)

// --- Product Store ---
export const useProductStore = create<ProductState>((set, get) => ({
  products: [],
  loading: false,
  error: null,
  lastFetch: 0,
  updateProductLocal: (id, patch) => set(state => ({
    products: state.products.map(product => String(product.id) === String(id) ? { ...product, ...patch } : product),
  })),
  fetchProducts: async (force = false) => {
    if (!force && Date.now() - get().lastFetch < 300000 && get().products.length > 0) return

    if (!isSupabaseConfigured) {
      set({
        products: [],
        loading: false,
        error: 'Supabase is not configured',
        lastFetch: Date.now(),
      })
      return
    }

    set({ loading: true, error: null })
    try {
      const { data, error } = await fetchAllProducts()

      if (error) throw error

      const normalized = (data || []).map(mapDbProduct)

      set({ products: normalized, loading: false, lastFetch: Date.now() })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Unable to fetch products',
        loading: false,
      })
    }
  }
}))

// --- Cart Store ---
export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (product, qty, unit, variantId, variantName, parentProductId) => {
        const items = [...get().items]
        const existing = items.find(i => i.id === product.id)

        const basePrice = product.offerPrice || product.price
        const lineTotal = calculateLineTotal(qty, product.unitType, product.baseQuantity, basePrice)

        if (existing) {
          existing.selectedUnit = unit
          const mergedQty = normalizeSelectedQuantity(
            existing.qty + qty,
            existing.unitType,
            existing.allowDecimalQuantity,
            1,
          )
          existing.qty = mergedQty
          existing.lineTotal = calculateLineTotal(mergedQty, existing.unitType, existing.baseQuantity, basePrice)
        } else {
          items.push({
            ...product,
            qty,
            selectedUnit: unit,
            basePrice,
            lineTotal,
            // Variant identity — only set for variant items
            variantId:       variantId       ?? undefined,
            variantName:     variantName     ?? undefined,
            parentProductId: parentProductId ?? undefined,
            
            // ZERA POS defaults
            cartItemId: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            discountType: 'amount',
            discountValue: 0,
            gstRate: product.gstPercent || 0,
            gstAmount: ((product.gstPercent || 0) > 0) ? (lineTotal * (product.gstPercent || 0) / 100) : 0,
          })
        }
        set({ items })
      },
      removeItem: (id) => set({ items: get().items.filter(i => i.id !== id) }),
      updateQuantity: (id, qty) => {
        const items = get().items.map(item => {
          if (item.id === id) {
            const newQty = normalizeSelectedQuantity(
              qty,
              item.unitType,
              item.allowDecimalQuantity,
              1,
            )
            return {
              ...item,
              qty: newQty,
              lineTotal: calculateLineTotal(newQty, item.unitType, item.baseQuantity, item.basePrice)
            }
          }
          return item
        })
        set({ items })
      },
      clearCart: () => set({ items: [] }),
      totalItems: () => get().items.length,
      cartSubtotal: () => get().items.reduce((sum, item) => sum + item.lineTotal, 0),
      add: (product) => {
        const packLabel = product.predefinedOptions[0]?.label ?? product.unitLabel
        get().addItem(product, 1, packLabel)
      },
      remove: (productId) => get().removeItem(productId),
      updateQty: (productId, quantity) => get().updateQuantity(productId, quantity),
      clear: () => get().clearCart(),
      count: () => get().totalItems(),
      total: () => get().cartSubtotal(),
    }),
    { name: 'sri-siddha-cart' }
  )
)

export const useFavStore = create<FavState>()(
  persist(
    (set, get) => ({
      items: [],
      toggle: (product) => {
        const exists = get().items.some((p) => p.id === product.id)
        if (exists) {
          set({ items: get().items.filter((p) => p.id !== product.id) })
          return
        }
        set({ items: [...get().items, product] })
      },
      isFav: (productId) => get().items.some((p) => p.id === productId),
      clear: () => set({ items: [] }),
    }),
    { name: 'sri-siddha-favorites' },
  ),
)

export const useProductModalStore = create<ProductModalState>()((set) => ({
  product: null,
  open: false,
  openProduct: (product) => set({ product, open: true }),
  closeProduct: () => set({ open: false, product: null }),
}))

// --- Variant Store ---
export const useVariantStore = create<VariantStoreState>()((set, get) => ({
  variantsMap: {},
  fetched: false,
  fetchVariants: async () => {
    if (get().fetched) return
    const { data } = await fetchAllVariants()
    const map: Record<string, ProductVariant[]> = {}
    for (const v of data) {
      if (!map[v.productId]) map[v.productId] = []
      map[v.productId].push(v)
    }
    set({ variantsMap: map, fetched: true })
  },
  refetchVariants: async () => {
    set({ fetched: false })
    const { data } = await fetchAllVariants()
    const map: Record<string, ProductVariant[]> = {}
    for (const v of data) {
      if (!map[v.productId]) map[v.productId] = []
      map[v.productId].push(v)
    }
    set({ variantsMap: map, fetched: true })
  },
  getVariants: (productId) => get().variantsMap[String(productId)] || [],
  getDefaultVariant: (productId) => {
    const variants = get().variantsMap[String(productId)] || []
    return variants.find(v => v.isDefault) || variants[0] || null
  },
  hasVariants: (productId) => (get().variantsMap[String(productId)] || []).length > 0,
}))

// --- Variant Selector Modal Store ---
export const useVariantModalStore = create<VariantModalState>()((set) => ({
  product: null,
  open: false,
  openVariantModal: (product) => set({ product, open: true }),
  closeVariantModal: () => set({ open: false, product: null }),
}))

// --- Store Settings State ---
export const useSettingsStore = create<SettingsState>()((set) => ({
  settings: null,
  loading: false,
  fetchSettings: async () => {
    set({ loading: true })
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.from('store_settings').select('*').limit(1).single()
      if (!error && data) {
        set({
          settings: {
            name: data.name,
            ownerName: data.owner_name,
            phone: data.phone,
            address: data.address,
            gstEnabled: data.gst_enabled
          },
          loading: false
        })
        return
      }
    }
    // Fallback/Demo settings
    set({
      settings: {
        name: 'ZERA',
        ownerName: 'Sulficker Roshan N',
        phone: '9342489391',
        address: 'ZERA, Kurinji Nagar, Brindhavan Circle, Kuniyamuthur',
        gstEnabled: false
      },
      loading: false
    })
  }
}))

const ADMIN_PORTAL_PASSWORD = import.meta.env.VITE_ADMIN_PORTAL_PASSWORD || 'purpleboutique'

interface AdminAuthState {
  isLoggedIn: boolean
  login: (password: string) => Promise<boolean>
  logout: () => void
}

export const useAdminAuthStore = create<AdminAuthState>()((set) => ({
  isLoggedIn: false,
  login: async (password: string) => {
    if (password === ADMIN_PORTAL_PASSWORD) {
      set({ isLoggedIn: true })
      return true
    }
    return false
  },
  logout: () => set({ isLoggedIn: false }),
}))
