import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

// iPadOS 13+ reports itself as a Mac, so touch support is the tell.
function detectIos(): boolean {
  const ua = window.navigator.userAgent
  if (/iphone|ipad|ipod/i.test(ua)) return true
  return /macintosh/i.test(ua) && window.navigator.maxTouchPoints > 1
}

function detectAndroid(): boolean {
  return /android/i.test(window.navigator.userAgent)
}

// Embedded browsers (Instagram, Facebook, TikTok…) can't add anything to the home screen.
function detectInAppBrowser(): boolean {
  return /Instagram|FBAN|FBAV|FB_IAB|Snapchat|TikTok|musical_ly|Twitter|LinkedInApp|MicroMessenger|Line\//i.test(
    window.navigator.userAgent,
  )
}

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(isStandalone)

  useEffect(() => {
    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    function onAppInstalled() {
      setInstalled(true)
      setDeferredPrompt(null)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  async function promptInstall() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    if (choice.outcome === 'accepted') setInstalled(true)
    setDeferredPrompt(null)
  }

  const isIos = detectIos()
  const isAndroid = detectAndroid()
  const isInAppBrowser = detectInAppBrowser()

  return {
    installed,
    isIos,
    isAndroid,
    isInAppBrowser,
    canPromptInstall: !installed && !!deferredPrompt,
    needsIosInstructions: !installed && !deferredPrompt && isIos,
    promptInstall,
  }
}
