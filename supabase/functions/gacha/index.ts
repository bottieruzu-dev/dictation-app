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

const getLuckMultiplier = (luck: number) => {
  if (luck >= 99) return 1.30;
  if (luck >= 90) return 1.22;
  if (luck >= 60) return 1.15;
  if (luck >= 30) return 1.08;
  if (luck >= 10) return 1.03;
  return 1.0;
};

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

  // 1. オーブ残高の確認
  const { data: balanceData } = await supabase
    .from("orb_balance")
    .select("balance")
    .eq("owner_id", user.id)
    .single();

  const currentBalance = balanceData?.balance ?? 0;
  if (currentBalance < 5) {
    return new Response(JSON.stringify({ error: "オーブが不足しています（必要: 5個）" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // 2. パーティの LUK (幸運) ステータス加算計算 (仕様書 4 準拠)
  const { data: partyList } = await supabase
    .from("party")
    .select("monster_id, monsters(*)")
    .eq("owner_id", user.id);

  let lukSum = 0;
  if (partyList) {
    for (const p of partyList) {
      if (!p.monsters) continue;
      const { data: uMon } = await supabase
        .from("user_monsters")
        .select("luck")
        .eq("owner_id", user.id)
        .eq("monster_id", p.monster_id)
        .maybeSingle();

      const luck = uMon?.luck ?? 1;
      const mult = getLuckMultiplier(luck);
      lukSum += Math.round((p.monsters as any).stat_luk * mult);
    }
  }

  const lukGachaBonusPt = Math.min(3.0, lukSum * 0.0012);

  // 3. 直近のピティ取得
  const { data: lastGacha } = await supabase
    .from("gacha_log")
    .select("pity_counter_4, pity_counter_5")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let pity4 = lastGacha?.pity_counter_4 ?? 0;
  let pity5 = lastGacha?.pity_counter_5 ?? 0;

  // 4. ガチャ確率計算 (仕様書 3.3 準拠)
  let pityBonus = 0;
  if (pity4 >= 5) {
    pityBonus = (pity4 - 4) * 4.0;
  }

  let baseHighRarityProb = Math.min(26.0, 12.0 + pityBonus + lukGachaBonusPt);
  if (pity4 >= 10) baseHighRarityProb = 100.0;

  const delta = Math.max(0, baseHighRarityProb - 12.0);
  let prob5 = 2.5 + delta * 0.2;
  let prob4 = 9.5 + delta * 0.8;

  if (pity5 >= 40) {
    prob5 = 100.0;
    prob4 = 0.0;
  }

  const rand = Math.random() * 100;
  let selectedRarity = 1;

  if (rand < prob5) {
    selectedRarity = 5;
  } else if (rand < prob5 + prob4) {
    selectedRarity = 4;
  } else if (rand < prob5 + prob4 + 20.0) {
    selectedRarity = 3;
  } else if (rand < prob5 + prob4 + 20.0 + 30.0) {
    selectedRarity = 2;
  } else {
    selectedRarity = 1;
  }

  // 5. モンスター抽選
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

  // 6. オーブ消費
  await supabase.from("orb_ledger").insert({
    owner_id: user.id,
    delta: -5,
    reason: "gacha_summon",
  });

  // 7. 所持更新
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

  // 8. ログ更新
  const newPity4 = selectedRarity >= 4 ? 0 : pity4 + 1;
  const newPity5 = selectedRarity === 5 ? 0 : pity5 + 1;

  await supabase.from("gacha_log").insert({
    owner_id: user.id,
    monster_id: monster.id,
    rarity: selectedRarity,
    pity_counter_4: newPity4,
    pity_counter_5: newPity5,
  });

  return new Response(
    JSON.stringify({
      monster,
      isNew,
      rarity: selectedRarity,
      remainingOrbs: currentBalance - 5,
    }),
    { headers: { ...cors, "Content-Type": "application/json" } }
  );
});