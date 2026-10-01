export async function googleAccessToken(_encryptedRefreshToken: string) {
  throw new Error("google_not_configured");
}

export async function googleJson(_url: string, _accessToken: string, _init: RequestInit = {}) {
  throw new Error("google_not_configured");
}
