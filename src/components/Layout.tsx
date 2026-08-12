import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard,
  Moon,
  UtensilsCrossed,
  Dumbbell,
  BookOpenText,
  Settings,
} from 'lucide-react'

const NAV_ITEMS = [
  { to: '/', label: 'Accueil', icon: LayoutDashboard, end: true },
  { to: '/sommeil', label: 'Sommeil', icon: Moon },
  { to: '/nutrition', label: 'Nutrition', icon: UtensilsCrossed },
  { to: '/sport', label: 'Sport', icon: Dumbbell },
  { to: '/habitudes', label: 'Lecture', icon: BookOpenText },
  { to: '/profil', label: 'Profil', icon: Settings },
]

export default function Layout() {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col bg-slate-950 pb-24">
      <main className="flex-1 px-4 pt-6">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 mx-auto max-w-lg border-t border-slate-800 bg-slate-950/95 pb-safe backdrop-blur">
        <ul className="grid grid-cols-6">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-1 py-3 text-[10px] font-medium ${
                    isActive ? 'text-brand-400' : 'text-slate-500'
                  }`
                }
              >
                <Icon size={20} />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
