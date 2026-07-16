import React, { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useProductStore } from '../store/store'
import { supabase } from '../lib/supabase'

interface AddProductModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function AddProductModal({ isOpen, onClose, onSuccess }: AddProductModalProps) {
  const { fetchProducts, products } = useProductStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [categoryOptions, setCategoryOptions] = useState<string[]>([])
  const [categoryMode, setCategoryMode] = useState<'select' | 'new'>('select')
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    price: '',
    stock: '10'
  })

  const existingCategories = categoryOptions.length > 0
    ? categoryOptions
    : Array.from(new Set(products.filter(p => p.category).map(p => p.category))).filter(Boolean).sort()

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    const loadCategories = async () => {
      const { data } = await supabase
        .from('categories')
        .select('name_en')
        .eq('is_active', true)
        .order('sort_order')
      if (!cancelled) setCategoryOptions((data || []).map(row => String(row.name_en || '')).filter(Boolean))
    }
    void loadCategories()
    return () => { cancelled = true }
  }, [isOpen])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) return setError('Name is required')
    if (!formData.price) return setError('Price is required')

    setLoading(true)
    setError('')
    try {
      const categoryName = formData.category.trim()
      let categoryId: string | number | null = null
      if (categoryName) {
        const { data: existingCategory, error: categoryLookupError } = await supabase
          .from('categories')
          .select('id')
          .ilike('name_en', categoryName)
          .maybeSingle()
        if (categoryLookupError) throw categoryLookupError
        categoryId = existingCategory?.id ?? null
        if (!existingCategory) {
          const { data: insertedCategory, error: categoryInsertError } = await supabase
            .from('categories')
            .insert({ name_en: categoryName, name_ta: '', is_active: true })
            .select('id')
            .single()
          if (categoryInsertError) throw categoryInsertError
          categoryId = insertedCategory?.id ?? null
        }
      }
      const { error: dbErr } = await supabase.from('products').insert({
        name: formData.name.trim(),
        category: categoryName || 'Uncategorized',
        category_id: categoryId,
        price: Number(formData.price),
        stock: Number(formData.stock),
        is_active: true,
        unit: '1pc',
        base_quantity: 1,
        unit_type: 'unit',
        unit_label: 'pc'
      })
      if (dbErr) throw dbErr
      await fetchProducts()
      onSuccess()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add product')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl w-full max-w-md flex flex-col shadow-2xl overflow-hidden border border-[#D1FAE5]/40">

        <div className="flex items-center justify-between p-6 border-b border-[#D1FAE5]/40 bg-[#F9FAFB]">
          <h2 className="text-xl font-black text-[#111111]">Add to Catalog</h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-black/5 text-[#374151]">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          {error && <div className="text-red-500 text-sm font-bold bg-red-50 p-3 rounded-xl">{error}</div>}

          <div>
            <label className="block text-[10px] font-black text-[#374151] tracking-wider uppercase mb-1.5">Product Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
              className="w-full px-4 py-3 bg-[#F9FAFB] border border-[#D1FAE5]/60 rounded-xl focus:outline-none focus:border-[#047857] text-[13px] font-bold"
              placeholder="E.g. Premium Shawl"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black text-[#374151] tracking-wider uppercase mb-1.5">Category</label>
              {categoryMode === 'select' ? (
                <div className="flex gap-1">
                  <select
                    value={formData.category}
                    onChange={e => setFormData({...formData, category: e.target.value})}
                    className="flex-1 w-full px-4 py-3 bg-[#F9FAFB] border border-[#D1FAE5]/60 rounded-xl focus:outline-none focus:border-[#047857] text-[13px] font-bold appearance-none"
                  >
                    <option value="">Select category</option>
                    {existingCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => { setCategoryMode('new'); setFormData(f => ({...f, category: ''})) }}
                    className="px-2 py-3 text-[10px] font-black text-[#047857] bg-[#F9FAFB] border border-[#D1FAE5]/60 rounded-xl hover:bg-[#D1FAE5]/40 transition-colors shrink-0"
                    title="Add new category"
                  >+</button>
                </div>
              ) : (
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={formData.category}
                    onChange={e => setFormData({...formData, category: e.target.value})}
                    className="flex-1 w-full px-4 py-3 bg-[#F9FAFB] border border-[#D1FAE5]/60 rounded-xl focus:outline-none focus:border-[#047857] text-[13px] font-bold"
                    placeholder="Type new category"
                  />
                  <button
                    type="button"
                    onClick={() => { setCategoryMode('select'); setFormData(f => ({...f, category: ''})) }}
                    className="px-2 py-3 text-[10px] font-black text-[#374151] bg-[#F9FAFB] border border-[#D1FAE5]/60 rounded-xl hover:bg-[#D1FAE5]/40 transition-colors shrink-0"
                    title="Pick from existing"
                  >↩</button>
                </div>
              )}
            </div>
            <div>
              <label className="block text-[10px] font-black text-[#374151] tracking-wider uppercase mb-1.5">Price (RM)</label>
              <input
                type="number"
                value={formData.price}
                onChange={e => setFormData({...formData, price: e.target.value})}
                className="w-full px-4 py-3 bg-[#F9FAFB] border border-[#D1FAE5]/60 rounded-xl focus:outline-none focus:border-[#047857] text-[13px] font-bold text-right"
                placeholder="0"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-4 w-full py-3.5 bg-[#047857] hover:bg-[#065F46] text-white rounded-xl text-[13px] font-black uppercase tracking-wider transition-colors disabled:opacity-50"
          >
            {loading ? 'Adding...' : 'Save Product'}
          </button>
        </form>
      </div>
    </div>
  )
}
