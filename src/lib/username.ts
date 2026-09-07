// Staff sign in with a plain username. Firebase Auth requires an email, so
// usernames are mapped to a synthetic, non-routable address of the form
// "<username>@samnan.local" everywhere a Firebase Auth email is needed
// (client sign-in, the admin employee API routes, and the seed script).
export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@samnan.local`;
}
