"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Video {
  id: string;
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
}

export default function DashboardPage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);

  const [videos, setVideos] = useState<Video[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [totalStorageBytes, setTotalStorageBytes] = useState(0);
  const [loading, setLoading] = useState(true);

  // 編集用モーダル状態
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

    const { data: vData } = await supabase
      .from("videos")
      .select("id, title, status, created_at")
      .order("created_at", { ascending: false });

    if (vData) setVideos(vData);

    const { data: cData } = await supabase
      .from("clips")
      .select("id, label, tags, status, video_id, created_at")
      .order("created_at", { ascending: false });

    if (cData) setClips(cData);

    // 容量計算
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
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
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
    if (!confirm("このクリップを削除しますか？（クラウドストレージ容量が解放されます）")) return;

    await supabase.from("clips").delete().eq("id", clipId);
    void fetchData();
  };

  const handleSaveEdit = async () => {
    if (!editingClip) return;
    const tagArray = editTags.split(",").map(t => t.trim()).filter(Boolean);

    await supabase.from("clips").update({
      label: editLabel,
      tags: tagArray
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
  const storageLimitMb = 10000; // Cloudflare R2 10GB 無料枠

  return (
    <main className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto px-4 space-y-8">
        
        <div className="flex justify-between items-center border-b pb-4">
          <h1 className="text-2xl font-extrabold text-gray-900">Dictation App</h1>
          
          {/* クラウド容量表示 */}
          <div className="text-right">
            <div className="text-xs font-bold text-gray-500">R2 クラウド使用量</div>
            <div className="text-sm font-mono font-bold text-blue-600">
              {storageMb} MB / 10 GB
            </div>
          </div>
        </div>

        <section className="bg-white p-5 border rounded-xl shadow-sm space-y-3">
          <h2 className="text-base font-bold text-gray-800">新規YouTube動画を追加</h2>
          <form onSubmit={handleAddVideo} className="flex gap-2">
            <input
              type="text"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="[https://www.youtube.com/watch?v=](https://www.youtube.com/watch?v=)..."
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              required
            />
            <button type="submit" disabled={isSubmitting} className="px-5 py-2 bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap">
              {isSubmitting ? "送信中..." : "追加"}
            </button>
          </form>
          {submitMessage && <p className="text-xs font-mono text-gray-700 bg-gray-100 p-2 rounded">{submitMessage}</p>}
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-gray-800">作成済みクリップ (穴埋めドリル)</h2>
          {loading ? (
            <p className="text-xs text-gray-500">読み込み中...</p>
          ) : clips.length === 0 ? (
            <div className="bg-white p-4 text-center border rounded-xl text-gray-400 text-sm">
              クリップがありません。動画詳細画面から作成してください。
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {clips.map((clip) => (
                <div key={clip.id} className="p-4 bg-white border rounded-xl shadow-sm space-y-3">
                  <div className="flex justify-between items-start">
                    <a href={`/clips/${clip.id}`} className="font-bold text-sm text-gray-900 hover:text-blue-600">
                      {clip.label || "無題のクリップ"}
                    </a>
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          setEditingClip(clip);
                          setEditLabel(clip.label || "");
                          setEditTags((clip.tags || []).join(", "));
                        }}
                        className="text-xs text-gray-500 hover:bg-gray-100 px-1.5 py-0.5 rounded"
                      >
                        ✏️ 編集
                      </button>
                      <button
                        onClick={() => handleDeleteClip(clip.id)}
                        className="text-xs text-red-500 hover:bg-red-50 px-1.5 py-0.5 rounded"
                      >
                        🗑️ 削除
                      </button>
                    </div>
                  </div>

                  {/* タグ表示 */}
                  {clip.tags && clip.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {clip.tags.map((t, idx) => (
                        <span key={idx} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-mono">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}

                  <a
                    href={`/clips/${clip.id}`}
                    className="block text-center py-2 bg-blue-50 text-blue-600 font-bold text-xs rounded-lg hover:bg-blue-100"
                  >
                    学習をスタート ➔
                  </a>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 編集用モーダル */}
        {editingClip && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
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