// Hand-written types mirroring the Supabase schema (see supabase/migrations).
// Regenerate with `supabase gen types typescript` once the project is linked.

export type Sex = 'male' | 'female' | 'other'
export type GoalType = 'lose_weight' | 'maintain' | 'gain_muscle' | 'improve_fitness' | 'wellbeing'
export type TrackingType = 'boolean' | 'quantity'
export type HabitCategory = 'sleep' | 'sport' | 'nutrition' | 'reading' | 'spiritual' | 'other'
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'
export type ReminderChannel = 'push' | 'email'

export interface UserProfile {
  id: string
  email: string
  timezone: string
  height_cm: number | null
  age: number | null
  sex: Sex | null
  goal_type: GoalType | null
  created_at: string
}

export interface WeightLog {
  id: string
  user_id: string
  date: string
  weight_kg: number
  created_at: string
}

export interface HabitType {
  id: string
  user_id: string
  name: string
  category: HabitCategory
  tracking_type: TrackingType
  target_value: number | null
  target_unit: string | null
  reminder_time: string | null
  active: boolean
  created_at: string
}

export interface HabitLog {
  id: string
  habit_type_id: string
  user_id: string
  date: string
  value: number
  created_at: string
}

export interface SleepLog {
  id: string
  user_id: string
  date: string
  bedtime: string | null
  wake_time: string | null
  duration_hours: number | null
  quality_rating: number | null
  created_at: string
}

export interface Meal {
  id: string
  user_id: string
  date: string
  meal_type: MealType
  photo_url: string | null
  estimated_calories: number | null
  estimated_protein_g: number | null
  estimated_carbs_g: number | null
  estimated_fat_g: number | null
  user_adjusted: boolean
  created_at: string
}

export interface Exercise {
  id: string
  wger_id: number | null
  name: string
  muscle_group: string | null
  instructions: string | null
  visual_url: string | null
  video_url: string | null
  equipment: string | null
  created_at: string
}

export interface Routine {
  id: string
  user_id: string
  name: string
  program_id: string | null
  week_number: number | null
  session_number: number | null
  created_at: string
}

export interface Program {
  id: string
  user_id: string
  goal_type: GoalType | null
  name: string
  created_at: string
}

export interface RoutineExercise {
  id: string
  routine_id: string
  exercise_id: string
  order: number
  sets: number | null
  reps: number | null
  duration_seconds: number | null
  rest_seconds: number | null
}

export interface WorkoutSession {
  id: string
  user_id: string
  routine_id: string | null
  date: string
  started_at: string | null
  completed_at: string | null
}

export interface WorkoutSessionLog {
  id: string
  session_id: string
  exercise_id: string
  sets_completed: number | null
  reps_completed: number | null
  weight_used: number | null
}

export interface Food {
  id: string
  name: string
  category: string
  subcategory: string | null
  portion_label: string
  portion_grams: number
  kcal: number
  kcal_per_100g: number
  protein_g_per_100g: number | null
  carbs_g_per_100g: number | null
  fat_g_per_100g: number | null
  source: string
  created_at: string
}

export type MealItemSource = 'catalog' | 'estimated'

export interface MealItem {
  id: string
  meal_id: string
  food_id: string | null
  name: string
  portion_g: number | null
  kcal: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  source: MealItemSource
  created_at: string
}

export interface PushSubscriptionRow {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  created_at: string
}

export interface Reminder {
  id: string
  user_id: string
  label: string
  time: string
  days_of_week: number[]
  linked_habit_type_id: string | null
  channel: ReminderChannel
  active: boolean
  created_at: string
}
