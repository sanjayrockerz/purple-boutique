import { AnimatePresence, motion } from 'framer-motion'
import { Heart, Plus, Minus, ChevronRight } from 'lucide-react'
import {
  useCartStore,
  useFavStore,
  useProductModalStore,
  useVariantStore,
  type Product,
} from '../store/store'
import { useLangStore } from '../store/langStore'
import { formatCurrency } from '../lib/retail'
import { getProductImage, onImgError } from '../lib/productImages'

export default function ProductCard({ product }: { product: Product }) {
  const { items, addItem, removeItem, updateQuantity } = useCartStore()
  const { toggle, isFav } = useFavStore()
  const openProduct = useProductModalStore((s) => s.openProduct)
  const { getDefaultVariant } = useVariantStore()
  const { lang } = useLangStore()
  const l = (en: string, ta: string) => (lang === 'ta' ? ta : en)

  const fav = isFav(product.id)
  const defaultVariant = product.hasVariants ? getDefaultVariant(String(product.id)) : null

  // ── Cart state — single source of truth from store ───────────────
  const cartItem = items.find((i) => i.id === product.id)
  const variantCartItems = product.hasVariants
    ? items.filter((i) => i.parentProductId === String(product.id))
    : []

  // qty = number of packs/units; weight/volume labels are display-only
  const packQty = cartItem ? Math.max(1, Math.round(cartItem.qty)) : 0
  const inCart = packQty > 0
  const variantInCart = variantCartItems.length > 0

  // ── Price ─────────────────────────────────────────────────────────
  const basePrice =
    product.offerPrice && product.offerPrice < product.price
      ? product.offerPrice
      : product.price
  const discount =
    product.offerPrice && product.offerPrice < product.price
      ? Math.round(((product.price - product.offerPrice) / product.price) * 100)
      : 0
  // Use the default variant's price; never show "from RMX" min-price
  const displayPrice =
    product.hasVariants && defaultVariant != null ? defaultVariant.price : basePrice
  // Weight / size label shown under product name
  const variantLabel = defaultVariant?.sizeLabel || defaultVariant?.variantName || null

  const displayName =
    lang === 'ta' && (product.nameTa || product.tamilName)
      ? (product.nameTa || product.tamilName)!
      : product.name

  // ── Handlers ──────────────────────────────────────────────────────
  const openModal = () => {
    openProduct(product)
  }

  const handleAdd = () => {
    if (product.hasVariants) {
      openModal()
    } else {
      const packLabel = product.predefinedOptions[0]?.label ?? product.unitLabel
      addItem(product, 1, packLabel)
    }
  }

  const handleDecrement = () => {
    if (packQty <= 1) {
      removeItem(product.id)
    } else {
      updateQuantity(product.id, packQty - 1)
    }
  }

  const handleIncrement = () => {
    updateQuantity(product.id, packQty + 1)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="group relative flex h-full flex-col overflow-hidden surface-panel-compact transition-shadow hover:shadow-[0_14px_32px_rgba(44,57,42,0.12)]"
    >
      {/* Fav button — desktop only */}
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={(e) => { e.stopPropagation(); void toggle(product) }}
        className={`absolute right-1.5 top-1.5 z-10 hidden xl:flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${
          fav ? 'border-rose-200 bg-rose-50' : 'border-[#D1FAE5] bg-white/90'
        }`}
        type="button"
        aria-label={fav ? 'Remove from favourites' : 'Add to favourites'}
      >
        <Heart size={13} className={fav ? 'fill-rose-500 text-rose-500' : 'text-slate-400'} />
      </motion.button>

      {discount > 0 && (
        <div className="absolute left-2 top-2 z-10 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-black text-white">
          {discount}% OFF
        </div>
      )}

      <div className="flex flex-1 flex-col gap-2 p-2.5 sm:p-3">
        {/* Image — click opens modal */}
        <button
          type="button"
          onClick={openModal}
          tabIndex={-1}
          aria-label={`View ${product.name}`}
          className="block aspect-square w-full overflow-hidden rounded-xl bg-[#E8EDE4] focus:outline-none"
        >
          <img
            src={getProductImage(product.name, product.category, product.imageUrl, 'card')}
            alt={product.name}
            loading="lazy"
            decoding="async"
            sizes="(max-width: 640px) 50vw, 280px"
            onError={onImgError}
            className="h-full w-full object-contain transition-transform duration-500 ease-out group-hover:scale-[1.03]"
          />
        </button>

        {/* Info */}
        <div className="flex flex-1 flex-col text-left">
          {/* Name — click opens modal */}
          <button
            type="button"
            onClick={openModal}
            className="text-left w-full focus:outline-none"
          >
            <h3 className="line-clamp-2 min-h-[2.4rem] text-[12px] font-semibold leading-[1.4] text-[#111111] ta-text hover:text-[#1e2817]">
              {displayName}
            </h3>
          </button>

          {/* Variant/unit label */}
          <p className="mt-0.5 min-h-[1rem] text-[10px] leading-none text-[#7A846F]">
            {variantLabel ?? product.unitLabel}
          </p>

          {/* Price */}
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-[13px] font-black text-[#111111] tabular-nums">
              {formatCurrency(displayPrice)}
            </span>
            {discount > 0 && !product.hasVariants && (
              <span className="ml-0.5 text-[10px] text-slate-400 line-through tabular-nums">
                {formatCurrency(product.price)}
              </span>
            )}
          </div>

          {/* ADD / Stepper — pushed to bottom */}
          <div className="mt-auto pt-2">
            <AnimatePresence mode="wait" initial={false}>
              {product.hasVariants ? (
                variantInCart ? (
                  // Variant in cart — show "In Cart" chip that opens modal to manage
                  <motion.button
                    key="variant-in-cart"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.14 }}
                    type="button"
                    onClick={openModal}
                    className="flex w-full items-center justify-between rounded-xl bg-[#111111]/8 px-3 py-2 text-[11px] font-black text-[#111111] ring-1 ring-[#111111]/20 active:bg-[#111111]/12"
                  >
                    <span>{l('In Cart', 'கூடையில்')}</span>
                    <ChevronRight size={12} className="text-[#374151]" />
                  </motion.button>
                ) : (
                  // Variant not in cart — ADD opens variant selector
                  <motion.button
                    key="variant-add"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.14 }}
                    whileTap={{ scale: 0.97 }}
                    type="button"
                    onClick={handleAdd}
                    className="flex w-full items-center justify-center gap-1 rounded-xl border-2 border-[#111111] px-3 py-2 text-[12px] font-black text-[#111111] transition-colors active:bg-[#111111] active:text-white"
                  >
                    {l('ADD', 'சேர்')}
                    <ChevronRight size={11} />
                  </motion.button>
                )
              ) : inCart ? (
                // Non-variant in cart — quantity stepper (dark pill, Blinkit style)
                <motion.div
                  key="stepper"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.14 }}
                  className="flex items-center justify-between rounded-xl bg-[#111111] px-1.5 py-1"
                >
                  <button
                    type="button"
                    onClick={handleDecrement}
                    aria-label="Decrease quantity"
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 text-white active:bg-white/25"
                  >
                    <Minus size={12} strokeWidth={3} />
                  </button>
                  <span className="min-w-[1.5rem] text-center text-[13px] font-black text-white tabular-nums">
                    {packQty}
                  </span>
                  <button
                    type="button"
                    onClick={handleIncrement}
                    aria-label="Increase quantity"
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 text-white active:bg-white/25"
                  >
                    <Plus size={12} strokeWidth={3} />
                  </button>
                </motion.div>
              ) : (
                // Non-variant, not in cart — ADD button
                <motion.button
                  key="add"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.14 }}
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  onClick={handleAdd}
                  className="flex w-full items-center justify-center rounded-xl border-2 border-[#111111] px-3 py-2 text-[12px] font-black text-[#111111] transition-colors active:bg-[#111111] active:text-white"
                >
                  {l('ADD', 'சேர்')}
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
