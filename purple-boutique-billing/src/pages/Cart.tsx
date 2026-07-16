import { motion } from 'framer-motion'
import { Trash2, Plus, Minus, ShoppingBag, ArrowLeft } from 'lucide-react'
import { useCartStore } from '../store/store'
import { useLangStore } from '../store/langStore'
import { Link } from 'react-router-dom'
import { formatCurrency, formatQuantityDisplay, getQuantityStepForProduct } from '../lib/retail'
import { getProductImage, onImgError } from '../lib/productImages'

export default function Cart() {
  const { items, remove, updateQty, total, count, clear } = useCartStore()
  const { t, lang } = useLangStore()
  const orderTotal = total()

  const getStep = (item: (typeof items)[number]) => getQuantityStepForProduct({
    unitType: item.unitType,
    baseQuantity: item.baseQuantity,
    allowDecimalQuantity: item.allowDecimalQuantity,
  })

  return (
    <div className="mobile-page-shell pb-28 sm:pb-8">
      <div className="bg-gradient-to-r from-[#eaf2e5] to-bgMain border-b border-sand/50 py-4 sm:py-8">
        <div className="max-w-7xl mx-auto px-4 flex items-center gap-3 sm:gap-4">
          <ShoppingBag className="text-sageDark shrink-0" size={24} />
          <div>
            <h1 className="text-xl sm:text-3xl font-bold font-headline text-textMain">{t('cart.title')}</h1>
            <p className="text-textMuted text-xs sm:text-sm">{count()} {t('cart.items_in_cart')}</p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-4 sm:py-8 flex flex-col lg:flex-row gap-4 sm:gap-8">
        {/* Cart items */}
        <div className="w-full lg:w-[62%]">
          {items.length === 0 ? (
            <div className="surface-panel p-8 sm:p-16 text-center">
              <p className="text-6xl mb-4">🛒</p>
              <h3 className="text-xl font-bold text-textMain mb-2 font-headline">{t('cart.empty')}</h3>
              <p className="text-textMuted text-sm mb-6">{t('cart.empty_sub')}</p>
              <Link to="/products" className="inline-flex items-center gap-2 bg-sageDark hover:bg-sageDeep text-white font-bold px-6 py-3 rounded-xl transition-colors">
                {t('cart.browse')}
              </Link>
            </div>
          ) : (
            <div className="surface-panel overflow-hidden">
              <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-sand/40">
                <h2 className="font-bold text-textMain font-headline">{t('cart.order_items')} ({items.length})</h2>
                <button onClick={clear} className="text-sm text-red-400 hover:text-red-600 font-medium">{t('cart.clear_all')}</button>
              </div>
              <div className="divide-y divide-sand/30">
                {items.map(item => (
                  <motion.div key={item.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 px-4 sm:px-6 py-4 sm:py-5">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden shrink-0 bg-gray-50 border border-sand/40">
                      <img
                        src={getProductImage(item.name, item.category, item.imageUrl, 'tile')}
                        alt={item.name}
                        onError={onImgError}
                        className="w-full h-full object-contain" loading="lazy" />
                    </div>
                    <div className="flex-grow flex flex-col items-start gap-0.5 sm:gap-1 min-w-0">
                      <h3 className="font-bold text-sm sm:text-base text-textMain">
                        {lang === 'ta' && item.nameTa ? item.nameTa : item.name}
                      </h3>
                      <p className="text-xs text-sageDark font-bold">{t('cat.' + item.category)}</p>
                      <p className="text-[11px] text-gray-400">{item.unitLabel} • {formatCurrency(item.basePrice)}</p>
                    </div>
                    <div className="flex items-center gap-3 sm:gap-4 flex-wrap w-full sm:w-auto">
                      <div className="flex items-center gap-0 border-2 border-sand rounded-lg overflow-hidden bg-white">
                        <button onClick={() => updateQty(item.id, item.qty - getStep(item))} className="touch-target w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center text-textMuted hover:bg-bgMain hover:text-textMain transition-colors"><Minus size={14} /></button>
                        <span className="min-w-12 sm:min-w-14 px-1 sm:px-2 text-center font-bold text-sm text-textMain">{item.variantId ? String(item.qty) : formatQuantityDisplay(item.qty, item.selectedUnit, item.unitType)}</span>
                        <button onClick={() => updateQty(item.id, item.qty + getStep(item))} className="touch-target w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center text-textMuted hover:bg-bgMain hover:text-textMain transition-colors"><Plus size={14} /></button>
                      </div>
                      <span className="text-lg font-bold text-textMain font-headline w-24 text-right whitespace-nowrap">{formatCurrency(item.lineTotal)}</span>
                      <button onClick={() => remove(item.id)} className="touch-target p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={15} /></button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
          <Link to="/products" className="inline-flex items-center gap-2 text-sageDark font-bold text-sm mt-5 hover:gap-3 transition-all group">
            <ArrowLeft size={15} className="group-hover:-translate-x-1 transition-transform" /> {t('cart.continue')}
          </Link>

          <div className="lg:hidden fixed inset-x-0 bottom-0 z-20 mobile-cta-bar px-4 py-3">
            <div className="mx-auto flex max-w-7xl items-center gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-textMuted">Cart Total</p>
                <p className="text-lg font-black text-textMain leading-tight">{formatCurrency(orderTotal)}</p>
              </div>
              <Link to="/checkout"
                className={`flex-1 flex items-center justify-center gap-2 font-bold py-3 rounded-2xl transition-colors text-sm ${
                  items.length ? 'bg-sageDark hover:bg-sageDeep text-white cursor-pointer' : 'bg-gray-100 text-gray-400 cursor-not-allowed pointer-events-none'
                }`}>
                Proceed to Checkout
              </Link>
            </div>
          </div>
        </div>

        {/* Bill summary */}
        <div className="w-full lg:w-[38%]">
          <div className="surface-panel p-5 sm:p-6 sticky top-24 sm:top-[110px]">
            <h2 className="font-bold text-xl font-headline text-textMain mb-5 pb-4 border-b border-sand/40">{t('cart.bill_summary')}</h2>

            {/* Item list */}
            {items.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-4">{t('cart.empty')}</p>
            ) : (
              <div className="space-y-2 mb-5">
                {items.map(i => {
                  const dbName = lang === 'ta' && i.nameTa ? i.nameTa : i.name;
                  return (
                    <div key={i.id} className="flex justify-between text-sm gap-2 items-center">
                      <span className="text-textMuted truncate flex items-center gap-1">
                        <span>{dbName}</span>
                        <span className="text-xs font-semibold">×{i.variantId ? String(i.qty) : formatQuantityDisplay(i.qty, i.selectedUnit, i.unitType)}</span>
                      </span>
                      <span className="font-bold text-textMain shrink-0 whitespace-nowrap">{formatCurrency(i.lineTotal)}</span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Totals */}
            <div className="border-t border-sand pt-4 space-y-2 text-sm mb-5">
              <div className="flex justify-between font-bold text-textMain text-base">
                <span>Cart Total</span>
                <span>{formatCurrency(orderTotal)}</span>
              </div>
              <p className="text-xs text-textMuted bg-bgMain px-3 py-2 rounded-lg">
                🚚 Delivery charges confirmed via WhatsApp before dispatch
              </p>
            </div>

            <div className="hidden lg:flex flex-col gap-3">
              <Link to="/checkout"
                className={`flex items-center justify-center gap-2 font-bold py-3.5 rounded-xl transition-colors text-sm ${
                  items.length ? 'bg-sageDark hover:bg-sageDeep text-white cursor-pointer' : 'bg-gray-100 text-gray-400 cursor-not-allowed pointer-events-none'
                }`}>
                Proceed to Checkout
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
