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

      setSubmitMessage("動画インジェストジョブを送信しました。");
      setYoutubeUrl("");
      void fetchData();
    } catch (err: any) {
      setSubmitMessage(`エラー: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClip = async (clipId: string) => {
    if (!confirm("このステージを削除しますか？")) return;
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
      case "初級": return "bg-emerald-900/90 text-emerald-300 border-emerald-500/80";
      case "中級": return "bg-sky-900/90 text-sky-300 border-sky-500/80";
      case "上級": return "bg-amber-900/90 text-amber-300 border-amber-500/80";
      case "超上級": return "bg-purple-900/90 text-purple-300 border-purple-500/80";
      case "超絶": return "bg-red-900/90 text-red-300 border-red-500/80 font-black";
      default: return "bg-slate-800/90 text-slate-300 border-slate-600";
    }
  };

  if (signedIn === false) {
    return (
      <form onSubmit={handleSignIn} className="max-w-sm mx-auto my-20 p-8 game-panel space-y-5 text-slate-100">
        <div className="text-center space-y-1">
          <span className="text-[10px] font-num tracking-widest text-sky-400 uppercase font-bold">PLAYER AUTHENTICATION</span>
          <h2 className="text-xl font-black text-white">Dictation RPG ログイン</h2>
        </div>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="メールアドレス" className="w-full bg-[#0a121e] border border-[#273e63] rounded-xl px-3.5 py-2.5 text-xs text-white focus:border-sky-400 focus:outline-none" required />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="パスワード" className="w-full bg-[#0a121e] border border-[#273e63] rounded-xl px-3.5 py-2.5 text-xs text-white focus:border-sky-400 focus:outline-none" required />
        <button className="w-full btn-game-yellow py-3 text-xs tracking-wider uppercase">ゲーム開始</button>
        {authError && <p className="text-red-400 text-xs text-center font-bold">{authError}</p>}
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
    <main className="min-h-screen pb-24 pt-4 px-3 sm:px-6">
      <div className="max-w-4xl mx-auto space-y-5">
        
        {/* ステータスヘッダーバー */}
        <header className="game-panel p-3.5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-b from-sky-400 to-indigo-600 p-0.5 shadow-md flex items-center justify-center shrink-0">
                <div className="w-full h-full bg-[#0a1220] rounded-[10px] flex items-center justify-center font-num text-xs font-black text-sky-300">
                  LV.1
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-sm font-black text-white">エバラ</h1>
                  <span className="text-[9px] font-num px-1.5 py-0.2 rounded bg-sky-950 text-sky-400 border border-sky-700/60 font-bold">Ver 2.0</span>
                </div>
                <div className="w-28 h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-700 mt-1">
                  <div className="h-full bg-gradient-to-r from-sky-400 to-emerald-400" style={{ width: "40%" }} />
                </div>
              </div>
            </div>

            {/* ゲーム内通貨・リソースバー */}
            <div className="flex items-center gap-2 font-num">
              <div className="bg-[#0b1424] border border-[#2d4d7a] px-3 py-1.5 rounded-xl flex items-center gap-2 shadow-inner">
                <svg className="w-4 h-4 text-cyan-400 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2L2 9l10 13 10-13-10-7zm0 3.2L18.6 9 12 18.2 5.4 9 12 5.2z"/>
                </svg>
                <div className="text-xs font-bold text-cyan-200">{orbCount}</div>
              </div>

              <div className="bg-[#0b1424] border border-[#2d4d7a] px-3 py-1.5 rounded-xl flex items-center gap-2 shadow-inner">
                <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"/>
                </svg>
                <div className="text-xs font-bold text-amber-200">{storageMb} <span className="text-[9px] text-slate-400">MB</span></div>
              </div>
            </div>
          </div>

          {/* クイックナビ */}
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-1.5 pt-2 border-t border-[#213757]">
            <Link href="/romance" className="btn-game-blue text-[11px] py-1.5 text-center flex items-center justify-center gap-1">
              遠征 (ロマンス)
            </Link>
            <Link href="/missions" className="bg-[#12233f] border border-[#29456e] text-slate-200 hover:text-white text-[11px] py-1.5 rounded-lg text-center">
              任務
            </Link>
            <Link href="/party" className="bg-[#12233f] border border-[#29456e] text-slate-200 hover:text-white text-[11px] py-1.5 rounded-lg text-center">
              編成
            </Link>
            <button onClick={() => setIsGachaOpen(true)} className="bg-[#12233f] border border-[#29456e] text-slate-200 hover:text-white text-[11px] py-1.5 rounded-lg text-center">
              召喚
            </button>
            <Link href="/monsters" className="bg-[#12233f] border border-[#29456e] text-slate-200 hover:text-white text-[11px] py-1.5 rounded-lg text-center">
              図鑑
            </Link>
            <Link href="/history" className="bg-[#12233f] border border-[#29456e] text-slate-200 hover:text-white text-[11px] py-1.5 rounded-lg text-center">
              鍛錬手記
            </Link>
          </div>
        </header>

        {/* 新規インジェスト入力枠 */}
        <section className="game-panel p-3.5 space-y-2">
          <div className="text-xs font-bold text-sky-400 uppercase tracking-wider flex items-center gap-2">
            <svg className="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
            </svg>
            新規インジェスト
          </div>
          <form onSubmit={handleAddVideo} className="flex gap-2">
            <input
              type="text"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="flex-1 bg-[#09111c] border border-[#253f66] rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-sky-400 font-mono"
              required
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 btn-game-yellow text-xs rounded-xl whitespace-nowrap disabled:opacity-50"
            >
              {isSubmitting ? "解析中..." : "解析実行"}
            </button>
          </form>
          {submitMessage && (
            <p className="text-xs font-mono text-sky-300 bg-[#091524] border border-[#1b3652] p-2 rounded-lg">
              {submitMessage}
            </p>
          )}
        </section>

        {/* 検索 ＆ タブ切替 */}
        <div className="space-y-2.5">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ステージ名、難易度（初級・超絶等）、モンスター名で検索..."
            className="w-full bg-[#0a121f] border border-[#213757] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400"
          />

          <div className="flex border-b border-[#213757]">
            <button
              onClick={() => setActiveTab("clips")}
              className={`flex-1 py-2 font-bold text-xs text-center border-b-2 transition-all ${
                activeTab === "clips"
                  ? "border-sky-400 text-sky-300 bg-[#162742]"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              クエストステージ ({filteredClips.length})
            </button>
            <button
              onClick={() => setActiveTab("videos")}
              className={`flex-1 py-2 font-bold text-xs text-center border-b-2 transition-all ${
                activeTab === "videos"
                  ? "border-sky-400 text-sky-300 bg-[#162742]"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              登録済み動画 ({filteredVideos.length})
            </button>
          </div>
        </div>

        {/* クエストステージカード一覧 */}
        {activeTab === "clips" && (
          <section>
            {loading ? (
              <p className="text-xs text-slate-500 font-mono text-center py-12">ステージデータを読み込み中...</p>
            ) : filteredClips.length === 0 ? (
              <div className="game-panel p-12 text-center rounded-2xl text-slate-500 text-xs font-mono">
                該当するステージが存在しません。
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {filteredClips.map((clip) => {
                  const ytId = clip.videos?.youtube_id;
                  const thumbUrl = ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : null;
                  const mon = clip.monsters;
                  const currentLuck = clip.user_luck ?? 0;
                  const style = getTierStyle(clip.difficulty_tier);

                  return (
                    <div
                      key={clip.id}
                      className="game-panel rounded-2xl overflow-hidden p-3 space-y-3 flex flex-col justify-between"
                    >
                      <div className="space-y-2.5">
                        <div className="aspect-video bg-[#070d17] rounded-xl overflow-hidden relative border border-[#233a5e]">
                          {thumbUrl ? (
                            <img
                              src={thumbUrl}
                              alt="Thumbnail"
                              onError={handleThumbError}
                              className="w-full h-full object-cover opacity-90"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-600 text-xs font-mono">NO THUMBNAIL</div>
                          )}

                          {clip.is_cleared ? (
                            <span className="absolute top-2 right-2 bg-emerald-950/90 text-emerald-300 font-black text-[9px] font-mono px-2 py-0.5 rounded-full border border-emerald-500/80 shadow">
                              CLEAR
                            </span>
                          ) : (
                            <span className="absolute top-2 right-2 game-badge-yellow font-black text-[9px] font-mono px-2 py-0.5 rounded-full shadow">
                              NEW (💎2)
                            </span>
                          )}

                          {clip.difficulty_tier && (
                            <span className={`absolute top-2 left-2 px-2.5 py-0.5 rounded text-[10px] font-bold font-mono border shadow ${style}`}>
                              {clip.difficulty_tier} (SCORE: {clip.difficulty_score ?? 0})
                            </span>
                          )}
                        </div>

                        <div className="flex justify-between items-start gap-2">
                          <Link
                            href={`/clips/${clip.id}/prepare`}
                            className="font-bold text-sm text-white hover:text-sky-300 transition-colors line-clamp-1"
                          >
                            {clip.label || "無題のステージ"}
                          </Link>
                          <div className="flex gap-1 shrink-0">
                            <button
                              onClick={() => {
                                setEditingClip(clip);
                                setEditLabel(clip.label || "");
                                setEditTags((clip.tags || []).join(", "));
                              }}
                              className="text-xs text-slate-400 hover:text-white p-1"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => handleDeleteClip(clip.id)}
                              className="text-xs text-slate-400 hover:text-red-400 p-1"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>

                        {mon ? (
                          <div className="bg-[#0e1829] border border-[#213757] p-2 rounded-xl flex items-center justify-between gap-2 shadow-inner">
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <img
                                src={mon.image_url}
                                alt={mon.name}
                                className="w-9 h-9 object-cover rounded-lg border border-[#2a4870] shrink-0"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="text-[9px] text-amber-400 font-bold leading-none mb-0.5">
                                  {"★".repeat(mon.rarity)}
                                </div>
                                <div className="text-xs font-bold text-slate-200 truncate">
                                  {mon.name}
                                </div>
                              </div>
                            </div>

                            <div className="text-right font-num shrink-0">
                              <div className="text-xs font-bold text-sky-400">☘️ {currentLuck}</div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-500 bg-[#0c1626] p-2 rounded-xl text-center font-mono border border-[#1b2d47]">
                            ターゲット未設定
                          </div>
                        )}
                      </div>

                      <Link
                        href={`/clips/${clip.id}/prepare`}
                        className="block text-center py-2.5 btn-game-yellow text-xs font-black rounded-xl shadow uppercase tracking-wider"
                      >
                        出撃確認 ➔
                      </Link>
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
              <p className="text-xs text-slate-500 font-mono text-center py-12">動画データをロード中...</p>
            ) : filteredVideos.length === 0 ? (
              <div className="game-panel p-12 text-center rounded-2xl text-slate-500 text-xs font-mono">
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
                      className="game-panel p-3 rounded-2xl hover:border-sky-400 transition-all flex flex-col justify-between group"
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
                        <h3 className="text-xs font-bold text-slate-200 line-clamp-2 group-hover:text-sky-300 transition-colors">
                          {video.title || "（タイトル取得中）"}
                        </h3>
                        <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono pt-1 border-t border-[#213757]">
                          <span>STATUS: {video.status.toUpperCase()}</span>
                          <span className="text-sky-400 font-bold">文字起こしを見る ➔</span>
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
            <div className="game-panel rounded-2xl p-5 w-full max-w-sm space-y-4 text-white shadow-2xl">
              <h3 className="font-bold text-sm border-b border-[#213757] pb-2 text-sky-300">ステージ情報編集</h3>
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">ステージ名</label>
                  <input
                    type="text"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    className="w-full bg-[#0a121f] border border-[#213757] rounded-xl px-3 py-2 text-xs focus:border-sky-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">タグ (カンマ区切り)</label>
                  <input
                    type="text"
                    value={editTags}
                    onChange={(e) => setEditTags(e.target.value)}
                    className="w-full bg-[#0a121f] border border-[#213757] rounded-xl px-3 py-2 text-xs focus:border-sky-400 focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button onClick={() => setEditingClip(null)} className="px-3.5 py-1.5 text-xs text-slate-400">キャンセル</button>
                <button onClick={handleSaveEdit} className="px-4 py-1.5 btn-game-yellow text-xs rounded-xl">保存</button>
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

      {/* 下部固定ゲームフッターナビゲーションバー (ロマンス導線を配置) */}
      <footer className="fixed bottom-0 left-0 right-0 bg-[#08101c]/95 border-t-2 border-[#1e3458] backdrop-blur-md z-40 py-2 px-3 shadow-2xl">
        <div className="max-w-md mx-auto grid grid-cols-6 gap-1 text-center font-bold">
          {/* ホーム (アクティブ) */}
          <Link href="/" className="nav-item-card active py-1.5 flex flex-col items-center justify-center gap-0.5">
            <svg className="w-4 h-4 text-sky-200" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
            </svg>
            <span className="text-[8px] text-white">ホーム</span>
          </Link>

          {/* 遠征（ロマンス） */}
          <Link href="/romance" className="nav-item-card py-1.5 flex flex-col items-center justify-center gap-0.5">
            <svg className="w-4 h-4 text-pink-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 002 2h1.5a2.5 2.5 0 002.5-2.5V7a2 2 0 00-2-2h-1.5a2 2 0 01-2-2V3.055"/>
            </svg>
            <span className="text-[8px] text-slate-300">遠征</span>
          </Link>

          {/* 任務 */}
          <Link href="/missions" className="nav-item-card py-1.5 flex flex-col items-center justify-center gap-0.5">
            <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <span className="text-[8px] text-slate-300">任務</span>
          </Link>

          {/* 図鑑 */}
          <Link href="/monsters" className="nav-item-card py-1.5 flex flex-col items-center justify-center gap-0.5">
            <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
            </svg>
            <span className="text-[8px] text-slate-300">図鑑</span>
          </Link>

          {/* 召喚 */}
          <button onClick={() => setIsGachaOpen(true)} className="nav-item-card py-1.5 flex flex-col items-center justify-center gap-0.5">
            <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L5.605 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"/>
            </svg>
            <span className="text-[8px] text-slate-300">召喚</span>
          </button>

          {/* 編成 */}
          <Link href="/party" className="nav-item-card py-1.5 flex flex-col items-center justify-center gap-0.5">
            <svg className="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
            </svg>
            <span className="text-[8px] text-slate-300">編成</span>
          </Link>
        </div>
      </footer>

    </main>
  );
}