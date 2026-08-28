"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface Monster {
  id: number;
  name: string;
  name_en: string;
  rarity: number;
  element: string;
  quote_en: string;
  quote_ja: string;
  madness_episode: string;
  image_url: string;
  stat_int: number;
  stat_ear: number;
  stat_voc: number;
  stat_foc: number;
  stat_luk: number;
  stat_gut: number;
  user_monsters?: {
    luck: number;
    total_obtained: number;
  }[];
}

export default function MonstersPage() {
  const [monsters, setMonsters] = useState<Monster[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonster, setSelectedMonster] = useState<Monster | null>(null);

  const supabase = createClient();

  useEffect(() => {
    async function fetchMonsters() {
      setLoading(true);

      const { data: mData } = await supabase
        .from("monsters")
        .select("*, user_monsters(luck, total_obtained)")
        .order("rarity", { ascending: false });

      if (mData) setMonsters(mData as Monster[]);
      setLoading(false);
    }

    void fetchMonsters();
  }, [supabase]);

  return (
    <main className="min-h-screen bg-gray-950 text-white py-8">
      <div className="max-w-4xl mx-auto px-4 space-y-6">
        
        {/* ヘッダー */}
        <div className="flex items-center justify-between border-b border-gray-800 pb-4">
          <div>
            <h1 className="text-2xl font-black">📖 モンスター図鑑</h1>
            <p className="text-xs text-gray-400 mt-1">
              収集したモンスターのステータスとフレーバーテキストを確認できます
            </p>
          </div>
          <Link
            href="/"
            className="px-3 py-1.5 bg-gray-800 text-gray-200 font-bold text-xs rounded-lg hover:bg-gray-700 transition-colors"
          >
            ← ダッシュボード
          </Link>
        </div>

        {/* 図鑑グリッド */}
        {loading ? (
          <p className="text-xs text-gray-500 text-center py-12">図鑑データを読み込み中...</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {monsters.map((m) => {
              const isOwned = m.user_monsters && m.user_monsters.length > 0;
              const luck = isOwned ? m.user_monsters![0].luck : 0;

              return (
                <div
                  key={m.id}
                  onClick={() => setSelectedMonster(m)}
                  className={`bg-gray-900 border rounded-xl overflow-hidden cursor-pointer transition-all hover:scale-[1.02] ${
                    isOwned ? "border-gray-700 shadow-lg" : "border-gray-800 opacity-40 grayscale"
                  }`}
                >
                  <div className="aspect-square relative bg-black">
                    <img src={m.image_url} alt={m.name} className="w-full h-full object-cover" />
                    <div className="absolute top-2 left-2 bg-black/60 backdrop-blur px-2 py-0.5 rounded text-[10px] font-bold text-amber-400">
                      {"★".repeat(m.rarity)}
                    </div>
                    {isOwned && (
                      <div className="absolute bottom-2 right-2 bg-blue-600 text-white font-mono text-[10px] font-bold px-1.5 py-0.5 rounded">
                        ☘️ {luck}
                      </div>
                    )}
                  </div>

                  <div className="p-3 space-y-1">
                    <h3 className="text-xs font-bold truncate">{isOwned ? m.name : "？？？？"}</h3>
                    <p className="text-[10px] text-gray-500 font-mono truncate">{m.element.toUpperCase()}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 詳細表示モーダル */}
        {selectedMonster && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-md w-full p-6 text-white space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs text-amber-400 font-bold">
                    {"★".repeat(selectedMonster.rarity)}
                  </span>
                  <h2 className="text-xl font-black">{selectedMonster.name}</h2>
                  <p className="text-xs text-gray-400 font-mono">{selectedMonster.name_en}</p>
                </div>
                <button
                  onClick={() => setSelectedMonster(null)}
                  className="text-gray-400 hover:text-white text-sm font-bold"
                >
                  ✕
                </button>
              </div>

              <img
                src={selectedMonster.image_url}
                alt={selectedMonster.name}
                className="w-full h-48 object-cover rounded-xl border border-gray-800"
              />

              <div className="bg-gray-950 p-3 rounded-xl space-y-2 text-xs">
                <p className="text-cyan-300 italic">"{selectedMonster.quote_ja}"</p>
                <p className="text-gray-400 text-[11px] leading-relaxed">
                  {selectedMonster.madness_episode}
                </p>
              </div>

              {/* ステータス表 */}
              <div className="grid grid-cols-3 gap-2 text-xs font-mono bg-gray-950 p-3 rounded-xl border border-gray-800">
                <div>知力 (INT): <span className="font-bold text-blue-400">{selectedMonster.stat_int}</span></div>
                <div>聴力 (EAR): <span className="font-bold text-green-400">{selectedMonster.stat_ear}</span></div>
                <div>語彙 (VOC): <span className="font-bold text-purple-400">{selectedMonster.stat_voc}</span></div>
                <div>集中 (FOC): <span className="font-bold text-amber-400">{selectedMonster.stat_foc}</span></div>
                <div>幸運 (LUK): <span className="font-bold text-yellow-400">{selectedMonster.stat_luk}</span></div>
                <div>胆力 (GUT): <span className="font-bold text-red-400">{selectedMonster.stat_gut}</span></div>
              </div>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}