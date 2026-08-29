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
  const fromClip = searchParams.get("fromClip"); // 出撃元クリップID

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
      setMessage("🚨 ログインが必要です");
      setSaving(false);
      return;
    }

    try {
      await supabase.from("party").delete().eq("owner_id", user.id);

      const inserts = partySlots
        .map((m, idx) => {
          if (!m) return null;
          return {
            owner_id: user.id,
            slot: idx + 1,
            monster_id: m.id,
          };
        })
        .filter(Boolean);

      if (inserts.length > 0) {
        await supabase.from("party").insert(inserts);
      }

      // ★ 出撃元クリップID（fromClip）がある場合は、保存後にすぐ出撃画面へ復帰！
      if (fromClip) {
        setMessage("🎉 編成を保存しました！出撃画面へ戻ります...");
        setTimeout(() => {
          router.push(`/clips/${fromClip}/prepare`);
        }, 600);
      } else {
        setMessage("🎉 パーティ編成を保存しました！");
      }
    } catch (err: any) {
      setMessage(`🚨 エラー: ${err.message}`);
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
      vocHints: Math.min(5, Math.floor(vocSum / 400)),
      focComboGrace: Math.min(3, Math.floor(focSum / 700)),
      lukGachaBonus: Math.min(3.0, lukSum * 0.0012).toFixed(2),
      gutShields: Math.min(3, Math.floor(gutSum / 900)),
    };
  };

  const stats = calculateTotalStats();

  return (
    <main className="min-h-screen bg-gray-950 text-white py-8">
      <div className="max-w-4xl mx-auto px-4 space-y-6">
        
        <div className="flex items-center justify-between border-b border-gray-800 pb-4">
          <div>
            <h1 className="text-2xl font-black">⚔️ パーティ編成</h1>
            <p className="text-xs text-gray-400 mt-1">
              {fromClip ? "出撃デッキを設定して「保存して出撃画面へ戻る」を押してください" : "下のモンスターをドロップ領域へドラッグ＆ドロップして編成できます"}
            </p>
          </div>
          {/* ★ キャンセル/戻る先を出撃画面へ動的変更 */}
          <Link
            href={fromClip ? `/clips/${fromClip}/prepare` : "/"}
            className="px-3 py-1.5 bg-gray-800 text-gray-200 font-bold text-xs rounded-lg hover:bg-gray-700 transition-colors"
          >
            {fromClip ? "← 出撃確認へ戻る" : "← ダッシュボード"}
          </Link>
        </div>

        {/* 1. スロット編成（ドロップターゲット領域） */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                className={`bg-gray-900 border rounded-2xl p-4 flex flex-col justify-between space-y-3 relative shadow-lg transition-all ${
                  isOver ? "border-cyan-400 ring-4 ring-cyan-500/30 scale-[1.02]" : "border-gray-800"
                }`}
              >
                <div className="flex justify-between items-center text-xs font-bold font-mono text-gray-400">
                  <span>SLOT #{slotIdx + 1} {slotIdx === 0 && "👑(リーダー)"}</span>
                  {m && (
                    <button
                      onClick={() => handleClearSlot(slotIdx)}
                      className="text-red-400 hover:text-red-300 text-[10px]"
                    >
                      外す ✕
                    </button>
                  )}
                </div>

                {m ? (
                  <div className="space-y-2 text-center py-2">
                    <img
                      src={m.image_url}
                      alt={m.name}
                      className="w-24 h-24 object-cover rounded-xl mx-auto border-2 border-indigo-500 shadow-md pointer-events-none"
                    />
                    <div>
                      <div className="text-xs text-amber-400 font-bold">{"★".repeat(m.rarity)}</div>
                      <div className="text-sm font-black">{m.name}</div>
                      <div className="text-[10px] text-blue-400 font-mono mt-0.5">☘️ ラック: {luck}</div>
                    </div>
                  </div>
                ) : (
                  <div className="py-10 text-center text-gray-500 border-2 border-dashed border-gray-800 rounded-xl space-y-1">
                    <div className="text-2xl">🎯</div>
                    <div className="text-xs font-bold">ここにドラッグ＆ドロップ</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 保存ボタン */}
        <div className="flex flex-col items-center gap-2">
          {message && (
            <div className="p-2.5 bg-indigo-950 border border-indigo-800 text-indigo-300 text-xs font-bold rounded-lg text-center w-full max-w-md animate-pulse">
              {message}
            </div>
          )}

          <button
            onClick={handleSaveParty}
            disabled={saving}
            className="w-full max-w-md py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-90 text-white font-black text-sm rounded-xl shadow-lg disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            <span>💾 {fromClip ? "保存して出撃画面へ戻る" : "パーティ編成を保存する"}</span>
          </button>
        </div>

        {/* 2. 合計ステータス表示 */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-bold text-gray-300 border-b border-gray-800 pb-2">
            📊 パーティ合計ステータス & 発動効果
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono">
            <div className="bg-gray-950 p-3 rounded-xl border border-gray-800">
              <span className="text-gray-400 block text-[10px]">知力 (INT)</span>
              <span className="text-lg font-black text-blue-400">{stats.int}</span>
              <span className="text-[10px] text-gray-400 block mt-1">獲得XP: {stats.xpMult}倍</span>
            </div>

            <div className="bg-gray-950 p-3 rounded-xl border border-gray-800">
              <span className="text-gray-400 block text-[10px]">聴力 (EAR)</span>
              <span className="text-lg font-black text-green-400">{stats.ear}</span>
              <span className="text-[10px] text-gray-400 block mt-1">ドロップ加算: +{stats.earDropBonus}pt</span>
            </div>

            <div className="bg-gray-950 p-3 rounded-xl border border-gray-800">
              <span className="text-gray-400 block text-[10px]">語彙 (VOC)</span>
              <span className="text-lg font-black text-purple-400">{stats.voc}</span>
              <span className="text-[10px] text-gray-400 block mt-1">ヒント可能回数: {stats.vocHints}回</span>
            </div>

            <div className="bg-gray-950 p-3 rounded-xl border border-gray-800">
              <span className="text-gray-400 block text-[10px]">集中 (FOC)</span>
              <span className="text-lg font-black text-amber-400">{stats.foc}</span>
              <span className="text-[10px] text-gray-400 block mt-1">ミス許容回数: {stats.focComboGrace}回</span>
            </div>

            <div className="bg-gray-950 p-3 rounded-xl border border-gray-800">
              <span className="text-gray-400 block text-[10px]">幸運 (LUK)</span>
              <span className="text-lg font-black text-yellow-400">{stats.luk}</span>
              <span className="text-[10px] text-gray-400 block mt-1">ガチャ★4加算: +{stats.lukGachaBonus}pt</span>
            </div>

            <div className="bg-gray-950 p-3 rounded-xl border border-gray-800">
              <span className="text-gray-400 block text-[10px]">胆力 (GUT)</span>
              <span className="text-lg font-black text-red-400">{stats.gut}</span>
              <span className="text-[10px] text-gray-400 block mt-1">月間ストリーク保護: {stats.gutShields}回</span>
            </div>
          </div>
        </div>

        {/* 3. 所持モンスター一覧 */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
          <h2 className="text-sm font-bold text-gray-300">
            所持モンスター一覧 (ドラッグしてスロットへ配置)
          </h2>

          {loading ? (
            <p className="text-xs text-gray-500 text-center py-6">読み込み中...</p>
          ) : ownedMonsters.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-6">
              所持しているモンスターがいません。「召喚（ガチャ）」でモンスターを獲得しましょう。
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {ownedMonsters.map((m) => {
                const luck = m.user_monsters && m.user_monsters.length > 0 ? m.user_monsters[0].luck : 1;
                const setSlotIdx = partySlots.findIndex((s) => s?.id === m.id);

                return (
                  <div
                    key={m.id}
                    draggable
                    onDragStart={() => setDraggedMonster(m)}
                    onDragEnd={() => setDraggedMonster(null)}
                    className={`bg-gray-950 border rounded-xl p-3 space-y-2 relative transition-all cursor-grab active:cursor-grabbing select-none ${
                      setSlotIdx !== -1 ? "border-indigo-500 ring-2 ring-indigo-500/30 opacity-70" : "border-gray-800 hover:border-cyan-500 hover:scale-105"
                    }`}
                  >
                    {setSlotIdx !== -1 && (
                      <span className="absolute top-2 left-2 bg-indigo-600 text-white font-mono text-[9px] font-bold px-1.5 py-0.5 rounded">
                        SLOT #{setSlotIdx + 1}
                      </span>
                    )}

                    <img src={m.image_url} alt={m.name} className="w-16 h-16 object-cover rounded-lg mx-auto border border-gray-800 pointer-events-none" />

                    <div className="text-center">
                      <div className="text-[10px] text-amber-400">{"★".repeat(m.rarity)}</div>
                      <div className="text-xs font-bold truncate">{m.name}</div>
                      <div className="text-[10px] text-blue-400 font-mono">☘️ {luck}</div>
                    </div>

                    <div className="grid grid-cols-3 gap-1 pt-1">
                      {[0, 1, 2].map((sIdx) => (
                        <button
                          key={sIdx}
                          onClick={() => handleSelectMonster(m, sIdx)}
                          className={`py-1 text-[9px] font-bold rounded ${
                            setSlotIdx === sIdx ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"
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
          )}
        </div>

      </div>
    </main>
  );
}

export default function PartyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-950 text-white p-8 text-center text-sm font-mono">読み込み中...</div>}>
      <PartyInner />
    </Suspense>
  );
}