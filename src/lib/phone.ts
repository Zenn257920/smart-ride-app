/**
 * B5 — one shared Myanmar phone normalisation, used everywhere a phone
 * is stored or looked up (register, login, phone-login).
 *
 * Register used to store only `trim()` and login looked the phone up
 * exactly, so `09123456789` registered and `09-123 456 789` typed at
 * login never matched. Normalising on both sides fixes that: the
 * stored form and the lookup form are always the same canonical
 * `09…` number.
 *
 * Rules:
 * - strip spaces, dashes and parentheses;
 * - a leading `+95` country code becomes the local `0` prefix
 *   (`+959123456789` -> `09123456789`); the same applies to a bare
 *   leading `95` (`959123456789` -> `09123456789`), i.e. +95 typed
 *   without the plus;
 * - anything else (emails, already-local numbers, garbage) passes
 *   through unchanged apart from the stripping, so callers can safely
 *   normalise an identifier before deciding whether it is a phone.
 */
export function normalizePhone(raw: string): string {
  const stripped = raw.trim().replace(/[\s\-()]/g, "");
  if (stripped.startsWith("+95")) {
    return `0${stripped.slice(3)}`;
  }
  if (
    stripped.startsWith("95") &&
    stripped.length > 9 &&
    stripped[2] === "9"
  ) {
    return `0${stripped.slice(2)}`;
  }
  return stripped;
}
