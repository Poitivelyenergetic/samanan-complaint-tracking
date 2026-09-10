// Shared by the forgot-password flow's client (formatting what the user
// types for Firebase's phone sign-in) and its API route (comparing the
// verified number against the account's phone-on-file).

export function phoneDigitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

// Arabic-Indic (٠-٩) and Eastern Arabic-Indic (۰-۹) digits map to their
// Latin equivalents — used on every phone number input site-wide so a
// number typed on an Arabic keyboard is still stored/displayed as 0-9,
// never as non-Latin digit glyphs.
const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const EASTERN_ARABIC_INDIC_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function toLatinDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (char) => {
    const arabicIndex = ARABIC_INDIC_DIGITS.indexOf(char);
    if (arabicIndex !== -1) return String(arabicIndex);
    const easternIndex = EASTERN_ARABIC_INDIC_DIGITS.indexOf(char);
    return easternIndex !== -1 ? String(easternIndex) : char;
  });
}

// Loose comparison rather than exact-string: staff phone numbers are stored
// as free text (e.g. local "05XXXXXXXX"), while a verified Firebase phone
// sign-in always comes back in E.164 ("+9665XXXXXXXX"). Comparing just the
// last 9 digits tolerates that mismatch without requiring every stored
// number to already be in E.164.
export function phoneNumbersMatch(a: string, b: string): boolean {
  const da = phoneDigitsOnly(a);
  const db = phoneDigitsOnly(b);
  const tailLength = 9;
  if (da.length < tailLength || db.length < tailLength) return false;
  return da.slice(-tailLength) === db.slice(-tailLength);
}

// Best-effort E.164 formatting for Saudi numbers — the only market this app
// currently targets. Left untouched if it already looks like E.164.
export function toE164SaudiPhone(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("+")) return trimmed;
  const local = phoneDigitsOnly(trimmed).replace(/^0+/, ""); // drop a leading trunk "0"
  return `+966${local}`;
}
