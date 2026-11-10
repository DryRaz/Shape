// Spoken kilometre announcements. Uses the browser's speech synthesis, which only runs while the
// page is alive (screen on) — the same limit as the GPS itself.

const VOICE_KEY = 'shape.run.voice'

export function isVoiceEnabled(): boolean {
  try {
    return window.localStorage.getItem(VOICE_KEY) !== '0'
  } catch {
    return true
  }
}

export function setVoiceEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(VOICE_KEY, enabled ? '1' : '0')
  } catch {
    // ignore
  }
}

export function speak(text: string, language: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  try {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = language === 'en' ? 'en-US' : 'fr-FR'
    window.speechSynthesis.speak(utterance)
  } catch {
    // Speech is a nicety; never let it break tracking.
  }
}
