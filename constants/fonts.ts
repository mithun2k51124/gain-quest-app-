// constants/fonts.ts — the Outfit typeface used for screen titles and their date lines.
// Loaded once in app/_layout.tsx. Custom fonts carry their own weight, so styles using them
// leave fontWeight unset (Android otherwise falls back to the system font).
import { Outfit_500Medium, Outfit_700Bold, Outfit_800ExtraBold } from '@expo-google-fonts/outfit';

export const FONT_ASSETS = { Outfit_500Medium, Outfit_700Bold, Outfit_800ExtraBold };

export const FONT = {
  title: 'Outfit_800ExtraBold',
  bold:  'Outfit_700Bold',
  sub:   'Outfit_500Medium',
};

/** Screen title in the top-left of every page. */
export const TITLE_STYLE = { fontFamily: FONT.title, fontSize: 26, letterSpacing: -0.4 } as const;
/** A screen title that shares its row with wide header pills (Tracker's scan pill, Overall's score). */
export const TITLE_COMPACT_STYLE = { fontFamily: FONT.title, fontSize: 21, letterSpacing: -0.3, flexShrink: 1, marginRight: 10 } as const;
/** The date line under a screen title. */
export const SUBTITLE_STYLE = { fontFamily: FONT.sub, fontSize: 13, letterSpacing: 0.2, marginTop: 1 } as const;
