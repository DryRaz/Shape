import type { ActivityLevel, GoalType, Sex } from '@/types/database'

// Mifflin-St Jeor BMR × activity-level multiplier, then a goal-based calorie
// adjustment and a g/kg protein target. Standard sports-nutrition formulas,
// not anything app-specific.

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
}

const ACTIVITY_WEEKLY_SESSIONS: Record<ActivityLevel, number> = {
  sedentary: 2,
  light: 3,
  moderate: 4,
  active: 5,
  very_active: 6,
}

export const ACTIVITY_LEVEL_KEYS: { value: ActivityLevel; labelKey: string }[] = [
  { value: 'sedentary', labelKey: 'activityLevel.sedentary' },
  { value: 'light', labelKey: 'activityLevel.light' },
  { value: 'moderate', labelKey: 'activityLevel.moderate' },
  { value: 'active', labelKey: 'activityLevel.active' },
  { value: 'very_active', labelKey: 'activityLevel.veryActive' },
]

const CALORIE_ADJUSTMENT: Record<GoalType, number> = {
  lose_weight: -500,
  maintain: 0,
  gain_muscle: 350,
  improve_fitness: 0,
  wellbeing: 0,
}

const PROTEIN_PER_KG: Record<GoalType, number> = {
  lose_weight: 2,
  gain_muscle: 2,
  improve_fitness: 1.7,
  maintain: 1.4,
  wellbeing: 1.4,
}

// Never suggest below this, whatever the inputs — a short, light person on
// the "lose_weight" -500 adjustment can otherwise land under what's safe.
const MIN_DAILY_CALORIES = 1200

function bmr(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age
  if (sex === 'male') return base + 5
  if (sex === 'female') return base - 161
  return base - 78 // midpoint of the male/female offsets
}

export interface NutritionGoalInput {
  sex: Sex | null
  heightCm: number | null
  age: number | null
  goalType: GoalType | null
  activityLevel: ActivityLevel | null
  weightKg: number | null
}

export type MissingField = 'sex' | 'heightCm' | 'age' | 'goalType' | 'activityLevel' | 'weightKg'

export const MISSING_FIELD_KEYS: Record<MissingField, string> = {
  sex: 'missingField.sex',
  heightCm: 'missingField.heightCm',
  age: 'missingField.age',
  goalType: 'missingField.goalType',
  activityLevel: 'missingField.activityLevel',
  weightKg: 'missingField.weightKg',
}

export interface NutritionGoalResult {
  dailyCalories: number
  dailyProteinG: number
  weeklyCalories: number
  weeklyProteinG: number
  weeklySessions: number
}

export function missingFieldsFor(input: NutritionGoalInput): MissingField[] {
  const missing: MissingField[] = []
  if (!input.sex) missing.push('sex')
  if (!input.heightCm) missing.push('heightCm')
  if (!input.age) missing.push('age')
  if (!input.goalType) missing.push('goalType')
  if (!input.activityLevel) missing.push('activityLevel')
  if (!input.weightKg) missing.push('weightKg')
  return missing
}

export function computeNutritionGoal(input: NutritionGoalInput): NutritionGoalResult | null {
  if (missingFieldsFor(input).length > 0) return null
  const { sex, heightCm, age, goalType, activityLevel, weightKg } = input

  const tdee = bmr(sex!, weightKg!, heightCm!, age!) * ACTIVITY_MULTIPLIERS[activityLevel!]
  const dailyCalories = Math.max(MIN_DAILY_CALORIES, Math.round(tdee + CALORIE_ADJUSTMENT[goalType!]))
  const dailyProteinG = Math.round(weightKg! * PROTEIN_PER_KG[goalType!])

  return {
    dailyCalories,
    dailyProteinG,
    weeklyCalories: dailyCalories * 7,
    weeklyProteinG: dailyProteinG * 7,
    weeklySessions: ACTIVITY_WEEKLY_SESSIONS[activityLevel!],
  }
}
