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

// Or by the customer's full name, exactly as it was saved — only spaces and
// capital letters don't matter. Never part of a name, so typing "Ahmed"
// only finds customers called exactly "Ahmed". Gives back the name as a
// key to compare by (or null if it isn't a name: empty, or has digits).
export function fullNameKey(input: string): string | null {
  const name = input.trim().replace(/\s+/g, " ");
  if (name.length < 2 || /[0-9٠-٩۰-۹]/.test(name) || !/\p{L}/u.test(name)) return null;
  return name.toLowerCase();
}

// The ways that name might have been saved: as typed, all lower case, all
// capitals, or each word capitalised (Arabic has no capitals, so these are
// all the same for an Arabic name).
export function nameSpellings(input: string): string[] {
  const name = input.trim().replace(/\s+/g, " ");
  const title = name.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, sp: string, c: string) => sp + c.toUpperCase());
  return [...new Set([name, name.toLowerCase(), name.toUpperCase(), title])];
}

// What a search box holds, as one of the two: a full phone number, or a
// full name — with a key telling one search from the next.
export function lookupKey(input: string): string | null {
  const phone = fullPhoneKey(input);
  if (phone) return `phone:${phone}`;
  const name = fullNameKey(input);
  return name ? `name:${name}` : null;
}
