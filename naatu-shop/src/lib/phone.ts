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

export function normalizePhoneForWhatsApp(input: string): string {
  if (!input) return ''
  const digits = input.replace(/\D/g, '')
  if (!digits) return ''

  if (digits.length >= 11 && (digits.startsWith('60') || digits.startsWith('91'))) {
    return digits
  }
  if (digits.startsWith('0') && (digits.length === 10 || digits.length === 11)) {
    return '60' + digits.slice(1)
  }
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    return '91' + digits
  }
  if (digits.length >= 9 && digits.length <= 10 && digits.startsWith('1')) {
    return '60' + digits
  }
  return digits
}

export function toWhatsAppUrl(phone: string, text?: string): string {
  const normalized = normalizePhoneForWhatsApp(phone)
  const queryParams: string[] = []

  if (normalized) {
    queryParams.push(`phone=${normalized}`)
  }
  if (text) {
    queryParams.push(`text=${encodeURIComponent(text)}`)
  }

  return `https://api.whatsapp.com/send${queryParams.length > 0 ? `?${queryParams.join('&')}` : ''}`
}


