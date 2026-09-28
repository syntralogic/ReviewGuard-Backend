/**
 * Minimal Google Business Profile client (OAuth + reviews) using plain fetch.
 * Endpoints: Account Management v1, Business Information v1, and the v4
 * reviews API (reviews.list is still served from mybusiness.googleapis.com/v4).
 */

const SCOPES = ["https://www.googleapis.com/auth/business.manage", "openid", "email"];

export class GoogleApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "GoogleApiError";
    this.status = status;
    this.code = code;
  }
}

export function googleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI,
  );
}

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline", // needed to receive a refresh token
    prompt: "consent", // force a refresh token even on re-connect
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  id_token?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      ...body,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, string>;
  if (!res.ok) {
    throw new GoogleApiError(json.error_description ?? json.error ?? "Token request failed", res.status, json.error);
  }
  return json as unknown as TokenResponse;
}

export function exchangeCode(code: string) {
  return tokenRequest({
    code,
    grant_type: "authorization_code",
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
  });
}

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const t = await tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });
  return t.access_token;
}

/** Email from the id_token (received directly from Google over TLS). */
export function emailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

async function gGet<T>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; status?: string } };
  if (!res.ok) {
    throw new GoogleApiError(json.error?.message ?? `Google API error (${res.status})`, res.status, json.error?.status);
  }
  return json as T;
}

export async function listAccounts(accessToken: string): Promise<{ name: string; accountName?: string }[]> {
  const r = await gGet<{ accounts?: { name: string; accountName?: string }[] }>(
    "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
    accessToken,
  );
  return r.accounts ?? [];
}

export async function listLocations(
  accountName: string,
  accessToken: string,
): Promise<{ name: string; title?: string }[]> {
  const r = await gGet<{ locations?: { name: string; title?: string }[] }>(
    `https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations?readMask=name,title&pageSize=100`,
    accessToken,
  );
  return r.locations ?? [];
}

export interface GoogleReview {
  externalId: string;
  reviewerName: string;
  rating: number;
  text: string;
  createdAt: string;
}

const STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

interface RawReview {
  reviewId?: string;
  name?: string;
  reviewer?: { displayName?: string; isAnonymous?: boolean };
  starRating?: string;
  comment?: string;
  createTime?: string;
}

/** Fetches every review of one location (all pages). */
export async function listAllReviews(
  accountName: string,
  locationName: string,
  accessToken: string,
): Promise<GoogleReview[]> {
  const out: GoogleReview[] = [];
  let pageToken: string | undefined;
  do {
    const qs = new URLSearchParams({ pageSize: "50", orderBy: "updateTime desc" });
    if (pageToken) qs.set("pageToken", pageToken);
    const r = await gGet<{ reviews?: RawReview[]; nextPageToken?: string }>(
      `https://mybusiness.googleapis.com/v4/${accountName}/${locationName}/reviews?${qs.toString()}`,
      accessToken,
    );
    for (const raw of r.reviews ?? []) {
      const id = raw.reviewId ?? raw.name?.split("/").pop();
      const rating = STARS[raw.starRating ?? ""];
      if (!id || !rating) continue;
      out.push({
        externalId: id,
        reviewerName: raw.reviewer?.isAnonymous ? "A Google user" : (raw.reviewer?.displayName ?? "A Google user"),
        rating,
        text: raw.comment?.trim() || "(No written review)",
        createdAt: raw.createTime ?? new Date().toISOString(),
      });
    }
    pageToken = r.nextPageToken;
  } while (pageToken);
  return out;
}
