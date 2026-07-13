import React, { useState, useMemo, useEffect } from 'react'
import { X, Search, ShoppingBag, Edit2, Trash2 } from 'lucide-react'
import { useProductStore, type Product } from '../store/store'
import { supabase } from '../lib/supabase'

interface CatalogModalProps {
  isOpen: boolean
  onClose: () => void
  onAdd: (product: Product) => void
}

type CategoryOption = { id: string | number; name_en: string }

export default function CatalogModal({ isOpen, onClose, onAdd }: CatalogModalProps) {
  const { fetchProducts, products, updateProductLocal } = useProductStore()
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [editForm, setEditForm] = useState({ name: '', category: '', price: '' })
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState('')
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([])

  useEffect(() => {
    let cancelled = false
    const loadCategories = async () => {
      const { data } = await supabase.from('categories').select('id, name_en').eq('is_active', true).order('sort_order')
      if (!cancelled) setCategoryOptions((data || []) as CategoryOption[])
    }
    void loadCategories()
    return () => { cancelled = true }
  }, [])

  const categories = useMemo(() => {
    const cats = Array.from(new Set(products.filter(p => p.isActive).map(p => p.category))).filter(Boolean)
    return ['All', ...cats]
  }, [products])

  const allCategoryOptions = useMemo(() => {
    const merged = new Map<string, CategoryOption>()
    const activeNames = new Set(products.filter(p => p.isActive && p.category.trim()).map(p => p.category.trim().toLowerCase()))
    categoryOptions.filter(c => c.name_en.trim().toLowerCase() !== 'manual' && activeNames.has(c.name_en.trim().toLowerCase()))
      .forEach(c => merged.set(c.name_en.trim().toLowerCase(), c))
    products.filter(p => p.isActive && p.category.trim()).forEach(p => {
      const key = p.category.trim().toLowerCase()
      if (key !== 'manual' && !merged.has(key)) merged.set(key, { id: p.categoryId || `product-category-${key}`, name_en: p.category.trim() })
    })
    return Array.from(merged.values()).sort((a, b) => a.name_en.localeCompare(b.name_en))
  }, [categoryOptions, products])

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

  const startEdit = (p: Product) => {
    setEditingProduct(p)
    setEditForm({ name: p.name, category: p.category, price: String(p.price) })
    setEditError('')
  }

  const cancelEdit = () => {
    setEditingProduct(null)
    setEditError('')
  }

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingProduct) return
    const name = editForm.name.trim()
    const category = editForm.category.trim()
    const priceText = editForm.price.trim()
    const price = Number(priceText)
    if (name.length < 2) { setEditError('Product name must contain at least 2 characters'); return }
    if (name.length > 120) { setEditError('Product name must be 120 characters or less'); return }
    if (!category) { setEditError('Select a category'); return }
    if (!/^\d+(\.\d{1,2})?$/.test(priceText) || !Number.isFinite(price) || price < 0 || price > 1000000) {
      setEditError('Enter a valid price from RM0.00 to RM1,000,000.00'); return
    }
    setEditLoading(true)
    setEditError('')
    const categoryId = allCategoryOptions.find(c => c.name_en === category)?.id || editingProduct.categoryId || null
    const { data: updatedProduct, error } = await supabase.from('products').update({
      name,
      name_ta: name,
      tamil_name: name,
      category,
      category_id: categoryId,
      price,
    }).eq('id', editingProduct.id).select('id, price, category').maybeSingle()
    if (error) {
      const message = error.message || ''
      setEditError(message.toLowerCase().includes('row-level security')
        ? 'Editing is blocked by Supabase RLS. Run the local-password access migration in supabase/0007_local_password_access.sql.'
        : `Could not save product: ${message}`)
      setEditLoading(false)
      return
    }
    if (!updatedProduct) {
      setEditError('Price was not saved. Run supabase/0007_local_password_access.sql, then try again.')
      setEditLoading(false)
      return
    }
    updateProductLocal(editingProduct.id, { name, nameTa: name, tamilName: name, category, categoryId, price })
    await fetchProducts(true)
    setEditLoading(false)
    cancelEdit()
  }

  const handleDelete = async (p: Product) => {
    if (!window.confirm(`Delete "${p.name}"? This will deactivate it.`)) return
    await supabase.from('products').update({ is_active: false }).eq('id', p.id)
    await fetchProducts(true)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl w-full min-w-0 max-w-[calc(100vw-2rem)] sm:max-w-4xl flex flex-col shadow-[0_25px_50px_-12px_rgba(126,34,206,0.25)] overflow-hidden border border-borderLight max-h-[calc(100vh-2rem)]">

        {editingProduct ? (
          <>
            <div className="flex items-center justify-between p-5 border-b border-borderLight bg-gray-50">
              <h2 className="text-xl font-black text-textMain">Edit Product</h2>
              <button onClick={cancelEdit} className="btn-icon text-textMuted hover:bg-gray-100 hover:text-textMain">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={saveEdit} className="p-5 flex flex-col gap-4">
              {editError && <div className="text-error text-sm font-bold bg-error/10 p-3 rounded-xl border border-error/20">{editError}</div>}
              <div className="form-group">
                <label className="label-base">Product Name</label>
                <input type="text" value={editForm.name}
                  onChange={e => setEditForm({...editForm, name: e.target.value})}
                  className="input-base" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="label-base">Category</label>
                  <select value={editForm.category}
                    onChange={e => setEditForm({...editForm, category: e.target.value})}
                    className="input-base">
                    <option value="">Select category</option>
                    {allCategoryOptions.map(category => <option key={category.id} value={category.name_en}>{category.name_en}</option>)}
                    {!allCategoryOptions.some(category => category.name_en === editForm.category) && editForm.category && <option value={editForm.category}>{editForm.category}</option>}
                  </select>
                </div>
                <div className="form-group">
                  <label className="label-base">Price (RM)</label>
                  <input type="text" inputMode="decimal" value={editForm.price}
                    onChange={e => setEditForm({...editForm, price: e.target.value})}
                    className="input-base text-right" placeholder="0.00" aria-invalid={Boolean(editError)} />
                </div>
              </div>
              <button type="submit" disabled={editLoading}
                className="btn-primary btn-block mt-2">
                {editLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between p-5 border-b border-borderLight bg-gray-50">
              <h2 className="text-[18px] font-black text-textMain flex items-center gap-2">
                <Search size={18} className="text-primary" />
                Search Catalog
              </h2>
              <button onClick={onClose} className="btn-icon text-textMuted hover:bg-gray-100 hover:text-textMain">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 border-b border-borderLight bg-white space-y-3 min-w-0">
              <div className="relative">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-textMuted" />
                <input type="text" value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by product name, Tamil name, or category..."
                  className="input-base pl-10" />
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
                {categories.map(cat => (
                  <button key={cat} onClick={() => setActiveCategory(cat)}
                    className={`btn-tertiary btn-sm whitespace-nowrap ${activeCategory === cat ? 'bg-primary text-white border-primary' : 'text-textMuted hover:bg-purple-50 hover:border-purple-200'}`}>
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 min-h-0 min-w-0 overflow-x-hidden overflow-y-auto p-3 sm:p-4 bg-gray-50">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-textMuted/60 py-12">
                  <ShoppingBag size={48} className="mb-4 opacity-20" />
                  <p className="text-[14px] font-bold">No products found</p>
                </div>
              ) : (
                <div className="grid min-w-0 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {filtered.map(product => (
                    <div key={product.id}
                      className="min-w-0 overflow-hidden bg-white border border-borderLight rounded-2xl p-3 flex flex-col gap-2 hover:border-primary/30 hover:shadow-card transition-all group relative">
                      <div className="absolute top-2 right-2 flex gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-10">
                        <button onClick={(e) => { e.stopPropagation(); startEdit(product) }} title="Edit product"
                          className="btn-icon-xs bg-white border border-borderLight text-textMuted hover:text-primary hover:border-primary/40 shadow-soft transition-colors">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); void handleDelete(product) }} title="Delete product"
                          className="btn-icon-xs bg-white border border-borderLight text-error hover:text-red-600 hover:border-red-300 shadow-soft transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div onClick={() => onAdd(product)} className="cursor-pointer flex-1">
                        <h4 className="text-[13px] font-black text-textMain leading-tight group-hover:text-primary transition-colors">{product.name}</h4>
                        {product.nameTa && <p className="text-[10px] font-bold text-textMuted mt-0.5">{product.nameTa}</p>}
                      </div>
                      <div onClick={() => onAdd(product)} className="cursor-pointer">
                        <div className="flex items-end justify-between mt-2 pt-2 border-t border-borderLight/30">
                          <span className="text-[14px] font-black text-textMain">RM{product.price}</span>
                          <span className="badge-outline min-w-0 max-w-[58%] truncate text-[9px]">{product.category}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

      </div>
    </div>
  )
}
