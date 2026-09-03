"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface Country {
  id: number;
  name_ja: string;
  name_en: string;
  flag_emoji: string;
  required_monsters: number;
}

interface Heroine {
  id: number;
  country_id: number;
  name: string;
  age: number;
  personality: string;
  is_secret: boolean;
  unlock_cost: number;
  image_url: string;
  user_heroines?: {
    unlocked: boolean;
    affection_level: number;
    current_rp: number;
  }[];
}

interface Thought {
  heroine_id: number;
  affection_level: number;
  thought_en: string;
}

interface DateEvent {
  heroine_id: number;
  affection_level: number;
  dialogue_en: string;
}

export default function RomancePage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const [displayName, setDisplayName] = useState("Takumi");
  const [romancePoints, setRomancePoints] = useState(0);
  const [ownedMonstersCount, setOwnedMonstersCount] = useState(0);

  const [countries, setCountries] = useState<Country[]>([]);
  const [heroines, setHeroines] = useState<Heroine[]>([]);
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [dateEvents, setDateEvents] = useState<DateEvent[]>([]);

  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [activeHeroine, setActiveHeroine] = useState<Heroine | null>(null);
  const [currentThought, setCurrentThought] = useState<string | null>(null);

  const [novelDialogue, setNovelDialogue] = useState<{ heroine: Heroine; level: number; text: string } | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [newNameInput, setNewNameInput] = useState("");

  const supabase = createClient();

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    e.currentTarget.src = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600";
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSignedIn(!!data.session);
    });
  }, [supabase]);

  const loadData = async () => {
    if (!signedIn) return;
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: prof } = await supabase
      .from("profiles")
      .select("display_name, romance_points")
      .eq("id", user.id)
      .maybeSingle();

    if (prof) {
      setDisplayName(prof.display_name || "Takumi");
      setRomancePoints(prof.romance_points || 0);
    } else {
      await supabase.from("profiles").upsert({ id: user.id, display_name: "Takumi", romance_points: 100 });
      setRomancePoints(100);
    }

    const { count: mCount } = await supabase
      .from("user_monsters")
      .select("*", { count: "exact", head: true })
      .eq("owner_id", user.id);

    const mTotal = mCount || 0;
    setOwnedMonstersCount(mTotal);

    const { data: cData } = await supabase
      .from("romance_countries")
      .select("*")
      .order("id", { ascending: true });

    if (cData && cData.length > 0) {
      setCountries(cData);
      setSelectedCountry(cData[0]);
    }

    const { data: hData } = await supabase
      .from("heroines")
      .select("*, user_heroines(unlocked, affection_level, current_rp)")
      .order("id", { ascending: true });

    if (hData) setHeroines(hData as Heroine[]);

    const { data: tData } = await supabase.from("heroine_thoughts").select("*");
    if (tData) setThoughts(tData);

    const { data: dData } = await supabase.from("heroine_dates").select("*");
    if (dData) setDateEvents(dData);

    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, [signedIn]);

  const triggerRandomThought = (heroine: Heroine, level: number) => {
    const list = thoughts.filter((t) => t.heroine_id === heroine.id && t.affection_level <= level);
    if (list.length > 0) {
      const picked = list[Math.floor(Math.random() * list.length)].thought_en;
      setCurrentThought(picked.replace(/{player_name}/g, displayName));
    } else {
      setCurrentThought(`I wonder what ${displayName} is doing right now...`);
    }
  };

  const handleUnlockHeroine = async (heroine: Heroine) => {
    if (romancePoints < heroine.unlock_cost) {
      alert(`RP（ロマンスポイント）が不足しています（必要: ${heroine.unlock_cost} RP）`);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const newRp = romancePoints - heroine.unlock_cost;
    await supabase.from("profiles").update({ romance_points: newRp }).eq("id", user.id);
    setRomancePoints(newRp);

    await supabase.from("user_heroines").upsert({
      owner_id: user.id,
      heroine_id: heroine.id,
      unlocked: true,
      affection_level: 1,
      current_rp: 0,
    });

    void loadData();
  };

  const handleUpgradeAffection = async (heroine: Heroine) => {
    const userH = heroine.user_heroines && heroine.user_heroines.length > 0 ? heroine.user_heroines[0] : null;
    if (!userH || !userH.unlocked) return;

    const currentLevel = userH.affection_level;
    if (currentLevel >= 5) {
      alert("すでに最高好感度（Lv.5 MAX）に達しています！");
      return;
    }

    const costMap: Record<number, number> = heroine.is_secret
      ? { 1: 1000, 2: 3000, 3: 6000, 4: 20000 }
      : { 1: 200, 2: 500, 3: 1000, 4: 2000 };

    const requiredCost = costMap[currentLevel] || 500;

    if (romancePoints < requiredCost) {
      alert(`好感度アップに必要なRPが不足しています（必要: ${requiredCost} RP）`);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const newRp = romancePoints - requiredCost;
    const nextLevel = currentLevel + 1;

    await supabase.from("profiles").update({ romance_points: newRp }).eq("id", user.id);
    await supabase.from("user_heroines").update({
      affection_level: nextLevel,
    }).eq("owner_id", user.id).eq("heroine_id", heroine.id);

    setRomancePoints(newRp);

    const dEvent = dateEvents.find((d) => d.heroine_id === heroine.id && d.affection_level === nextLevel);
    if (dEvent) {
      setNovelDialogue({
        heroine,
        level: nextLevel,
        text: dEvent.dialogue_en.replace(/{player_name}/g, displayName),
      });
    }

    void loadData();
  };

  const handleSaveName = async () => {
    if (!newNameInput.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("profiles").update({ display_name: newNameInput.trim() }).eq("id", user.id);
    setDisplayName(newNameInput.trim());
    setIsEditingName(false);
  };

  if (loading) {
    return <div className="min-h-screen bg-[#070c17] text-pink-400 p-8 text-center text-xs font-mono">LOADING WORLD ROMANCE DATA...</div>;
  }

  const unlockedCountriesCount = countries.filter(c => ownedMonstersCount >= c.required_monsters).length;

  return (
    <main className="min-h-screen pb-20 pt-4 px-3 sm:px-6">
      <div className="max-w-4xl mx-auto space-y-5">

        {/* ステータスヘッダー */}
        <header className="game-panel p-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-pink-900/80 border border-pink-500/80 flex items-center justify-center shrink-0 shadow">
              <svg className="w-5 h-5 text-pink-300" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black text-white">WORLD ROMANCE</h1>
                <button
                  onClick={() => { setNewNameInput(displayName); setIsEditingName(true); }}
                  className="text-[9px] bg-pink-950 text-pink-300 border border-pink-700/60 px-2 py-0.5 rounded-full hover:bg-pink-900"
                >
                  {displayName} ✏️
                </button>
              </div>
              <p className="text-[10px] text-slate-400 font-mono">世界のヒロインと交流し親愛度を高めるモード</p>
            </div>
          </div>

          <div className="flex items-center gap-3 font-num">
            <div className="bg-[#0b1424] border border-pink-500/50 px-3.5 py-1.5 rounded-xl text-right shadow-inner flex items-center gap-2">
              <span className="text-xs text-pink-400 font-bold">RP</span>
              <div className="text-sm font-bold text-pink-300">{romancePoints}</div>
            </div>

            <Link href="/" className="btn-game-blue text-xs px-3 py-1.5 rounded-xl">
              ◀ ホーム
            </Link>
          </div>
        </header>

        {/* 国選択エリア */}
        <section className="game-panel p-3.5 space-y-3">
          <div className="flex justify-between items-center border-b border-[#213757] pb-2 text-xs font-bold text-slate-300">
            <span>🗺️ MAP (解放国: {unlockedCountriesCount} / {countries.length})</span>
            <span className="text-[10px] text-slate-400 font-mono">図鑑所持: {ownedMonstersCount} 体</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {countries.map((c) => {
              const isUnlocked = ownedMonstersCount >= c.required_monsters;
              const isSelected = selectedCountry?.id === c.id;

              return (
                <button
                  key={c.id}
                  disabled={!isUnlocked}
                  onClick={() => {
                    setSelectedCountry(c);
                    setActiveHeroine(null);
                    setCurrentThought(null);
                  }}
                  className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center justify-between relative overflow-hidden ${
                    !isUnlocked
                      ? "bg-[#0a111d] border-slate-800 opacity-40 cursor-not-allowed"
                      : isSelected
                      ? "bg-[#182845] border-pink-400 ring-2 ring-pink-500/40 shadow-lg"
                      : "bg-[#0e1829] border-[#213757] hover:border-pink-500/50"
                  }`}
                >
                  <div className="text-2xl mb-1">{c.flag_emoji}</div>
                  <div className="text-xs font-bold text-white">{c.name_ja}</div>
                  <div className="text-[8px] text-slate-400 font-mono uppercase">{c.name_en}</div>

                  {!isUnlocked && (
                    <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-1">
                      <span className="text-[9px] font-mono text-pink-400 font-bold">図鑑 {c.required_monsters}体で解放</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* ヒロイン一覧 */}
        {selectedCountry && (
          <section className="game-panel p-3.5 space-y-3">
            <div className="flex justify-between items-center border-b border-[#213757] pb-2">
              <h2 className="text-xs font-bold text-white flex items-center gap-2">
                <span>{selectedCountry.flag_emoji}</span> {selectedCountry.name_ja} のヒロイン
              </h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {heroines.filter(h => h.country_id === selectedCountry.id).map((h) => {
                const userH = h.user_heroines && h.user_heroines.length > 0 ? h.user_heroines[0] : null;
                const isUnlocked = userH?.unlocked ?? false;
                const affection = userH?.affection_level ?? 1;

                return (
                  <div
                    key={h.id}
                    onClick={() => {
                      setActiveHeroine(h);
                      if (isUnlocked) triggerRandomThought(h, affection);
                    }}
                    className={`bg-[#0a1220] border rounded-xl p-2 text-center space-y-1.5 cursor-pointer transition-all relative overflow-hidden flex flex-col justify-between ${
                      activeHeroine?.id === h.id ? "border-pink-400 ring-2 ring-pink-500/50" : "border-[#213757] hover:border-pink-800"
                    }`}
                  >
                    <div className="aspect-[3/4] bg-[#060a12] rounded-lg overflow-hidden relative border border-[#1b2d47]">
                      <img
                        src={h.image_url}
                        alt={h.name}
                        onError={handleImageError}
                        className={`w-full h-full object-cover object-top ${isUnlocked ? "" : "blur-sm opacity-50"}`}
                      />

                      {isUnlocked ? (
                        <div className="absolute top-1 left-1 bg-black/80 text-pink-400 text-[8px] font-bold font-num px-1.5 py-0.2 rounded border border-pink-500/40">
                          Lv.{affection} {affection === 5 && "👑"}
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/60 font-mono text-[9px] text-pink-300 font-bold">
                          未開放
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="text-xs font-bold text-white truncate">{h.name}</div>
                      <div className="text-[8px] text-slate-400 font-mono truncate">{h.personality}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ヒロイン詳細 ＆ 心の声 */}
        {activeHeroine && (
          <section className="game-panel p-4 space-y-3">
            {(() => {
              const userH = activeHeroine.user_heroines && activeHeroine.user_heroines.length > 0 ? activeHeroine.user_heroines[0] : null;
              const isUnlocked = userH?.unlocked ?? false;
              const affection = userH?.affection_level ?? 1;

              const costMap: Record<number, number> = activeHeroine.is_secret
                ? { 1: 1000, 2: 3000, 3: 6000, 4: 20000 }
                : { 1: 200, 2: 500, 3: 1000, 4: 2000 };

              const requiredCost = costMap[affection] || 500;

              return (
                <div className="flex flex-col sm:flex-row gap-4 items-center">
                  <div className="w-36 h-48 bg-[#0a1220] rounded-xl overflow-hidden border-2 border-pink-500/60 shadow shrink-0 relative">
                    <img
                      src={activeHeroine.image_url}
                      alt={activeHeroine.name}
                      onError={handleImageError}
                      className={`w-full h-full object-cover object-top ${isUnlocked ? "" : "blur-md opacity-40"}`}
                    />
                  </div>

                  <div className="flex-1 space-y-2.5 w-full">
                    <div className="border-b border-[#213757] pb-1.5">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-white">{activeHeroine.name}</h3>
                        <span className="text-xs text-slate-400 font-mono">({activeHeroine.age}歳)</span>
                      </div>
                      <p className="text-[10px] text-pink-300 font-mono mt-0.5">{activeHeroine.personality}</p>
                    </div>

                    {isUnlocked ? (
                      <div className="bg-[#0b1626] border border-pink-500/40 p-3 rounded-xl space-y-1 relative shadow-inner">
                        <div className="text-[8px] font-bold font-mono text-pink-400 uppercase tracking-widest flex items-center justify-between">
                          <span>HER INNER THOUGHTS</span>
                          <button
                            onClick={() => triggerRandomThought(activeHeroine, affection)}
                            className="text-slate-400 hover:text-white"
                          >
                            🔄 更新
                          </button>
                        </div>
                        <p className="text-xs font-mono text-slate-200 italic leading-relaxed pt-0.5">
                          "{currentThought || "..."}"
                        </p>
                      </div>
                    ) : (
                      <div className="p-2.5 bg-[#09111e] border border-[#213757] rounded-lg text-xs text-slate-400 font-mono">
                        未解放です。RPで解放できます。
                      </div>
                    )}

                    <div className="pt-1">
                      {!isUnlocked ? (
                        <button
                          onClick={() => handleUnlockHeroine(activeHeroine)}
                          className="w-full py-2.5 btn-game-yellow text-xs font-bold rounded-xl flex items-center justify-center gap-2"
                        >
                          解放する (消費: {activeHeroine.unlock_cost} RP)
                        </button>
                      ) : affection < 5 ? (
                        <button
                          onClick={() => handleUpgradeAffection(activeHeroine)}
                          className="w-full py-2.5 btn-game-yellow text-xs font-bold rounded-xl flex items-center justify-center gap-2"
                        >
                          親愛度を上げる (Lv.{affection} ➔ Lv.{affection + 1} / 必要: {requiredCost} RP)
                        </button>
                      ) : (
                        <div className="text-center py-2 bg-pink-950/40 border border-pink-500/50 rounded-xl text-pink-300 font-bold text-xs font-num">
                          👑 MAX (Lv.5)
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </section>
        )}

        {/* 交流ノベルモーダル */}
        {novelDialogue && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <div className="game-panel rounded-2xl max-w-md w-full p-5 text-white space-y-4 shadow-2xl">
              <div className="text-center space-y-1 border-b border-[#213757] pb-2">
                <span className="bg-pink-600 text-white text-[9px] font-bold px-2.5 py-0.5 rounded-full uppercase font-num">
                  EVENT - Lv.{novelDialogue.level} UNLOCKED
                </span>
                <h3 className="text-sm font-bold text-pink-300">{novelDialogue.heroine.name} との交流</h3>
              </div>

              <div className="relative aspect-square max-h-48 mx-auto bg-[#08101c] rounded-xl overflow-hidden border border-pink-500/50">
                <img
                  src={novelDialogue.heroine.image_url}
                  alt={novelDialogue.heroine.name}
                  onError={handleImageError}
                  className="w-full h-full object-cover object-top"
                />
              </div>

              <div className="bg-[#08101c] border border-pink-500/40 p-3 rounded-xl space-y-1">
                <div className="text-[9px] text-pink-400 font-bold font-mono">【{novelDialogue.heroine.name}】</div>
                <p className="text-xs font-mono text-slate-100 italic leading-relaxed">
                  "{novelDialogue.text}"
                </p>
              </div>

              <button
                onClick={() => setNovelDialogue(null)}
                className="w-full py-2.5 btn-game-yellow text-xs font-bold rounded-xl"
              >
                確認 ➔
              </button>
            </div>
          </div>
        )}

        {/* プレイヤー名編集 */}
        {isEditingName && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <div className="game-panel rounded-2xl p-5 max-w-xs w-full text-white space-y-3 shadow-2xl">
              <h3 className="text-xs font-bold text-white border-b border-[#213757] pb-2">プレイヤー名設定</h3>
              <input
                type="text"
                value={newNameInput}
                onChange={(e) => setNewNameInput(e.target.value)}
                className="w-full bg-[#0a121f] border border-[#213757] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-500 font-bold"
                placeholder="例: Takumi"
              />
              <div className="flex gap-2 justify-end pt-1">
                <button onClick={() => setIsEditingName(false)} className="px-3 py-1 text-xs text-slate-400">キャンセル</button>
                <button onClick={handleSaveName} className="px-4 py-1 btn-game-yellow text-xs rounded-xl">保存</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}