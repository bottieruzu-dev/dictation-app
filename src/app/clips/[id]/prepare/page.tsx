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
  monsters?: Monster | null;
}

export default function PreparePage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [clip, setClip] = useState<Clip | null>(null);
  const [partySlots, setPartySlots] = useState<(Monster | null)[]>([null, null, null]);
  const [loading, setLoading] = useState(true);

  const [speed, setSpeed] = useState<number>(1.0);

  const supabase = createClient();

  const getLuckMultiplier = (luck: number) => {
    if (luck >= 99) return 1.30;
    if (luck >= 90) return 1.22;
    if (luck >= 60) return 1.15;
    if (luck >= 30) return 1.08;
    if (luck >= 10) return 1.03;
    return 1.0;
  };

  const getDropMultiplier = (spd: number) => {
    const mult = 1.0 + (spd - 1.0) * 2.0;
    return Math.max(0.1, parseFloat(mult.toFixed(2)));
  };

  useEffect(() => {
    if (!id) return;

    async function fetchPrepareData() {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();

      const { data: clipData } = await supabase
        .from("clips")
        .select("*, monsters(*)")
        .eq("id", id)
        .maybeSingle();

      if (clipData) {
        setClip(clipData as Clip);
      }

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
  }, [id, supabase]);

  const calculateTotalStats = () => {
    let intSum = 0, earSum = 0, vocSum = 0, focSum = 0, lukSum = 0, gutSum = 0;

    partySlots.forEach((m) => {
      if (!m) return;
      const luck = m.user_monsters && m.user_monsters.length > 0 ? m.user_monsters[0].luck : 1;
      const mult = getLuckMultiplier(luck);

      intSum += Math.round(m.stat_int * mult);
      earSum += Math.round(m.stat_ear * mult);
      vocSum += Math.round(m.stat_voc * mult);
      focSum += Math.round(m.stat_foc * mult);
      lukSum += Math.round(m.stat_luk * mult);
      gutSum += Math.round(m.stat_gut * mult);
    });

    return {
      int: intSum,
      ear: earSum,
      voc: vocSum,
      foc: focSum,
      luk: lukSum,
      gut: gutSum,
      xpMult: Math.min(2.5, 1.0 + intSum * 0.0008).toFixed(2),
      earDropBonus: Math.min(20.0, earSum * 0.006).toFixed(1),
    };
  };

  const stats = calculateTotalStats();
  const dropMult = getDropMultiplier(speed);

  if (loading) {
    return <div className="min-h-screen bg-[#070c17] text-slate-400 p-8 text-center text-xs font-mono">LOADING PREPARE DATA...</div>;
  }

  const targetMon = clip?.monsters;

  return (
    <main className="min-h-screen pb-20 pt-4 px-3 sm:px-6">
      <div className="max-w-md mx-auto space-y-4">
        
        <div className="game-panel p-3.5 flex items-center justify-between">
          <Link href="/" className="text-xs text-slate-400 hover:text-white font-bold flex items-center gap-1">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
            </svg>
            <span>キャンセル</span>
          </Link>
          <span className="text-xs font-bold text-sky-400 uppercase font-num">
            STAGE SELECT
          </span>
          <div className="w-10"></div>
        </div>

        {/* クエスト情報 */}
        <div className="game-panel p-4 space-y-3">
          <div className="flex justify-between items-start border-b border-[#213757] pb-2">
            <div>
              <span className="bg-[#182b47] text-sky-300 font-bold px-2 py-0.5 rounded text-[10px] uppercase border border-[#2b4973]">
                {clip?.difficulty_tier || '中級'} (SCORE: {clip?.difficulty_score ?? 0})
              </span>
              <h2 className="text-base font-bold text-white mt-1.5 line-clamp-1">
                {clip?.label || 'ステージ'}
              </h2>
            </div>
          </div>

          {targetMon ? (
            <div className="bg-[#09111c] p-2.5 rounded-xl border border-[#213757] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <img src={targetMon.image_url} alt={targetMon.name} className="w-10 h-10 object-cover rounded-lg border border-[#2a4870]" />
                <div>
                  <div className="text-[9px] text-amber-400 font-bold font-num">{"★".repeat(targetMon.rarity)}</div>
                  <div className="text-xs font-bold text-white">{targetMon.name}</div>
                </div>
              </div>
              <div className="text-right text-[10px] text-sky-300 font-num font-bold">
                ドロップ対象
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-500 text-center py-1 font-mono">ターゲット未割り当て</div>
          )}
        </div>

        {/* 速度 ＆ 倍率 */}
        <div className="game-panel p-3.5 space-y-2.5">
          <div className="flex justify-between items-center border-b border-[#213757] pb-1.5">
            <span className="text-xs font-bold text-sky-300 font-num flex items-center gap-1">
              <svg className="w-4 h-4 text-amber-400 fill-current" viewBox="0 0 24 24">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
              </svg>
              <span>再生速度 ＆ ドロップ倍率</span>
            </span>
            <span className="text-xs font-bold font-num text-amber-300">
              ×{dropMult.toFixed(2)}
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs font-num">
              <span className="text-slate-400">速度: <strong className="text-white text-sm">{speed.toFixed(1)}x</strong></span>
            </div>

            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.1}
              value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
              className="w-full h-2 bg-[#09111c] rounded-lg appearance-none cursor-pointer accent-sky-400"
            />

            <div className="grid grid-cols-5 gap-1 pt-1">
              {[0.6, 0.8, 1.0, 1.2, 1.5].map((preset) => (
                <button
                  key={preset}
                  onClick={() => setSpeed(preset)}
                  className={`py-1 text-[10px] font-bold font-num rounded-lg transition-all ${
                    speed === preset ? 'bg-sky-600 text-white' : 'bg-[#0a1220] text-slate-300'
                  }`}
                >
                  {preset}x
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* デッキ */}
        <div className="game-panel p-3.5 space-y-2">
          <div className="flex justify-between items-center border-b border-[#213757] pb-1.5">
            <span className="text-xs font-bold text-slate-200 font-num">
              出撃デッキ
            </span>
            <Link
              href={`/party?fromClip=${id}`}
              className="px-2 py-0.5 bg-sky-700 hover:bg-sky-600 text-white text-[10px] font-bold rounded-lg"
            >
              変更
            </Link>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {[0, 1, 2].map((slotIdx) => {
              const m = partySlots[slotIdx];
              const luck = m && m.user_monsters && m.user_monsters.length > 0 ? m.user_monsters[0].luck : 0;

              return (
                <div key={slotIdx} className="bg-[#09111c] border border-[#213757] rounded-xl p-2 text-center space-y-1">
                  {m ? (
                    <>
                      <img src={m.image_url} alt={m.name} className="w-12 h-12 object-cover rounded-lg mx-auto border border-[#2a4870]" />
                      <div className="text-[9px] text-amber-400 font-num">{"★".repeat(m.rarity)}</div>
                      <div className="text-[10px] font-bold truncate text-white">{m.name}</div>
                      <div className="text-[8px] text-sky-300 font-num flex items-center justify-center gap-0.5">
                        <svg className="w-2.5 h-2.5 text-emerald-400 fill-current" viewBox="0 0 24 24">
                          <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                        </svg>
                        <span>{luck}</span>
                      </div>
                    </>
                  ) : (
                    <div className="py-5 text-slate-600 text-[10px] font-mono">未設定</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <button
          onClick={() => router.push(`/clips/${id}?speed=${speed}`)}
          className="w-full py-3.5 btn-game-yellow text-sm font-black rounded-2xl shadow uppercase tracking-wider flex items-center justify-center gap-1.5"
        >
          <svg className="w-4 h-4 text-slate-900 fill-current" viewBox="0 0 24 24">
            <path d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
            <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <span>試練開始</span>
        </button>

      </div>
    </main>
  );
}