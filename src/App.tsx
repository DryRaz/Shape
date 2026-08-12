import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '@/lib/AuthContext'
import Layout from '@/components/Layout'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import SleepPage from '@/pages/SleepPage'
import NutritionPage from '@/pages/NutritionPage'
import MealCapturePage from '@/pages/MealCapturePage'
import SportPage from '@/pages/SportPage'
import ExerciseCatalogPage from '@/pages/ExerciseCatalogPage'
import RoutineEditorPage from '@/pages/RoutineEditorPage'
import WorkoutSessionPage from '@/pages/WorkoutSessionPage'
import ProgramGeneratePage from '@/pages/ProgramGeneratePage'
import ProgramPage from '@/pages/ProgramPage'
import HabitsPage from '@/pages/HabitsPage'
import RemindersPage from '@/pages/RemindersPage'
import SettingsPage from '@/pages/SettingsPage'

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { session, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        Chargement…
      </div>
    )
  }
  if (!session) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/sommeil" element={<SleepPage />} />
        <Route path="/nutrition" element={<NutritionPage />} />
        <Route path="/nutrition/nouveau" element={<MealCapturePage />} />
        <Route path="/sport" element={<SportPage />} />
        <Route path="/sport/exercices" element={<ExerciseCatalogPage />} />
        <Route path="/sport/routines/:routineId" element={<RoutineEditorPage />} />
        <Route path="/sport/routines/nouveau" element={<RoutineEditorPage />} />
        <Route path="/sport/programme/nouveau" element={<ProgramGeneratePage />} />
        <Route path="/sport/programme/:programId" element={<ProgramPage />} />
        <Route path="/sport/seance/:sessionId" element={<WorkoutSessionPage />} />
        <Route path="/habitudes" element={<HabitsPage />} />
        <Route path="/rappels" element={<RemindersPage />} />
        <Route path="/profil" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
