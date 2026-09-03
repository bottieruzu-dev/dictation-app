"use client";

import { useState } from "react";
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
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  orbCount: number;
}

export default function GachaModal({ isOpen, onClose, onSuccess, orbCount }: Props) {
  const [loading, setLoading] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [result, setResult] = useState<{ monster: Monster; isNew: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  if (!isOpen) return null;

  const handleSummon = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setAnimating(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("ログインしていません。");

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/gacha`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "ガチャ実行エラー");

      setTimeout(() => {
        setResult(data);
        setAnimating(false);
        onSuccess();
      }, 1200);
    } catch (err: any) {
      setError(err.message);
      setAnimating(false);
    } finally {
      setLoading(false);
    }
  };

  const getRarityColor = (r: number) => {
    switch (r) {
      case 5: return "from-amber-400 via-purple-500 to-indigo-600 border-amber-300 text-amber-300";
      case 4: return "from-yellow-400 to-amber-600 border-yellow-400 text-yellow-300";
      case 3: return "from-blue-400 to-indigo-600 border-blue-400 text-blue-300";
      case 2: return "from-green-400 to-emerald-600 border-green-400 text-green-300";
      default: return "from-gray-400 to-gray-600 border-gray-400 text-gray-300";
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
      <div className="game-panel rounded-2xl max-w-md w-full p-6 text-white space-y-6 shadow-2xl relative overflow-hidden">
        
        <div className="flex justify-between items-center border-b border-[#213757] pb-3">
          <h2 className="text-sm font-black tracking-wide flex items-center gap-2 text-sky-300">
            <span>ノーマル召喚 (フレンドガチャ枠)</span>
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-sm font-bold">
            ✕
          </button>
        </div>

        {animating ? (
          <div className="py-12 flex flex-col items-center justify-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-r from-sky-400 to-indigo-500 animate-spin flex items-center justify-center shadow-lg shadow-sky-500/50">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L5.605 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"/>
              </svg>
            </div>
            <p className="text-xs font-bold tracking-widest animate-pulse text-sky-300 font-mono">
              召喚の儀式を実行中...
            </p>
          </div>
        ) : result ? (
          <div className="space-y-4 text-center">
            <div className={`p-1 rounded-xl bg-gradient-to-b ${getRarityColor(result.monster.rarity)}`}>
              <div className="bg-[#08101c] rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-center text-xs font-bold font-mono">
                  <span className="text-amber-400">
                    {"★".repeat(result.monster.rarity)}
                  </span>
                  {result.isNew && (
                    <span className="bg-red-600 text-white px-2 py-0.5 rounded-full text-[10px]">
                      NEW!
                    </span>
                  )}
                </div>

                <img
                  src={result.monster.image_url}
                  alt={result.monster.name}
                  className="w-28 h-28 object-cover rounded-xl mx-auto border-2 border-[#213757] shadow-md"
                />

                <div>
                  <h3 className="text-lg font-black text-white">{result.monster.name}</h3>
                  <p className="text-xs text-slate-400 font-mono">{result.monster.name_en}</p>
                </div>

                <p className="text-xs italic text-sky-300 font-serif">
                  "{result.monster.quote_ja}"
                </p>

                <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono bg-[#050a12] p-2 rounded-lg text-slate-300 border border-[#1e3458]">
                  <div>INT: {result.monster.stat_int}</div>
                  <div>EAR: {result.monster.stat_ear}</div>
                  <div>VOC: {result.monster.stat_voc}</div>
                  <div>FOC: {result.monster.stat_foc}</div>
                  <div>LUK: {result.monster.stat_luk}</div>
                  <div>GUT: {result.monster.stat_gut}</div>
                </div>
              </div>
            </div>

            <button
              onClick={() => setResult(null)}
              className="w-full py-2.5 btn-game-blue text-xs font-bold rounded-xl"
            >
              もう一度召喚画面に戻る
            </button>
          </div>
        ) : (
          <div className="space-y-5 text-center py-2">
            <p className="text-xs text-slate-300">
              オーブ1個で気軽に召喚できます。（★1〜★3メインの育成・ラック上げ用枠です）
            </p>

            {error && (
              <p className="text-xs text-red-400 bg-red-950/50 p-2 rounded border border-red-800">
                {error}
              </p>
            )}

            <button
              onClick={handleSummon}
              disabled={loading || orbCount < 1}
              className="w-full py-3 btn-game-yellow text-xs font-bold rounded-xl shadow disabled:opacity-40 flex items-center justify-center gap-2"
            >
              <span>1 オーブで召喚する</span>
              <span className="text-[10px] font-mono opacity-80">(所持: {orbCount}個)</span>
            </button>
          </div>
        )}

      </div>
    </div>
  );
}