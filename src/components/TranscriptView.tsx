"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Segment {
  id: string;
  idx: number;
  start_ms: number;
  end_ms: number;
  text: string;
}

interface Props {
  videoId: string;
}

export default function TranscriptView({ videoId }: Props) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStart, setSelectedStart] = useState<Segment | null>(null);
  const [selectedEnd, setSelectedEnd] = useState<Segment | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // 認証状態管理
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  const supabase = createClient();

  // 1. ログイン状態の確認
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSignedIn(!!data.session);
    });
  }, [supabase]);

  // 2. 文字起こしデータ (segments) の読み込み（ログイン済みの場合のみ）
  useEffect(() => {
    async function fetchSegments() {
      if (!signedIn || !videoId) return;
      setLoading(true);
      const { data, error } = await supabase
        .from("segments")
        .select("id, idx, start_ms, end_ms, text")
        .eq("video_id", videoId)
        .order("idx", { ascending: true });

      if (error) {
        console.error("error fetching segments:", error);
        setMessage(`🚨 データ取得エラー: ${error.message}`);
      } else if (data) {
        setSegments(data);
      }
      setLoading(false);
    }

    void fetchSegments();
  }, [videoId, signedIn, supabase]);

  // サインイン処理
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setAuthError(error.message);
    } else {
      setSignedIn(true);
    }
  };

  // 範囲選択ロジック
  const handleSelectSegment = (seg: Segment) => {
    setMessage(null);
    if (!selectedStart || (selectedStart && selectedEnd)) {
      setSelectedStart(seg);
      setSelectedEnd(null);
    } else {
      if (seg.idx < selectedStart.idx) {
        setSelectedStart(seg);
        setSelectedEnd(null);
      } else {
        setSelectedEnd(seg);
      }
    }
  };

  // クリップ作成リクエスト
  const handleCreateClip = async () => {
    if (!selectedStart) return;

    const startSeg = selectedStart;
    const endSeg = selectedEnd || selectedStart;

    setIsSubmitting(true);
    setMessage(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("ログインしていません。");

      const { data: clip, error: clipErr } = await supabase
        .from("clips")
        .insert({
          owner_id: user.id,
          video_id: videoId,
          start_ms: startSeg.start_ms,
          end_ms: endSeg.end_ms,
          seg_from: startSeg.idx,
          seg_to: endSeg.idx,
          label: `${(startSeg.start_ms / 1000).toFixed(1)}s - ${(endSeg.end_ms / 1000).toFixed(1)}s`,
          status: "pending",
        })
        .select("id")
        .single();

      if (clipErr) throw clipErr;

      const { error: jobErr } = await supabase.from("ingest_jobs").insert({
        owner_id: user.id,
        video_id: videoId,
        clip_id: clip.id,
        type: "clip_encode",
        lane: "gpu",
        priority: 10,
        payload: {
          video_id: videoId,
          clip_id: clip.id,
          start_ms: startSeg.start_ms,
          end_ms: endSeg.end_ms,
        },
      });

      if (jobErr) throw jobErr;

      setMessage("🎉 クリップ切り出しジョブを送信しました！次回PC起動時に作成されます。");
      setSelectedStart(null);
      setSelectedEnd(null);
    } catch (err: any) {
      setMessage(`🚨 エラー: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ログイン未完了時：ログインフォームを表示
  if (signedIn === false) {
    return (
      <form onSubmit={handleSignIn} className="max-w-sm mx-auto p-6 space-y-4 bg-white border rounded-xl shadow-sm">
        <h2 className="text-lg font-bold text-center">サインインが必要です</h2>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="メールアドレス"
          autoComplete="username"
          className="w-full border rounded-lg px-3 py-2 text-sm"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="パスワード"
          autoComplete="current-password"
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

  if (loading || signedIn === null) {
    return <div className="p-4 text-center text-gray-500">文字起こしを読み込み中...</div>;
  }

  const isSelected = (seg: Segment) => {
    if (!selectedStart) return false;
    if (!selectedEnd) return seg.idx === selectedStart.idx;
    return seg.idx >= selectedStart.idx && seg.idx <= selectedEnd.idx;
  };

  return (
    <div className="space-y-4 max-w-xl mx-auto p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Transcript (文字起こし)</h2>
        <span className="text-xs text-gray-500">
          {selectedStart
            ? selectedEnd
              ? `選択中: ${selectedStart.idx + 1} 〜 ${selectedEnd.idx + 1} 行目`
              : `開始行: ${selectedStart.idx + 1} 行目`
            : "範囲を選択してください"}
        </span>
      </div>

      {selectedStart && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
          <div className="text-xs text-blue-800 font-mono">
            長さ:{" "}
            {(
              ((selectedEnd?.end_ms || selectedStart.end_ms) -
                selectedStart.start_ms) /
              1000
            ).toFixed(1)}
            秒
          </div>
          <button
            onClick={handleCreateClip}
            disabled={isSubmitting}
            className="px-4 py-2 bg-blue-600 text-white font-bold rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? "送信中..." : "この区間でクリップ作成"}
          </button>
        </div>
      )}

      {message && (
        <div className="p-3 bg-gray-100 rounded-lg text-xs font-mono">{message}</div>
      )}

      <div className="space-y-2 border rounded-lg p-2 bg-white max-h-[60vh] overflow-y-auto">
        {segments.length === 0 ? (
          <div className="p-4 text-center text-gray-400 text-sm">
            文字起こしデータがありません。
          </div>
        ) : (
          segments.map((seg) => {
            const active = isSelected(seg);
            return (
              <div
                key={seg.id}
                onClick={() => handleSelectSegment(seg)}
                className={`p-3 rounded-lg border cursor-pointer transition-colors text-sm ${
                  active
                    ? "bg-blue-100 border-blue-500 font-medium"
                    : "hover:bg-gray-50 border-gray-200"
                }`}
              >
                <div className="flex justify-between text-[10px] text-gray-400 font-mono mb-1">
                  <span>#{(seg.idx + 1).toString().padStart(2, "0")}</span>
                  <span>
                    {(seg.start_ms / 1000).toFixed(1)}s - {(seg.end_ms / 1000).toFixed(1)}s
                  </span>
                </div>
                <p className="text-gray-800 leading-relaxed">{seg.text}</p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}