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

  // プロフィールステータス
  const [displayName, setDisplayName] = useState("Takumi");
  const [romancePoints, setRomancePoints] = useState(0);
  const [ownedMonstersCount, setOwnedMonstersCount] = useState(0);

  // マスターデータ
  const [countries, setCountries] = useState<Country[]>([]);
  const [heroines, setHeroines] = useState<Heroine[]>([]);
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [dateEvents, setDateEvents] = useState<DateEvent[]>([]);

  // 画面状態管理
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [activeHeroine, setActiveHeroine] = useState<Heroine | null>(null);
  const [currentThought, setCurrentThought] = useState<string | null>(null);

  // デートイベント（ノベル）モーダル
  const [novelDialogue, setNovelDialogue] = useState<{ heroine: Heroine; level: number; text: string } | null>(null);
  
  // 名前編集モーダル
  const [isEditingName, setIsEditingName] = useState(false);
  const [newNameInput, setNewNameInput] = useState("");

  const supabase = createClient();

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

    // 1. プロフィールデータ
    const { data: prof } = await supabase
      .from("profiles")
      .select("display_name, romance_points")
      .eq("id", user.id)
      .maybeSingle();

    if (prof) {
      setDisplayName(prof.display_name || "Takumi");
      setRomancePoints(prof.romance_points || 0);
    } else {
      await supabase.from("profiles").insert({ id: user.id, display_name: "Takumi", romance_points: 100 });
      setRomancePoints(100);
    }

    // 2. 所持偉人図鑑カウント
    const { count: mCount } = await supabase
      .from("user_monsters")
      .select("*", { count: "exact", head: true })
      .eq("owner_id", user.id);

    setOwnedMonstersCount(mCount || 0);

    // 3. 国一覧
    const { data: cData } = await supabase
      .from("romance_countries")
      .select("*")
      .order("id", { ascending: true });

    if (cData) setCountries(cData);

    // 4. ヒロイン一覧 ＆ ユーザー進行度
    const { data: hData } = await supabase
      .from("heroines")
      .select("*, user_heroines(unlocked, affection_level, current_rp)")
      .order("id", { ascending: true });

    if (hData) setHeroines(hData as Heroine[]);

    // 5. 心の声 ＆ デートイベント
    const { data: tData } = await supabase.from("heroine_thoughts").select("*");
    if (tData) setThoughts(tData);

    const { data: dData } = await supabase.from("heroine_dates").select("*");
    if (dData) setDateEvents(dData);

    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, [signedIn]);

  // 心の声（ランダム吹き出し表示）
  const triggerRandomThought = (heroine: Heroine, level: number) => {
    const list = thoughts.filter((t) => t.heroine_id === heroine.id && t.affection_level <= level);
    if (list.length > 0) {
      const picked = list[Math.floor(Math.random() * list.length)].thought_en;
      setCurrentThought(picked.replace(/{player_name}/g, displayName));
    } else {
      setCurrentThought(`I wonder what ${displayName} is doing right now...`);
    }
  };

  // ヒロインアンロック（ナンパ実行）
  const handleUnlockHeroine = async (heroine: Heroine) => {
    if (romancePoints < heroine.unlock_cost) {
      alert(`RP（Romance Point）が足りません！（必要: ${heroine.unlock_cost} RP）`);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // RP消費
    const newRp = romancePoints - heroine.unlock_cost;
    await supabase.from("profiles").update({ romance_points: newRp }).eq("id", user.id);
    setRomancePoints(newRp);

    // アンロック登録
    await supabase.from("user_heroines").upsert({
      owner_id: user.id,
      heroine_id: heroine.id,
      unlocked: true,
      affection_level: 1,
      current_rp: 0,
    });

    void loadData();
  };

  // 好感度レベルアップ（RP投入）
  const handleUpgradeAffection = async (heroine: Heroine) => {
    const userH = heroine.user_heroines && heroine.user_heroines.length > 0 ? heroine.user_heroines[0] : null;
    if (!userH || !userH.unlocked) return;

    const currentLevel = userH.affection_level;
    if (currentLevel >= 5) {
      alert("すでに最高好感度（Lv.5 MAX）に達しています！");
      return;
    }

    // レベルアップに必要なコスト定義（シークレットヒロインは高コスト）
    const costMap: Record<number, number> = heroine.is_secret
      ? { 1: 1000, 2: 3000, 3: 6000, 4: 20000 }
      : { 1: 200, 2: 500, 3: 1000, 4: 2000 };

    const requiredCost = costMap[currentLevel] || 500;

    if (romancePoints < requiredCost) {
      alert(`好感度アップに必要なRPが不足しています！（必要: ${requiredCost} RP）`);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // RP消費 ＆ レベルアップ
    const newRp = romancePoints - requiredCost;
    const nextLevel = currentLevel + 1;

    await supabase.from("profiles").update({ romance_points: newRp }).eq("id", user.id);
    await supabase.from("user_heroines").update({
      affection_level: nextLevel,
    }).eq("owner_id", user.id).eq("heroine_id", heroine.id);

    setRomancePoints(newRp);

    // デート会話イベント起動！
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

  // プレイヤー名保存
  const handleSaveName = async () => {
    if (!newNameInput.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("profiles").update({ display_name: newNameInput.trim() }).eq("id", user.id);
    setDisplayName(newNameInput.trim());
    setIsEditingName(false);
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-950 text-pink-400 p-8 text-center text-xs font-mono">LOADING WORLD ROMANCE DATA...</div>;
  }

  return (
    <main className="min-h-screen bg-[#0d0914] text-slate-100 font-sans py-6 px-3 sm:px-6 relative selection:bg-pink-500 selection:text-white">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* トップステータスバー */}
        <header className="bg-gradient-to-r from-slate-900 via-purple-950 to-slate-900 border-2 border-pink-500/40 rounded-2xl p-4 shadow-2xl flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="text-3xl">🌹</div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black text-white tracking-wider">WORLD ROMANCE</h1>
                <button
                  onClick={() => { setNewNameInput(displayName); setIsEditingName(true); }}
                  className="text-[10px] bg-pink-950/80 text-pink-300 border border-pink-700/60 px-2 py-0.5 rounded-full hover:bg-pink-900"
                >
                  ✏️ {displayName}
                </button>
              </div>
              <p className="text-[11px] text-pink-300/80 font-mono">世界の美女と出会い、好感度を深めるやり込みモード</p>
            </div>
          </div>

          <div className="flex items-center gap-3 font-mono">
            <div className="bg-slate-950 border border-pink-500/50 px-3.5 py-2 rounded-xl text-right shadow-inner">
              <div className="text-[9px] font-bold text-pink-400 uppercase tracking-widest leading-none">ROMANCE POINTS</div>
              <div className="text-base font-black text-pink-300 leading-tight mt-0.5">💖 {romancePoints} <span className="text-xs font-normal">RP</span></div>
            </div>

            <Link
              href="/"
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 transition-colors"
            >
              ◀ ダッシュボード
            </Link>
          </div>
        </header>

        {/* 🗺️ 世界地図 ＆ 国選択エリア */}
        <section className="bg-slate-900/80 border border-purple-900/50 rounded-2xl p-4 space-y-4 shadow-xl">
          <div className="flex justify-between items-center border-b border-slate-800 pb-2">
            <span className="text-xs font-black text-pink-400 font-mono flex items-center gap-1.5">
              <span>🗺️</span> WORLD MAP (解放国: {countries.filter(c => ownedMonstersCount >= c.required_monsters).length} / {countries.length})
            </span>
            <span className="text-[10px] text-slate-400 font-mono">図鑑所持: 📖 {ownedMonstersCount} 体</span>
          </div>

          {/* 7カ国グリッド */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                  className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center justify-between relative overflow-hidden ${
                    !isUnlocked
                      ? "bg-slate-950 border-slate-800 opacity-40 cursor-not-allowed grayscale"
                      : isSelected
                      ? "bg-gradient-to-b from-pink-950 to-purple-950 border-pink-400 ring-2 ring-pink-500/40 shadow-lg scale-105"
                      : "bg-slate-900/90 border-slate-800 hover:border-pink-500/50 active:scale-95 cursor-pointer"
                  }`}
                >
                  <div className="text-3xl mb-1">{c.flag_emoji}</div>
                  <div className="text-xs font-black text-white">{c.name_ja}</div>
                  <div className="text-[9px] text-slate-400 font-mono uppercase">{c.name_en}</div>

                  {!isUnlocked && (
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-[1px] flex flex-col items-center justify-center p-1">
                      <span className="text-xs">🔒</span>
                      <span className="text-[9px] font-mono text-pink-400 font-bold mt-1">図鑑 {c.required_monsters}体で解放</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* 🌹 選択した国のヒロイン一覧 (5名) */}
        {selectedCountry && (
          <section className="bg-slate-900/90 border-2 border-pink-500/40 rounded-2xl p-4 space-y-4 shadow-2xl animate-fadeIn">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <h2 className="text-sm font-black text-white flex items-center gap-2">
                <span>{selectedCountry.flag_emoji}</span> {selectedCountry.name_ja} のヒロイン一覧
              </h2>
              <span className="text-[10px] text-slate-400 font-mono">タップでコミュニケーション / ナンパ</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {heroines.filter(h => h.country_id === selectedCountry.id).map((h) => {
                const userH = h.user_monsters && h.user_monsters.length > 0 ? h.user_monsters[0] : null;
                const isUnlocked = userH?.unlocked ?? false;
                const affection = userH?.affection_level ?? 1;

                return (
                  <div
                    key={h.id}
                    onClick={() => {
                      setActiveHeroine(h);
                      if (isUnlocked) triggerRandomThought(h, affection);
                    }}
                    className={`bg-slate-950 border rounded-2xl p-2.5 text-center space-y-2 cursor-pointer transition-all relative overflow-hidden flex flex-col justify-between ${
                      activeHeroine?.id === h.id ? "border-pink-400 ring-2 ring-pink-500/50 shadow-xl" : "border-slate-800 hover:border-pink-800"
                    }`}
                  >
                    {/* 画像 */}
                    <div className="aspect-[3/4] bg-slate-900 rounded-xl overflow-hidden relative border border-slate-800">
                      <img
                        src={h.image_url}
                        alt={h.name}
                        className={`w-full h-full object-cover object-top transition-transform duration-300 ${isUnlocked ? "" : "blur-sm grayscale opacity-50"}`}
                      />

                      {/* 好感度バッジ */}
                      {isUnlocked ? (
                        <div className="absolute top-1 left-1 bg-slate-950/80 backdrop-blur text-pink-400 text-[9px] font-black font-mono px-1.5 py-0.5 rounded border border-pink-500/40">
                          Lv.{affection} {affection === 5 && "👑"}
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/60 font-mono text-[10px] text-pink-300 font-bold">
                          🔒 未出会い
                        </div>
                      )}

                      {h.is_secret && (
                        <div className="absolute bottom-1 right-1 bg-amber-500 text-black text-[8px] font-black px-1.5 py-0.2 rounded uppercase">
                          SECRET
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="text-xs font-black text-white truncate">{h.name}</div>
                      <div className="text-[9px] text-slate-400 font-mono truncate">{h.personality}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 💬 ヒロイン詳細 ＆ 心の声（独り言）＆ 好感度アップパネル */}
        {activeHeroine && (
          <section className="bg-gradient-to-b from-slate-900 to-[#180f24] border-2 border-pink-500 rounded-2xl p-5 shadow-2xl space-y-4 animate-fadeIn">
            {(() => {
              const userH = activeHeroine.user_monsters && activeHeroine.user_monsters.length > 0 ? activeHeroine.user_monsters[0] : null;
              const isUnlocked = userH?.unlocked ?? false;
              const affection = userH?.affection_level ?? 1;

              const costMap: Record<number, number> = activeHeroine.is_secret
                ? { 1: 1000, 2: 3000, 3: 6000, 4: 20000 }
                : { 1: 200, 2: 500, 3: 1000, 4: 2000 };

              const requiredCost = costMap[affection] || 500;

              return (
                <div className="flex flex-col md:flex-row gap-5 items-center">
                  
                  {/* ポートレート立ち絵 */}
                  <div className="w-44 h-60 bg-slate-950 rounded-2xl overflow-hidden border-2 border-pink-500/60 shadow-xl shrink-0 relative">
                    <img
                      src={activeHeroine.image_url}
                      alt={activeHeroine.name}
                      className={`w-full h-full object-cover object-top ${isUnlocked ? "" : "blur-md grayscale"}`}
                    />
                  </div>

                  {/* 右側詳細 ＆ コンテンツ */}
                  <div className="flex-1 space-y-3 w-full">
                    <div className="border-b border-slate-800 pb-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-black text-white">{activeHeroine.name}</h3>
                        <span className="text-xs text-slate-400 font-mono">({activeHeroine.age}歳)</span>
                      </div>
                      <p className="text-xs text-pink-300 font-mono mt-0.5">{activeHeroine.personality}</p>
                    </div>

                    {/* 心の声 (吹き出し) */}
                    {isUnlocked ? (
                      <div className="bg-pink-950/40 border border-pink-500/50 p-3.5 rounded-2xl space-y-1 relative shadow-inner">
                        <div className="text-[9px] font-bold font-mono text-pink-400 uppercase tracking-widest flex items-center justify-between">
                          <span>💭 HER INNER THOUGHTS (心の声)</span>
                          <button
                            onClick={() => triggerRandomThought(activeHeroine, affection)}
                            className="text-slate-400 hover:text-white"
                          >
                            🔄 別の独り言を聞く
                          </button>
                        </div>
                        <p className="text-xs font-mono text-slate-100 italic leading-relaxed pt-1">
                          "{currentThought || "..."}"
                        </p>
                      </div>
                    ) : (
                      <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-400 font-mono">
                        まだ出会っていません。「ナンパする（アンロック）」で会話が解放されます。
                      </div>
                    )}

                    {/* アクションボタン */}
                    <div className="pt-2">
                      {!isUnlocked ? (
                        <button
                          onClick={() => handleUnlockHeroine(activeHeroine)}
                          className="w-full py-3 bg-gradient-to-r from-pink-600 to-purple-600 hover:opacity-90 active:translate-y-0.5 text-white font-black text-xs rounded-xl shadow-lg border border-pink-400/30 transition-all flex items-center justify-center gap-2"
                        >
                          <span>🍷 ナンパして出会う (消費: {activeHeroine.unlock_cost} RP)</span>
                        </button>
                      ) : affection < 5 ? (
                        <button
                          onClick={() => handleUpgradeAffection(activeHeroine)}
                          className="w-full py-3 bg-gradient-to-r from-pink-600 via-rose-600 to-purple-600 hover:opacity-90 active:translate-y-0.5 text-white font-black text-xs rounded-xl shadow-lg border border-pink-400/30 transition-all flex items-center justify-center gap-2"
                        >
                          <span>💖 好感度を深める (Lv.{affection} ➔ Lv.{affection + 1} / 必要: {requiredCost} RP)</span>
                        </button>
                      ) : (
                        <div className="text-center py-2.5 bg-gradient-to-r from-amber-500/20 to-pink-500/20 border border-amber-500/50 rounded-xl text-amber-300 font-black text-xs font-mono">
                          👑 好感度 MAX (Lv.5) - 特別な絆で結ばれています
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              );
            })()}
          </section>
        )}

        {/* 📖 恋愛ノベル風デートイベント モーダル */}
        {novelDialogue && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fadeIn">
            <div className="bg-[#120a1d] border-2 border-pink-500 rounded-3xl max-w-md w-full p-6 text-white space-y-5 shadow-2xl relative font-sans overflow-hidden">
              
              <div className="text-center space-y-1 border-b border-purple-900 pb-3">
                <span className="bg-pink-600 text-white text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest animate-bounce inline-block">
                  ✨ DATE EVENT - Lv.{novelDialogue.level} UNLOCKED
                </span>
                <h3 className="text-base font-black text-pink-300">{novelDialogue.heroine.name} との特別な出来事</h3>
              </div>

              {/* ノベルゲーム立ち絵表示 */}
              <div className="relative aspect-square max-h-56 mx-auto bg-slate-950 rounded-2xl overflow-hidden border-2 border-pink-500/60 shadow-2xl">
                <img
                  src={novelDialogue.heroine.image_url}
                  alt={novelDialogue.heroine.name}
                  className="w-full h-full object-cover object-top"
                />
              </div>

              {/* 英語会話テキスト (ノベル枠) */}
              <div className="bg-slate-950/90 border-2 border-pink-500/60 p-4 rounded-2xl space-y-1 shadow-inner min-h-[90px]">
                <div className="text-[10px] text-pink-400 font-black font-mono">【{novelDialogue.heroine.name}】</div>
                <p className="text-xs font-mono text-slate-100 italic leading-relaxed pt-1">
                  "{novelDialogue.text}"
                </p>
              </div>

              <button
                onClick={() => setNovelDialogue(null)}
                className="w-full py-3 bg-gradient-to-r from-pink-600 to-purple-600 hover:opacity-90 text-white font-black text-xs rounded-xl shadow-lg transition-all"
              >
                想いを受け入れる ➔
              </button>
            </div>
          </div>
        )}

        {/* ✏️ プレイヤー名編集モーダル */}
        {isEditingName && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fadeIn">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-xs w-full text-white space-y-4 shadow-2xl">
              <h3 className="text-sm font-black text-white border-b border-slate-800 pb-2">✏️ プレイヤー名設定</h3>
              <p className="text-xs text-slate-400 font-mono">ヒロインたちが呼んでくれるあなたの名前を設定します。</p>
              
              <input
                type="text"
                value={newNameInput}
                onChange={(e) => setNewNameInput(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-500 font-bold"
                placeholder="例: Takumi"
              />

              <div className="flex gap-2 justify-end pt-1">
                <button onClick={() => setIsEditingName(false)} className="px-3 py-1.5 text-xs text-slate-400">キャンセル</button>
                <button onClick={handleSaveName} className="px-4 py-1.5 bg-pink-600 text-white font-black text-xs rounded-xl shadow">保存</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}