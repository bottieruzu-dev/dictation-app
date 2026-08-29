import { createClient } from "npm:@supabase/supabase-js@2.47.10";

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function corsHeaders(origin: string | null): Record<string, string> {
  const isWildcard = ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.length === 0;
  const allow = isWildcard
    ? (origin ?? "*")
    : (origin && ALLOWED_ORIGINS.includes(origin) ? origin : "");

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

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // 1. オーブ残高の確認（1個必要）
  const { data: balanceData } = await supabase
    .from("orb_balance")
    .select("balance")
    .eq("owner_id", user.id)
    .single();

  const currentBalance = balanceData?.balance ?? 0;
  if (currentBalance < 1) {
    return new Response(JSON.stringify({ error: "オーブが不足しています（必要: 1個）" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // 2. フレンドガチャ風確率判定（★1: 65%, ★2: 25%, ★3: 9.5%, ★4: 0.5%）
  const rand = Math.random() * 100;
  let selectedRarity = 1;

  if (rand < 0.5) {
    selectedRarity = 4;
  } else if (rand < 0.5 + 9.5) {
    selectedRarity = 3;
  } else if (rand < 0.5 + 9.5 + 25.0) {
    selectedRarity = 2;
  } else {
    selectedRarity = 1;
  }

  // 3. モンスター抽選
  const { data: availableMonsters } = await supabase
    .from("monsters")
    .select("*")
    .eq("rarity", selectedRarity);

  if (!availableMonsters || availableMonsters.length === 0) {
    return new Response(JSON.stringify({ error: "該当するレアリティのモンスターが存在しません" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const monster = availableMonsters[Math.floor(Math.random() * availableMonsters.length)];

  // 4. オーブ1個消費処理
  await supabase.from("orb_ledger").insert({
    owner_id: user.id,
    delta: -1,
    reason: "friend_gacha_summon",
  });

  // 5. user_monsters（所持/ラック）更新
  const { data: existing } = await supabase
    .from("user_monsters")
    .select("luck, total_obtained")
    .eq("owner_id", user.id)
    .eq("monster_id", monster.id)
    .maybeSingle();

  let isNew = false;
  if (existing) {
    await supabase
      .from("user_monsters")
      .update({
        luck: Math.min(99, existing.luck + 1),
        total_obtained: existing.total_obtained + 1,
      })
      .eq("owner_id", user.id)
      .eq("monster_id", monster.id);
  } else {
    isNew = true;
    await supabase.from("user_monsters").insert({
      owner_id: user.id,
      monster_id: monster.id,
      luck: 1,
      total_obtained: 1,
    });
  }

  return new Response(
    JSON.stringify({
      monster,
      isNew,
      rarity: selectedRarity,
      remainingOrbs: currentBalance - 1,
    }),
    { headers: { ...cors, "Content-Type": "application/json" } }
  );
});