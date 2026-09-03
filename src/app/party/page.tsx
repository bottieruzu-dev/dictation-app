"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
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
  skill_code: string;
  user_monsters?: {
    luck: number;
  }[];
}

function PartyInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const fromClip = searchParams.get("fromClip");

  const [ownedMonsters, setOwnedMonsters] = useState<Monster[]>([]);
  const [partySlots, setPartySlots] = useState<(Monster | null)[]>([null, null, null]);
  const [draggedMonster, setDraggedMonster] = useState<Monster | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
    async function fetchPartyData() {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: mData } = await supabase
        .from("user_monsters")
        .select("monsters(*), luck")
        .eq("owner_id", user.id);

      if (mData) {
        const list: Monster[] = mData.map((item: any) => ({
          ...item.monsters,
          user_monsters: [{ luck: item.luck }],
        }));
        setOwnedMonsters(list);

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

      setLoading(false);
    }

    void fetchPartyData();
  }, [supabase]);

  const handleSelectMonster = (monster: Monster, targetSlotIndex: number) => {
    setMessage(null);
    const newSlots = [...partySlots];

    const existingIndex = newSlots.findIndex((s) => s?.id === monster.id);
    if (existingIndex !== -1) {
      newSlots[existingIndex] = null;
    }

    newSlots[targetSlotIndex] = monster;
    setPartySlots(newSlots);
  };

  const handleClearSlot = (slotIndex: number) => {
    setMessage(null);
    const newSlots = [...partySlots];
    newSlots[slotIndex] = null;
    setPartySlots(newSlots);
  };

  const handleDrop = (slotIdx: number) => {
    if (draggedMonster) {
      handleSelectMonster(draggedMonster, slotIdx);
      setDraggedMonster(null);
      setDragOverSlot(null);
    }
  };

  const handleSaveParty = async () => {
    setSaving(true);
    setMessage(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setMessage("ログインが必要です");
      setSaving(false);
      return;
    }

    try {
      await supabase.from("party").delete().eq("owner_id", user.id);

      // flatMap を使用して型推論から null を完全に排除
      const inserts = partySlots.flatMap((m, idx) =>
        m ? [{
          owner_id: user.id,
          slot: idx + 1,
          monster_id: m.id,
        }] : []
      );

      if (inserts.length > 0) {
        await supabase.from("party").insert(inserts);
      }

      if (fromClip) {
        setMessage("パーティを保存しました。出撃画面へ遷移します...");
        setTimeout(() => {
          router.push(`/clips/${fromClip}/prepare`);
        }, 600);
      } else {
        setMessage("パーティ編成を保存しました。");
      }
    } catch (err: any) {
      setMessage(`エラー: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

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

  return (
    <main className="min-h-screen pb-20 pt-4 px-3 sm:px-6">
      <div className="max-w-4xl mx-auto space-y-4">
        
        <div className="game-panel p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-sky-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
            </svg>
            <div>
              <h1 className="text-base font-black text-white">パーティ編成</h1>
              <p className="text-[10px] text-slate-400 font-mono mt-0.5">スロットへドラッグ＆ドロップして配置します</p>
            </div>
          </div>
          <Link
            href={fromClip ? `/clips/${fromClip}/prepare` : "/"}
            className="btn-game-blue text-xs px-3 py-1.5 rounded-xl flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
            </svg>
            <span>{fromClip ? "出撃確認" : "ホーム"}</span>
          </Link>
        </div>

        {/* スロット */}
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((slotIdx) => {
            const m = partySlots[slotIdx];
            const luck = m && m.user_monsters && m.user_monsters.length > 0 ? m.user_monsters[0].luck : 0;
            const isOver = dragOverSlot === slotIdx;

            return (
              <div
                key={slotIdx}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverSlot(slotIdx);
                }}
                onDragLeave={() => setDragOverSlot(null)}
                onDrop={() => handleDrop(slotIdx)}
                className={`game-panel p-3 text-center space-y-1.5 flex flex-col justify-between ${
                  isOver ? "border-sky-400 ring-2 ring-sky-500/40" : ""
                }`}
              >
                <div className="flex justify-between items-center text-[9px] font-mono text-slate-400">
                  <span>SLOT #{slotIdx + 1}</span>
                  {slotIdx === 0 && (
                    <span className="flex items-center gap-0.5 text-amber-400 font-bold">
                      <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
                        <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"/>
                      </svg>
                      <span>リーダー</span>
                    </span>
                  )}
                  {m && (
                    <button onClick={() => handleClearSlot(slotIdx)} className="text-red-400 hover:text-red-300">✕</button>
                  )}
                </div>

                {m ? (
                  <div className="space-y-1 py-1">
                    <img src={m.image_url} alt={m.name} className="w-14 h-14 object-cover rounded-lg mx-auto border border-[#2a4870]" />
                    <div className="text-[9px] text-amber-400 font-num">{"★".repeat(m.rarity)}</div>
                    <div className="text-xs font-bold text-white truncate">{m.name}</div>
                    <div className="text-[9px] text-sky-400 font-num flex items-center justify-center gap-0.5">
                      <svg className="w-2.5 h-2.5 text-emerald-400 fill-current" viewBox="0 0 24 24">
                        <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                      </svg>
                      <span>ラック: {luck}</span>
                    </div>
                  </div>
                ) : (
                  <div className="py-6 border-2 border-dashed border-[#213757] rounded-xl flex flex-col items-center justify-center gap-1 text-[10px] text-slate-500 font-mono">
                    <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 1.343-3 3s1.343 3 3 3 3-1.343 3-3-1.343-3-3-3zm0-4c-3.866 0-7 3.134-7 7s3.134 7 7 7 7-3.134 7-7-3.134-7-7-7z"/>
                    </svg>
                    <span>未配置</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {message && (
          <div className="p-2 bg-[#091524] border border-[#1b3652] text-sky-300 text-xs font-bold rounded-xl text-center">
            {message}
          </div>
        )}

        <button
          onClick={handleSaveParty}
          disabled={saving}
          className="w-full py-3 btn-game-yellow text-xs font-black rounded-xl shadow flex items-center justify-center gap-1.5"
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/>
          </svg>
          <span>{fromClip ? "保存して出撃準備へ" : "パーティ編成を保存する"}</span>
        </button>

        {/* 合計ステータス */}
        <div className="game-panel p-3.5 space-y-2">
          <h2 className="text-xs font-bold text-slate-300 border-b border-[#213757] pb-1 flex items-center gap-1.5">
            <svg className="w-4 h-4 text-sky-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
            </svg>
            <span>合計ステータス</span>
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-num">
            <div className="bg-[#09111c] p-2 rounded-lg border border-[#213757]">
              <span className="text-slate-400 text-[9px] block">INT (知力)</span>
              <span className="text-sm font-bold text-sky-400">{stats.int}</span>
            </div>
            <div className="bg-[#09111c] p-2 rounded-lg border border-[#213757]">
              <span className="text-slate-400 text-[9px] block">EAR (聴力)</span>
              <span className="text-sm font-bold text-emerald-400">{stats.ear}</span>
            </div>
            <div className="bg-[#09111c] p-2 rounded-lg border border-[#213757]">
              <span className="text-slate-400 text-[9px] block">VOC (語彙)</span>
              <span className="text-sm font-bold text-purple-400">{stats.voc}</span>
            </div>
          </div>
        </div>

        {/* 所持一覧 */}
        <div className="game-panel p-3.5 space-y-2">
          <h2 className="text-xs font-bold text-slate-300">所持モンスター一覧</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {ownedMonsters.map((m) => {
              const luck = m.user_monsters && m.user_monsters.length > 0 ? m.user_monsters[0].luck : 1;
              const setSlotIdx = partySlots.findIndex((s) => s?.id === m.id);

              return (
                <div
                  key={m.id}
                  draggable
                  onDragStart={() => setDraggedMonster(m)}
                  onDragEnd={() => setDraggedMonster(null)}
                  className={`bg-[#0a1220] border rounded-xl p-2 space-y-1 relative select-none cursor-grab active:cursor-grabbing ${
                    setSlotIdx !== -1 ? "border-sky-500 opacity-60" : "border-[#213757] hover:border-sky-400"
                  }`}
                >
                  {setSlotIdx !== -1 && (
                    <span className="absolute top-1.5 left-1.5 bg-sky-600 text-white font-num text-[8px] font-bold px-1 rounded">
                      SLOT #{setSlotIdx + 1}
                    </span>
                  )}
                  <img src={m.image_url} alt={m.name} className="w-12 h-12 object-cover rounded-lg mx-auto border border-[#1b2d47]" />
                  <div className="text-center">
                    <div className="text-xs font-bold truncate text-white">{m.name}</div>
                    <div className="text-[9px] text-sky-400 font-num flex items-center justify-center gap-0.5">
                      <svg className="w-2.5 h-2.5 text-emerald-400 fill-current" viewBox="0 0 24 24">
                        <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                      </svg>
                      <span>ラック: {luck}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-1 pt-1">
                    {[0, 1, 2].map((sIdx) => (
                      <button
                        key={sIdx}
                        onClick={() => handleSelectMonster(m, sIdx)}
                        className={`py-0.5 text-[8px] font-bold rounded ${
                          setSlotIdx === sIdx ? "bg-sky-600 text-white" : "bg-[#14233f] text-slate-300"
                        }`}
                      >
                        #{sIdx + 1}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </main>
  );
}

export default function PartyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#070c17] text-slate-400 p-8 text-center text-xs font-mono">LOADING...</div>}>
      <PartyInner />
    </Suspense>
  );
}