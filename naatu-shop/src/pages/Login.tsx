import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Leaf, Mail, ArrowLeft, CheckCircle, User, Phone as PhoneIcon } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { BRAND_EN } from '../lib/brand'
import { isValidMalaysianPhone, getSubscriberDigits } from '../lib/phone'

type EmailStep = 'input' | 'sent'

type FieldError = {
  name?: string
  phone?: string
  email?: string
}

function validate(name: string, phone: string, email: string): FieldError {
  const errs: FieldError = {}
  if (!name.trim() || name.trim().length < 2)
    errs.name = 'Please enter your full name (at least 2 characters).'
  if (!isValidMalaysianPhone(phone))
    errs.phone = 'Enter a valid Malaysian mobile number (e.g. 0123456789 or +60 12-345 6789).'
  if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    errs.email = 'Enter a valid email address.'
  return errs
}

export default function Login() {
  const location   = useLocation()
  const redirectPath = new URLSearchParams(location.search).get('redirect') || '/'

  const [loading,   setLoading]   = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error,     setError]     = useState('')
  const [fieldErrs, setFieldErrs] = useState<FieldError>({})
  const [email,     setEmail]     = useState('')
  const [name,      setName]      = useState('')
  const [phone,     setPhone]     = useState('')
  const [emailStep, setEmailStep] = useState<EmailStep>('input')

  const inputCls = (hasErr: boolean) =>
    `w-full px-3 py-3 bg-white border-2 ${hasErr ? 'border-red-400' : 'border-sand'} rounded-xl text-[13px] font-bold text-textMain focus:outline-none focus:border-sageDark transition-colors`

  const handleSignup = async () => {
    const errs = validate(name, phone, email)
    setFieldErrs(errs)
    if (errs.name || errs.phone || errs.email) return

    setLoading(true)
    setError('')
    try {
      const subscriberDigits = getSubscriberDigits(phone) ?? phone.replace(/\D/g, '')
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: true,
          data: { name: name.trim(), phone: `60${subscriberDigits}`, mobile: `60${subscriberDigits}` },
        },
      })
      if (signInError) throw signInError
      setEmailStep('sent')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setGoogleLoading(true)
    setError('')
    try {
      const { error: oAuthErr } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}${redirectPath}` },
      })
      if (oAuthErr) throw oAuthErr
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed')
    } finally {
      setGoogleLoading(false)
    }
  }

  if (emailStep === 'sent') {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-3xl p-8 border border-[#EAD7B7]/40 shadow-xl text-center">
          <CheckCircle size={48} className="mx-auto mb-4 text-green-500" />
          <h1 className="text-xl font-black text-[#2C392A] mb-2">Check your email</h1>
          <p className="text-[13px] text-[#5F6D59] mb-6">We sent a magic link to <strong className="text-[#2C392A]">{email}</strong></p>
          <div className="bg-[#F7F6F2] rounded-xl p-4 mb-6 text-left text-[13px] text-[#5F6D59] space-y-1">
            <p><span className="font-bold text-[#2C392A]">Name:</span> {name}</p>
            <p><span className="font-bold text-[#2C392A]">Phone:</span> +60 {getSubscriberDigits(phone)}</p>
          </div>
          <button onClick={() => setEmailStep('input')}
            className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-[#F7F6F2] border border-[#EAD7B7]/60 rounded-xl text-[13px] font-bold text-[#5F6D59] hover:bg-[#EAD7B7]/40 transition-colors">
            <ArrowLeft size={14} /> Use a different email
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl border border-[#EAD7B7]/40 shadow-xl overflow-hidden">
        <div className="bg-gradient-to-br from-[#8B2332] to-[#6b1a25] p-6 text-center">
          <div className="w-14 h-14 bg-white/15 backdrop-blur rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Leaf size={28} className="text-white" />
          </div>
          <h1 className="text-xl font-black text-white">{BRAND_EN}</h1>
          <p className="text-white/70 text-[12px] font-medium mt-1">Admin Login</p>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-[12px] font-bold">{error}</div>
          )}

          {/* Full Name */}
          <div>
            <label className="block text-[10px] font-black text-[#5F6D59] tracking-wider uppercase mb-1.5">Full Name</label>
            <div className="flex gap-2">
              <span className="flex items-center px-3 py-3 bg-[#F7F6F2] border-2 border-sand rounded-xl shrink-0">
                <User size={14} className="text-[#5F6D59]" />
              </span>
              <input type="text" autoComplete="name" placeholder="Your full name"
                className={`flex-1 ${inputCls(!!fieldErrs.name)}`}
                value={name} onChange={e => { setName(e.target.value); setFieldErrs(f => ({ ...f, name: '' })) }} />
            </div>
            {fieldErrs.name && <p className="text-[10px] font-bold text-red-500 mt-1">{fieldErrs.name}</p>}
          </div>

          {/* Mobile Number */}
          <div>
            <label className="block text-[10px] font-black text-[#5F6D59] tracking-wider uppercase mb-1.5">Mobile Number</label>
            <div className="flex gap-2">
              <span className="flex items-center px-3 py-3 bg-[#F7F6F2] border-2 border-sand rounded-xl text-[13px] font-bold text-textMuted shrink-0 select-none">
                🇲🇾 +60
              </span>
              <input type="tel" autoComplete="tel-national" placeholder="0123456789 or +60 12-345 6789"
                className={`flex-1 ${inputCls(!!fieldErrs.phone)}`}
                value={phone} onChange={e => { setPhone(e.target.value); setFieldErrs(f => ({ ...f, phone: '' })) }} />
            </div>
            {fieldErrs.phone && <p className="text-[10px] font-bold text-red-500 mt-1">{fieldErrs.phone}</p>}
          </div>

          {/* Email */}
          <div>
            <label className="block text-[10px] font-black text-[#5F6D59] tracking-wider uppercase mb-1.5">Email Address</label>
            <div className="flex gap-2">
              <span className="flex items-center px-3 py-3 bg-[#F7F6F2] border-2 border-sand rounded-xl shrink-0">
                <Mail size={14} className="text-[#5F6D59]" />
              </span>
              <input type="email" autoComplete="email" placeholder="you@example.com"
                className={`flex-1 ${inputCls(!!fieldErrs.email)}`}
                value={email} onChange={e => { setEmail(e.target.value); setFieldErrs(f => ({ ...f, email: '' })) }} />
            </div>
            {fieldErrs.email && <p className="text-[10px] font-bold text-red-500 mt-1">{fieldErrs.email}</p>}
          </div>

          <button onClick={handleSignup} disabled={loading || !isSupabaseConfigured}
            className="w-full py-3.5 bg-[#8B2332] hover:bg-[#6b1a25] disabled:opacity-60 text-white rounded-xl text-[13px] font-black tracking-wide transition-colors">
            {loading ? 'Sending magic link...' : 'Sign in with magic link'}
          </button>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-[#EAD7B7]/60" />
            <span className="text-[10px] font-bold text-[#5F6D59] uppercase">or</span>
            <div className="h-px flex-1 bg-[#EAD7B7]/60" />
          </div>

          <button onClick={handleGoogleLogin} disabled={googleLoading || !isSupabaseConfigured}
            className="w-full py-3 bg-white border-2 border-[#EAD7B7]/60 hover:bg-[#F7F6F2] disabled:opacity-60 rounded-xl text-[13px] font-bold text-[#2C392A] flex items-center justify-center gap-2 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            {googleLoading ? 'Connecting...' : 'Continue with Google'}
          </button>

          <p className="text-[10px] text-[#5F6D59] text-center leading-relaxed">
            By continuing, you agree to our Terms & Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  )
}
