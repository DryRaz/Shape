import { NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  LayoutDashboard,
  Moon,
  UtensilsCrossed,
  Dumbbell,
  BookOpenText,
  Settings,
} from 'lucide-react'

const NAV_ITEMS = [
  { to: '/', labelKey: 'nav.home', icon: LayoutDashboard, end: true },
  { to: '/sommeil', labelKey: 'nav.sleep', icon: Moon },
  { to: '/nutrition', labelKey: 'nav.nutrition', icon: UtensilsCrossed },
  { to: '/sport', labelKey: 'nav.sport', icon: Dumbbell },
  { to: '/habitudes', labelKey: 'nav.habits', icon: BookOpenText },
  { to: '/profil', labelKey: 'nav.profile', icon: Settings },
]

export default function Layout() {
  const { t } = useTranslation()
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col bg-slate-950 pb-24">
      <main className="flex-1 px-4 pt-6">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 mx-auto max-w-lg border-t border-slate-800 bg-slate-950/95 pb-safe backdrop-blur">
        <ul className="grid grid-cols-6">
          {NAV_ITEMS.map(({ to, labelKey, icon: Icon, end }) => (
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
                {t(labelKey)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
