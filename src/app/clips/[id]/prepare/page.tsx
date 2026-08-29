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
    if (!id) return;

    async function fetchPrepareData() {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();

      // 1. クリップ情報・ドロップ対象モンスターの取得
      const { data: clipData } = await supabase
        .from("clips")
        .select("*, monsters(*)")
        .eq("id", id)
        .maybeSingle();

      if (clipData) {
        setClip(clipData as Clip);
      }

      // 2. 現在のパーティ編成3体を取得
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

  if (loading) {
    return <div className="min-h-screen bg-gray-950 text-white p-8 text-center text-sm font-mono">出撃データを確認中...</div>;
  }

  const targetMon = clip?.monsters;

  return (
    <main className="min-h-screen bg-gray-950 text-white py-8">
      <div className="max-w-md mx-auto px-4 space-y-5">
        
        {/* 上部ヘッダー */}
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <Link href="/" className="text-xs text-gray-400 hover:text-white font-bold">
            ← キャンセル
          </Link>
          <span className="text-xs font-black tracking-widest text-cyan-400 uppercase font-mono">
            STAGE SELECT
          </span>
          <div className="w-12"></div>
        </div>

        {/* クエスト情報カード */}
        <div className="bg-gradient-to-b from-gray-900 to-gray-950 border-2 border-indigo-600 rounded-2xl p-4 shadow-xl space-y-3 relative overflow-hidden">
          <div className="flex justify-between items-start border-b border-gray-800 pb-2">
            <div>
              <span className="bg-red-600 text-white font-black px-2.5 py-0.5 rounded text-[10px] uppercase tracking-wider">
                {clip?.difficulty_tier || '中級'} (SCORE: {clip?.difficulty_score ?? 0})
              </span>
              <h2 className="text-base font-black text-white mt-1.5 line-clamp-1">
                {clip?.label || 'ディクテーションクエスト'}
              </h2>
            </div>
          </div>

          {/* ドロップターゲット枠 */}
          {targetMon ? (
            <div className="bg-gray-900 p-2.5 rounded-xl border border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <img src={targetMon.image_url} alt={targetMon.name} className="w-12 h-12 object-cover rounded-lg border border-amber-500/50 shadow" />
                <div>
                  <div className="text-[10px] text-amber-400 font-bold">ドロップターゲット {"★".repeat(targetMon.rarity)}</div>
                  <div className="text-xs font-black text-white">{targetMon.name}</div>
                </div>
              </div>
              <div className="text-right text-[10px] text-cyan-300 font-mono font-bold">
                ☘️ 運極周回可
              </div>
            </div>
          ) : (
            <div className="text-xs text-gray-500 text-center py-2 font-mono">ターゲットモンスター未割り当て</div>
          )}
        </div>

        {/* 出撃デッキ表示 */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3 shadow-lg">
          <div className="flex justify-between items-center border-b border-gray-800 pb-2">
            <span className="text-xs font-black text-indigo-300 font-mono">
              ⚔️ 出撃デッキ (スロット 1〜3)
            </span>
            {/* ★ クリップIDを引き継いでパーティ画面へ遷移 */}
            <Link
              href={`/party?fromClip=${id}`}
              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold rounded-lg transition-colors"
            >
              編成を変更
            </Link>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((slotIdx) => {
              const m = partySlots[slotIdx];
              const luck = m && m.user_monsters && m.user_monsters.length > 0 ? m.user_monsters[0].luck : 0;

              return (
                <div
                  key={slotIdx}
                  className="bg-gray-950 border border-gray-800 rounded-xl p-2.5 text-center space-y-1.5 flex flex-col justify-between"
                >
                  <div className="text-[9px] text-gray-500 font-mono font-bold">
                    #{slotIdx + 1} {slotIdx === 0 && "👑"}
                  </div>

                  {m ? (
                    <>
                      <img src={m.image_url} alt={m.name} className="w-14 h-14 object-cover rounded-lg mx-auto border border-indigo-500/50" />
                      <div>
                        <div className="text-[9px] text-amber-400">{"★".repeat(m.rarity)}</div>
                        <div className="text-[11px] font-bold truncate">{m.name}</div>
                        <div className="text-[9px] text-cyan-300 font-mono">☘️ {luck}</div>
                      </div>
                    </>
                  ) : (
                    <div className="py-6 text-gray-700 text-xs font-bold">未設定</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ステータスサマリー */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-3.5 text-xs font-mono grid grid-cols-2 gap-2 text-gray-300">
          <div className="bg-gray-950 p-2 rounded-lg border border-gray-800">
            <span className="text-gray-500 block text-[9px]">知力 (INT)</span>
            <span className="text-sm font-black text-blue-400">{stats.int}</span>
            <span className="text-[9px] text-gray-400 block">XP: {stats.xpMult}倍</span>
          </div>
          <div className="bg-gray-950 p-2 rounded-lg border border-gray-800">
            <span className="text-gray-500 block text-[9px]">聴力 (EAR)</span>
            <span className="text-sm font-black text-green-400">{stats.ear}</span>
            <span className="text-[9px] text-gray-400 block">ドロップ: +{stats.earDropBonus}pt</span>
          </div>
        </div>

        {/* 出撃ボタン */}
        <button
          onClick={() => router.push(`/clips/${id}`)}
          className="w-full py-4 bg-gradient-to-r from-emerald-500 via-teal-600 to-cyan-600 hover:opacity-95 text-white font-black text-lg rounded-2xl shadow-2xl tracking-widest uppercase border border-cyan-400/30 transition-all flex items-center justify-center gap-2 animate-pulse"
        >
          <span>🔥 出 撃 （学習スタート）</span>
        </button>

      </div>
    </main>
  );
}