// Shared by analyze-meal-photo and analyze-nutrition-label.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export type AppLanguage = 'fr' | 'en'

/** Appended to a prompt so the model writes its text output (names, etc.) in the user's chosen language, independent of the prompt's own (French) wording. */
export function languageInstruction(language: unknown): string {
  return language === 'en'
    ? ' Write every text field (names, etc.) in English.'
    : ' Écris tous les champs texte (noms, etc.) en français.'
}

/** The category assigned to catalog rows this backend creates itself (vision/label), as opposed to the imported Yazio catalog. */
export function aiCatalogCategory(language: unknown): string {
  return language === 'en' ? 'Other' : 'Divers'
}

/** Used when a nutrition label's product name couldn't be read off the packaging. */
export function defaultLabelProductName(language: unknown): string {
  return language === 'en' ? 'Product (label)' : 'Produit (étiquette)'
}

export function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('No JSON object found in model response')
  return JSON.parse(candidate.slice(start, end + 1))
}
