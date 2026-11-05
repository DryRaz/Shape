import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/lib/AuthContext'
import { Sparkles } from 'lucide-react'

export default function LoginPage() {
  const { t } = useTranslation()
  const { session, signInWithEmail } = useAuth()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  if (session) return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setStatus('sending')
    const { error } = await signInWithEmail(email.trim())
    if (error) {
      setErrorMsg(error)
      setStatus('error')
    } else {
      setStatus('sent')
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-400">
            <Sparkles size={28} />
          </div>
          <h1 className="text-2xl font-semibold text-slate-50">Shape</h1>
          <p className="text-sm text-slate-400">{t('login.tagline')}</p>
        </div>

        {status === 'sent' ? (
          <div className="card text-center text-sm text-slate-300">
            {t('login.linkSentBefore')} <span className="font-medium text-slate-100">{email}</span>
            {t('login.linkSentAfter')}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="label">
                {t('login.emailLabel')}
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder={t('login.emailPlaceholder')}
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {status === 'error' && <p className="text-sm text-red-400">{errorMsg}</p>}
            <button type="submit" className="btn-primary w-full" disabled={status === 'sending'}>
              {status === 'sending' ? t('login.sending') : t('login.submit')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
