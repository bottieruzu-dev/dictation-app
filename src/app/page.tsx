"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface Video {
  id: string;
  youtube_id: string;
  title: string | null;
  status: string;
  created_at: string;
}

interface Clip {
  id: string;
  label: string | null;
  tags: string[] | null;
  status: string;
  video_id: string;
  created_at: string;
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

  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSignedIn(!!data.session);
    });
  }, [supabase]);

  const fetchData = async () => {
    if (!signedIn) return;
    setLoading(true);

    // 1. 初期オーブ処理・残高の呼び出し
    const { data: orbRes, error: orbErr } = await supabase.rpc("ensure_initial_orbs");
    if (!orbErr && orbRes !== null) {
      setOrbCount(orbRes);
    }

    // 2. 動画一覧の取得
    const { data: vData } = await supabase
      .from("videos")
      .select("id, youtube_id, title, status, created_at")
      .order("created_at", { ascending: false });

    if (vData) setVideos(vData);

    // 3. クリップ一覧の取得
    const { data: cData } = await supabase
      .from("clips")
      .select("*, videos(youtube_id, title)")
      .order("created_at", { ascending: false });

    if (cData) setClips(cData);

    // 4. ストレージ使用量取得
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

  if (signedIn === false) {
    return (
      <form onSubmit={handleSignIn} className="max-w-sm mx-auto my-12 p-6 space-y-4 bg-white border rounded-xl shadow-sm">
        <h2 className="text-lg font-bold text-center">サインイン</h2>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="メールアドレス" className="w-full border rounded-lg px-3 py-2 text-sm" required />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="パスワード" className="w-full border rounded-lg px-3 py-2 text-sm" required />
        <button className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-bold text-sm hover:bg-blue-700">サインイン</button>
        {authError && <p className="text-red-600 text-xs text-center">{authError}</p>}
      </form>
    );
  }

  const storageMb = (totalStorageBytes / (1024 * 1024)).toFixed(1);

  const filteredClips = clips.filter((c) => {
    const q = searchQuery.toLowerCase();
    const labelMatch = (c.label || "").toLowerCase().includes(q);
    const tagMatch = (c.tags || []).some((t) => t.toLowerCase().includes(q));
    return labelMatch || tagMatch;
  });

  const filteredVideos = videos.filter((v) =>
    (v.title || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <main className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto px-4 space-y-6">
        
        {/* ヘッダー領域 */}
        <div className="flex justify-between items-center border-b pb-4">
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900">Dictation App</h1>
            <Link href="/history" className="inline-block mt-1 text-xs font-bold text-purple-600 bg-purple-50 px-2 py-1 rounded hover:bg-purple-100 transition-colors">
              📝 間違いノート・履歴を開く ➔
            </Link>
          </div>

          <div className="flex items-center gap-4 text-right">
            {/* ★ 新機能：オーブ表示 */}
            <div className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-3.5 py-1.5 rounded-xl shadow-sm flex items-center gap-1.5">
              <span className="text-base">💎</span>
              <div className="text-left">
                <div className="text-[10px] font-bold opacity-80 leading-none">オーブ</div>
                <div className="text-sm font-black font-mono leading-tight">{orbCount} 個</div>
              </div>
            </div>

            <div>
              <div className="text-xs font-bold text-gray-500">R2 クラウド使用量</div>
              <div className="text-sm font-mono font-bold text-blue-600">{storageMb} MB / 10 GB</div>
            </div>
          </div>
        </div>

        {/* 1. YouTube追加フォーム */}
        <section className="bg-white p-5 border rounded-xl shadow-sm space-y-3">
          <h2 className="text-sm font-bold text-gray-800">新規YouTube動画を追加</h2>
          <form onSubmit={handleAddVideo} className="flex gap-2">
            <input
              type="text"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              required
            />
            <button type="submit" disabled={isSubmitting} className="px-5 py-2 bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap">
              {isSubmitting ? "送信中..." : "追加"}
            </button>
          </form>
          {submitMessage && <p className="text-xs font-mono text-gray-700 bg-gray-100 p-2 rounded">{submitMessage}</p>}
        </section>

        {/* 2. 検索バー & タブ切り替え */}
        <div className="space-y-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="🔍 題名やタグで検索..."
            className="w-full border bg-white rounded-xl px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:border-blue-500"
          />

          <div className="flex border-b">
            <button
              onClick={() => setActiveTab("clips")}
              className={`flex-1 py-3 font-bold text-sm text-center border-b-2 transition-colors ${
                activeTab === "clips" ? "border-blue-600 text-blue-600 bg-white" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              ✂️ 作成済みクリップ ({filteredClips.length})
            </button>
            <button
              onClick={() => setActiveTab("videos")}
              className={`flex-1 py-3 font-bold text-sm text-center border-b-2 transition-colors ${
                activeTab === "videos" ? "border-blue-600 text-blue-600 bg-white" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              📹 登録済み動画 ({filteredVideos.length})
            </button>
          </div>
        </div>

        {/* 3. クリップ一覧タブ */}
        {activeTab === "clips" && (
          <section>
            {loading ? (
              <p className="text-xs text-gray-500 text-center py-8">読み込み中...</p>
            ) : filteredClips.length === 0 ? (
              <div className="bg-white p-8 text-center border rounded-xl text-gray-400 text-sm">
                該当するクリップが見つかりません。
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {filteredClips.map((clip) => {
                  const ytId = clip.videos?.youtube_id;
                  const thumbUrl = ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : null;

                  return (
                    <div key={clip.id} className="bg-white border rounded-xl overflow-hidden shadow-sm flex flex-col justify-between">
                      {thumbUrl && (
                        <div className="aspect-video bg-black relative">
                          <img src={thumbUrl} alt="Thumbnail" className="w-full h-full object-cover" />
                        </div>
                      )}

                      <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                        <div className="space-y-1">
                          <div className="flex justify-between items-start">
                            <Link href={`/clips/${clip.id}`} className="font-bold text-sm text-gray-900 hover:text-blue-600 line-clamp-1">
                              {clip.label || "無題のクリップ"}
                            </Link>
                            <div className="flex gap-1 shrink-0">
                              <button
                                onClick={() => {
                                  setEditingClip(clip);
                                  setEditLabel(clip.label || "");
                                  setEditTags((clip.tags || []).join(", "));
                                }}
                                className="text-xs text-gray-500 hover:bg-gray-100 px-1.5 py-0.5 rounded"
                              >
                                ✏️
                              </button>
                              <button
                                onClick={() => handleDeleteClip(clip.id)}
                                className="text-xs text-red-500 hover:bg-red-50 px-1.5 py-0.5 rounded"
                              >
                                🗑️
                              </button>
                            </div>
                          </div>

                          {clip.tags && clip.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {clip.tags.map((t, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => setSearchQuery(t)}
                                  className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-mono hover:bg-blue-50 hover:text-blue-600"
                                >
                                  #{t}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <Link
                          href={`/clips/${clip.id}`}
                          className="block text-center py-2 bg-blue-50 text-blue-600 font-bold text-xs rounded-lg hover:bg-blue-100"
                        >
                          学習をスタート ➔
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* 4. 動画一覧タブ */}
        {activeTab === "videos" && (
          <section>
            {loading ? (
              <p className="text-xs text-gray-500 text-center py-8">読み込み中...</p>
            ) : filteredVideos.length === 0 ? (
              <div className="bg-white p-8 text-center border rounded-xl text-gray-400 text-sm">
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
                      className="bg-white border rounded-xl overflow-hidden shadow-sm hover:border-blue-500 transition-colors flex flex-col justify-between"
                    >
                      {thumbUrl && (
                        <div className="aspect-video bg-black">
                          <img src={thumbUrl} alt="Thumbnail" className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="p-3 space-y-1">
                        <h3 className="text-sm font-bold text-gray-800 line-clamp-2">
                          {video.title || "（タイトル取得中）"}
                        </h3>
                        <div className="flex justify-between items-center text-[10px] text-gray-400 font-mono">
                          <span>{video.status}</span>
                          <span className="text-blue-600 font-bold">文字起こしを見る ➔</span>
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
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl p-5 w-full max-w-sm space-y-4">
              <h3 className="font-bold text-base">クリップ名の変更とタグ付け</h3>
              <div className="space-y-2 text-xs">
                <label className="block font-bold">名前</label>
                <input
                  type="text"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="例: 自己紹介の挨拶"
                />
                <label className="block font-bold">タグ (カンマ区切り)</label>
                <input
                  type="text"
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="例: 日常会話, 初級"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setEditingClip(null)} className="px-3 py-1.5 text-xs text-gray-600">キャンセル</button>
                <button onClick={handleSaveEdit} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold">保存</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}