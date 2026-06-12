/**
 * Best-effort "verified sender" check, the blue check Gmail shows next to
 * brands. Real verification is BIMI + a Verified Mark Certificate (a DNS record
 * and cert chain we can't read from the client), so this is a curated allowlist
 * of widely-recognized brands plus their subdomains. Treat it as a cosmetic
 * affordance, NOT a security signal — never gate trust decisions on it.
 */
const VERIFIED_DOMAINS = new Set([
  "google.com",
  "youtube.com",
  "github.com",
  "stripe.com",
  "ticketmaster.com",
  "linkedin.com",
  "amazon.com",
  "apple.com",
  "microsoft.com",
  "paypal.com",
  "x.com",
  "twitter.com",
  "meta.com",
  "facebook.com",
  "instagram.com",
  "discord.com",
  "slack.com",
  "notion.so",
  "figma.com",
  "vercel.com",
  "cloudflare.com",
  "openai.com",
  "anthropic.com",
  "netflix.com",
  "spotify.com",
  "uber.com",
  "airbnb.com",
  "dropbox.com",
  "atlassian.com",
  "shopify.com",
]);

/** True when the address's domain (or a parent of it) is a known brand. */
export function isVerifiedSender(address: string): boolean {
  const domain = address.split("@")[1]?.trim().toLowerCase();
  if (!domain) return false;
  const parts = domain.split(".");
  // mail.stripe.com → check "mail.stripe.com", "stripe.com", "com".
  for (let i = 0; i < parts.length - 1; i++) {
    if (VERIFIED_DOMAINS.has(parts.slice(i).join("."))) return true;
  }
  return false;
}
