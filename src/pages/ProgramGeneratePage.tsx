import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Sparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { generateAndSaveProgram } from '@/lib/programGenerator'

export default function ProgramGeneratePage() {
  const { t } = useTranslation()
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  // Guards against double-invocation (e.g. React StrictMode's double-mount in dev),
  // not against retries: runGeneration clears it itself so a manual retry can run again.
  const runningRef = useRef(false)

  const runGeneration = useCallback(async () => {
    if (!user || runningRef.current) return
    runningRef.current = true
    setError(null)

    try {
      const { data: exercises, error: exercisesError } = await supabase
        .from('exercises')
        .select('id, name, muscle_group')
      if (exercisesError) throw exercisesError

      const programId = await generateAndSaveProgram(
        user.id,
        profile?.goal_type ?? null,
        exercises ?? [],
        profile?.language ?? 'fr'
      )
      navigate(`/sport/programme/${programId}`, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('programGenerate.error'))
      runningRef.current = false
    }
  }, [user, profile, navigate, t])

  useEffect(() => {
    runGeneration()
  }, [runGeneration])

  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-500/15 text-brand-400">
        <Sparkles size={28} className={error ? '' : 'animate-pulse'} />
      </div>
      {error ? (
        <>
          <h1 className="text-lg font-semibold text-slate-50">{t('programGenerate.failedTitle')}</h1>
          <p className="max-w-xs text-sm text-red-400">{error}</p>
          <div className="flex gap-2">
            <button onClick={() => navigate('/sport')} className="btn-secondary">
              {t('common.back')}
            </button>
            <button onClick={() => runGeneration()} className="btn-primary">
              {t('programGenerate.retry')}
            </button>
          </div>
        </>
      ) : (
        <>
          <h1 className="text-lg font-semibold text-slate-50">{t('programGenerate.generatingTitle')}</h1>
          <p className="max-w-xs text-sm text-slate-400">{t('programGenerate.generatingSubtitle')}</p>
        </>
      )}
    </div>
  )
}
