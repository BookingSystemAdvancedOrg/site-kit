import { BOT_CHECK_FAILED, BOT_CHECK_UNAVAILABLE } from './api'

/** Gästens text när säkerhetskontrollen (shared/botCheck.ts) stoppar ett formulär. */
export const BOT_CHECK_ERRORS: Record<string, string> = {
  [BOT_CHECK_UNAVAILABLE]:
    'Säkerhetskontrollen kunde inte laddas. Kontrollera uppkopplingen, stäng av blockerande tillägg för sidan och försök igen.',
  [BOT_CHECK_FAILED]:
    'Säkerhetskontrollen gick inte igenom. Försök igen om en stund. Fungerar det ändå inte, kontakta restaurangen.',
}
