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

const TIER_MULT: Record<string, number> = {
  "初級": 0.7,
  "中級": 1.0,
  "上級": 1.15,
  "超上級": 1.3,
  "超絶": 1.5,
};

const DECAY = [1.0, 0.85, 0.70, 0.55, 0.40];

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

  let body: {
    clipId: string;
    rawAccuracy: number;
    blankTotal: number;
    blankFilled: number;
  };

  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { clipId, rawAccuracy, blankTotal, blankFilled } = body;

  // 1. クリップ情報の取得
  const { data: clip, error: clipErr } = await supabase
    .from("clips")
    .select("*, monsters(*)")
    .eq("id", clipId)
    .single();

  if (clipErr || !clip) {
    return new Response(JSON.stringify({ error: "クリップが見つかりません" }), {
      status: 404,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let monster = clip.monsters;
  if (!monster) {
    const { data: allMonsters } = await supabase.from("monsters").select("*");
    if (allMonsters && allMonsters.length > 0) {
      monster = allMonsters[Math.floor(Math.random() * allMonsters.length)];
      await supabase.from("clips").update({ monster_id: monster.id }).eq("id", clipId);
    }
  }

  // 2. パーティの EAR (聴力) ステータス加算計算 (仕様書 4 準拠)
  const { data: partyList } = await supabase
    .from("party")
    .select("monster_id, monsters(*)")
    .eq("owner_id", user.id);

  let earSum = 0;
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
      earSum += Math.round((p.monsters as any).stat_ear * mult);
    }
  }

  const earBonusPt = Math.min(20.0, earSum * 0.006);

  // 3. プレイ回数取得
  const todayStr = new Date().toISOString().split("T")[0];
  const { count: todayCount } = await supabase
    .from("play_sessions")
    .select("*", { count: "exact", head: true })
    .eq("owner_id", user.id)
    .eq("clip_id", clipId)
    .gte("started_at", `${todayStr}T00:00:00Z`);

  const playIndexToday = (todayCount ?? 0) + 1;

  // 4. 初クリア判定
  const { count: totalClearCount } = await supabase
    .from("play_sessions")
    .select("*", { count: "exact", head: true })
    .eq("owner_id", user.id)
    .eq("clip_id", clipId);

  const isFirstClear = (totalClearCount ?? 0) === 0;

  // 5. ドロップ率計算
  let dropRate = 0;

  if (blankFilled >= blankTotal && blankTotal > 0) {
    if (isFirstClear) {
      dropRate = 100.0;
    } else {
      let base = 10;
      if (rawAccuracy >= 100) base = 100;
      else if (rawAccuracy >= 95) base = 85;
      else if (rawAccuracy >= 90) base = 70;
      else if (rawAccuracy >= 80) base = 55;
      else if (rawAccuracy >= 70) base = 40;
      else if (rawAccuracy >= 60) base = 28;
      else if (rawAccuracy >= 50) base = 18;

      const tierMult = TIER_MULT[clip.difficulty_tier ?? "中級"] ?? 1.0;
      const decayMult = DECAY[Math.min(playIndexToday - 1, DECAY.length - 1)];

      dropRate = Math.max(0, Math.min(100, base * tierMult * decayMult + earBonusPt));
    }
  }

  // 6. 抽選
  const rand = Math.random() * 100;
  const isDropped = rand < dropRate;

  let newLuck = 1;
  if (isDropped && monster) {
    const { data: existing } = await supabase
      .from("user_monsters")
      .select("luck, total_obtained")
      .eq("owner_id", user.id)
      .eq("monster_id", monster.id)
      .maybeSingle();

    if (existing) {
      newLuck = Math.min(99, existing.luck + 1);
      await supabase
        .from("user_monsters")
        .update({
          luck: newLuck,
          total_obtained: existing.total_obtained + 1,
          lucky_max_at: newLuck === 99 ? new Date().toISOString() : null,
        })
        .eq("owner_id", user.id)
        .eq("monster_id", monster.id);
    } else {
      await supabase.from("user_monsters").insert({
        owner_id: user.id,
        monster_id: monster.id,
        luck: 1,
        total_obtained: 1,
      });
    }
  }

  // 7. 保存
  await supabase.from("play_sessions").insert({
    owner_id: user.id,
    clip_id: clipId,
    blank_total: blankTotal,
    blank_filled: blankFilled,
    correct_count: Math.round((rawAccuracy / 100) * blankTotal),
    raw_accuracy: rawAccuracy,
    adjusted_accuracy: rawAccuracy,
    drop_rate_used: dropRate,
    dropped_count: isDropped ? 1 : 0,
    is_first_clear: isFirstClear,
    play_index_today: playIndexToday,
  });

  return new Response(
    JSON.stringify({
      isDropped,
      dropRateUsed: Math.round(dropRate),
      monster,
      newLuck,
      isFirstClear,
    }),
    { headers: { ...cors, "Content-Type": "application/json" } }
  );
});