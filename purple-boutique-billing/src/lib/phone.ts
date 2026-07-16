import { BRAND_WHATSAPP_LINK } from './brand'

/**
 * Normalizes any Indian phone input to the 12-digit form 91XXXXXXXXXX.
 *
 * Accepted inputs:
 *   9876543210          → 919876543210
 *   09876543210         → 919876543210
 *   +919876543210       → 919876543210
 *   +91 98765 43210     → 919876543210
 *   919876543210        → 919876543210 (already normalized)
 *
 * Returns null for anything that cannot be reduced to a valid
 * 10-digit Indian subscriber number (first digit 6–9).
 */
export function normalizeIndianPhone(input: string): string | null {
  if (!input) return null

  // Strip everything except digits
  const raw = input.replace(/\D/g, '')
  if (!raw) return null

  let digits = raw

  if (digits.length === 12 && digits.startsWith('91')) {
    // Already 91XXXXXXXXXX — validate subscriber part below
  } else if (digits.length === 11 && digits.startsWith('0')) {
    // 0XXXXXXXXXX → drop leading 0, prepend 91
    digits = '91' + digits.slice(1)
  } else if (digits.length === 10) {
    // XXXXXXXXXX → prepend 91
    digits = '91' + digits
  } else {
    return null
  }

  // Subscriber portion must start with 6–9 and be exactly 10 digits
  if (!/^91[6-9]\d{9}$/.test(digits)) return null

  return digits
}

/** Returns true when the input can be normalized to a valid Indian number. */
export function isValidIndianPhone(input: string): boolean {
  return normalizeIndianPhone(input) !== null
}

/**
 * Returns the 10-digit subscriber number (no country code).
 * Useful for display or storing in DB alongside a known +91 prefix.
 */
export function getSubscriberDigits(input: string): string | null {
  const normalized = normalizeIndianPhone(input)
  return normalized ? normalized.slice(2) : null
}

/**
 * Builds a wa.me URL for the given Indian phone number.
 * Falls back to the store's WhatsApp link if the number is invalid.
 */
export function toWhatsAppUrl(phone: string, fallback?: string): string {
  const normalized = normalizeIndianPhone(phone)
  if (normalized) return `https://wa.me/${normalized}`
  return fallback ?? BRAND_WHATSAPP_LINK
}
