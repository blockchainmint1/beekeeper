/**
 * Vault password policy.
 *
 * The vault is encrypted on the device, so the only thing standing between a
 * stolen phone backup and the seed is PBKDF2 cost times password entropy. Ten
 * characters is the floor, plus checks that catch the passwords that get
 * cracked in seconds regardless of iteration count.
 *
 * Only applied when SETTING a password. Unlocking never re-validates, so
 * existing wallets created under the old 8-char rule keep working.
 */

export const MIN_PASSWORD_LENGTH = 10;

const COMMON = new Set([
  "password", "password1", "password123", "passw0rd", "12345678", "123456789",
  "1234567890", "qwertyuiop", "qwerty123", "letmein", "iloveyou", "admin123",
  "welcome1", "welcome123", "monkey123", "dragon123", "football", "baseball",
  "sunshine", "princess", "abc12345", "trustno1", "starwars", "whatever",
  "bitcoin", "bitcoin123", "cryptocurrency", "seedphrase", "beekeeper",
  "honestmoney", "texitcoin", "nectarpay",
]);

export type PasswordVerdict = {
  ok: boolean;
  /** 0-4, for a meter. */
  score: number;
  label: "too short" | "weak" | "fair" | "good" | "strong";
  problems: string[];
};

export function checkPassword(password: string): PasswordVerdict {
  const problems: string[] = [];
  const pw = password ?? "";
  const normalized = pw.toLowerCase().replace(/[^a-z0-9]/g, "");

  if (pw.length < MIN_PASSWORD_LENGTH) {
    problems.push(`Use at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (COMMON.has(normalized)) {
    problems.push("This is a well-known password — pick something else");
  }
  if (/^(.)\1+$/.test(pw)) {
    problems.push("Don't repeat a single character");
  }
  if (/^(?:0123456789|1234567890|abcdefghij|qwertyuiop)/i.test(pw)) {
    problems.push("Avoid keyboard or number runs");
  }

  const classes =
    (/[a-z]/.test(pw) ? 1 : 0) +
    (/[A-Z]/.test(pw) ? 1 : 0) +
    (/[0-9]/.test(pw) ? 1 : 0) +
    (/[^A-Za-z0-9]/.test(pw) ? 1 : 0);

  let score = 0;
  if (pw.length >= MIN_PASSWORD_LENGTH) score = 1;
  if (pw.length >= 12 && classes >= 2) score = 2;
  if (pw.length >= 14 && classes >= 3) score = 3;
  if (pw.length >= 18 || (pw.length >= 16 && classes >= 3)) score = 4;
  if (problems.length) score = Math.min(score, 1);

  const label: PasswordVerdict["label"] =
    pw.length < MIN_PASSWORD_LENGTH
      ? "too short"
      : (["weak", "weak", "fair", "good", "strong"] as const)[score];

  return { ok: problems.length === 0, score, label, problems };
}

/** Throws with the first problem, for non-UI call sites. */
export function assertPasswordPolicy(password: string): void {
  const verdict = checkPassword(password);
  if (!verdict.ok) throw new Error(verdict.problems[0]);
}
