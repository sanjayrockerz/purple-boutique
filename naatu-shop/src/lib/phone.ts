import { BRAND_WHATSAPP_LINK } from './brand'

export function normalizeMalaysianPhone(input: string): string | null {
  if (!input) return null

  const raw = input.replace(/\D/g, '')
  if (!raw) return null

  let digits = raw

  if (digits.length === 11 && digits.startsWith('60')) {
  } else if (digits.length === 10 && digits.startsWith('0')) {
    digits = '60' + digits.slice(1)
  } else if (digits.length === 9) {
    digits = '60' + digits
  } else {
    return null
  }

  if (!/^60[1]\d{8}$/.test(digits)) return null

  return digits
}

export function isValidMalaysianPhone(input: string): boolean {
  return normalizeMalaysianPhone(input) !== null
}

export function getSubscriberDigits(input: string): string | null {
  const normalized = normalizeMalaysianPhone(input)
  return normalized ? normalized.slice(2) : null
}

export function toWhatsAppUrl(phone: string, fallback?: string): string {
  const normalized = normalizeMalaysianPhone(phone)
  if (normalized) return `https://wa.me/${normalized}`
  return fallback ?? BRAND_WHATSAPP_LINK
}
