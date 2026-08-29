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
      <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-md w-full p-6 text-white space-y-6 shadow-2xl relative overflow-hidden">
        
        <div className="flex justify-between items-center border-b border-gray-800 pb-3">
          <h2 className="text-lg font-black tracking-wide flex items-center gap-2">
            <span>🤝 ノーマル召喚 (フレンドガチャ枠)</span>
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-sm font-bold">
            ✕ 閉じる
          </button>
        </div>

        {animating ? (
          <div className="py-12 flex flex-col items-center justify-center space-y-4">
            <div className="w-20 h-20 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 animate-spin flex items-center justify-center shadow-lg shadow-teal-500/50">
              <div className="w-16 h-16 rounded-full bg-gray-900 flex items-center justify-center text-2xl">
                💎
              </div>
            </div>
            <p className="text-sm font-bold tracking-widest animate-pulse text-emerald-400">
              モンスターを召喚中...
            </p>
          </div>
        ) : result ? (
          <div className="space-y-4 text-center">
            <div className={`p-1 rounded-xl bg-gradient-to-b ${getRarityColor(result.monster.rarity)}`}>
              <div className="bg-gray-950 rounded-lg p-4 space-y-3">
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
                  className="w-28 h-28 object-cover rounded-xl mx-auto border-2 border-gray-800 shadow-md"
                />

                <div>
                  <h3 className="text-xl font-black text-white">{result.monster.name}</h3>
                  <p className="text-xs text-gray-400 font-mono">{result.monster.name_en}</p>
                </div>

                <p className="text-xs italic text-cyan-300 font-serif">
                  "{result.monster.quote_ja}"
                </p>

                <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono bg-gray-900 p-2 rounded-lg text-gray-300">
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
              className="w-full py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-xs font-bold transition-colors"
            >
              もう一度召喚画面に戻る
            </button>
          </div>
        ) : (
          <div className="space-y-6 text-center py-4">
            <div className="space-y-2">
              <div className="text-4xl">🤝</div>
              <p className="text-xs text-gray-400">
                オーブ1個で気軽に召喚できます。（★1〜★3メインの育成・ラック上げ用枠です）
              </p>
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-950/50 p-2 rounded border border-red-800">
                {error}
              </p>
            )}

            <button
              onClick={handleSummon}
              disabled={loading || orbCount < 1}
              className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:opacity-90 text-white rounded-xl font-black text-sm shadow-lg disabled:opacity-40 transition-all flex items-center justify-center gap-2"
            >
              <span>1 オーブで召喚する</span>
              <span className="text-xs font-mono opacity-80">(所持: {orbCount}個)</span>
            </button>
          </div>
        )}

      </div>
    </div>
  );
}