import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { generateAndSaveProgram } from '@/lib/programGenerator'

export default function ProgramGeneratePage() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const startedRef = useRef(false)

  useEffect(() => {
    if (!user || startedRef.current) return
    startedRef.current = true

    ;(async () => {
      try {
        const { data: exercises, error: exercisesError } = await supabase
          .from('exercises')
          .select('id, name, muscle_group')
        if (exercisesError) throw exercisesError

        const programId = await generateAndSaveProgram(user.id, profile?.goal_type ?? null, exercises ?? [])
        navigate(`/sport/programme/${programId}`, { replace: true })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Impossible de générer le programme.')
      }
    })()
  }, [user, profile, navigate])

  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-500/15 text-brand-400">
        <Sparkles size={28} className={error ? '' : 'animate-pulse'} />
      </div>
      {error ? (
        <>
          <h1 className="text-lg font-semibold text-slate-50">Échec de la génération</h1>
          <p className="max-w-xs text-sm text-red-400">{error}</p>
          <div className="flex gap-2">
            <button onClick={() => navigate('/sport')} className="btn-secondary">
              Retour
            </button>
            <button
              onClick={() => {
                startedRef.current = false
                setError(null)
              }}
              className="btn-primary"
            >
              Réessayer
            </button>
          </div>
        </>
      ) : (
        <>
          <h1 className="text-lg font-semibold text-slate-50">Génération de votre programme…</h1>
          <p className="max-w-xs text-sm text-slate-400">
            Claude prépare 3 semaines de séances adaptées à votre objectif. Cela prend quelques secondes.
          </p>
        </>
      )}
    </div>
  )
}
