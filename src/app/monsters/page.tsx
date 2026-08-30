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

  // 画像読み込みエラー時のフォールバック処理
  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    e.currentTarget.src = "https://images.unsplash.com/photo-1532012197267-da84d127e765?w=400";
  };

  return (
    <main className="min-h-screen bg-[#0d0a08] text-[#2b2118] font-serif py-8 px-2 sm:px-6 relative selection:bg-amber-800 selection:text-amber-100">
      
      {/* 背景：アンティーク木目風テクスチャ装飾 */}
      <div className="max-w-5xl mx-auto space-y-6 relative">
        
        {/* ヘッダー領域 */}
        <div className="flex items-center justify-between border-b-2 border-[#3d2e1e] pb-4 px-2">
          <div>
            <span className="text-[10px] font-mono tracking-widest text-amber-600 uppercase block font-bold">
              ENCYCLOPEDIA OF GREAT MINDS
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-[#e6c896] drop-shadow-md flex items-center gap-2 font-serif">
              <span>📖</span> 偉人英傑 魔導図鑑
            </h1>
          </div>
          <Link
            href="/"
            className="px-4 py-2 bg-[#211811] hover:bg-[#33261a] border border-[#54412c] text-[#e6c896] font-bold text-xs rounded-xl shadow-lg transition-all font-sans"
          >
            ◀ ダッシュボードに戻る
          </Link>
        </div>

        {/* ================= 本の本体（羊皮紙の開かれた古書デザイン） ================= */}
        <div className="bg-[#f4e8c1] border-8 border-[#3d2e1e] rounded-3xl shadow-2xl p-4 sm:p-8 relative overflow-hidden">
          
          {/* 本の背表紙・中央の折り目グラデーション */}
          <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-12 bg-gradient-to-r from-transparent via-[#d6c49b]/50 to-transparent pointer-events-none hidden md:block" />
          
          {/* 羊皮紙の角の金箔装飾コーナー */}
          <div className="absolute top-2 left-2 text-[#8c6d3f] text-xs font-serif pointer-events-none">✦</div>
          <div className="absolute top-2 right-2 text-[#8c6d3f] text-xs font-serif pointer-events-none">✦</div>
          <div className="absolute bottom-2 left-2 text-[#8c6d3f] text-xs font-serif pointer-events-none">✦</div>
          <div className="absolute bottom-2 right-2 text-[#8c6d3f] text-xs font-serif pointer-events-none">✦</div>

          <div className="text-center pb-6 border-b border-[#a89267]/40 mb-6 space-y-1">
            <p className="text-xs text-[#5c4a30] font-bold tracking-widest font-mono uppercase">
              - RECORD OF HEROIC SOULS -
            </p>
            <p className="text-xs text-[#705c3d] italic">
              刻まれた歴史の英傑たち。解放された偉人はその偉業と叡智を現す。
            </p>
          </div>

          {loading ? (
            <p className="text-xs text-[#705c3d] font-mono text-center py-16 animate-pulse">
              羊皮紙の記録を解読中...
            </p>
          ) : (
            /* モンスター挿絵グリッド */
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-6 relative z-10">
              {monsters.map((m) => {
                const isOwned = m.user_monsters && m.user_monsters.length > 0;
                const luck = isOwned ? m.user_monsters![0].luck : 0;

                return (
                  <div
                    key={m.id}
                    onClick={() => setSelectedMonster(m)}
                    className={`border-2 rounded-xl overflow-hidden cursor-pointer transition-all duration-200 relative group flex flex-col justify-between ${
                      isOwned
                        ? "bg-[#e8d7b0] border-[#8c6d3f] shadow-md hover:shadow-xl hover:-translate-y-1 hover:border-[#b8860b]"
                        : "bg-[#d1c29b]/40 border-[#a89267]/50 opacity-60 hover:opacity-80"
                    }`}
                  >
                    {/* カード枠内イラスト */}
                    <div className="aspect-square relative bg-[#1f1811] overflow-hidden border-b border-[#8c6d3f]/40">
                      <img
                        src={m.image_url}
                        alt=""
                        onError={handleImageError}
                        className={`w-full h-full object-cover object-top transition-transform duration-300 ${
                          isOwned ? "group-hover:scale-105" : "grayscale contrast-125 sepia opacity-40"
                        }`}
                      />
                      
                      {/* レアリティ星表示 */}
                      <div className="absolute top-1.5 left-1.5 bg-[#1f1811]/80 backdrop-blur px-2 py-0.5 rounded-md text-[9px] font-bold text-amber-400 border border-[#8c6d3f]/50">
                        {"★".repeat(m.rarity)}
                      </div>

                      {/* ラック表示 */}
                      {isOwned && (
                        <div className="absolute bottom-1.5 right-1.5 bg-[#211811] text-[#e6c896] font-mono text-[9px] font-bold px-2 py-0.5 rounded border border-[#8c6d3f]">
                          ☘️ {luck}
                        </div>
                      )}
                    </div>

                    {/* モンスター名・属性 */}
                    <div className="p-2.5 text-center space-y-0.5 bg-[#f4e8c1]/90">
                      <h3 className="text-xs font-black truncate text-[#2b2118]">
                        {isOwned ? m.name : "？？？？？？"}
                      </h3>
                      <p className="text-[9px] text-[#705c3d] font-mono uppercase font-bold tracking-wider">
                        {m.element}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </div>

        {/* ================= モンスター詳細（羊皮紙の羊皮手記モーダル） ================= */}
        {selectedMonster && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fadeIn">
            <div className="bg-[#f4e8c1] border-4 border-[#3d2e1e] rounded-3xl max-w-md w-full p-6 text-[#2b2118] space-y-4 shadow-2xl relative font-serif">
              
              <div className="flex justify-between items-start border-b border-[#a89267]/50 pb-2">
                <div>
                  <span className="text-xs text-amber-700 font-bold tracking-widest">
                    {"★".repeat(selectedMonster.rarity)}
                  </span>
                  <h2 className="text-lg font-black text-[#1a130d]">{selectedMonster.name}</h2>
                  <p className="text-[11px] text-[#705c3d] font-mono">{selectedMonster.name_en}</p>
                </div>
                <button
                  onClick={() => setSelectedMonster(null)}
                  className="text-[#705c3d] hover:text-[#1a130d] text-base font-bold bg-[#e8d7b0] border border-[#a89267] w-7 h-7 rounded-full flex items-center justify-center shadow"
                >
                  ✕
                </button>
              </div>

              {/* イラスト枠（正方形＋上部優先表示に修正） */}
              <div className="relative aspect-square max-h-64 mx-auto bg-[#1f1811] rounded-2xl overflow-hidden border-2 border-[#8c6d3f] shadow-inner">
                <img
                  src={selectedMonster.image_url}
                  alt=""
                  onError={handleImageError}
                  className="w-full h-full object-cover object-top"
                />
              </div>

              {/* 名言・狂気のエピソード */}
              <div className="bg-[#e8d7b0]/80 p-3.5 rounded-2xl border border-[#a89267]/60 space-y-2 text-xs">
                {selectedMonster.quote_ja && (
                  <p className="text-[#8c4800] font-black italic border-b border-[#a89267]/30 pb-1.5">
                    "{selectedMonster.quote_ja}"
                  </p>
                )}
                <p className="text-[#423321] text-[11px] leading-relaxed">
                  {selectedMonster.madness_episode}
                </p>
              </div>

              {/* ステータスグリッド */}
              <div className="grid grid-cols-3 gap-2 text-xs font-mono bg-[#211811] text-[#e6c896] p-3 rounded-2xl border border-[#8c6d3f]">
                <div>知力: <span className="font-bold text-cyan-400">{selectedMonster.stat_int}</span></div>
                <div>聴力: <span className="font-bold text-emerald-400">{selectedMonster.stat_ear}</span></div>
                <div>語彙: <span className="font-bold text-purple-400">{selectedMonster.stat_voc}</span></div>
                <div>集中: <span className="font-bold text-amber-400">{selectedMonster.stat_foc}</span></div>
                <div>幸運: <span className="font-bold text-yellow-400">{selectedMonster.stat_luk}</span></div>
                <div>胆力: <span className="font-bold text-red-400">{selectedMonster.stat_gut}</span></div>
              </div>

              <button
                onClick={() => setSelectedMonster(null)}
                className="w-full py-2.5 bg-[#3d2e1e] hover:bg-[#54412c] text-[#e6c896] font-bold text-xs rounded-xl shadow-lg font-sans transition-colors"
              >
                手記を閉じる
              </button>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}