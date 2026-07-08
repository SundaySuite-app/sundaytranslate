// Listener-facing UI strings. The listener is by definition foreign-language,
// so this chrome is translated. Keys fall back to English, then Norwegian.
// Operator/source/interpreter pages stay Norwegian-first (staff are local).

import type { UiLocale } from "@/lib/locales";

export interface Strings {
  choose: string;
  chooseSub: string;
  original: string;
  originalSub: string;
  ai: string;
  connecting: string;
  playing: string;
  stop: string;
  waiting: string;
  ended: string;
  endedSub: string;
  earbuds: string;
  keepAwake: string;
  noRecording: string;
  notFound: string;
  uiLanguage: string;
  connectionLost: string;
  retry: string;
}

const en: Strings = {
  choose: "Choose your language",
  chooseSub: "Pick a channel to hear it on this phone.",
  original: "Original audio",
  originalSub: "Assistive listening — the room audio in your ear.",
  ai: "AI voice",
  connecting: "Connecting…",
  playing: "Playing",
  stop: "Stop",
  waiting: "Waiting for the channel to go live…",
  ended: "The session has ended",
  endedSub: "Thank you for listening.",
  earbuds: "Use earbuds for the best experience.",
  keepAwake: "Keep this screen on while listening.",
  noRecording: "No audio is recorded.",
  notFound: "No live session found for that PIN.",
  uiLanguage: "Language",
  connectionLost: "Connection lost.",
  retry: "Try again",
};

const no: Strings = {
  choose: "Velg ditt språk",
  chooseSub: "Velg en kanal for å høre den på denne telefonen.",
  original: "Original-lyd",
  originalSub: "Lytteanlegg — lyden i rommet rett i øret.",
  ai: "AI-stemme",
  connecting: "Kobler til…",
  playing: "Spiller av",
  stop: "Stopp",
  waiting: "Venter på at kanalen skal starte…",
  ended: "Sesjonen er avsluttet",
  endedSub: "Takk for at du lyttet.",
  earbuds: "Bruk ørepropper for best opplevelse.",
  keepAwake: "Hold skjermen på mens du lytter.",
  noRecording: "Ingen lyd tas opp.",
  notFound: "Fant ingen aktiv sesjon for den PIN-en.",
  uiLanguage: "Språk",
  connectionLost: "Mistet forbindelsen.",
  retry: "Prøv igjen",
};

const nn: Strings = {
  ...no,
  choose: "Vel ditt språk",
  chooseSub: "Vel ein kanal for å høyre han på denne telefonen.",
  playing: "Spelar av",
  waiting: "Ventar på at kanalen skal starte…",
  endedSub: "Takk for at du lytta.",
  earbuds: "Bruk øyreproppar for best oppleving.",
  keepAwake: "Hald skjermen på medan du lyttar.",
  notFound: "Fann ingen aktiv sesjon for den PIN-en.",
  connectionLost: "Mista sambandet.",
};

const pl: Strings = {
  choose: "Wybierz swój język",
  chooseSub: "Wybierz kanał, aby słuchać na tym telefonie.",
  original: "Dźwięk oryginalny",
  originalSub: "Wspomaganie słuchu — dźwięk z sali w twoim uchu.",
  ai: "Głos AI",
  connecting: "Łączenie…",
  playing: "Odtwarzanie",
  stop: "Zatrzymaj",
  waiting: "Czekanie na uruchomienie kanału…",
  ended: "Sesja zakończona",
  endedSub: "Dziękujemy za słuchanie.",
  earbuds: "Użyj słuchawek dla najlepszego efektu.",
  keepAwake: "Nie wygaszaj ekranu podczas słuchania.",
  noRecording: "Dźwięk nie jest nagrywany.",
  notFound: "Nie znaleziono aktywnej sesji dla tego PIN-u.",
  uiLanguage: "Język",
  connectionLost: "Utracono połączenie.",
  retry: "Spróbuj ponownie",
};

const uk: Strings = {
  choose: "Виберіть свою мову",
  chooseSub: "Виберіть канал, щоб слухати на цьому телефоні.",
  original: "Оригінальний звук",
  originalSub: "Допомога для слуху — звук залу у вашому вусі.",
  ai: "Голос ШІ",
  connecting: "Підключення…",
  playing: "Відтворення",
  stop: "Зупинити",
  waiting: "Очікування запуску каналу…",
  ended: "Сесію завершено",
  endedSub: "Дякуємо, що слухали.",
  earbuds: "Використовуйте навушники для найкращого враження.",
  keepAwake: "Не вимикайте екран під час прослуховування.",
  noRecording: "Звук не записується.",
  notFound: "Не знайдено активної сесії для цього PIN-коду.",
  uiLanguage: "Мова",
  connectionLost: "З'єднання втрачено.",
  retry: "Спробувати ще раз",
};

const ar: Strings = {
  choose: "اختر لغتك",
  chooseSub: "اختر قناة للاستماع على هذا الهاتف.",
  original: "الصوت الأصلي",
  originalSub: "مساعدة على السمع — صوت القاعة في أذنك.",
  ai: "صوت الذكاء الاصطناعي",
  connecting: "جارٍ الاتصال…",
  playing: "قيد التشغيل",
  stop: "إيقاف",
  waiting: "في انتظار بدء القناة…",
  ended: "انتهت الجلسة",
  endedSub: "شكرًا لاستماعك.",
  earbuds: "استخدم سماعات الأذن لأفضل تجربة.",
  keepAwake: "أبقِ الشاشة مضاءة أثناء الاستماع.",
  noRecording: "لا يتم تسجيل أي صوت.",
  notFound: "لم يتم العثور على جلسة نشطة لهذا الرمز.",
  uiLanguage: "اللغة",
  connectionLost: "انقطع الاتصال.",
  retry: "حاول مرة أخرى",
};

const so: Strings = {
  choose: "Dooro luqaddaada",
  chooseSub: "Dooro kanaal si aad uga maqasho taleefankan.",
  original: "Codka asalka ah",
  originalSub: "Caawimaad maqalka — codka qolka oo dhegtaada ah.",
  ai: "Cod AI",
  connecting: "Ku xidhaya…",
  playing: "Wuu shaqaynayaa",
  stop: "Jooji",
  waiting: "Sugaya in kanaalku bilaabmo…",
  ended: "Fadhigu wuu dhammaaday",
  endedSub: "Mahadsanid dhageysigaaga.",
  earbuds: "Isticmaal dhegaha si aad u hesho khibradda ugu fiican.",
  keepAwake: "Shaashadda sii daa iyada oo shidan inta aad dhageysanayso.",
  noRecording: "Cod lama duubo.",
  notFound: "Lama helin fadhi firfircoon oo PIN-kaas ah.",
  uiLanguage: "Luqad",
  connectionLost: "Xiriirku wuu go'ay.",
  retry: "Isku day mar kale",
};

const DICT: Record<UiLocale, Strings> = { en, no, nn, pl, uk, ar, so };

/** Pick the best UI dictionary for a locale code (exact, then base, then en). */
export function strings(code: string): Strings {
  if (code in DICT) return DICT[code as UiLocale];
  const base = code.split("-")[0];
  if (base in DICT) return DICT[base as UiLocale];
  return en;
}
