import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, ExternalLink, Share, SquarePlus, Smartphone, X, type LucideIcon } from 'lucide-react'
import { useInstallPrompt } from '@/lib/useInstallPrompt'

const DISMISS_KEY = 'shape.installGuide.dismissed'

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

function writeDismissed() {
  try {
    window.localStorage.setItem(DISMISS_KEY, '1')
  } catch {
    // Storage can be unavailable (private mode); the card simply reappears next visit.
  }
}

interface Step {
  icon: LucideIcon
  titleKey: string
  detailKey: string
}

const IOS_STEPS: Step[] = [
  { icon: Share, titleKey: 'install.iosStep1Title', detailKey: 'install.iosStep1Detail' },
  { icon: SquarePlus, titleKey: 'install.iosStep2Title', detailKey: 'install.iosStep2Detail' },
  { icon: Download, titleKey: 'install.iosStep3Title', detailKey: 'install.iosStep3Detail' },
  { icon: Smartphone, titleKey: 'install.iosStep4Title', detailKey: 'install.iosStep4Detail' },
]

/**
 * Guides a not-yet-installed visitor through installing Shape on their home screen.
 * Renders nothing once the app is installed, on desktop without an install prompt,
 * or after the user dismisses it.
 */
export default function InstallGuide({ dismissible = true }: { dismissible?: boolean }) {
  const { t } = useTranslation()
  const { installed, isIos, isAndroid, isInAppBrowser, canPromptInstall, promptInstall } = useInstallPrompt()
  const [dismissed, setDismissed] = useState(readDismissed)

  if (installed || (dismissible && dismissed)) return null
  const isMobile = isIos || isAndroid
  if (!isMobile && !canPromptInstall) return null

  function dismiss() {
    writeDismissed()
    setDismissed(true)
  }

  const dismissButton = dismissible ? (
    <button
      type="button"
      onClick={dismiss}
      aria-label={t('install.dismiss')}
      className="absolute right-3 top-3 rounded-lg p-1 text-slate-500 hover:text-slate-300"
    >
      <X size={16} />
    </button>
  ) : null

  // Embedded browsers (Instagram, Facebook…) can't install anything: send the user out first.
  if (isInAppBrowser) {
    return (
      <div className="card relative space-y-2">
        {dismissButton}
        <div className="flex items-center gap-2 pr-6">
          <ExternalLink size={18} className="shrink-0 text-amber-400" />
          <p className="text-sm font-medium text-slate-100">{t('install.inAppTitle')}</p>
        </div>
        <p className="text-sm text-slate-400">{t('install.inAppBody')}</p>
      </div>
    )
  }

  if (isIos) {
    return (
      <div className="card relative space-y-3">
        {dismissButton}
        <div className="pr-6">
          <p className="text-sm font-medium text-slate-100">{t('install.iosTitle')}</p>
          <p className="text-xs text-slate-400">{t('install.iosIntro')}</p>
        </div>
        <ol className="space-y-3">
          {IOS_STEPS.map(({ icon: Icon, titleKey, detailKey }, index) => (
            <li key={titleKey} className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-brand-400">
                <Icon size={16} />
              </span>
              <div>
                <p className="text-sm font-medium text-slate-200">
                  {index + 1}. {t(titleKey)}
                </p>
                <p className="text-xs text-slate-400">{t(detailKey)}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    )
  }

  // Android / desktop Chromium with a native install prompt available.
  if (canPromptInstall) {
    return (
      <div className="card relative space-y-3">
        {dismissButton}
        <div className="pr-6">
          <p className="text-sm font-medium text-slate-100">{t('install.genericTitle')}</p>
          <p className="text-xs text-slate-400">{t('install.iosIntro')}</p>
        </div>
        <button type="button" onClick={promptInstall} className="btn-primary w-full">
          <Download size={16} />
          {t('settings.installApp')}
        </button>
      </div>
    )
  }

  // Android without a prompt (already dismissed once, or browser doesn't offer one): point to the menu.
  return (
    <div className="card relative space-y-1">
      {dismissButton}
      <p className="pr-6 text-sm font-medium text-slate-100">{t('install.genericTitle')}</p>
      <p className="text-sm text-slate-400">{t('install.androidMenuHint')}</p>
    </div>
  )
}
