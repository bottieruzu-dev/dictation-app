"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface Monster {
  id: number;
  name: string;
  name_en: string;
  rarity: number;
  element: string;
  image_url: string;
  quote_ja?: string;
  stat_int: number;
  stat_ear: number;
  stat_voc: number;
  stat_foc: number;
  stat_luk: number;
  stat_gut: number;
  user_monsters?: {
    luck: number;
  }[];
}

interface Clip {
  id: string;
  label: string | null;
  difficulty_score?: number | null;
  difficulty_tier?: string | null;
  effective_wpm?: number | null;
  monster_id?: number | null;
  monsters?: Monster | null;
  videos?: {
    youtube_id: string;
    title: string;
  };
}

export default function PreparePage() {
  const params = useParams();
  const router = useRouter();
  const currentClipId = params?.id as string;

  const [currentClip, setCurrentClip] = useState<Clip | null>(null);
  const [allClips, setAllClips] = useState<Clip[]>([]);
  const [partySlots, setPartySlots] = useState<(Monster | null)[]>([null, null, null]);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  const getLuckMultiplier = (luck: number) => {
    if (luck >= 99) return 1.30;
    if (luck >= 90) return 1.22;
    if (luck >= 60) return 1.15;
    if (luck >= 30) return 1.08;
    if (luck >= 10) return 1.03;
    return 1.0;
  };

  useEffect(() => {
    if (!currentClipId) return;

    async function fetchPrepareData() {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();

      // 1. 全クリップリストの取得 (左側ステージリスト用)
      const { data: clipList } = await supabase
        .from("clips")
        .select("*, videos(youtube_id, title), monsters(*)")
        .order("created_at", { ascending: false });

      if (clipList) {
        setAllClips(clipList as Clip[]);
        const active = clipList.find((c) => c.id === currentClipId) as Clip;
        if (active) setCurrentClip(active);
      }

      // 2. 出撃パーティ3体の取得
      if (user) {
        const { data: mData } = await supabase
          .from("user_monsters")
          .select("monsters(*), luck")
          .eq("owner_id", user.id);

        if (mData) {
          const list: Monster[] = mData.map((item: any) => ({
            ...item.monsters,
            user_monsters: [{ luck: item.luck }],
          }));

          const { data: pData } = await supabase
            .from("party")
            .select("slot, monster_id")
            .eq("owner_id", user.id)
            .order("slot", { ascending: true });

          if (pData) {
            const slots: (Monster | null)[] = [null, null, null];
            pData.forEach((p) => {
              const found = list.find((m) => m.id === p.monster_id);
              if (found && p.slot >= 1 && p.slot <= 3) {
                slots[p.slot - 1] = found;
              }
            });
            setPartySlots(slots);
          }
        }
      }

      setLoading(false);
    }

    void fetchPrepareData();
  }, [currentClipId, supabase]);

  // パーティ合計ステータス計算
  const calculateTotalStats = () => {
    let intSum = 0, earSum = 0;
    partySlots.forEach((m) => {
      if (!m) return;
      const luck = m.user_monsters && m.user_monsters.length > 0 ? m.user_monsters[0].luck : 1;
      const mult = getLuckMultiplier(luck);
      intSum += Math.round(m.stat_int * mult);
      earSum += Math.round(m.stat_ear * mult);
    });

    return {
      xpMult: Math.min(2.5, 1.0 + intSum * 0.0008).toFixed(2),
      earDropBonus: Math.min(20.0, earSum * 0.006).toFixed(1),
    };
  };

  const getTierBadgeStyle = (tier?: string | null) => {
    switch (tier) {
      case "初級": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/50";
      case "中級": return "bg-cyan-500/20 text-cyan-400 border-cyan-500/50";
      case "上級": return "bg-amber-500/20 text-amber-400 border-amber-500/50";
      case "超上級": return "bg-purple-500/20 text-purple-400 border-purple-500/50";
      case "超絶": return "bg-red-500/20 text-red-400 border-red-500/50 animate-pulse";
      default: return "bg-slate-700/50 text-slate-300 border-slate-600";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-400 p-8 flex items-center justify-center text-xs font-mono tracking-widest">
        LOADING STAGE HUD...
      </div>
    );
  }

  const targetMon = currentClip?.monsters;
  const ytId = currentClip?.videos?.youtube_id;
  const thumbUrl = ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : null;
  const stats = calculateTotalStats();

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 font-sans p-4 sm:p-6 flex flex-col justify-between selection:bg-cyan-500 selection:text-black">
      
      {/* 画面トップ：ヘッダーナビゲーション */}
      <header className="flex items-center justify-between border-b border-slate-800/80 pb-3 mb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2 bg-slate-900 border border-slate-800 rounded-xl hover:bg-slate-800 text-slate-300 text-xs font-bold transition-all"
          >
            ◀ メインハブに戻る
          </Link>
          <h1 className="text-lg font-black tracking-wider uppercase flex items-center gap-2">
            <span>⚔️</span> クエスト出撃準備 (STAGE SELECT)
          </h1>
        </div>
      </header>

      {/* メインハブ 2カラム領域（画像1再現） */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 items-stretch">
        
        {/* ================= 左側：ダンジョン / クリップ選択リスト (4カラム) ================= */}
        <div className="lg:col-span-4 bg-slate-900/80 border border-slate-800/90 rounded-2xl p-4 flex flex-col space-y-3 shadow-2xl backdrop-blur-md max-h-[720px] overflow-y-auto">
          <div className="text-xs font-black tracking-widest text-slate-400 uppercase font-mono border-b border-slate-800 pb-2 flex justify-between">
            <span>SELECT STAGE</span>
            <span className="text-cyan-400">{allClips.length} STAGES</span>
          </div>

          <div className="space-y-2.5">
            {allClips.map((c) => {
              const isSelected = c.id === currentClipId;
              const mon = c.monsters;

              return (
                <div
                  key={c.id}
                  onClick={() => router.push(`/clips/${c.id}/prepare`)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 relative overflow-hidden ${
                    isSelected
                      ? "bg-gradient-to-r from-cyan-950/80 to-indigo-950/80 border-cyan-400/80 ring-2 ring-cyan-500/20 shadow-lg shadow-cyan-950/50"
                      : "bg-slate-950/60 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/60"
                  }`}
                >
                  {/* 選択時ハイライトサイドライン */}
                  {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-400" />}

                  <div className="space-y-1 flex-1 truncate pl-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-black font-mono border ${getTierBadgeStyle(c.difficulty_tier)}`}>
                        {c.difficulty_tier || "中級"}
                      </span>
                      {c.effective_wpm && (
                        <span className="text-[9px] text-slate-500 font-mono">WPM {c.effective_wpm}</span>
                      )}
                    </div>
                    <div className={`text-xs font-black truncate ${isSelected ? "text-cyan-300" : "text-slate-200"}`}>
                      {c.label || "無題のクリップ"}
                    </div>
                  </div>

                  {/* ターゲットモンスターのミニ枠 */}
                  {mon && (
                    <img src={mon.image_url} alt={mon.name} className="w-9 h-9 object-cover rounded-lg border border-slate-800 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ================= 右側：特大メインビジュアル ＆ 詳細パネル (8カラム) ================= */}
        <div className="lg:col-span-8 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between space-y-6 shadow-2xl relative overflow-hidden">
          
          {/* バックグラウンドシネマティックアート（グラデーションオーバーレイ） */}
          {thumbUrl && (
            <div className="absolute inset-0 z-0 pointer-events-none opacity-20 overflow-hidden">
              <img src={thumbUrl} alt="Background Art" className="w-full h-full object-cover filter blur-sm scale-110" />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent" />
            </div>
          )}

          <div className="relative z-10 space-y-5">
            {/* ステージタイトル ＆ 概要 */}
            <div className="space-y-2 border-b border-slate-800/80 pb-4">
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-xs font-black font-mono border ${getTierBadgeStyle(currentClip?.difficulty_tier)}`}>
                  {currentClip?.difficulty_tier || "中級"} (SCORE: {currentClip?.difficulty_score ?? 0})
                </span>
                <span className="text-xs font-mono text-cyan-400/80">RECOMMENDED SOLO STAGE</span>
              </div>
              <h2 className="text-2xl font-black text-white tracking-wide">
                {currentClip?.label || "ディクテーションダンジョン"}
              </h2>
              <p className="text-xs text-slate-400 font-mono leading-relaxed">
                動画原本: {currentClip?.videos?.title || "英語リスニングトレーニング"}
              </p>
            </div>

            {/* ドロップ報酬枠 (画像1・2再現：正方形メタリックアイコン並び) */}
            <div className="space-y-2.5">
              <div className="text-xs font-black text-slate-400 font-mono uppercase tracking-wider">
                🎁 クエストドロップ ＆ 獲得可能リソース
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                {/* ターゲットモンスター（ドロップ報酬） */}
                {targetMon ? (
                  <div className="bg-slate-950 border-2 border-amber-500/70 p-2.5 rounded-2xl flex items-center gap-3 shadow-lg shadow-amber-950/30">
                    <img src={targetMon.image_url} alt={targetMon.name} className="w-12 h-12 object-cover rounded-xl border border-amber-400" />
                    <div>
                      <div className="text-[9px] text-amber-400 font-bold">{"★".repeat(targetMon.rarity)}</div>
                      <div className="text-xs font-black text-white">{targetMon.name}</div>
                      <div className="text-[10px] text-cyan-400 font-mono">☘️ 100%完答でドロップ</div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-950 border border-slate-800 p-3 rounded-2xl text-xs text-slate-500 font-mono">
                    モンスター未割り当て
                  </div>
                )}

                {/* 経験値アイコン */}
                <div className="w-14 h-14 bg-slate-950 border border-purple-500/50 rounded-2xl flex flex-col items-center justify-center text-center shadow">
                  <span className="text-xs font-black text-purple-400 font-mono">EXP</span>
                  <span className="text-[9px] text-slate-400 font-mono">x {stats.xpMult}倍</span>
                </div>

                {/* オーブアイコン */}
                <div className="w-14 h-14 bg-slate-950 border border-cyan-500/50 rounded-2xl flex flex-col items-center justify-center text-center shadow">
                  <span className="text-base">💎</span>
                  <span className="text-[9px] text-cyan-300 font-mono">初回 +5</span>
                </div>
              </div>
            </div>

            {/* 出撃パーティデッキ枠 */}
            <div className="bg-slate-950/80 border border-slate-800/80 p-4 rounded-2xl space-y-2">
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="font-bold text-slate-400">⚔️ 出撃デッキメンバー</span>
                <span className="text-[10px] text-green-400">ドロップ加算 +{stats.earDropBonus}pt</span>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[0, 1, 2].map((sIdx) => {
                  const m = partySlots[sIdx];
                  const luck = m && m.user_monsters && m.user_monsters.length > 0 ? m.user_monsters[0].luck : 0;

                  return (
                    <div key={sIdx} className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl text-center space-y-1">
                      <div className="text-[9px] text-slate-500 font-mono">#{sIdx + 1} {sIdx === 0 && "👑"}</div>
                      {m ? (
                        <>
                          <img src={m.image_url} alt={m.name} className="w-10 h-10 object-cover rounded-lg mx-auto border border-indigo-500/50" />
                          <div className="text-[10px] font-bold text-slate-200 truncate">{m.name}</div>
                          <div className="text-[9px] text-cyan-300 font-mono">☘️ {luck}</div>
                        </>
                      ) : (
                        <div className="py-4 text-[10px] text-slate-600 font-bold">未設定</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 画面右下：アクション大型ボタン領域 (画像1再現) */}
          <div className="relative z-10 flex items-center justify-end gap-3 pt-4 border-t border-slate-800/80">
            {/* パーティ編成へ移動 */}
            <Link
              href={`/party?fromClip=${currentClipId}`}
              className="py-3.5 px-6 bg-slate-800 hover:bg-slate-700 active:translate-y-0.5 border border-slate-700 text-slate-200 font-black text-xs rounded-xl shadow-lg transition-all"
            >
              パーティ編成へ
            </Link>

            {/* ⚔️ 出撃開始 (マッチング・出撃) */}
            <button
              onClick={() => router.push(`/clips/${currentClipId}`)}
              className="py-3.5 px-8 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:opacity-95 active:translate-y-0.5 text-white font-black text-sm rounded-xl shadow-2xl shadow-indigo-950 border border-indigo-400/30 transition-all uppercase tracking-widest flex items-center gap-2 animate-pulse"
            >
              <span>⚔️ 出 撃 開 始</span>
            </button>
          </div>

        </div>

      </div>
    </main>
  );
}