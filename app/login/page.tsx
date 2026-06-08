'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'

const ROLE_TO_DASHBOARD: Record<string, string> = {
  superadmin: 'superadmin',
  manager: 'mgr',
  sed: 'sed',
  fabrication: 'fab',
  installation: 'fix',
}

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Login failed'); return }
      router.push(`/dashboard/${ROLE_TO_DASHBOARD[data.user.role] ?? data.user.role}`)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* ── Left panel ── */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center p-12 relative overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #1a0e08 0%, #2c1608 50%, #1a0e08 100%)' }}
      >
        {/* Wood-grain texture */}
        <div className="absolute inset-0 opacity-[0.05]" style={{
          backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(200,119,58,0.6) 2px, rgba(200,119,58,0.6) 3px)',
          backgroundSize: '60px 100%',
        }} />
        {/* Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full opacity-20 blur-3xl"
          style={{ background: 'radial-gradient(circle, #d95e1a 0%, transparent 70%)' }} />

        <div className="relative z-10 text-center max-w-sm">
          <img
            src="/logo.png"
            alt="WoodWings"
            className="h-28 w-auto mx-auto mb-8 object-contain drop-shadow-2xl"
            onError={(e) => {
              const el = e.currentTarget
              el.style.display = 'none'
              const fb = el.nextElementSibling as HTMLElement
              if (fb) fb.style.display = 'flex'
            }}
          />
          <div
            className="hidden w-24 h-24 rounded-2xl mx-auto mb-8 items-center justify-center shadow-2xl"
            style={{ background: 'linear-gradient(135deg, #C8773A, #8B3E0F)' }}
          >
            <span className="text-white text-4xl font-black">W</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">WoodWings</h1>
          <p className="text-white/40 text-sm tracking-[0.15em] uppercase mb-10">Fitout Services</p>
          <div className="space-y-3 text-left">
            {[
              'Project lifecycle management',
              'Multi-department workflow',
              'Real-time task tracking',
            ].map((f) => (
              <div key={f} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(217,94,26,0.3)', border: '1px solid rgba(217,94,26,0.5)' }}>
                  <svg className="w-3 h-3 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-white/60 text-sm">{f}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="absolute bottom-6 text-white/20 text-[11px] tracking-wide">
          WoodWings Internal — Authorized personnel only
        </p>
      </div>

      {/* ── Right panel ── */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-gray-50">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <img
              src="/logo.png"
              alt="WoodWings"
              className="h-16 w-auto mx-auto mb-3 object-contain"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
            />
            <p className="text-gray-500 text-xs tracking-widest uppercase">Fitout Services</p>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Welcome back</h2>
            <p className="text-gray-500 text-sm mt-1">Sign in to your account to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@woodwings.com"
                required
                autoComplete="email"
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent text-sm bg-white transition-all shadow-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                  className="w-full px-3.5 py-2.5 pr-10 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent text-sm bg-white transition-all shadow-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full py-2.5 px-4 text-white font-semibold rounded-xl transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg active:scale-[0.99]"
              style={{ background: loading ? '#b84a14' : 'linear-gradient(135deg, #d95e1a, #b84a14)' }}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="text-center text-gray-400 text-[11px] mt-8 lg:hidden">
            WoodWings Internal — Authorized personnel only
          </p>
        </div>
      </div>
    </div>
  )
}
