import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/lib/AuthContext'
import InstallGuide from '@/components/InstallGuide'
import { Sparkles } from 'lucide-react'

export default function LoginPage() {
  const { t } = useTranslation()
  const { session, signInWithEmail, verifyEmailCode } = useAuth()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [codeError, setCodeError] = useState('')

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

  async function handleVerify(e: FormEvent) {
    e.preventDefault()
    setVerifying(true)
    setCodeError('')
    const { error } = await verifyEmailCode(email.trim(), code.trim())
    // On success the auth listener sets the session and this page redirects on its own.
    if (error) {
      setCodeError(error)
      setVerifying(false)
    }
  }

  function resetToEmail() {
    setStatus('idle')
    setCode('')
    setCodeError('')
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-400">
            <Sparkles size={28} />
          </div>
          <h1 className="text-2xl font-semibold text-slate-50">Shape</h1>
          <p className="text-sm text-slate-400">{t('login.tagline')}</p>
        </div>

        <InstallGuide />

        {status === 'sent' ? (
          <div className="space-y-4">
            <div className="card text-center text-sm text-slate-300">
              {t('login.linkSentBefore')} <span className="font-medium text-slate-100">{email}</span>
              {t('login.linkSentAfter')}
            </div>
            <form onSubmit={handleVerify} className="space-y-4">
              <div>
                <label htmlFor="code" className="label">
                  {t('login.codeLabel')}
                </label>
                <input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={10}
                  required
                  placeholder={t('login.codePlaceholder')}
                  className="input text-center text-lg tracking-[0.3em]"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                />
                <p className="mt-1.5 text-xs text-slate-500">{t('login.codeHint')}</p>
              </div>
              {codeError && <p className="text-sm text-red-400">{codeError}</p>}
              <button type="submit" className="btn-primary w-full" disabled={verifying || code.length < 6}>
                {verifying ? t('login.verifying') : t('login.verify')}
              </button>
              <button type="button" onClick={resetToEmail} className="btn-ghost w-full">
                {t('login.useOtherEmail')}
              </button>
            </form>
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
