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

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    e.currentTarget.src = "https://images.unsplash.com/photo-1532012197267-da84d127e765?w=400";
  };

  return (
    <main className="min-h-screen pb-20 pt-4 px-3 sm:px-6">
      <div className="max-w-4xl mx-auto space-y-4">
        
        <div className="game-panel p-4 flex items-center justify-between">
          <div>
            <span className="text-[9px] font-num tracking-widest text-sky-400 uppercase font-bold block">
              ENCYCLOPEDIA OF MONSTERS
            </span>
            <h1 className="text-base font-black text-white">モンスター図鑑</h1>
          </div>
          <Link href="/" className="btn-game-blue text-xs px-3 py-1.5 rounded-xl flex items-center gap-1">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
            </svg>
            <span>ホーム</span>
          </Link>
        </div>

        {loading ? (
          <p className="text-xs text-slate-500 font-mono text-center py-16">データを読み込み中...</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {monsters.map((m) => {
              const isOwned = m.user_monsters && m.user_monsters.length > 0;
              const luck = isOwned ? m.user_monsters![0].luck : 0;

              return (
                <div
                  key={m.id}
                  onClick={() => setSelectedMonster(m)}
                  className={`game-panel p-2.5 rounded-xl text-center space-y-1.5 cursor-pointer transition-all ${
                    isOwned ? "hover:border-sky-400" : "opacity-40 grayscale"
                  }`}
                >
                  <div className="aspect-square relative bg-[#070d17] rounded-lg overflow-hidden border border-[#213757]">
                    <img
                      src={m.image_url}
                      alt=""
                      onError={handleImageError}
                      className="w-full h-full object-cover object-top"
                    />
                    
                    <div className="absolute top-1 left-1 bg-black/80 px-1.5 py-0.2 rounded text-[8px] font-bold text-amber-400 font-num">
                      {"★".repeat(m.rarity)}
                    </div>

                    {isOwned && (
                      <div className="absolute bottom-1 right-1 bg-black/80 text-sky-300 font-num text-[8px] font-bold px-1.5 py-0.2 rounded border border-sky-500/40 flex items-center gap-0.5">
                        <svg className="w-2.5 h-2.5 text-emerald-400 fill-current" viewBox="0 0 24 24">
                          <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                        </svg>
                        <span>{luck}</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-0.5">
                    <h3 className="text-xs font-bold truncate text-white">
                      {isOwned ? m.name : "？？？？？？"}
                    </h3>
                    <p className="text-[8px] text-slate-400 font-mono uppercase">
                      {m.element}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 詳細モーダル */}
        {selectedMonster && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <div className="game-panel rounded-2xl max-w-sm w-full p-5 text-white space-y-3.5 shadow-2xl">
              <div className="flex justify-between items-start border-b border-[#213757] pb-2">
                <div>
                  <span className="text-xs text-amber-400 font-bold font-num">
                    {"★".repeat(selectedMonster.rarity)}
                  </span>
                  <h2 className="text-sm font-bold text-white">{selectedMonster.name}</h2>
                  <p className="text-[10px] text-slate-400 font-mono">{selectedMonster.name_en}</p>
                </div>
                <button onClick={() => setSelectedMonster(null)} className="text-slate-400 hover:text-white text-sm font-bold">✕</button>
              </div>

              <div className="relative aspect-square max-h-48 mx-auto bg-[#070d17] rounded-xl overflow-hidden border border-[#213757]">
                <img src={selectedMonster.image_url} alt="" onError={handleImageError} className="w-full h-full object-cover object-top" />
              </div>

              <div className="bg-[#0a121f] p-3 rounded-xl border border-[#213757] space-y-1.5 text-xs">
                {selectedMonster.quote_ja && (
                  <p className="text-amber-300 font-bold italic border-b border-[#213757] pb-1 text-[11px]">
                    "{selectedMonster.quote_ja}"
                  </p>
                )}
                <p className="text-slate-300 text-[10px] leading-relaxed">
                  {selectedMonster.madness_episode}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-1.5 text-[10px] font-num bg-[#0a121f] text-slate-200 p-2.5 rounded-xl border border-[#213757] text-center">
                <div>INT: <span className="font-bold text-sky-400">{selectedMonster.stat_int}</span></div>
                <div>EAR: <span className="font-bold text-emerald-400">{selectedMonster.stat_ear}</span></div>
                <div>VOC: <span className="font-bold text-purple-400">{selectedMonster.stat_voc}</span></div>
                <div>FOC: <span className="font-bold text-amber-400">{selectedMonster.stat_foc}</span></div>
                <div>LUK: <span className="font-bold text-yellow-400">{selectedMonster.stat_luk}</span></div>
                <div>GUT: <span className="font-bold text-red-400">{selectedMonster.stat_gut}</span></div>
              </div>

              <button onClick={() => setSelectedMonster(null)} className="w-full py-2 btn-game-blue text-xs rounded-xl font-bold">
                閉じる
              </button>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}