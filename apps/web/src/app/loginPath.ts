// Where a signed-out visitor is sent, and how they get back. Three gates build
// this URL and LoginPage reads the parameter back out; it is one string in one
// place so the two ends cannot disagree about its name or its encoding.
export function loginPath(callbackUrl: string): string {
  return `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`
}
