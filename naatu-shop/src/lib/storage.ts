import { supabase } from './supabase'

const PRODUCT_IMAGE_BUCKET = 'product-images'

const sanitizeFileName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]/g, '-')
    .replace(/-+/g, '-')

export const uploadProductImage = async (file: File) => {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const safeName = sanitizeFileName(file.name.replace(/\.[^/.]+$/, ''))
  const filePath = `products/${Date.now()}-${safeName}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .upload(filePath, file, { upsert: false })

  if (uploadError) {
    throw uploadError
  }

  const { data } = supabase.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .getPublicUrl(filePath)

  return data.publicUrl
}
