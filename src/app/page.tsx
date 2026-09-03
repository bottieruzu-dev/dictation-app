"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import GachaModal from "@/components/GachaModal";

interface Video {
  id: string;
  youtube_id: string;
  title: string | null;
  status: string;
  created_at: string;
}

interface Monster {
  id: number;
  name: string;
  rarity: number;
  image_url: string;
}

interface Clip {
  id: string;
  label: string | null;
  tags: string[] | null;
  status: string;
  video_id: string;
  created_at: string;
  difficulty_score?: number | null;
  difficulty_tier?: string | null;
  effective_wpm?: number | null;
  monster_id?: number | null;
  monsters?: Monster | null;
  user_luck?: number;
  is_cleared?: boolean;
  videos?: {
    youtube_id: string;
    title: string;
  };
}

export default function DashboardPage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"clips" | "videos">("clips");
  const [searchQuery, setSearchQuery] = useState("");

  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);

  const [videos, setVideos] = useState<Video[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [totalStorageBytes, setTotalStorageBytes] = useState(0);
  const [orbCount, setOrbCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const [editingClip, setEditingClip] = useState<Clip | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editTags, setEditTags] = useState("");

  const [isGachaOpen, setIsGachaOpen] = useState(false);

  const supabase = createClient();

  const handleThumbError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    e.currentTarget.src = "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=400";
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSignedIn(!!data.session);
    });
  }, [supabase]);

  const fetchData = async () => {
    if (!signedIn) return;
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();

    const { data: orbRes, error: orbErr } = await supabase.rpc("ensure_initial_orbs");
    if (!orbErr && orbRes !== null) {
      setOrbCount(orbRes);
    }

    const { data: vData } = await supabase
      .from("videos")
      .select("id, youtube_id, title, status, created_at")
      .order("created_at", { ascending: false });

    if (vData) setVideos(vData);

    let luckMap: Record<number, number> = {};
    if (user) {
      const { data: uMonData } = await supabase
        .from("user_monsters")
        .select("monster_id, luck")
        .eq("owner_id", user.id);

      if (uMonData) {
        uMonData.forEach((row) => {
          luckMap[row.monster_id] = row.luck;
        });
      }
    }

    let clearedClipIds = new Set<string>();
    if (user) {
      const { data: clearData } = await supabase
        .from("play_sessions")
        .select("clip_id")
        .eq("owner_id", user.id);

      if (clearData) {
        clearData.forEach((row) => clearedClipIds.add(row.clip_id));
      }
    }

    const { data: cData } = await supabase
      .from("clips")
      .select("*, videos(youtube_id, title), monsters(*)")
      .order("created_at", { ascending: false });

    if (cData) {
      const formattedClips: Clip[] = cData.map((c: any) => ({
        ...c,
        user_luck: c.monster_id ? (luckMap[c.monster_id] ?? 0) : 0,
        is_cleared: clearedClipIds.has(c.id),
      }));
      setClips(formattedClips);
    }

    const { data: assetData } = await supabase
      .from("clip_assets")
      .select("video_bytes");

    if (assetData) {
      const bytes = assetData.reduce((acc, row) => acc + (row.video_bytes || 0), 0);
      setTotalStorageBytes(bytes);
    }

    setLoading(false);
  };

  useEffect(() => {
    void fetchData();
  }, [signedIn]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthError(error.message);
    else setSignedIn(true);
  };

  const extractYoutubeId = (url: string) => {
    const match = url.match(/(?:v=|\/embed\/|\/1080\/|\/shorts\/|youtu\.be\/|\/v\/)([^#&?]*)/);
    return match && match[1].length === 11 ? match[1] : null;
  };

  const handleAddVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitMessage(null);

    const ytId = extractYoutubeId(youtubeUrl);
    if (!ytId) {
      setSubmitMessage("有効なYouTube URLを入力してください。");
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("ログインしていません。");

      const { data: video, error: vErr } = await supabase
        .from("videos")
        .insert({
          owner_id: user.id,
          youtube_id: ytId,
          title: "（取得中...）",
          status: "downloading",
        })
        .select("id")
        .single();

      if (vErr) throw vErr;

      const { error: jErr } = await supabase.from("ingest_jobs").insert({
        owner_id: user.id,
        video_id: video.id,
        type: "download",
        lane: "gpu",
        priority: 100,
        payload: { youtube_id: ytId },
      });

      if (jErr) throw jErr;

      setSubmitMessage("動画のインジェストを開始しました。");
      setYoutubeUrl("");
      void fetchData();
    } catch (err: any) {
      setSubmitMessage(`エラー: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClip = async (clipId: string) => {
    if (!confirm("この遠征クリップを削除しますか？")) return;
    await supabase.from("clips").delete().eq("id", clipId);
    void fetchData();
  };

  const handleSaveEdit = async () => {
    if (!editingClip) return;
    const tagArray = editTags.split(",").map((t) => t.trim()).filter(Boolean);

    await supabase.from("clips").update({
      label: editLabel,
      tags: tagArray,
    }).eq("id", editingClip.id);

    setEditingClip(null);
    void fetchData();
  };

  const getTierStyle = (tier?: string | null) => {
    switch (tier) {
      case "初級":
        return "bg-emerald-950/80 text-emerald-300 border-emerald-600/60";
      case "中級":
        return "bg-amber-950/80 text-amber-300 border-amber-600/60";
      case "上級":
        return "bg-orange-950/80 text-orange-300 border-orange-600/60";
      case "超上級":
        return "bg-purple-950/80 text-purple-300 border-purple-600/60";
      case "超絶":
        return "bg-red-950/80 text-red-300 border-red-600/80 font-black";
      default:
        return "bg-slate-900/80 text-slate-300 border-slate-700";
    }
  };

  if (signedIn === false) {
    return (
      <form onSubmit={handleSignIn} className="max-w-sm mx-auto my-20 p-8 rpg-panel-dark rounded-2xl space-y-5 text-slate-100">
        <div className="text-center space-y-1">
          <span className="text-[10px] font-num tracking-widest text-[#cbb07a] uppercase">KNIGHT'S COMMAND</span>
          <h2 className="text-xl font-bold tracking-wide text-white">騎士団 ログイン</h2>
        </div>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="メールアドレス" className="w-full bg-[#110e19] border border-[#3f3352] rounded-lg px-3.5 py-2.5 text-xs text-white focus:border-[#cbb07a] focus:outline-none" required />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="パスワード" className="w-full bg-[#110e19] border border-[#3f3352] rounded-lg px-3.5 py-2.5 text-xs text-white focus:border-[#cbb07a] focus:outline-none" required />
        <button className="w-full btn-gold py-3 rounded-lg text-xs tracking-wider">出撃認証</button>
        {authError && <p className="text-red-400 text-xs text-center">{authError}</p>}
      </form>
    );
  }

  const storageMb = (totalStorageBytes / (1024 * 1024)).toFixed(1);

  const filteredClips = clips.filter((c) => {
    const q = searchQuery.toLowerCase();
    const labelMatch = (c.label || "").toLowerCase().includes(q);
    const tagMatch = (c.tags || []).some((t) => t.toLowerCase().includes(q));
    const tierMatch = (c.difficulty_tier || "").toLowerCase().includes(q);
    const monsterMatch = (c.monsters?.name || "").toLowerCase().includes(q);
    return labelMatch || tagMatch || tierMatch || monsterMatch;
  });

  const filteredVideos = videos.filter((v) =>
    (v.title || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <main className="min-h-screen py-6 px-3 sm:px-6">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* 👑 金彩ヘッダー・ステータス表示 */}
        <header className="rpg-panel-dark rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#cbb07a] to-[#735832] p-0.5 shadow-lg shrink-0 flex items-center justify-center">
                <div className="w-full h-full bg-[#181422] rounded-[10px] flex items-center justify-center text-lg font-num font-black text-[#f3e5ab]">
                  ⚔️
                </div>
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-wider text-[#f3e5ab] flex items-center gap-2 font-serif">
                  Dictation RPG
                  <span className="text-[9px] font-num px-2 py-0.5 rounded bg-[#2a2236] text-[#cbb07a] border border-[#524161]">Ver 2.0</span>
                </h1>
                <p className="text-[11px] text-slate-400">試練のディクテーション × 英傑育成</p>
              </div>
            </div>

            {/* オーブ / ストレージ */}
            <div className="flex items-center gap-3 self-end md:self-auto font-num">
              <div className="bg-[#100d18] border border-[#8c6e40] px-4 py-2 rounded-xl shadow-inner flex items-center gap-3">
                <span className="text-lg text-[#f3e5ab]">💎</span>
                <div>
                  <div className="text-[8px] font-bold text-[#cbb07a] uppercase tracking-widest leading-none">ORB POSSESSION</div>
                  <div className="text-sm font-bold text-[#f3e5ab] leading-tight mt-0.5">{orbCount} <span className="text-[10px] font-normal text-slate-400">個</span></div>
                </div>
              </div>

              <div className="bg-[#100d18] border border-[#3b304f] px-3.5 py-2 rounded-xl text-right">
                <div className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-none">R2 CAPACITY</div>
                <div className="text-xs font-bold text-indigo-300 leading-tight mt-0.5">{storageMb} <span className="text-[9px] text-slate-500">MB</span></div>
              </div>
            </div>
          </div>

          {/* メインナビゲーションボタン群 */}
          <nav className="grid grid-cols-2 sm:grid-cols-6 gap-2 pt-3 border-t border-[#312742]">
            <Link
              href="/missions"
              className="py-2.5 px-3 btn-gold text-xs rounded-xl text-center shadow flex items-center justify-center gap-1.5 col-span-2 sm:col-span-1"
            >
              🎯 試練任務
            </Link>

            <Link
              href="/romance"
              className="py-2.5 px-3 btn-nav-dark text-xs rounded-xl text-center flex items-center justify-center gap-1.5 col-span-2 sm:col-span-1"
            >
              🌹 遠征世界
            </Link>

            <Link
              href="/party"
              className="py-2.5 px-3 btn-nav-dark text-xs rounded-xl text-center flex items-center justify-center gap-1.5"
            >
              ⚔️ 騎士団編成
            </Link>

            <button
              onClick={() => setIsGachaOpen(true)}
              className="py-2.5 px-3 btn-nav-dark text-xs rounded-xl text-center flex items-center justify-center gap-1.5"
            >
              🔮 聖霊召喚
            </button>

            <Link
              href="/monsters"
              className="py-2.5 px-3 btn-nav-dark text-xs rounded-xl text-center flex items-center justify-center gap-1.5"
            >
              📖 英傑魔導書
            </Link>

            <Link
              href="/history"
              className="py-2.5 px-3 btn-nav-dark text-xs rounded-xl text-center flex items-center justify-center gap-1.5"
            >
              📝 鍛錬手記
            </Link>
          </nav>
        </header>

        {/* 📹 新規YouTube動画取り込み */}
        <section className="rpg-panel-dark rounded-2xl p-4 space-y-2.5">
          <h2 className="text-xs font-bold text-[#cbb07a] uppercase tracking-wider flex items-center gap-1.5 font-serif">
            <span>📹</span> 新規試練動画のインジェスト
          </h2>
          <form onSubmit={handleAddVideo} className="flex gap-2">
            <input
              type="text"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="flex-1 bg-[#100d18] border border-[#3b304f] rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-[#cbb07a] font-mono"
              required
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 btn-gold text-xs rounded-xl whitespace-nowrap disabled:opacity-50"
            >
              {isSubmitting ? "解析中..." : "取り込む"}
            </button>
          </form>
          {submitMessage && (
            <p className="text-xs font-mono text-[#cbb07a] bg-[#1a1526] border border-[#4a3a61] p-2.5 rounded-xl">
              {submitMessage}
            </p>
          )}
        </section>

        {/* 🔍 検索 ＆ クリップ/原本タブ */}
        <div className="space-y-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="🔍 題名、タグ、難易度（初級、超絶等）、英傑名で検索..."
            className="w-full bg-[#120f1a] border border-[#342a47] rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#cbb07a]"
          />

          <div className="flex border-b border-[#312742]">
            <button
              onClick={() => setActiveTab("clips")}
              className={`flex-1 py-2.5 font-bold text-xs text-center border-b-2 transition-all ${
                activeTab === "clips"
                  ? "border-[#cbb07a] text-[#f3e5ab] bg-[#221b30]"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              ✂️ 遠征試練クリップ ({filteredClips.length})
            </button>
            <button
              onClick={() => setActiveTab("videos")}
              className={`flex-1 py-2.5 font-bold text-xs text-center border-b-2 transition-all ${
                activeTab === "videos"
                  ? "border-[#cbb07a] text-[#f3e5ab] bg-[#221b30]"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              📹 登録済み原本動画 ({filteredVideos.length})
            </button>
          </div>
        </div>

        {/* ✂️ クリップカード一覧（羊皮紙 × アンティーク風パネル） */}
        {activeTab === "clips" && (
          <section>
            {loading ? (
              <p className="text-xs text-slate-500 font-mono text-center py-12">試練データを読込中...</p>
            ) : filteredClips.length === 0 ? (
              <div className="rpg-panel-dark p-12 text-center rounded-2xl text-slate-500 text-xs font-mono">
                該当する試練クリップが存在しません。
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {filteredClips.map((clip) => {
                  const ytId = clip.videos?.youtube_id;
                  const thumbUrl = ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : null;
                  const mon = clip.monsters;
                  const currentLuck = clip.user_luck ?? 0;
                  const style = getTierStyle(clip.difficulty_tier);

                  return (
                    <div
                      key={clip.id}
                      className="parchment-panel rounded-2xl overflow-hidden shadow-xl flex flex-col justify-between"
                    >
                      {/* 上部：サムネイル ＆ 難易度バッジ */}
                      <div className="aspect-video bg-[#120f1a] relative overflow-hidden group">
                        {thumbUrl ? (
                          <img
                            src={thumbUrl}
                            alt="Thumbnail"
                            onError={handleThumbError}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 opacity-90"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-600 text-xs font-mono">NO IMAGE</div>
                        )}

                        {/* クリア状態バッジ */}
                        {clip.is_cleared ? (
                          <span className="absolute top-2.5 right-2.5 bg-emerald-800 text-emerald-100 font-bold text-[9px] font-mono px-2 py-0.5 rounded shadow border border-emerald-500/50">
                            CLEARED
                          </span>
                        ) : (
                          <span className="absolute top-2.5 right-2.5 bg-amber-600 text-amber-950 font-bold text-[9px] font-mono px-2 py-0.5 rounded shadow border border-amber-300">
                            NEW (初回💎2)
                          </span>
                        )}

                        {clip.difficulty_tier && (
                          <span className={`absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded text-[10px] font-bold font-mono border shadow ${style}`}>
                            {clip.difficulty_tier} (SCORE: {clip.difficulty_score ?? 0})
                          </span>
                        )}

                        {clip.effective_wpm && (
                          <span className="absolute bottom-2 right-2 bg-black/80 text-slate-300 font-mono text-[9px] px-2 py-0.5 rounded border border-slate-700">
                            WPM: {clip.effective_wpm}
                          </span>
                        )}
                      </div>

                      {/* 下部：詳細 ＆ 英傑ドロップ情報 */}
                      <div className="p-3.5 space-y-3 flex-1 flex flex-col justify-between">
                        <div className="space-y-2">
                          <div className="flex justify-between items-start gap-2">
                            <Link
                              href={`/clips/${clip.id}/prepare`}
                              className="font-bold text-sm text-[#2b2118] hover:text-[#8c6e40] transition-colors line-clamp-1"
                            >
                              {clip.label || "無題の試練"}
                            </Link>
                            <div className="flex gap-1 shrink-0">
                              <button
                                onClick={() => {
                                  setEditingClip(clip);
                                  setEditLabel(clip.label || "");
                                  setEditTags((clip.tags || []).join(", "));
                                }}
                                className="text-xs text-slate-600 hover:text-slate-900 p-1"
                              >
                                ✏️
                              </button>
                              <button
                                onClick={() => handleDeleteClip(clip.id)}
                                className="text-xs text-slate-600 hover:text-red-700 p-1"
                              >
                                🗑️
                              </button>
                            </div>
                          </div>

                          {/* 偉人ターゲット表示 */}
                          {mon ? (
                            <div className="bg-[#e2d5bd] border border-[#bfae95] p-2 rounded-xl flex items-center justify-between gap-2 shadow-inner">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <img
                                  src={mon.image_url}
                                  alt={mon.name}
                                  className="w-9 h-9 object-cover rounded-lg border border-[#a89578] shrink-0"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="text-[9px] text-[#a6814a] font-bold leading-none mb-0.5">
                                    {"★".repeat(mon.rarity)}
                                  </div>
                                  <div className="text-xs font-bold text-[#2b2118] truncate">
                                    {mon.name}
                                  </div>
                                </div>
                              </div>

                              <div className="text-right font-num shrink-0">
                                <div className="text-xs font-bold text-[#8c6e40]">☘️ {currentLuck}</div>
                              </div>
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-600 bg-[#e2d5bd]/60 p-2 rounded-xl text-center font-mono border border-[#c2b29b]">
                              守護英傑 未割り当て
                            </div>
                          )}

                          {clip.tags && clip.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {clip.tags.map((t, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => setSearchQuery(t)}
                                  className="text-[9px] bg-[#dfcfb9] text-[#524333] px-2 py-0.5 rounded font-mono border border-[#bfae95]"
                                >
                                  #{t}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <Link
                          href={`/clips/${clip.id}/prepare`}
                          className="block text-center py-2 btn-gold text-xs rounded-xl shadow uppercase tracking-wider"
                        >
                          ⚔️ 試練出撃 ➔
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* 📹 動画原本一覧 */}
        {activeTab === "videos" && (
          <section>
            {loading ? (
              <p className="text-xs text-slate-500 font-mono text-center py-12">動画データを読込中...</p>
            ) : filteredVideos.length === 0 ? (
              <div className="rpg-panel-dark p-12 text-center rounded-2xl text-slate-500 text-xs font-mono">
                該当する動画原本が存在しません。
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {filteredVideos.map((video) => {
                  const thumbUrl = video.youtube_id ? `https://img.youtube.com/vi/${video.youtube_id}/hqdefault.jpg` : null;

                  return (
                    <Link
                      key={video.id}
                      href={`/videos/${video.id}`}
                      className="rpg-panel-dark p-3 rounded-2xl hover:border-[#cbb07a] transition-all flex flex-col justify-between group"
                    >
                      {thumbUrl && (
                        <div className="aspect-video bg-black rounded-xl overflow-hidden relative mb-2">
                          <img
                            src={thumbUrl}
                            alt="Thumbnail"
                            onError={handleThumbError}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 opacity-90"
                          />
                        </div>
                      )}
                      <div className="space-y-1">
                        <h3 className="text-xs font-bold text-slate-200 line-clamp-2 group-hover:text-[#f3e5ab] transition-colors">
                          {video.title || "（タイトル取得中）"}
                        </h3>
                        <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono pt-1 border-t border-[#312742]">
                          <span>STATUS: {video.status.toUpperCase()}</span>
                          <span className="text-[#cbb07a] font-bold">解読文字起こし ➔</span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* 編集モーダル */}
        {editingClip && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <div className="rpg-panel-dark rounded-2xl p-5 w-full max-w-sm space-y-4 text-white shadow-2xl">
              <h3 className="font-bold text-sm border-b border-[#312742] pb-2 text-[#f3e5ab]">✏️ 試練情報編集</h3>
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">試練名</label>
                  <input
                    type="text"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    className="w-full bg-[#100d18] border border-[#3b304f] rounded-xl px-3 py-2 text-xs focus:border-[#cbb07a] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">タグ (カンマ区切り)</label>
                  <input
                    type="text"
                    value={editTags}
                    onChange={(e) => setEditTags(e.target.value)}
                    className="w-full bg-[#100d18] border border-[#3b304f] rounded-xl px-3 py-2 text-xs focus:border-[#cbb07a] focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button onClick={() => setEditingClip(null)} className="px-3.5 py-1.5 text-xs text-slate-400">キャンセル</button>
                <button onClick={handleSaveEdit} className="px-4 py-1.5 btn-gold text-xs rounded-xl">保存</button>
              </div>
            </div>
          </div>
        )}

        {/* ガチャモーダル */}
        <GachaModal
          isOpen={isGachaOpen}
          onClose={() => setIsGachaOpen(false)}
          onSuccess={() => void fetchData()}
          orbCount={orbCount}
        />

      </div>
    </main>
  );
}