import { z } from "zod";
import { businessProfileUrl } from "@/lib/site-config";
import { serverEnv } from "@/lib/server-env";
const ratings: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
const schema = z.object({ averageRating: z.number().min(0).max(5).optional(), totalReviewCount: z.number().nonnegative().optional(), reviews: z.array(z.object({ reviewId: z.string(), reviewer: z.object({ displayName: z.string().optional(), isAnonymous: z.boolean().optional() }).optional(), starRating: z.enum(["ONE", "TWO", "THREE", "FOUR", "FIVE"]), comment: z.string().optional(), createTime: z.string().datetime() })).optional() });
let cached: { expires: number; data: object } | null = null;
export async function GET() {
  const environment = await serverEnv();
  const { GOOGLE_BUSINESS_ACCOUNT_ID: account, GOOGLE_BUSINESS_LOCATION_ID: location, GOOGLE_OAUTH_CLIENT_ID: clientId, GOOGLE_OAUTH_CLIENT_SECRET: clientSecret, GOOGLE_OAUTH_REFRESH_TOKEN: refreshToken } = environment;
  if (!account || !location || !clientId || !clientSecret || !refreshToken) return Response.json({ status: "not_configured" });
  if (!/^\d+$/.test(account) || !/^\d+$/.test(location)) return Response.json({ status: "unavailable" }, { status: 503 });
  if (cached && cached.expires > Date.now()) return Response.json(cached.data);
  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }), signal: AbortSignal.timeout(10000) });
    if (!tokenResponse.ok) throw new Error("OAuth unavailable");
    const token = z.object({ access_token: z.string().min(1) }).parse(await tokenResponse.json());
    const response = await fetch(`https://mybusiness.googleapis.com/v4/accounts/${account}/locations/${location}/reviews?pageSize=6&orderBy=updateTime%20desc`, { headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("Reviews unavailable");
    const result = schema.parse(await response.json());
    const configuredUrl = environment.GOOGLE_BUSINESS_PROFILE_URL || businessProfileUrl;
    let profileUrl: string | undefined;
    if (configuredUrl) { const parsed = new URL(configuredUrl); if (parsed.protocol === "https:" && ["google.com", "www.google.com", "maps.google.com", "maps.app.goo.gl", "g.page", "share.google"].includes(parsed.hostname)) profileUrl = parsed.href; }
    const data = { status: "ready", average: result.averageRating ?? 0, count: result.totalReviewCount ?? 0, profileUrl, reviews: (result.reviews ?? []).map(review => ({ id: review.reviewId, author: review.reviewer?.isAnonymous ? "Viajante" : review.reviewer?.displayName || "Viajante", rating: ratings[review.starRating], text: review.comment ?? "", date: review.createTime })) };
    cached = { expires: Date.now() + 300000, data };
    return Response.json(data);
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
