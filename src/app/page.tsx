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

    // クリア済みクリップの取得
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
      setSubmitMessage("🚨 有効なYouTube URLを入力してください。");
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

      setSubmitMessage("🎉 動画を追加しました！");
      setYoutubeUrl("");
      void fetchData();
    } catch (err: any) {
      setSubmitMessage(`🚨 エラー: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClip = async (clipId: string) => {
    if (!confirm("このクリップを削除しますか？")) return;
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
        return {
          badge: "bg-emerald-500/20 text-emerald-400 border-emerald-500/50 shadow-emerald-500/20",
          cardBorder: "border-emerald-500/40 hover:border-emerald-400 hover:shadow-emerald-500/20",
        };
      case "中級":
        return {
          badge: "bg-cyan-500/20 text-cyan-400 border-cyan-500/50 shadow-cyan-500/20",
          cardBorder: "border-cyan-500/40 hover:border-cyan-400 hover:shadow-cyan-500/20",
        };
      case "上級":
        return {
          badge: "bg-amber-500/20 text-amber-400 border-amber-500/50 shadow-amber-500/20",
          cardBorder: "border-amber-500/40 hover:border-amber-400 hover:shadow-amber-500/20",
        };
      case "超上級":
        return {
          badge: "bg-purple-500/20 text-purple-400 border-purple-500/50 shadow-purple-500/20",
          cardBorder: "border-purple-500/40 hover:border-purple-400 hover:shadow-purple-500/20",
        };
      case "超絶":
        return {
          badge: "bg-red-500/20 text-red-400 border-red-500/50 shadow-red-500/20 animate-pulse",
          cardBorder: "border-red-500/50 hover:border-red-400 hover:shadow-red-500/30",
        };
      default:
        return {
          badge: "bg-slate-700/50 text-slate-300 border-slate-600",
          cardBorder: "border-slate-800 hover:border-slate-700",
        };
    }
  };

  if (signedIn === false) {
    return (
      <form onSubmit={handleSignIn} className="max-w-sm mx-auto my-16 p-6 space-y-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl text-white">
        <h2 className="text-xl font-black text-center tracking-wide">PLAYER LOGIN</h2>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="メールアドレス" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm focus:border-cyan-500 focus:outline-none" required />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="パスワード" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm focus:border-cyan-500 focus:outline-none" required />
        <button className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:opacity-90 text-white py-3 rounded-xl font-black text-sm shadow-lg transition-all">ログイン</button>
        {authError && <p className="text-red-400 text-xs text-center font-mono">{authError}</p>}
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
    <main className="min-h-screen bg-slate-950 text-slate-100 font-sans py-6 selection:bg-cyan-500 selection:text-black">
      <div className="max-w-4xl mx-auto px-4 space-y-6">
        
        {/* ステータスヘッダー */}
        <header className="bg-slate-900/90 border border-slate-800/80 backdrop-blur-md rounded-2xl p-4 shadow-2xl space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-0.5 shadow-lg shadow-purple-500/20">
                <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center text-xl font-black text-transparent bg-clip-text bg-gradient-to-br from-cyan-400 to-indigo-300">
                  D
                </div>
              </div>
              <div>
                <h1 className="text-lg font-black tracking-wider text-white flex items-center gap-2">
                  Dictation App
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-cyan-950 text-cyan-400 border border-cyan-800/50">Ver 2.0</span>
                </h1>
                <p className="text-[11px] text-slate-400 font-mono">ディクテーション × ソシャゲ周回</p>
              </div>
            </div>

            <div className="flex items-center gap-3 self-end md:self-auto font-mono">
              <div className="bg-gradient-to-r from-slate-950 to-slate-900 border border-cyan-500/40 px-4 py-2 rounded-xl shadow-lg flex items-center gap-2.5 relative overflow-hidden group">
                <div className="absolute inset-0 bg-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                <span className="text-xl animate-pulse">💎</span>
                <div>
                  <div className="text-[9px] font-bold text-cyan-400/80 uppercase tracking-widest leading-none">ORB</div>
                  <div className="text-base font-black text-cyan-300 leading-tight drop-shadow">{orbCount} <span className="text-xs font-normal">個</span></div>
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 px-3.5 py-2 rounded-xl text-right">
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">R2 STORAGE</div>
                <div className="text-xs font-bold text-indigo-400 leading-tight mt-0.5">{storageMb} <span className="text-[10px] text-slate-500">MB / 10 GB</span></div>
              </div>
            </div>
          </div>

          <nav className="grid grid-cols-2 sm:grid-cols-6 gap-2 pt-2 border-t border-slate-800/80">
            <Link
              href="/missions"
              className="py-2.5 px-3 bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 hover:opacity-90 active:translate-y-0.5 border border-amber-400/30 text-white text-xs font-black rounded-xl shadow-lg shadow-amber-950 transition-all flex items-center justify-center gap-1.5 col-span-2 sm:col-span-1"
            >
              <span>🎯</span> ミッション
            </Link>

            <Link
              href="/romance"
              className="py-2.5 px-3 bg-gradient-to-r from-pink-700 via-rose-600 to-purple-800 hover:opacity-90 active:translate-y-0.5 border border-pink-400/30 text-white text-xs font-black rounded-xl shadow-lg shadow-pink-950 transition-all flex items-center justify-center gap-1.5 col-span-2 sm:col-span-1"
            >
              <span>🌹</span> ワールドロマンス
            </Link>

            <Link
              href="/party"
              className="py-2.5 px-3 bg-gradient-to-r from-indigo-700 via-indigo-600 to-indigo-800 hover:from-indigo-600 hover:to-indigo-700 active:translate-y-0.5 border border-indigo-400/30 text-white text-xs font-black rounded-xl shadow-lg shadow-indigo-950 transition-all flex items-center justify-center gap-1.5"
            >
              <span>⚔️</span> パーティ編成
            </Link>

            <button
              onClick={() => setIsGachaOpen(true)}
              className="py-2.5 px-3 bg-gradient-to-r from-purple-700 via-purple-600 to-indigo-800 hover:from-purple-600 hover:to-indigo-700 active:translate-y-0.5 border border-purple-400/30 text-white text-xs font-black rounded-xl shadow-lg shadow-purple-950 transition-all flex items-center justify-center gap-1.5"
            >
              <span>🔮</span> 召喚 (ガチャ)
            </button>

            <Link
              href="/monsters"
              className="py-2.5 px-3 bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 active:translate-y-0.5 border border-slate-700 text-slate-200 text-xs font-black rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5"
            >
              <span>📖</span> モンスター図鑑
            </Link>

            <Link
              href="/history"
              className="py-2.5 px-3 bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 active:translate-y-0.5 border border-slate-700 text-slate-200 text-xs font-black rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5"
            >
              <span>📝</span> 間違いノート
            </Link>
          </nav>
        </header>

        {/* YouTube追加フォーム */}
        <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 space-y-3 shadow-xl backdrop-blur-sm">
          <h2 className="text-xs font-extrabold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
            <span>📹</span> 新規YouTube動画を取り込む
          </h2>
          <form onSubmit={handleAddVideo} className="flex gap-2">
            <input
              type="text"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono transition-colors"
              required
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:opacity-90 active:translate-y-0.5 text-white font-black text-xs rounded-xl shadow-lg shadow-cyan-950/50 disabled:opacity-40 transition-all whitespace-nowrap"
            >
              {isSubmitting ? "解析中..." : "動画をインジェスト"}
            </button>
          </form>
          {submitMessage && (
            <p className="text-xs font-mono text-cyan-300 bg-cyan-950/40 border border-cyan-900 p-2.5 rounded-xl animate-fadeIn">
              {submitMessage}
            </p>
          )}
        </section>

        {/* 検索バー ＆ メニュータブ */}
        <div className="space-y-3">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="🔍 題名、タグ、難易度（初級、超絶等）、モンスター名で検索..."
              className="w-full bg-slate-900/80 border border-slate-800 rounded-xl pl-4 pr-10 py-3 text-xs text-white placeholder-slate-500 shadow-inner focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          <div className="flex border-b border-slate-800">
            <button
              onClick={() => setActiveTab("clips")}
              className={`flex-1 py-3 font-black text-xs text-center border-b-2 transition-all flex items-center justify-center gap-1.5 ${
                activeTab === "clips"
                  ? "border-cyan-400 text-cyan-400 bg-gradient-to-t from-cyan-950/30 to-transparent"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              <span>✂️</span> 作成済みクエストクリップ ({filteredClips.length})
            </button>
            <button
              onClick={() => setActiveTab("videos")}
              className={`flex-1 py-3 font-black text-xs text-center border-b-2 transition-all flex items-center justify-center gap-1.5 ${
                activeTab === "videos"
                  ? "border-cyan-400 text-cyan-400 bg-gradient-to-t from-cyan-950/30 to-transparent"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              <span>📹</span> 登録済み動画原本 ({filteredVideos.length})
            </button>
          </div>
        </div>

        {/* クリップ一覧 */}
        {activeTab === "clips" && (
          <section>
            {loading ? (
              <p className="text-xs text-slate-500 font-mono text-center py-12 animate-pulse">クエストデータをロード中...</p>
            ) : filteredClips.length === 0 ? (
              <div className="bg-slate-900/40 p-12 text-center border border-slate-800/80 rounded-2xl text-slate-500 text-xs font-mono">
                該当するクリップが見つかりません。
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {filteredClips.map((clip) => {
                  const ytId = clip.videos?.youtube_id;
                  const thumbUrl = ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : null;
                  const mon = clip.monsters;
                  const currentLuck = clip.user_luck ?? 0;
                  const remainingLuck = Math.max(0, 99 - currentLuck);
                  const isLuckMax = currentLuck >= 99;
                  const style = getTierStyle(clip.difficulty_tier);

                  return (
                    <div
                      key={clip.id}
                      className={`bg-slate-900/80 border rounded-2xl overflow-hidden shadow-xl flex flex-col justify-between transition-all duration-200 ${style.cardBorder}`}
                    >
                      <div className="aspect-video bg-black relative overflow-hidden group">
                        {thumbUrl ? (
                          <img
                            src={thumbUrl}
                            alt="Thumbnail"
                            onError={handleThumbError}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 opacity-90"
                          />
                        ) : (
                          <div className="w-full h-full bg-slate-950 flex items-center justify-center text-slate-700 font-mono text-xs">NO THUMBNAIL</div>
                        )}

                        {/* クリア状態バッジ（NEWかCLEARか判別） */}
                        {clip.is_cleared ? (
                          <span className="absolute top-2.5 right-2.5 bg-emerald-500 text-black font-black text-[9px] font-mono px-2 py-0.5 rounded-full shadow-lg border border-emerald-300">
                            CLEAR
                          </span>
                        ) : (
                          <span className="absolute top-2.5 right-2.5 bg-gradient-to-r from-amber-400 to-yellow-300 text-black font-black text-[9px] font-mono px-2 py-0.5 rounded-full shadow-lg border border-amber-200 animate-pulse">
                            NEW (初回💎2)
                          </span>
                        )}

                        {clip.difficulty_tier && (
                          <span
                            className={`absolute top-2.5 left-2.5 px-3 py-1 rounded-full text-[10px] font-black font-mono border backdrop-blur-md shadow-lg ${style.badge}`}
                          >
                            {clip.difficulty_tier} (SCORE: {clip.difficulty_score ?? 0})
                          </span>
                        )}

                        {clip.effective_wpm && (
                          <span className="absolute bottom-2 right-2 bg-slate-950/80 backdrop-blur-md text-slate-400 font-mono text-[9px] px-2 py-0.5 rounded border border-slate-800">
                            WPM: {clip.effective_wpm}
                          </span>
                        )}
                      </div>

                      <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                        <div className="space-y-2.5">
                          <div className="flex justify-between items-start gap-2">
                            <Link
                              href={`/clips/${clip.id}/prepare`}
                              className="font-black text-sm text-white hover:text-cyan-400 transition-colors line-clamp-1"
                            >
                              {clip.label || "無題のクリップ"}
                            </Link>
                            <div className="flex gap-1 shrink-0">
                              <button
                                onClick={() => {
                                  setEditingClip(clip);
                                  setEditLabel(clip.label || "");
                                  setEditTags((clip.tags || []).join(", "));
                                }}
                                className="text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-800 px-1.5 py-0.5 rounded transition-colors"
                              >
                                ✏️
                              </button>
                              <button
                                onClick={() => handleDeleteClip(clip.id)}
                                className="text-xs text-slate-500 hover:text-red-400 hover:bg-red-950/50 px-1.5 py-0.5 rounded transition-colors"
                              >
                                🗑️
                              </button>
                            </div>
                          </div>

                          {mon ? (
                            <div className="bg-slate-950/90 border border-slate-800 p-2.5 rounded-xl flex items-center justify-between shadow-inner gap-2">
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <img
                                  src={mon.image_url}
                                  alt={mon.name}
                                  className="w-10 h-10 object-cover rounded-lg border border-slate-800 shadow shrink-0"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="text-[9px] text-amber-400 font-bold tracking-widest leading-none mb-1">
                                    {"★".repeat(mon.rarity)}
                                  </div>
                                  
                                  <div className="text-xs font-black text-slate-200 line-clamp-2 leading-tight">
                                    {mon.name}
                                  </div>
                                </div>
                              </div>

                              <div className="text-right font-mono shrink-0 pl-1">
                                <div className="text-xs font-black text-cyan-400">☘️ {currentLuck}</div>
                                <div className="text-[9px] text-slate-500 whitespace-nowrap">
                                  {isLuckMax ? (
                                    <span className="text-amber-400 font-black animate-pulse">👑 運極</span>
                                  ) : (
                                    <span>あと {remainingLuck}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-500 bg-slate-950/50 border border-slate-900 p-2 rounded-xl text-center font-mono">
                              モンスター未割り当て
                            </div>
                          )}

                          {clip.tags && clip.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {clip.tags.map((t, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => setSearchQuery(t)}
                                  className="text-[10px] bg-slate-950 text-slate-400 px-2 py-0.5 rounded-md font-mono border border-slate-800 hover:border-cyan-500 hover:text-cyan-400 transition-colors"
                                >
                                  #{t}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <Link
                          href={`/clips/${clip.id}/prepare`}
                          className="block text-center py-2.5 bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 hover:opacity-95 active:translate-y-0.5 text-white font-black text-xs rounded-xl shadow-lg shadow-cyan-950/30 border border-cyan-400/20 transition-all uppercase tracking-wider"
                        >
                          🔥 クエスト確認・出撃 ➔
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* 動画原本一覧 */}
        {activeTab === "videos" && (
          <section>
            {loading ? (
              <p className="text-xs text-slate-500 font-mono text-center py-12 animate-pulse">動画データをロード中...</p>
            ) : filteredVideos.length === 0 ? (
              <div className="bg-slate-900/40 p-12 text-center border border-slate-800/80 rounded-2xl text-slate-500 text-xs font-mono">
                該当する動画が見つかりません。
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {filteredVideos.map((video) => {
                  const thumbUrl = video.youtube_id ? `https://img.youtube.com/vi/${video.youtube_id}/hqdefault.jpg` : null;

                  return (
                    <Link
                      key={video.id}
                      href={`/videos/${video.id}`}
                      className="bg-slate-900/80 border border-slate-800/80 rounded-2xl overflow-hidden shadow-lg hover:border-indigo-500 transition-all flex flex-col justify-between group"
                    >
                      {thumbUrl && (
                        <div className="aspect-video bg-black overflow-hidden relative">
                          <img
                            src={thumbUrl}
                            alt="Thumbnail"
                            onError={handleThumbError}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 opacity-90"
                          />
                        </div>
                      )}
                      <div className="p-3.5 space-y-1.5">
                        <h3 className="text-xs font-bold text-slate-200 line-clamp-2 group-hover:text-cyan-400 transition-colors">
                          {video.title || "（タイトル取得中）"}
                        </h3>
                        <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono pt-1 border-t border-slate-800/50">
                          <span>STATUS: {video.status.toUpperCase()}</span>
                          <span className="text-cyan-400 font-bold">文字起こしを見る ➔</span>
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
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fadeIn">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 w-full max-w-sm space-y-4 text-white shadow-2xl">
              <h3 className="font-black text-sm tracking-wide border-b border-slate-800 pb-2">✏️ クリップ情報編集</h3>
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-400 mb-1">クリップ名</label>
                  <input
                    type="text"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs focus:border-cyan-500 focus:outline-none"
                    placeholder="例: 自己紹介の挨拶"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-400 mb-1">タグ (カンマ区切り)</label>
                  <input
                    type="text"
                    value={editTags}
                    onChange={(e) => setEditTags(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs focus:border-cyan-500 focus:outline-none"
                    placeholder="例: 日常会話, 初級"
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button onClick={() => setEditingClip(null)} className="px-3.5 py-1.5 text-xs text-slate-400 hover:text-white">キャンセル</button>
                <button onClick={handleSaveEdit} className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-black shadow-md">保存</button>
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