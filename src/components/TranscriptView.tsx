"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ClipGachaModal from "@/components/ClipGachaModal";

interface Segment {
  id: string;
  idx: number;
  start_ms: number;
  end_ms: number;
  text: string;
  corrected_text?: string;
}

interface Monster {
  id: number;
  name: string;
  name_en: string;
  rarity: number;
  image_url: string;
  quote_ja: string;
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

  // 出現モーダル用ステート
  const [appearedMonster, setAppearedMonster] = useState<Monster | null>(null);
  const [isClipGachaOpen, setIsClipGachaOpen] = useState(false);

  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSignedIn(!!data.session);
    });
  }, [supabase]);

  useEffect(() => {
    async function fetchSegments() {
      if (!signedIn || !videoId) return;
      setLoading(true);
      const { data, error } = await supabase
        .from("segments")
        .select("*")
        .eq("video_id", videoId)
        .order("idx", { ascending: true });

      if (error) {
        setMessage(`🚨 データ取得エラー: ${error.message}`);
      } else if (data) {
        setSegments(data);
      }
      setLoading(false);
    }

    void fetchSegments();
  }, [videoId, signedIn, supabase]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthError(error.message);
    else setSignedIn(true);
  };

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

  const handleCopyAll = () => {
    const fullText = segments.map((s) => s.corrected_text || s.text).join("\n");
    void navigator.clipboard.writeText(fullText);
    setMessage("📋 文字起こしの全文をクリップボードにコピーしました！");
  };

  const handleCopySelected = () => {
    if (!selectedStart) return;
    const startIdx = selectedStart.idx;
    const endIdx = selectedEnd ? selectedEnd.idx : selectedStart.idx;
    const selectedSegs = segments.filter((s) => s.idx >= startIdx && s.idx <= endIdx);
    const selectedText = selectedSegs.map((s) => s.corrected_text || s.text).join("\n");

    void navigator.clipboard.writeText(selectedText);
    setMessage("📋 選択範囲の文章をクリップボードにコピーしました！");
  };

  // ★ オーブ5個消費 ＆ ガチャ演出付きクリップ作成
  const handleCreateClip = async () => {
    if (!selectedStart) return;

    const startSeg = selectedStart;
    const endSeg = selectedEnd || selectedStart;

    setIsSubmitting(true);
    setMessage(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("ログインしていません。");

      // 1. オーブ残高の確認
      const { data: bal } = await supabase
        .from("orb_balance")
        .select("balance")
        .eq("owner_id", user.id)
        .single();

      if ((bal?.balance ?? 0) < 5) {
        throw new Error("オーブが足りません（必要: 5個）。");
      }

      // 2. モンスターガチャ抽選（★1〜★5からランダム）
      const { data: allMonsters } = await supabase.from("monsters").select("*");
      let assignedMonster: Monster | null = null;
      if (allMonsters && allMonsters.length > 0) {
        assignedMonster = allMonsters[Math.floor(Math.random() * allMonsters.length)];
      }

      // 3. オーブ消費ログ
      await supabase.from("orb_ledger").insert({
        owner_id: user.id,
        delta: -5,
        reason: "clip_creation_gacha",
      });

      // 4. クリップの作成
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
          monster_id: assignedMonster?.id || null,
        })
        .select("id")
        .single();

      if (clipErr) throw clipErr;

      // 5. ジョブ送信
      await supabase.from("ingest_jobs").insert({
        owner_id: user.id,
        video_id: videoId,
        clip_id: clip.id,
        type: "clip_encode",
        lane: "gpu",
        priority: 10,
        payload: { video_id: videoId, clip_id: clip.id, start_ms: startSeg.start_ms, end_ms: endSeg.end_ms },
      });

      // ★ モンスター出現演出モーダルを起動！
      if (assignedMonster) {
        setAppearedMonster(assignedMonster);
        setIsClipGachaOpen(true);
      } else {
        setMessage("🎉 クリップを作成しました！");
      }

      setSelectedStart(null);
      setSelectedEnd(null);
    } catch (err: any) {
      setMessage(`🚨 エラー: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (signedIn === false) {
    return (
      <form onSubmit={handleSignIn} className="max-w-sm mx-auto p-6 space-y-4 bg-white border rounded-xl shadow-sm">
        <h2 className="text-lg font-bold text-center">サインインが必要です</h2>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="メールアドレス" className="w-full border rounded-lg px-3 py-2 text-sm" required />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="パスワード" className="w-full border rounded-lg px-3 py-2 text-sm" required />
        <button className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-bold text-sm hover:bg-blue-700">サインイン</button>
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
        <button onClick={handleCopyAll} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-bold hover:bg-gray-200">
          📋 全文コピー
        </button>
      </div>

      {selectedStart && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between gap-2">
          <button onClick={handleCopySelected} className="px-3 py-1.5 bg-white border border-blue-300 text-blue-700 rounded-md text-xs font-bold hover:bg-blue-100">
            📋 選択文をコピー
          </button>
          <button onClick={handleCreateClip} disabled={isSubmitting} className="px-4 py-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white font-bold rounded-md text-sm hover:opacity-90 disabled:opacity-50 shadow-sm flex items-center gap-1">
            <span>💎5</span> {isSubmitting ? "召喚・切り出し中..." : "この区間でクリップガチャ作成"}
          </button>
        </div>
      )}

      {message && <div className="p-3 bg-gray-100 rounded-lg text-xs font-mono">{message}</div>}

      <div className="space-y-2 border rounded-lg p-2 bg-white max-h-[60vh] overflow-y-auto">
        {segments.map((seg) => {
          const active = isSelected(seg);
          return (
            <div
              key={seg.id}
              onClick={() => handleSelectSegment(seg)}
              className={`p-3 rounded-lg border cursor-pointer transition-colors text-sm ${
                active ? "bg-blue-100 border-blue-500 font-medium" : "hover:bg-gray-50 border-gray-200"
              }`}
            >
              <div className="flex justify-between text-[10px] text-gray-400 font-mono mb-1">
                <span>#{(seg.idx + 1).toString().padStart(2, "0")}</span>
                <span>{(seg.start_ms / 1000).toFixed(1)}s - {(seg.end_ms / 1000).toFixed(1)}s</span>
              </div>
              <p className="text-gray-800 leading-relaxed">{seg.corrected_text || seg.text}</p>
            </div>
          );
        })}
      </div>

      {/* ★ クリップモンスター出現演出モーダル */}
      <ClipGachaModal
        isOpen={isClipGachaOpen}
        monster={appearedMonster}
        onClose={() => setIsClipGachaOpen(false)}
      />

    </div>
  );
}