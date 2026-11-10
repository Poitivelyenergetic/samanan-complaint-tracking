import { phoneDigitsOnly, toLatinDigits } from "./phone";

// Looking up other people's complaints by the customer's phone number (see
// /api/complaints/by-phone): only with the whole number, never part of it,
// so nobody can browse everyone's complaints by typing "05". A Saudi mobile
// is 9 digits after the leading 0 / 966 — so a search counts as a full
// number once it's all digits (spaces, dashes and a + aside) and has at
// least 9 of them. Gives back the number's last 9 digits, or null.
export function fullPhoneKey(input: string): string | null {
  const trimmed = toLatinDigits(input.trim());
  if (!trimmed || /[^\d\s+()-]/.test(trimmed)) return null;
  const digits = phoneDigitsOnly(trimmed);
  return digits.length >= 9 ? digits.slice(-9) : null;
}

// Every way a number ending in these 9 digits might have been saved: with
// a 0, without it, with 966 or +966 — in Latin digits or either kind of
// Arabic-Indic digits (older complaints kept whatever was typed).
export function phoneSpellings(key: string): string[] {
  const forms = [`0${key}`, key, `966${key}`, `+966${key}`];
  const spell = (s: string, zero: number) => s.replace(/[0-9]/g, (d) => String.fromCharCode(zero + Number(d)));
  return [...new Set(forms.flatMap((f) => [f, spell(f, 0x0660), spell(f, 0x06f0)]))];
}
