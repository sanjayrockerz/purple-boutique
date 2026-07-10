import React, { useState } from 'react'
import { X } from 'lucide-react'
import { useProductStore } from '../store/store'
import { supabase } from '../lib/supabase'

interface AddProductModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function AddProductModal({ isOpen, onClose, onSuccess }: AddProductModalProps) {
  const { fetchProducts } = useProductStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    name: '',
    category: 'Manual',
    price: '',
    stock: '10'
  })

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) return setError('Name is required')
    if (!formData.price) return setError('Price is required')
    
    setLoading(true)
    setError('')
    try {
      const { error: dbErr } = await supabase.from('products').insert({
        name: formData.name.trim(),
        category: formData.category.trim(),
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl w-full max-w-md flex flex-col shadow-2xl overflow-hidden border border-[#EAD7B7]/40">
        
        <div className="flex items-center justify-between p-6 border-b border-[#EAD7B7]/40 bg-[#F7F6F2]">
          <h2 className="text-xl font-black text-[#2C392A]">Add to Catalog</h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-black/5 text-[#5F6D59]">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          {error && <div className="text-red-500 text-sm font-bold bg-red-50 p-3 rounded-xl">{error}</div>}
          
          <div>
            <label className="block text-[10px] font-black text-[#5F6D59] tracking-wider uppercase mb-1.5">Product Name</label>
            <input 
              type="text" 
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
              className="w-full px-4 py-3 bg-[#F7F6F2] border border-[#EAD7B7]/60 rounded-xl focus:outline-none focus:border-[#8B2332] text-[13px] font-bold"
              placeholder="E.g. Premium Shawl"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black text-[#5F6D59] tracking-wider uppercase mb-1.5">Category</label>
              <input 
                type="text" 
                value={formData.category}
                onChange={e => setFormData({...formData, category: e.target.value})}
                className="w-full px-4 py-3 bg-[#F7F6F2] border border-[#EAD7B7]/60 rounded-xl focus:outline-none focus:border-[#8B2332] text-[13px] font-bold"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-[#5F6D59] tracking-wider uppercase mb-1.5">Price (₹)</label>
              <input 
                type="number" 
                value={formData.price}
                onChange={e => setFormData({...formData, price: e.target.value})}
                className="w-full px-4 py-3 bg-[#F7F6F2] border border-[#EAD7B7]/60 rounded-xl focus:outline-none focus:border-[#8B2332] text-[13px] font-bold text-right"
                placeholder="0"
              />
            </div>
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="mt-4 w-full py-3.5 bg-[#8B2332] hover:bg-[#6b1a25] text-white rounded-xl text-[13px] font-black uppercase tracking-wider transition-colors disabled:opacity-50"
          >
            {loading ? 'Adding...' : 'Save Product'}
          </button>
        </form>
      </div>
    </div>
  )
}
