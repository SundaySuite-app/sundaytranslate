// The language set SundayTranslate knows about: the listener UI languages and
// the interpreter/caption target languages. Norwegian-first, then the languages
// most present in Norwegian congregations. Flags are decorative only.

export interface Lang {
  code: string;
  /** Endonym — shown to the listener in their own language. */
  name: string;
  flag: string;
}

export const LANGS: Lang[] = [
  { code: "no", name: "Norsk (bokmål)", flag: "🇳🇴" },
  { code: "nn", name: "Norsk (nynorsk)", flag: "🇳🇴" },
  { code: "en", name: "English", flag: "🇬🇧" },
  { code: "pl", name: "Polski", flag: "🇵🇱" },
  { code: "uk", name: "Українська", flag: "🇺🇦" },
  { code: "ar", name: "العربية", flag: "🇸🇦" },
  { code: "so", name: "Soomaali", flag: "🇸🇴" },
  { code: "ti", name: "ትግርኛ", flag: "🇪🇷" },
  { code: "es", name: "Español", flag: "🇪🇸" },
  { code: "fr", name: "Français", flag: "🇫🇷" },
  { code: "de", name: "Deutsch", flag: "🇩🇪" },
  { code: "ru", name: "Русский", flag: "🇷🇺" },
  { code: "fa", name: "فارسی", flag: "🇮🇷" },
  { code: "vi", name: "Tiếng Việt", flag: "🇻🇳" },
];

const BY_CODE = new Map(LANGS.map((l) => [l.code, l]));

export function lang(code: string | null | undefined): Lang | null {
  return code ? (BY_CODE.get(code) ?? null) : null;
}

export function langName(code: string | null | undefined): string {
  return lang(code)?.name ?? code ?? "";
}

/** The 7 UI locales the listener chrome ships strings for (rest fall back to en). */
export const UI_LOCALES = ["no", "nn", "en", "pl", "uk", "ar", "so"] as const;
export type UiLocale = (typeof UI_LOCALES)[number];

/** Right-to-left languages — flip the listener layout. */
export const RTL = new Set(["ar", "fa"]);
export function isRtl(code: string): boolean {
  return RTL.has(code);
}
