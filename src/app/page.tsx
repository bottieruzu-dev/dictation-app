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
  const [loading, setLoading] = useState(true);

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
      .select("id, label, status, video_id, created_at")
      .order("created_at", { ascending: false });

    if (cData) setClips(cData);

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
      const {
        data: { user },
      } = await supabase.auth.getUser();
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
        payload: {
          youtube_id: ytId,
        },
      });

      if (jErr) throw jErr;

      setSubmitMessage("🎉 動画を追加しました！ワーカー起動時に解析が始まります。");
      setYoutubeUrl("");
      void fetchData();
    } catch (err: any) {
      setSubmitMessage(`🚨 エラー: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (signedIn === false) {
    return (
      <form
        onSubmit={handleSignIn}
        className="max-w-sm mx-auto my-12 p-6 space-y-4 bg-white border rounded-xl shadow-sm"
      >
        <h2 className="text-lg font-bold text-center">サインイン</h2>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="メールアドレス"
          className="w-full border rounded-lg px-3 py-2 text-sm"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="パスワード"
          className="w-full border rounded-lg px-3 py-2 text-sm"
          required
        />
        <button className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-bold text-sm hover:bg-blue-700">
          サインイン
        </button>
        {authError && <p className="text-red-600 text-xs text-center">{authError}</p>}
      </form>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto px-4 space-y-8">
        <h1 className="text-2xl font-extrabold text-gray-900 border-b pb-4">
          Dictation App ダッシュボード
        </h1>

        <section className="bg-white p-5 border rounded-xl shadow-sm space-y-3">
          <h2 className="text-base font-bold text-gray-800">新規YouTube動画を追加</h2>
          <form onSubmit={handleAddVideo} className="flex gap-2">
            <input
              type="text"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              required
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
            >
              {isSubmitting ? "送信中..." : "追加"}
            </button>
          </form>
          {submitMessage && (
            <p className="text-xs font-mono text-gray-700 bg-gray-100 p-2 rounded">
              {submitMessage}
            </p>
          )}
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
                <a
                  key={clip.id}
                  href={`/clips/${clip.id}`}
                  className="block p-4 bg-white border rounded-xl shadow-sm hover:border-blue-500 transition-colors"
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                      {clip.label || "Clip"}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                        clip.status === "ready"
                          ? "bg-green-100 text-green-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {clip.status}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 font-mono break-all">
                    ID: {clip.id.slice(0, 8)}...
                  </div>
                </a>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-gray-800">登録済み動画一覧 (文字起こし)</h2>
          {loading ? (
            <p className="text-xs text-gray-500">読み込み中...</p>
          ) : videos.length === 0 ? (
            <div className="bg-white p-4 text-center border rounded-xl text-gray-400 text-sm">
              登録された動画はありません。
            </div>
          ) : (
            <div className="space-y-2">
              {videos.map((video) => (
                <a
                  key={video.id}
                  href={`/videos/${video.id}`}
                  className="flex items-center justify-between p-4 bg-white border rounded-xl shadow-sm hover:border-blue-500 transition-colors"
                >
                  <div>
                    <h3 className="text-sm font-bold text-gray-800 mb-1">
                      {video.title || "（タイトル取得中）"}
                    </h3>
                    <p className="text-[10px] text-gray-400 font-mono">
                      ID: {video.id}
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded font-mono ${
                      video.status === "ready"
                        ? "bg-green-100 text-green-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {video.status}
                  </span>
                </a>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}