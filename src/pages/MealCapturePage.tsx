import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, Database, Loader2, Search, Sparkles, Trash2, Upload, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { todayInTimezone } from '@/lib/date'
import type { Food, MealItemSource, MealType } from '@/types/database'

interface DetectedItem {
  name: string
  portion_g: number
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  source: MealItemSource
  food_id: string | null
  matched_name?: string | null
  category?: string | null
}

type FoodSearchResult = Pick<
  Food,
  | 'id'
  | 'name'
  | 'category'
  | 'subcategory'
  | 'portion_label'
  | 'portion_grams'
  | 'kcal_per_100g'
  | 'protein_g_per_100g'
  | 'carbs_g_per_100g'
  | 'fat_g_per_100g'
>

type EntryMode = 'photo' | 'manual'

const ENTRY_MODE_OPTIONS: { value: EntryMode; label: string }[] = [
  { value: 'photo', label: 'Photo' },
  { value: 'manual', label: 'Saisie manuelle' },
]

const SEARCH_DEBOUNCE_MS = 250
const SEARCH_MIN_LENGTH = 2

/** Mirrors public.normalize_food_name() in the DB: lowercase + accents stripped. */
function normalizeFoodQuery(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

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

  const [entryMode, setEntryMode] = useState<EntryMode>('photo')
  const [mealType, setMealType] = useState<MealType>(defaultMealType)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [items, setItems] = useState<DetectedItem[]>([])
  const [calories, setCalories] = useState('')
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fat, setFat] = useState('')
  const [userAdjusted, setUserAdjusted] = useState(false)
  const [saving, setSaving] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<FoodSearchResult[]>([])
  const [selectedFood, setSelectedFood] = useState<FoodSearchResult | null>(null)
  const [portionInput, setPortionInput] = useState('')

  useEffect(() => {
    const trimmed = searchQuery.trim()
    if (trimmed.length < SEARCH_MIN_LENGTH) {
      setSearchResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    let cancelled = false
    const timeout = setTimeout(async () => {
      const normalized = normalizeFoodQuery(trimmed)
      const { data, error } = await supabase
        .from('foods')
        .select(
          'id, name, category, subcategory, portion_label, portion_grams, kcal_per_100g, protein_g_per_100g, carbs_g_per_100g, fat_g_per_100g'
        )
        .ilike('search_name', `%${normalized}%`)
        .order('name')
        .limit(15)
      if (cancelled) return
      setSearchResults(error ? [] : (data ?? []))
      setSearching(false)
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [searchQuery])

  function updateItems(newItems: DetectedItem[]) {
    setItems(newItems)
    setCalories(String(Math.round(newItems.reduce((sum, it) => sum + it.calories, 0))))
    setProtein(String(Math.round(newItems.reduce((sum, it) => sum + it.protein_g, 0))))
    setCarbs(String(Math.round(newItems.reduce((sum, it) => sum + it.carbs_g, 0))))
    setFat(String(Math.round(newItems.reduce((sum, it) => sum + it.fat_g, 0))))
  }

  function removeItem(index: number) {
    updateItems(items.filter((_, i) => i !== index))
  }

  function handleSelectFood(food: FoodSearchResult) {
    setSelectedFood(food)
    setPortionInput(String(food.portion_grams))
  }

  function handleAddManualItem() {
    if (!selectedFood) return
    const portionG = Number(portionInput)
    if (!portionG || portionG <= 0) return
    const newItem: DetectedItem = {
      name: selectedFood.name,
      portion_g: portionG,
      calories: Math.round((selectedFood.kcal_per_100g * portionG) / 100),
      protein_g: selectedFood.protein_g_per_100g !== null ? Math.round((selectedFood.protein_g_per_100g * portionG) / 100) : 0,
      carbs_g: selectedFood.carbs_g_per_100g !== null ? Math.round((selectedFood.carbs_g_per_100g * portionG) / 100) : 0,
      fat_g: selectedFood.fat_g_per_100g !== null ? Math.round((selectedFood.fat_g_per_100g * portionG) / 100) : 0,
      source: 'catalog',
      food_id: selectedFood.id,
      matched_name: selectedFood.name,
      category: selectedFood.category,
    }
    updateItems([...items, newItem])
    setSelectedFood(null)
    setPortionInput('')
    setSearchQuery('')
    setSearchResults([])
  }

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
      updateItems(data.items ?? [])
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

      const { data: newMeal, error } = await supabase
        .from('meals')
        .insert({
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
        .select('*')
        .single()
      if (error) throw error

      if (newMeal && items.length > 0) {
        const { error: itemsError } = await supabase.from('meal_items').insert(
          items.map((item) => ({
            meal_id: newMeal.id,
            food_id: item.food_id,
            name: item.name,
            portion_g: item.portion_g,
            kcal: item.calories,
            protein_g: item.protein_g,
            carbs_g: item.carbs_g,
            fat_g: item.fat_g,
            source: item.source,
          }))
        )
        // Don't block saving the meal if the item breakdown fails to save.
        if (itemsError) console.error('Failed to save meal item breakdown', itemsError)
      }

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
          <label className="label">Mode de saisie</label>
          <div className="grid grid-cols-2 gap-2">
            {ENTRY_MODE_OPTIONS.map((opt) => (
              <button
                type="button"
                key={opt.value}
                onClick={() => setEntryMode(opt.value)}
                className={`rounded-xl px-2 py-2 text-xs font-medium ${
                  entryMode === opt.value ? 'bg-brand-500 text-slate-950' : 'bg-slate-900 text-slate-400'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {entryMode === 'photo' ? (
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
        ) : (
          <div className="space-y-3">
            <div>
              <label className="label">Rechercher un aliment</label>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  className="input pl-9"
                  placeholder="Ex. Poulet grillé"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setSelectedFood(null)
                  }}
                />
              </div>
            </div>

            {searching && <p className="text-xs text-slate-500">Recherche…</p>}

            {!selectedFood && searchResults.length > 0 && (
              <ul className="card divide-y divide-slate-800 space-y-0 p-0">
                {searchResults.map((food) => (
                  <li key={food.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectFood(food)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-slate-200">{food.name}</span>
                        <span className="block truncate text-xs text-slate-500">{food.category}</span>
                      </span>
                      <span className="shrink-0 text-xs text-slate-400">{food.kcal_per_100g} kcal/100g</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {selectedFood && (
              <div className="card space-y-3">
                <div>
                  <p className="text-sm font-medium text-slate-100">{selectedFood.name}</p>
                  <p className="text-xs text-slate-500">
                    {selectedFood.category}
                    {selectedFood.subcategory ? ` · ${selectedFood.subcategory}` : ''}
                  </p>
                </div>
                <div>
                  <label className="label">Portion (g)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    className="input"
                    value={portionInput}
                    onChange={(e) => setPortionInput(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setSelectedFood(null)} className="btn-ghost flex-1">
                    Annuler
                  </button>
                  <button type="button" onClick={handleAddManualItem} className="btn-primary flex-1">
                    Ajouter
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {analysisError && (
          <p className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-400">{analysisError}</p>
        )}

        {items.length > 0 && (
          <div className="card space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Aliments</p>
              <p className="text-xs text-slate-500">
                {items.filter((i) => i.source === 'catalog').length}/{items.length} depuis la base de données
              </p>
            </div>
            <ul className="space-y-1">
              {items.map((item, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-slate-300">
                    {item.source === 'catalog' ? (
                      <Database size={14} className="shrink-0 text-brand-400" />
                    ) : (
                      <Sparkles size={14} className="shrink-0 text-slate-500" />
                    )}
                    {item.name} <span className="text-slate-500">· {item.portion_g}g</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-slate-400">{Math.round(item.calories)} kcal</span>
                    <button
                      type="button"
                      onClick={() => removeItem(i)}
                      className="text-slate-600 hover:text-red-400"
                      aria-label={`Retirer ${item.name}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
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
