import './index.css'
import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAuthStore, useProductStore, useVariantStore } from './store/store'
import { BRAND_EN } from './lib/brand'
import { clearLocalOrders } from './lib/ordersFallback'
import { isSupabaseConfigured, supabase } from './lib/supabase'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Pos = lazy(() => import('./pages/Pos'))
const DigitalInvoice = lazy(() => import('./pages/DigitalInvoice'))
const Login = lazy(() => import('./pages/Login'))

function LoadingSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bgMain">
      <span className="h-10 w-10 animate-spin rounded-full border-4 border-[#EAD7B7] border-t-[#8B2332]" />
    </div>
  )
}

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user)
  const loading = useAuthStore((state) => state.loading)

  if (loading) return <LoadingSpinner />
  return user ? <Navigate to="/dashboard" replace /> : <>{children}</>
}

function AppShell() {
  const initialize = useAuthStore((state) => state.initialize)
  const fetchProducts = useProductStore((state) => state.fetchProducts)
  const fetchVariants = useVariantStore((state) => state.fetchVariants)

  useEffect(() => {
    document.title = BRAND_EN
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      void initialize()
      return
    }

    clearLocalOrders()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        void initialize()
      }
    })

    void initialize()

    return () => subscription.unsubscribe()
  }, [initialize])

  useEffect(() => {
    void fetchProducts()
    void fetchVariants()

    if (!isSupabaseConfigured) {
      return
    }

    const productChannel = supabase
      .channel('admin-products-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        void fetchProducts()
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(productChannel)
    }
  }, [fetchProducts, fetchVariants])

  return (
    <div className="min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-bgMain print:block print:min-h-0">
      <main className="print:block">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route
            path="/login"
            element={
              <PublicOnlyRoute>
                <Suspense fallback={<LoadingSpinner />}>
                  <Login />
                </Suspense>
              </PublicOnlyRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <Suspense fallback={<LoadingSpinner />}>
                <Dashboard />
              </Suspense>
            }
          />
          <Route
            path="/dashboard"
            element={
              <Suspense fallback={<LoadingSpinner />}>
                <Dashboard />
              </Suspense>
            }
          />
          <Route
            path="/whatsapp-center"
            element={
              <Suspense fallback={<LoadingSpinner />}>
                <Dashboard />
              </Suspense>
            }
          />
          <Route
            path="/pos-analytics"
            element={
              <Suspense fallback={<LoadingSpinner />}>
                <Dashboard />
              </Suspense>
            }
          />
          <Route
            path="/pos"
            element={
              <Suspense fallback={<LoadingSpinner />}>
                <Pos />
              </Suspense>
            }
          />
          <Route
            path="/invoice/:id"
            element={
              <Suspense fallback={<LoadingSpinner />}>
                <DigitalInvoice />
              </Suspense>
            }
          />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  )
}
