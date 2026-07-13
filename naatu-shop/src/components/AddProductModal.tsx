import React, { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useProductStore } from '../store/store'
import { supabase } from '../lib/supabase'

interface AddProductModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

type Category = { id: number; name_en: string }

export default function AddProductModal({ isOpen, onClose, onSuccess }: AddProductModalProps) {
  const { fetchProducts } = useProductStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    price: '',
    stock: '10'
  })

  useEffect(() => {
    if (isOpen) {
      supabase.from('categories').select('id, name_en').order('name_en').then(({ data }) => {
        setCategories((data || []) as Category[])
      })
      setFormData({ name: '', category: '', price: '', stock: '10' })
      setError('')
    }
  }, [isOpen])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  if (!isOpen) return null

  const filtered = categories.filter(c =>
    c.name_en.toLowerCase().includes(formData.category.toLowerCase())
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) return setError('Name is required')
    if (!formData.price) return setError('Price is required')
    if (!formData.category.trim()) return setError('Category is required')

    setLoading(true)
    setError('')
    try {
      let categoryName = formData.category.trim()
      const existing = categories.find(c => c.name_en.toLowerCase() === categoryName.toLowerCase())
      if (!existing) {
        const { data: newCat, error: catErr } = await supabase.from('categories').insert({
          name_en: categoryName,
          name_ta: categoryName,
          is_active: true,
        }).select('id, name_en').single()
        if (catErr) throw catErr
        if (newCat) {
          setCategories(prev => [...prev, newCat as Category])
          categoryName = (newCat as Category).name_en
        }
      }

      const { error: dbErr } = await supabase.from('products').insert({
        name: formData.name.trim(),
        category: categoryName,
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
    } catch (err: any) {
      setError(err.message || 'Failed to add product')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-container max-w-md">
        <div className="modal-header">
          <h2 className="modal-title">Add to Catalog</h2>
          <button onClick={onClose} className="modal-close">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body space-y-4">
          {error && <div className="form-error bg-error/10 p-3 rounded-xl">{error}</div>}

          <div className="form-group">
            <label className="label-base">Product Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
              className="input-base"
              placeholder="E.g. Premium Shawl"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="form-group relative" ref={dropdownRef}>
              <label className="label-base">Category</label>
              <input
                ref={inputRef}
                type="text"
                value={formData.category}
                onFocus={() => setShowDropdown(true)}
                onChange={e => { setFormData({...formData, category: e.target.value}); setShowDropdown(true) }}
                className="input-base"
                placeholder="Type or select..."
              />
              {showDropdown && filtered.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-[#EAD7B7] rounded-xl shadow-lg max-h-40 overflow-y-auto">
                  {filtered.map(c => (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => { setFormData(f => ({...f, category: c.name_en})); setShowDropdown(false) }}
                      className="w-full text-left px-3 py-2 text-[13px] font-medium text-[#2C392A] hover:bg-purple-50 transition-colors"
                    >
                      {c.name_en}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="label-base">Price (RM)</label>
              <input
                type="number"
                value={formData.price}
                onChange={e => setFormData({...formData, price: e.target.value})}
                className="input-base text-right"
                placeholder="0"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary btn-block mt-2"
          >
            {loading ? 'Adding...' : 'Save Product'}
          </button>
        </form>
      </div>
    </div>
  )
}
