import { Link } from 'react-router-dom'
import ProductCard from '../components/ProductCard'
import { useFavStore } from '../store/store'
import { useLangStore } from '../store/langStore'

export default function Favorites() {
  const { t } = useLangStore()
  const items = useFavStore((state) => state.items)

  return (
    <div className="mobile-page-shell">
      <div className="max-w-7xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold text-textMain mb-2">{t('favorites.title')}</h1>
        {items.length === 0 ? (
          <div className="surface-panel p-10 text-center">
            <p className="text-textMuted">{t('favorites.empty')}</p>
            <Link to="/products" className="inline-block mt-3 text-sageDark font-semibold hover:underline">
              {t('products.title')}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5 mt-6">
            {items.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
