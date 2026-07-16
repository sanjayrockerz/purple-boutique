import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

export default function Register() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    // OTP flow on Login page handles new account creation automatically.
    // Preserve any ?redirect= param so the flow continues after sign-in.
    const params = new URLSearchParams(location.search)
    const redirect = params.get('redirect') || ''
    navigate(`/login${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''}`, { replace: true })
  }, [navigate, location.search])

  return null
}
