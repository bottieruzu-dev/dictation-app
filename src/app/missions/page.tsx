"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface Mission {
  key: string;
  category: "daily" | "achievement";
  title: string;
  target: number;
  rewardOrbs: number;
  progress: number;
  completed: boolean;
  claimed: boolean;
}

export default function MissionsPage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [orbBalance, setOrbBalance] = useState(0);
  const [activeTab, setActiveTab] = useState<"daily" | "achievement">("daily");
  const [missions, setMissions] = useState<Mission[]>([]);

  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSignedIn(!!data.session);
    });
  }, [supabase]);

  const loadMissions = async () => {
    if (!signedIn) return;
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // オーブ残高取得
    const { data: bal } = await supabase
      .from("orb_balance")
      .select("balance")
      .eq("owner_id", user.id)
      .maybeSingle();

    setOrbBalance(bal?.balance || 0);

    // 今日（UTC日付）
    const todayStr = new Date().toISOString().split("T")[0];

    // 各種進捗データのリアルタイムカウント
    // 1. 今日のセッション数
    const { count: todaySessions } = await supabase
      .from("play_sessions")
      .select("*", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .gte("started_at", `${todayStr}T00:00:00Z`);

    // 2. 総セッション数
    const { count: totalSessions } = await supabase
      .from("play_sessions")
      .select("*", { count: "exact", head: true })
      .eq("owner_id", user.id);

    // 3. 今日の動画インジェスト数
    const { count: todayVideos } = await supabase
      .from("videos")
      .select("*", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .gte("created_at", `${todayStr}T00:00:00Z`);

    // 4. 今日のクリップ作成数
    const { count: todayClips } = await supabase
      .from("clips")
      .select("*", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .gte("created_at", `${todayStr}T00:00:00Z`);

    // 5. 今日の間違いノート復習数
    const { count: todayHistoryReview } = await supabase
      .from("attempts")
      .select("*", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .gte("created_at", `${todayStr}T00:00:00Z`);

    // 6. 図鑑収集数
    const { count: totalMonsters } = await supabase
      .from("user_monsters")
      .select("*", { count: "exact", head: true })
      .eq("owner_id", user.id);

    // 7. デッキ平均レアリティ算定
    const { data: partyList } = await supabase
      .from("party")
      .select("monsters(rarity)")
      .eq("owner_id", user.id);

    let avgRarity = 0;
    if (partyList && partyList.length > 0) {
      const sum = partyList.reduce((acc: number, p: any) => acc + (p.monsters?.rarity || 1), 0);
      avgRarity = sum / partyList.length;
    }

    // DBに保存されている受取済みステータス取得
    const { data: dbMissions } = await supabase
      .from("user_missions")
      .select("*")
      .eq("owner_id", user.id);

    const claimedKeys = new Set(
      (dbMissions || []).filter((m) => m.claimed).map((m) => m.mission_key)
    );

    // ミッション定義一覧
    const rawMissions: Mission[] = [
      // 🌞 デイリーミッション
      { key: `daily_login_${todayStr}`, category: "daily", title: "ログインする", target: 1, rewardOrbs: 1, progress: 1, completed: true, claimed: claimedKeys.has(`daily_login_${todayStr}`) },
      { key: `daily_study_1_${todayStr}`, category: "daily", title: "学習を1回行う", target: 1, rewardOrbs: 1, progress: todaySessions || 0, completed: (todaySessions || 0) >= 1, claimed: claimedKeys.has(`daily_study_1_${todayStr}`) },
      { key: `daily_study_3_${todayStr}`, category: "daily", title: "学習を3回行う", target: 3, rewardOrbs: 1, progress: todaySessions || 0, completed: (todaySessions || 0) >= 3, claimed: claimedKeys.has(`daily_study_3_${todayStr}`) },
      { key: `daily_clip_1_${todayStr}`, category: "daily", title: "クリップを1つ生成する", target: 1, rewardOrbs: 1, progress: todayClips || 0, completed: (todayClips || 0) >= 1, claimed: claimedKeys.has(`daily_clip_1_${todayStr}`) },
      { key: `daily_video_1_${todayStr}`, category: "daily", title: "新規YouTube動画を1回取り込む", target: 1, rewardOrbs: 1, progress: todayVideos || 0, completed: (todayVideos || 0) >= 1, claimed: claimedKeys.has(`daily_video_1_${todayStr}`) },
      { key: `daily_history_1_${todayStr}`, category: "daily", title: "間違いノートで学習1回", target: 1, rewardOrbs: 1, progress: todayHistoryReview || 0, completed: (todayHistoryReview || 0) >= 1, claimed: claimedKeys.has(`daily_history_1_${todayStr}`) },

      // 🏆 全体ミッション（累積実績）
      { key: "achieve_study_100", category: "achievement", title: "学習を100回達成", target: 100, rewardOrbs: 10, progress: totalSessions || 0, completed: (totalSessions || 0) >= 100, claimed: claimedKeys.has("achieve_study_100") },
      { key: "achieve_study_500", category: "achievement", title: "学習を500回達成", target: 500, rewardOrbs: 100, progress: totalSessions || 0, completed: (totalSessions || 0) >= 500, claimed: claimedKeys.has("achieve_study_500") },
      { key: "achieve_rarity_3", category: "achievement", title: "パーティの平均レアリティ3以上達成", target: 3, rewardOrbs: 10, progress: Math.floor(avgRarity), completed: avgRarity >= 3, claimed: claimedKeys.has("achieve_rarity_3") },
      { key: "achieve_rarity_5", category: "achievement", title: "パーティの平均レアリティ5以上達成", target: 5, rewardOrbs: 100, progress: Math.floor(avgRarity), completed: avgRarity >= 5, claimed: claimedKeys.has("achieve_rarity_5") },
      { key: "achieve_dex_20", category: "achievement", title: "モンスター図鑑20体埋める", target: 20, rewardOrbs: 10, progress: totalMonsters || 0, completed: (totalMonsters || 0) >= 20, claimed: claimedKeys.has("achieve_dex_20") },
      { key: "achieve_dex_50", category: "achievement", title: "モンスター図鑑50体埋める", target: 50, rewardOrbs: 10, progress: totalMonsters || 0, completed: (totalMonsters || 0) >= 50, claimed: claimedKeys.has("achieve_dex_50") },
      { key: "achieve_dex_100", category: "achievement", title: "モンスター図鑑100体埋める", target: 100, rewardOrbs: 100, progress: totalMonsters || 0, completed: (totalMonsters || 0) >= 100, claimed: claimedKeys.has("achieve_dex_100") },
    ];

    setMissions(rawMissions);
    setLoading(false);
  };

  useEffect(() => {
    void loadMissions();
  }, [signedIn]);

  // オーブ報酬受取処理
  const handleClaimReward = async (m: Mission) => {
    if (!m.completed || m.claimed) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // オーブ加算
    await supabase.from("orb_ledger").insert({
      owner_id: user.id,
      delta: m.rewardOrbs,
      reason: `mission:${m.key}`,
    });

    // 受取フラグ保存
    await supabase.from("user_missions").upsert({
      owner_id: user.id,
      mission_key: m.key,
      category: m.category,
      progress: m.progress,
      target: m.target,
      completed: true,
      claimed: true,
    });

    void loadMissions();
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-950 text-cyan-400 p-8 text-center text-xs font-mono">LOADING MISSION DATA...</div>;
  }

  const currentMissions = missions.filter((m) => m.category === activeTab);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 font-sans py-6 px-4 max-w-2xl mx-auto space-y-5">
      
      {/* ヘッダー */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🎯</span>
          <div>
            <h1 className="text-base font-black text-white">ミッションセンター</h1>
            <p className="text-[10px] text-slate-400 font-mono">クリアしてオーブ（💎）を大量獲得しよう！</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-slate-900 border border-cyan-500/40 px-3 py-1.5 rounded-xl font-mono text-xs">
            💎 <strong className="text-cyan-300">{orbBalance}</strong> 個
          </div>
          <Link href="/" className="text-xs text-cyan-400 font-bold hover:underline">
            ◀ ダッシュボード
          </Link>
        </div>
      </div>

      {/* タブ切り替え */}
      <div className="flex border-b border-slate-800">
        <button
          onClick={() => setActiveTab("daily")}
          className={`flex-1 py-2.5 font-black text-xs text-center border-b-2 transition-colors ${
            activeTab === "daily" ? "border-cyan-400 text-cyan-400 bg-cyan-950/30" : "border-transparent text-slate-500"
          }`}
        >
          🌞 デイリーミッション (毎日更新)
        </button>
        <button
          onClick={() => setActiveTab("achievement")}
          className={`flex-1 py-2.5 font-black text-xs text-center border-b-2 transition-colors ${
            activeTab === "achievement" ? "border-amber-400 text-amber-400 bg-amber-950/30" : "border-transparent text-slate-500"
          }`}
        >
          🏆 全体ミッション (実績)
        </button>
      </div>

      {/* ミッションカード一覧 */}
      <div className="space-y-3">
        {currentMissions.map((m) => {
          const currentProg = Math.min(m.progress, m.target);
          const percent = Math.min(100, Math.round((currentProg / m.target) * 100));

          return (
            <div
              key={m.key}
              className={`p-4 rounded-2xl border flex items-center justify-between gap-3 shadow-lg transition-all ${
                m.claimed
                  ? "bg-slate-950/60 border-slate-800/80 opacity-50"
                  : m.completed
                  ? "bg-gradient-to-r from-slate-900 via-cyan-950/40 to-slate-900 border-cyan-500 shadow-cyan-950/30"
                  : "bg-slate-900/80 border-slate-800"
              }`}
            >
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-white truncate">{m.title}</span>
                  <span className="text-[10px] font-mono text-cyan-300 bg-cyan-950 border border-cyan-800 px-2 py-0.2 rounded-full shrink-0">
                    💎 +{m.rewardOrbs}個
                  </span>
                </div>

                {/* ゲージ */}
                <div className="space-y-0.5">
                  <div className="flex justify-between text-[9px] font-mono text-slate-400">
                    <span>PROGRESS</span>
                    <span>{currentProg} / {m.target}</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                    <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500" style={{ width: `${percent}%` }} />
                  </div>
                </div>
              </div>

              {/* 受取アクションボタン */}
              <div className="shrink-0">
                {m.claimed ? (
                  <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                    受取済み
                  </span>
                ) : m.completed ? (
                  <button
                    onClick={() => handleClaimReward(m)}
                    className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 active:scale-95 text-black font-black text-xs rounded-xl shadow-lg shadow-teal-950 animate-bounce"
                  >
                    💎 受取る
                  </button>
                ) : (
                  <span className="text-[10px] font-mono text-slate-500 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                    未達成
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

    </main>
  );
}