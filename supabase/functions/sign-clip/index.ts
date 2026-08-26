import { AwsClient } from "npm:aws4fetch@1.0.20";
import { createClient } from "npm:@supabase/supabase-js@2.47.10";

const R2_ACCOUNT_ID = Deno.env.get("R2_ACCOUNT_ID")!;
const R2_BUCKET = Deno.env.get("R2_BUCKET") ?? "dictation";
const SIGN_TTL_SEC = 7200; // 有効期限: 2時間

const r2 = new AwsClient({
  accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!,
  secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!,
  service: "s3",
  region: "auto",
});

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405, headers: cors });
  }

  // 1. ユーザー認証の確認
  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // 2. 入力データの形式チェック
  let body: { clipId?: string; kind?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const clipId = body.clipId ?? "";
  const kind = body.kind === "audio" ? "audio" : "video";
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(clipId)) {
    return new Response(JSON.stringify({ error: "invalid clipId" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // 3. データベースでの所有権チェック (RLS適用)
  const { data: asset, error: dbErr } = await supabase
    .from("clip_assets")
    .select("r2_video_key, r2_audio_key, r2_bucket")
    .eq("clip_id", clipId)
    .single();

  if (dbErr || !asset) {
    return new Response(JSON.stringify({ error: "not found" }), {
      status: 404,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const key = kind === "audio" ? asset.r2_audio_key : asset.r2_video_key;
  if (!key) {
    return new Response(JSON.stringify({ error: "asset not available" }), {
      status: 404,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // 4. Cloudflare R2 署名付きURLの生成
  const endpoint =
    `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/` +
    `${asset.r2_bucket ?? R2_BUCKET}/${key}`;

  const signed = await r2.sign(
    new Request(`${endpoint}?X-Amz-Expires=${SIGN_TTL_SEC}`, { method: "GET" }),
    { aws: { signQuery: true, allHeaders: false } },
  );

  return new Response(
    JSON.stringify({
      url: signed.url,
      kind,
      expiresAt: Date.now() + SIGN_TTL_SEC * 1000,
    }),
    { headers: { ...cors, "Content-Type": "application/json" } },
  );
});