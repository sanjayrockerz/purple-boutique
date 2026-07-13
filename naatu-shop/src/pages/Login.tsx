import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Lock, Eye, EyeOff, Building2 } from 'lucide-react'
import { useAuthStore } from '../store/store'
import { BRAND_EN } from '../lib/brand'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, setAuth } = useAuthStore()

  const redirectPath = new URLSearchParams(location.search).get('redirect') || '/dashboard'

  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const success = login('shopname', password)
    setLoading(false)
    if (success) {
      navigate(redirectPath, { replace: true })
    } else {
      setError('Invalid Shop ID or Password. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-bgMain flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl border border-borderLight shadow-card overflow-hidden">
        <div className="bg-gradient-to-br from-primary to-primary-dark p-6 text-center">
          <div className="w-16 h-16 bg-white/15 backdrop-blur rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Building2 size={32} className="text-white" />
          </div>
          <h1 className="text-xl font-black text-white">{BRAND_EN}</h1>
          <p className="text-white/70 text-[12px] font-medium mt-1">Admin Login</p>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-error/10 border border-error/20 text-error text-[12px] font-bold flex items-center gap-2">
              <Lock size={14} />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="form-group">
              <label className="label-base">Password</label>
              <div className="flex gap-2">
                <span className="flex items-center px-3 py-3 bg-gray-50 border-2 border-borderLight rounded-xl shrink-0">
                  <Lock size={14} className="text-textMuted" />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter Password"
                  className="flex-1 input-base pr-12"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-10 top-1/2 -translate-y-1/2 text-textMuted hover:text-textMain"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary btn-block mt-2"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="border-t border-borderLight pt-4 text-center">
            <p className="text-[11px] text-textMuted font-medium">
              Enter the store password.
            </p>
            <div className="mt-2 p-3 bg-gray-50 rounded-xl text-[11px] font-mono text-textMain space-y-1">
              <div><span className="font-bold text-textMuted">Password:</span> cenexa</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
