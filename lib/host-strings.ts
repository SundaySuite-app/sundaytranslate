// Staff/operatør-facing strings for the OPTIONAL Sunday-Account host login +
// "mine oversettelses-sesjoner" dashboard. Norwegian-first, like the rest of
// the staff chrome (operator/source/interpreter pages). The listener chrome
// keeps its own translated dictionary in `lib/locale.ts`.

export const hostStrings = {
  // login
  loginTitle: "Logg inn — vert",
  loginLede:
    "Innlogging er valgfritt. Vil du holde oversikt over oversettelses-sesjonene dine på tvers av enheter, logger du inn med Sunday-kontoen. Lyttere, lydpult og tolk trenger fortsatt ingen innlogging.",
  emailLabel: "E-post",
  emailPlaceholder: "deg@menigheten.no",
  sendMagicLink: "Send innloggingslenke",
  sending: "Sender …",
  magicLinkSent: "Sjekk innboksen din — vi har sendt deg en innloggingslenke.",
  signInWithSunday: "Logg inn med Sunday-konto",
  signInWithGoogle: "Logg inn med Google",
  loginError: "Klarte ikke å sende lenken — sjekk adressen og prøv igjen.",
  backToStart: "Tilbake til forsiden",

  // dashboard
  dashTitle: "Mine oversettelses-sesjoner",
  dashLede: "Sesjoner du har startet mens du var innlogget.",
  newSession: "Start ny sesjon",
  signOut: "Logg ut",
  noSessions:
    "Du har ingen lagrede sesjoner ennå. Start en ny — den dukker opp her.",
  open: "Åpne",
  manage: "Administrer",
  del: "Slett",
  deleting: "Sletter …",
  confirmDelete:
    "Slette denne sesjonen for godt? Lyttere kobles fra og PIN-koden frigjøres.",
  statusLive: "Aktiv",
  statusEnded: "Avsluttet",
  created: "Opprettet",
  expires: "Utløper",
  pinLabel: "PIN",
  loadError: "Kunne ikke laste sesjonene. Prøv igjen.",
  deleteError: "Kunne ikke slette sesjonen. Prøv igjen.",
  untitled: "(uten navn)",

  // landing link
  hostLink: "Driver du oversettelsen? Logg inn",
} as const;

export type HostStrings = typeof hostStrings;
