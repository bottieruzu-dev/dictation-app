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

    const { data: bal } = await supabase
      .from("orb_balance")
      .select("balance")
      .eq("owner_id", user.id)
      .maybeSingle();

    setOrbBalance(bal?.balance || 0);

    const todayStr = new Date().toISOString().split("T")[0];

    const { count: todaySessions } = await supabase
      .from("play_sessions")
      .select("*", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .gte("started_at", `${todayStr}T00:00:00Z`);

    const { count: totalSessions } = await supabase
      .from("play_sessions")
      .select("*", { count: "exact", head: true })
      .eq("owner_id", user.id);

    const { count: todayVideos } = await supabase
      .from("videos")
      .select("*", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .gte("created_at", `${todayStr}T00:00:00Z`);

    const { count: todayClips } = await supabase
      .from("clips")
      .select("*", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .gte("created_at", `${todayStr}T00:00:00Z`);

    const { count: todayHistoryReview } = await supabase
      .from("attempts")
      .select("*", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .gte("created_at", `${todayStr}T00:00:00Z`);

    const { count: totalMonsters } = await supabase
      .from("user_monsters")
      .select("*", { count: "exact", head: true })
      .eq("owner_id", user.id);

    const { data: partyList } = await supabase
      .from("party")
      .select("monsters(rarity)")
      .eq("owner_id", user.id);

    let avgRarity = 0;
    if (partyList && partyList.length > 0) {
      const sum = partyList.reduce((acc: number, p: any) => acc + (p.monsters?.rarity || 1), 0);
      avgRarity = sum / partyList.length;
    }

    const { data: dbMissions } = await supabase
      .from("user_missions")
      .select("*")
      .eq("owner_id", user.id);

    const claimedKeys = new Set(
      (dbMissions || []).filter((m) => m.claimed).map((m) => m.mission_key)
    );

    const rawMissions: Mission[] = [
      { key: `daily_login_${todayStr}`, category: "daily", title: "ログインする", target: 1, rewardOrbs: 1, progress: 1, completed: true, claimed: claimedKeys.has(`daily_login_${todayStr}`) },
      { key: `daily_study_1_${todayStr}`, category: "daily", title: "学習を1回行う", target: 1, rewardOrbs: 1, progress: todaySessions || 0, completed: (todaySessions || 0) >= 1, claimed: claimedKeys.has(`daily_study_1_${todayStr}`) },
      { key: `daily_study_3_${todayStr}`, category: "daily", title: "学習を3回行う", target: 3, rewardOrbs: 1, progress: todaySessions || 0, completed: (todaySessions || 0) >= 3, claimed: claimedKeys.has(`daily_study_3_${todayStr}`) },
      { key: `daily_clip_1_${todayStr}`, category: "daily", title: "クリップを1つ生成する", target: 1, rewardOrbs: 1, progress: todayClips || 0, completed: (todayClips || 0) >= 1, claimed: claimedKeys.has(`daily_clip_1_${todayStr}`) },
      { key: `daily_video_1_${todayStr}`, category: "daily", title: "新規YouTube動画を1回取り込む", target: 1, rewardOrbs: 1, progress: todayVideos || 0, completed: (todayVideos || 0) >= 1, claimed: claimedKeys.has(`daily_video_1_${todayStr}`) },
      { key: `daily_history_1_${todayStr}`, category: "daily", title: "間違いノートで学習1回", target: 1, rewardOrbs: 1, progress: todayHistoryReview || 0, completed: (todayHistoryReview || 0) >= 1, claimed: claimedKeys.has(`daily_history_1_${todayStr}`) },

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

  const handleClaimReward = async (m: Mission) => {
    if (!m.completed || m.claimed) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("orb_ledger").insert({
      owner_id: user.id,
      delta: m.rewardOrbs,
      reason: `mission:${m.key}`,
    });

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
    return <div className="min-h-screen bg-[#070c17] text-[#388bfd] p-8 text-center text-xs font-mono">LOADING MISSION DATA...</div>;
  }

  const currentMissions = missions.filter((m) => m.category === activeTab);

  return (
    <main className="min-h-screen pb-20 pt-4 px-3 sm:px-6">
      <div className="max-w-2xl mx-auto space-y-4">
        
        <div className="game-panel p-4 flex items-center justify-between">
          <div>
            <h1 className="text-base font-black text-white">試練任務</h1>
            <p className="text-[10px] text-slate-400 font-mono mt-0.5">達成してオーブを獲得</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-[#0b1424] border border-[#2d4d7a] px-3 py-1 rounded-xl text-xs font-bold text-cyan-200 font-num flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-cyan-400 fill-current" viewBox="0 0 24 24">
                <path d="M12 2L2 9l10 13 10-13-10-7zm0 3.2L18.6 9 12 18.2 5.4 9 12 5.2z"/>
              </svg>
              <span>{orbBalance}</span>
            </div>
            <Link href="/" className="btn-game-blue text-xs px-3 py-1.5 rounded-xl flex items-center gap-1">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
              </svg>
              <span>ホーム</span>
            </Link>
          </div>
        </div>

        <div className="flex border-b border-[#213757]">
          <button
            onClick={() => setActiveTab("daily")}
            className={`flex-1 py-2 font-bold text-xs text-center border-b-2 transition-all ${
              activeTab === "daily" ? "border-sky-400 text-sky-300 bg-[#162742]" : "border-transparent text-slate-500"
            }`}
          >
            デイリー任務
          </button>
          <button
            onClick={() => setActiveTab("achievement")}
            className={`flex-1 py-2 font-bold text-xs text-center border-b-2 transition-all ${
              activeTab === "achievement" ? "border-amber-400 text-amber-300 bg-[#2b2110]" : "border-transparent text-slate-500"
            }`}
          >
            全体実績
          </button>
        </div>

        <div className="space-y-2">
          {currentMissions.map((m) => {
            const currentProg = Math.min(m.progress, m.target);
            const percent = Math.min(100, Math.round((currentProg / m.target) * 100));

            return (
              <div
                key={m.key}
                className={`game-panel p-3 rounded-xl flex items-center justify-between gap-3 ${
                  m.claimed ? "opacity-40" : ""
                }`}
              >
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white truncate">{m.title}</span>
                    <span className="text-[9px] font-num text-cyan-300 bg-[#091829] border border-[#1b354d] px-2 py-0.2 rounded-full shrink-0 flex items-center gap-1">
                      <svg className="w-2.5 h-2.5 text-cyan-400 fill-current" viewBox="0 0 24 24">
                        <path d="M12 2L2 9l10 13 10-13-10-7zm0 3.2L18.6 9 12 18.2 5.4 9 12 5.2z"/>
                      </svg>
                      <span>+{m.rewardOrbs}</span>
                    </span>
                  </div>

                  <div className="space-y-0.5">
                    <div className="flex justify-between text-[8px] font-num text-slate-400">
                      <span>PROGRESS</span>
                      <span>{currentProg} / {m.target}</span>
                    </div>
                    <div className="w-full h-1.5 bg-[#08101c] rounded-full overflow-hidden border border-[#1e3458]">
                      <div className="h-full bg-gradient-to-r from-sky-400 to-emerald-400" style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                </div>

                <div className="shrink-0">
                  {m.claimed ? (
                    <span className="text-[9px] font-mono font-bold text-slate-500 bg-[#08101c] px-3 py-1.5 rounded-lg border border-[#1e3458]">
                      受取済
                    </span>
                  ) : m.completed ? (
                    <button
                      onClick={() => handleClaimReward(m)}
                      className="btn-game-yellow px-3 py-1.5 text-xs rounded-xl"
                    >
                      受取る
                    </button>
                  ) : (
                    <span className="text-[9px] font-mono text-slate-500 bg-[#08101c] px-3 py-1.5 rounded-lg border border-[#1e3458]">
                      未達成
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </main>
  );
}