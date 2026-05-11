/**
 * Web OAuth client (user login + Drive). Not the service account.
 * Supports either naming style in .env.
 */
export function getGoogleOAuthWebCredentials(): { clientId: string; clientSecret: string } {
  const clientId = (
    process.env.GOOGLE_OAUTH_CLIENT_ID ||
    process.env.GOOGLE_CLIENT_ID ||
    ""
  ).trim();
  const clientSecret = (
    process.env.GOOGLE_OAUTH_CLIENT_SECRET ||
    process.env.GOOGLE_CLIENT_SECRET ||
    ""
  ).trim();
  if (!clientId || !clientSecret) {
    throw new Error(
      "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (or GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET)."
    );
  }
  return { clientId, clientSecret };
}
