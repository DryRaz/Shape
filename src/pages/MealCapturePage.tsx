import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, Loader2, Upload, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { todayInTimezone } from '@/lib/date'
import type { MealType } from '@/types/database'

const MEAL_TYPE_OPTIONS: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Petit-déjeuner' },
  { value: 'lunch', label: 'Déjeuner' },
  { value: 'dinner', label: 'Dîner' },
  { value: 'snack', label: 'Collation' },
]

function defaultMealType(): MealType {
  const hour = new Date().getHours()
  if (hour < 11) return 'breakfast'
  if (hour < 16) return 'lunch'
  if (hour < 21) return 'dinner'
  return 'snack'
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1] ?? '')
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function MealCapturePage() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [mealType, setMealType] = useState<MealType>(defaultMealType)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [items, setItems] = useState<{ name: string; portion_g: number; calories: number }[]>([])
  const [calories, setCalories] = useState('')
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fat, setFat] = useState('')
  const [userAdjusted, setUserAdjusted] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPreviewUrl(URL.createObjectURL(file))
    setAnalysisError(null)
    setUserAdjusted(false)
    setItems([])
    setCalories('')
    setProtein('')
    setCarbs('')
    setFat('')

    setAnalyzing(true)
    try {
      const base64 = await fileToBase64(file)
      const { data, error } = await supabase.functions.invoke('analyze-meal-photo', {
        body: { imageBase64: base64, mediaType: file.type || 'image/jpeg' },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setItems(data.items ?? [])
      setCalories(String(Math.round(data.total_calories ?? 0)))
      setProtein(String(Math.round(data.total_protein_g ?? 0)))
      setCarbs(String(Math.round(data.total_carbs_g ?? 0)))
      setFat(String(Math.round(data.total_fat_g ?? 0)))
    } catch (err) {
      setAnalysisError(
        err instanceof Error ? err.message : "Impossible d'analyser la photo. Vous pouvez saisir les valeurs manuellement."
      )
    } finally {
      setAnalyzing(false)
    }
  }

  function markAdjusted<T>(setter: (v: T) => void) {
    return (v: T) => {
      setUserAdjusted(true)
      setter(v)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    try {
      let photoUrl: string | null = null
      if (photoFile) {
        const ext = photoFile.name.split('.').pop() || 'jpg'
        const path = `${user.id}/${Date.now()}.${ext}`
        const { error: uploadError } = await supabase.storage.from('meal-photos').upload(path, photoFile)
        if (uploadError) throw uploadError
        photoUrl = supabase.storage.from('meal-photos').getPublicUrl(path).data.publicUrl
      }

      const { error } = await supabase.from('meals').insert({
        user_id: user.id,
        date: todayInTimezone(profile?.timezone ?? 'Africa/Nairobi'),
        meal_type: mealType,
        photo_url: photoUrl,
        estimated_calories: calories ? Number(calories) : null,
        estimated_protein_g: protein ? Number(protein) : null,
        estimated_carbs_g: carbs ? Number(carbs) : null,
        estimated_fat_g: fat ? Number(fat) : null,
        user_adjusted: userAdjusted,
      })
      if (error) throw error
      navigate('/nutrition')
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : "Erreur lors de l'enregistrement du repas.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-slate-50">Nouveau repas</h1>
        <p className="text-xs text-slate-400">Photo analysée automatiquement, corrigez si besoin</p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="label">Type de repas</label>
          <div className="grid grid-cols-4 gap-2">
            {MEAL_TYPE_OPTIONS.map((opt) => (
              <button
                type="button"
                key={opt.value}
                onClick={() => setMealType(opt.value)}
                className={`rounded-xl px-2 py-2 text-xs font-medium ${
                  mealType === opt.value ? 'bg-brand-500 text-slate-950' : 'bg-slate-900 text-slate-400'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Photo</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />
          {previewUrl ? (
            <div className="relative">
              <img src={previewUrl} alt="Aperçu du repas" className="h-56 w-full rounded-2xl object-cover" />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-3 right-3 rounded-full bg-slate-950/80 p-2 text-slate-200"
              >
                <Camera size={18} />
              </button>
              {analyzing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl bg-slate-950/70 text-slate-200">
                  <Loader2 size={24} className="animate-spin" />
                  <p className="text-sm">Analyse de la photo…</p>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-56 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-700 text-slate-500"
            >
              <Upload size={28} />
              <span className="text-sm">Prendre ou importer une photo</span>
            </button>
          )}
        </div>

        {analysisError && (
          <p className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-400">{analysisError}</p>
        )}

        {items.length > 0 && (
          <div className="card space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Aliments détectés</p>
            <ul className="space-y-1">
              {items.map((item, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className="text-slate-300">
                    {item.name} <span className="text-slate-500">· {item.portion_g}g</span>
                  </span>
                  <span className="text-slate-400">{Math.round(item.calories)} kcal</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Calories (kcal)</label>
            <input
              type="number"
              inputMode="decimal"
              className="input"
              value={calories}
              onChange={(e) => markAdjusted(setCalories)(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <label className="label">Protéines (g)</label>
            <input
              type="number"
              inputMode="decimal"
              className="input"
              value={protein}
              onChange={(e) => markAdjusted(setProtein)(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <label className="label">Glucides (g)</label>
            <input
              type="number"
              inputMode="decimal"
              className="input"
              value={carbs}
              onChange={(e) => markAdjusted(setCarbs)(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <label className="label">Lipides (g)</label>
            <input
              type="number"
              inputMode="decimal"
              className="input"
              value={fat}
              onChange={(e) => markAdjusted(setFat)(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>

        {userAdjusted && <p className="text-xs text-amber-400">Valeurs corrigées manuellement</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate('/nutrition')}
            className="btn-ghost flex-1"
          >
            <X size={16} />
            Annuler
          </button>
          <button type="submit" className="btn-primary flex-1" disabled={saving || analyzing}>
            {saving ? 'Enregistrement…' : 'Enregistrer le repas'}
          </button>
        </div>
      </form>
    </div>
  )
}
