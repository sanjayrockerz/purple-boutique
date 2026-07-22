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
  const { fetchProducts, products, loading, error } = useProductStore()
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [editForm, setEditForm] = useState({ name: '', category: '', price: '' })
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState('')
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([])

  useEffect(() => {
    if (isOpen) void fetchProducts(true)
  }, [isOpen, fetchProducts])

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    const loadCategories = async () => {
      const { data } = await supabase.from('categories').select('id, name_en')
      if (!cancelled) setCategoryOptions((data || []) as CategoryOption[])
    }
    void loadCategories()
    return () => { cancelled = true }
  }, [isOpen])

  const categories = useMemo(() => {
    const cats = Array.from(new Set([
      ...categoryOptions.map(category => category.name_en.trim()),
      ...products.filter(p => p.isActive).map(p => p.category.trim()),
    ])).filter(Boolean).sort((a, b) => a.localeCompare(b))
    return ['All', ...cats]
  }, [categoryOptions, products])

  const allCategoryOptions = useMemo(() => {
    const merged = new Map<string, CategoryOption>()
    categoryOptions
      .filter(category => category.name_en.trim().toLowerCase() !== 'manual')
      .forEach(category => merged.set(category.name_en.trim().toLowerCase(), category))
    products.filter(product => product.isActive && product.category.trim()).forEach(product => {
      const key = product.category.trim().toLowerCase()
      if (key === 'manual') return
      if (!merged.has(key)) merged.set(key, { id: product.categoryId || `product-category-${key}`, name_en: product.category.trim() })
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
    return src
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
    if (!editForm.name.trim()) { setEditError('Name is required'); return }
    setEditLoading(true)
    setEditError('')
    const selectedCategory = allCategoryOptions.find(c => c.name_en.trim().toLowerCase() === editForm.category.trim().toLowerCase())
    if (!selectedCategory) { setEditError('Select a valid category'); setEditLoading(false); return }
    const categoryName = selectedCategory.name_en.trim()
    const { error } = await supabase.from('products').update({
      name: editForm.name.trim(),
      category: categoryName,
      category_id: selectedCategory.id,
      price: Number(editForm.price),
    }).eq('id', editingProduct.id)
    if (error) { setEditError(error.message); setEditLoading(false); return }
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
      <div className="bg-white rounded-2xl sm:rounded-3xl w-full max-w-5xl flex min-h-0 flex-col shadow-2xl overflow-hidden border border-[#D1FAE5]/40 max-h-[calc(100dvh-1rem)] sm:max-h-[85vh]">

        {editingProduct ? (
          <>
            <div className="flex items-center justify-between p-6 border-b border-[#D1FAE5]/40 bg-[#F9FAFB]">
              <h2 className="text-xl font-black text-[#111111]">Edit Product</h2>
              <button onClick={cancelEdit} className="p-2 rounded-xl hover:bg-black/5 text-[#374151]">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={saveEdit} className="p-6 flex flex-col gap-4">
              {editError && <div className="text-red-500 text-sm font-bold bg-red-50 p-3 rounded-xl">{editError}</div>}
              <div>
                <label className="block text-[10px] font-black text-[#374151] tracking-wider uppercase mb-1.5">Product Name</label>
                <input type="text" value={editForm.name}
                  onChange={e => setEditForm({...editForm, name: e.target.value})}
                  className="w-full px-4 py-3 bg-[#F9FAFB] border border-[#D1FAE5]/60 rounded-xl focus:outline-none focus:border-[#047857] text-[13px] font-bold" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-[#374151] tracking-wider uppercase mb-1.5">Category</label>
                  <select value={editForm.category}
                    onChange={e => setEditForm({...editForm, category: e.target.value})}
                    className="w-full min-w-0 h-12 px-4 py-3 bg-[#F9FAFB] border border-[#D1FAE5]/60 rounded-xl focus:outline-none focus:border-[#047857] text-[13px] font-bold touch-manipulation">
                    <option value="">Select category</option>
                    {allCategoryOptions.map(category => <option key={category.id} value={category.name_en}>{category.name_en}</option>)}
                    {!allCategoryOptions.some(category => category.name_en === editForm.category) && editForm.category && (
                      <option value={editForm.category}>{editForm.category}</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-[#374151] tracking-wider uppercase mb-1.5">Price (RM)</label>
                  <input type="number" value={editForm.price}
                    onChange={e => setEditForm({...editForm, price: e.target.value})}
                    className="w-full px-4 py-3 bg-[#F9FAFB] border border-[#D1FAE5]/60 rounded-xl focus:outline-none focus:border-[#047857] text-[13px] font-bold text-right" placeholder="0" />
                </div>
              </div>
              <button type="submit" disabled={editLoading}
                className="mt-4 w-full py-3.5 bg-[#047857] hover:bg-[#065F46] text-white rounded-xl text-[13px] font-black uppercase tracking-wider transition-colors disabled:opacity-50">
                {editLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between p-5 border-b border-[#D1FAE5]/40 bg-[#F9FAFB]">
              <h2 className="text-[18px] font-black text-[#111111] flex items-center gap-2">
                <Search size={18} className="text-[#047857]" />
                Search Catalog
              </h2>
              <button onClick={onClose} className="p-2 rounded-xl hover:bg-black/5 text-[#374151]">
                <X size={20} />
              </button>
            </div>
            <div className="p-3 sm:p-4 border-b border-[#D1FAE5]/40 bg-white space-y-3">
              <div className="relative">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#374151]" />
                <input type="text" value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by product name, Tamil name, or category..."
                  className="w-full pl-10 pr-4 py-3 bg-[#FAFAFA] border border-[#D1FAE5]/60 rounded-xl focus:outline-none focus:border-[#047857] text-[13px] font-bold text-[#111111]" />
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                {categories.map(cat => (
                  <button key={cat} onClick={() => setActiveCategory(cat)}
                    className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider whitespace-nowrap transition-colors ${activeCategory === cat ? 'bg-[#047857] text-white' : 'bg-[#FAFAFA] text-[#374151] hover:bg-[#F9FAFB] border border-[#D1FAE5]/60'}`}>
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 bg-[#FAFAFA]">
              {loading ? (
                <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-[#374151]/70">
                  <span className="h-7 w-7 animate-spin rounded-full border-2 border-[#D1FAE5] border-t-[#047857]" />
                  <p className="text-[13px] font-bold">Loading catalog...</p>
                </div>
              ) : error ? (
                <div className="flex min-h-48 flex-col items-center justify-center gap-2 px-4 text-center text-red-500">
                  <p className="text-[13px] font-bold">Unable to load catalog items.</p>
                  <button type="button" onClick={() => void fetchProducts(true)} className="rounded-lg bg-[#047857] px-3 py-2 text-[11px] font-black text-white">Try again</button>
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-[#374151]/60 py-12">
                  <ShoppingBag size={48} className="mb-4 opacity-20" />
                  <p className="text-[14px] font-bold">No products found</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {filtered.map(product => (
                    <div key={product.id}
                      className="bg-white border border-[#D1FAE5]/60 rounded-2xl p-3 flex flex-col gap-2 hover:border-[#047857]/40 hover:shadow-md transition-all group relative">
                      <div className="absolute top-2 right-2 flex gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-10">
                        <button onClick={(e) => { e.stopPropagation(); startEdit(product) }} title="Edit product"
                          className="p-1.5 rounded-lg bg-white border border-[#D1FAE5]/60 text-[#374151] hover:text-[#047857] hover:border-[#047857]/40 shadow-sm transition-colors">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); void handleDelete(product) }} title="Delete product"
                          className="p-1.5 rounded-lg bg-white border border-[#D1FAE5]/60 text-red-400 hover:text-red-600 hover:border-red-300 shadow-sm transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div onClick={() => onAdd(product)} className="cursor-pointer flex-1">
                        <h4 className="text-[13px] font-black text-[#111111] leading-tight group-hover:text-[#047857] transition-colors">{product.name}</h4>
                        {product.nameTa && <p className="text-[10px] font-bold text-[#374151] mt-0.5">{product.nameTa}</p>}
                      </div>
                      <div onClick={() => onAdd(product)} className="cursor-pointer">
                        <div className="flex items-end justify-between mt-2 pt-2 border-t border-[#D1FAE5]/30">
                          <span className="text-[14px] font-black text-[#111111]">RM{product.price}</span>
                          <span className="text-[9px] font-black text-[#374151] uppercase tracking-wider bg-[#F9FAFB] px-2 py-1 rounded border border-[#D1FAE5]/40">{product.category}</span>
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
