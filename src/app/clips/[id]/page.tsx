'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useSignedUrl } from '@/lib/useSignedUrl';
import ClipPlayer from '@/components/ClipPlayer';

interface Segment {
  id: string;
  idx: number;
  start_ms: number;
  end_ms: number;
  text: string;
  ja_text?: string;
  corrected_text?: string;
  skeletons?: { text: string; label: string }[];
}

interface ClozeItem {
  id: string;
  segment_id: string;
  word_from: number;
  word_to: number;
  answer: string;
  variants: string[];
}

export default function ClipPage() {
  const params = useParams();
  const id = params?.id as string;

  const [clip, setClip] = useState<any>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [clozeItems, setClozeItems] = useState<ClozeItem[]>([]);
  const [loading, setLoading] = useState(true);

  // アクティブな文章（インデックス）
  const [activeSegIndex, setActiveSegIndex] = useState(0);

  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, { isCorrect: boolean; score: number; answer: string }>>({});
  const [checkedSegments, setCheckedSegments] = useState<Record<string, boolean>>({});

  const [seekToTime, setSeekToTime] = useState<number | null>(null);
  const [currentVideoTime, setCurrentVideoTime] = useState(0);

  const { url: signedUrl } = useSignedUrl(id, 'video');
  const supabase = createClient();

  useEffect(() => {
    if (!id) return;

    async function fetchData() {
      setLoading(true);

      const { data: clipData } = await supabase
        .from('clips')
        .select('*, videos(youtube_id, title)')
        .eq('id', id)
        .maybeSingle();

      if (clipData) {
        setClip(clipData);

        const { data: segData } = await supabase
          .from('segments')
          .select('*')
          .eq('video_id', clipData.video_id)
          .gte('idx', clipData.seg_from ?? 0)
          .lte('idx', clipData.seg_to ?? 9999)
          .order('idx', { ascending: true });

        if (segData) setSegments(segData);

        const { data: itemData } = await supabase
          .from('cloze_items')
          .select('*')
          .eq('clip_id', id);

        if (itemData) setClozeItems(itemData);
      }

      setLoading(false);
    }

    fetchData();
  }, [id]);

  // 動画再生時間の変化に伴い、フォーカスカードを自動切り替え
  useEffect(() => {
    if (segments.length === 0) return;
    const foundIdx = segments.findIndex((seg) => {
      const startSec = (seg.start_ms || 0) / 1000;
      const endSec = (seg.end_ms || 0) / 1000;
      return currentVideoTime >= startSec && currentVideoTime <= endSec;
    });

    if (foundIdx !== -1 && foundIdx !== activeSegIndex) {
      setActiveSegIndex(foundIdx);
    }
  }, [currentVideoTime, segments]);

  const handleInputChange = (key: string, value: string) => {
    setUserAnswers((prev) => ({ ...prev, [key]: value }));
  };

  // 前の文章へ（動画も即座にジャンプ）
  const handlePrevSegment = () => {
    if (activeSegIndex > 0) {
      const newIdx = activeSegIndex - 1;
      setActiveSegIndex(newIdx);
      setSeekToTime(segments[newIdx].start_ms / 1000);
    }
  };

  // 次の文章へ（動画も即座にジャンプ）
  const handleNextSegment = () => {
    if (activeSegIndex < segments.length - 1) {
      const newIdx = activeSegIndex + 1;
      setActiveSegIndex(newIdx);
      setSeekToTime(segments[newIdx].start_ms / 1000);
    }
  };

  // 単一セグメント採点 & DB保存
  const checkSingleSegment = async (segId: string) => {
    const seg = segments.find((s) => s.id === segId);
    if (!seg) return;

    const words = (seg.corrected_text || seg.text).split(' ');
    const segItems = clozeItems.filter((it) => it.segment_id === seg.id);
    const newResults = { ...results };

    const { data: { user } } = await supabase.auth.getUser();

    for (let wIdx = 0; wIdx < words.length; wIdx++) {
      const word = words[wIdx];
      const key = `${seg.id}-${wIdx}`;
      const item = segItems.find((it) => it.word_from === wIdx);

      const targetAnswer = item ? item.answer : word.replace(/[^a-zA-Z0-9]/g, '');
      const userInput = (userAnswers[key] || '').trim().toLowerCase();
      const gold = targetAnswer.trim().toLowerCase();
      const isCorrect = userInput === gold;

      newResults[key] = { isCorrect, score: isCorrect ? 1.0 : 0.0, answer: targetAnswer };

      if (user) {
        await supabase.from('attempts').insert({
          owner_id: user.id,
          clip_id: id,
          segment_id: seg.id,
          item_id: item?.id || null,
          input_raw: userAnswers[key] || '',
          answer_gold: targetAnswer,
          score: isCorrect ? 1.0 : 0.0,
          is_correct: isCorrect,
        });
      }
    }

    setResults(newResults);
    setCheckedSegments((prev) => ({ ...prev, [segId]: true }));
  };

  // 全体一括チェック
  const handleCheckAllAnswers = async () => {
    for (const seg of segments) {
      await checkSingleSegment(seg.id);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">読み込み中...</div>;

  const currentSeg = segments[activeSegIndex];

  return (
    <main className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-xl mx-auto px-4 space-y-6">
        
        <div className="flex items-center justify-between border-b pb-3">
          <h1 className="text-lg font-bold text-gray-900">
            {clip?.label || 'ディクテーション穴埋め'}
          </h1>
          <Link href="/" className="text-sm text-blue-600 hover:underline font-bold">
            ← ダッシュボードに戻る
          </Link>
        </div>

        {/* 1. プレイヤー領域 */}
        {signedUrl ? (
          <ClipPlayer
            src={signedUrl}
            seekToTime={seekToTime}
            onTimeUpdate={(t) => setCurrentVideoTime(t)}
          />
        ) : (
          <div className="p-8 bg-amber-50 border border-amber-200 rounded-xl text-center text-xs text-amber-800">
            動画準備中...
          </div>
        )}

        {/* 2. 動画直下：フォーカス学習カード (再生位置連動 & 前後切り替え) */}
        {currentSeg && (
          <div className="bg-white border-2 border-blue-500 rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <div className="flex items-center gap-2">
                <span className="bg-blue-600 text-white font-mono text-xs font-bold px-2.5 py-0.5 rounded-full">
                  #{ (activeSegIndex + 1).toString().padStart(2, '0') } / { segments.length }
                </span>
                <span className="text-xs text-gray-400 font-mono">
                  ({ ((currentSeg.start_ms || 0) / 1000).toFixed(1) }s - { ((currentSeg.end_ms || 0) / 1000).toFixed(1) }s)
                </span>
              </div>

              <button
                onClick={() => setSeekToTime(currentSeg.start_ms / 1000)}
                className="px-2.5 py-1 bg-blue-50 text-blue-700 font-bold rounded-lg text-xs hover:bg-blue-100 transition-colors flex items-center gap-1"
              >
                ▶️ この文を再生
              </button>
            </div>

            {/* 穴埋め入力エリア */}
            <div className="flex flex-wrap gap-2 items-center font-mono py-2 min-h-[60px]">
              { (currentSeg.corrected_text || currentSeg.text).split(' ').map((word, wIdx) => {
                const segItems = clozeItems.filter((it) => it.segment_id === currentSeg.id);
                const key = `${currentSeg.id}-${wIdx}`;
                const item = segItems.find((it) => it.word_from === wIdx);
                const res = results[key];

                const isTarget = segItems.length > 0 ? !!item : true;

                if (isTarget) {
                  return (
                    <div key={wIdx} className="inline-flex flex-col items-center">
                      <input
                        type="text"
                        value={userAnswers[key] || ''}
                        onChange={(e) => handleInputChange(key, e.target.value)}
                        placeholder="---"
                        className={`w-24 border-b-2 px-1 py-1 text-center text-sm font-bold font-mono focus:outline-none transition-colors ${
                          res ? (res.isCorrect ? 'border-green-500 bg-green-50 text-green-800' : 'border-red-500 bg-red-50 text-red-800') : 'border-blue-500 bg-white text-gray-900'
                        }`}
                      />
                      {res && (
                        <span className={`text-[10px] font-bold mt-0.5 ${res.isCorrect ? 'text-green-600' : 'text-red-600'}`}>
                          {res.isCorrect ? '○ 100%' : `× (${res.answer})`}
                        </span>
                      )}
                    </div>
                  );
                }

                return (
                  <span key={wIdx} className="text-sm font-bold text-gray-800">
                    {word}
                  </span>
                );
              })}
            </div>

            {/* コントロール（前後ボタン & 回答チェック） */}
            <div className="flex items-center justify-between gap-2 pt-3 border-t">
              <button
                disabled={activeSegIndex === 0}
                onClick={handlePrevSegment}
                className="px-3.5 py-2 bg-gray-100 text-gray-700 rounded-xl text-xs font-bold hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                ⬅️ 前の文
              </button>

              <button
                onClick={() => checkSingleSegment(currentSeg.id)}
                className="px-4 py-2 bg-gray-900 text-white rounded-xl text-xs font-bold hover:bg-black transition-colors"
              >
                この文章をチェック
              </button>

              <button
                disabled={activeSegIndex === segments.length - 1}
                onClick={handleNextSegment}
                className="px-3.5 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                次の文 ➡️
              </button>
            </div>

            {/* 解説・日本語訳 (回答チェック後に表示) */}
            {checkedSegments[currentSeg.id] && (
              <div className="space-y-2 pt-3 border-t border-dashed">
                {currentSeg.skeletons && currentSeg.skeletons.length > 0 && (
                  <div className="space-y-1">
                    {currentSeg.skeletons.map((sk, idx) => (
                      <div key={idx} className="text-xs bg-blue-50 text-blue-800 p-2 rounded-lg font-semibold">
                        💡 構文: <strong>{sk.text}</strong> ({sk.label})
                      </div>
                    ))}
                  </div>
                )}
                {currentSeg.ja_text && (
                  <div className="text-xs bg-gray-50 text-gray-700 p-2 rounded-lg">
                    💡 <strong>訳:</strong> {currentSeg.ja_text}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 3. 下部：全体一括チェック & 全文章クイック選択一覧 */}
        <div className="bg-white border rounded-xl p-5 space-y-4 shadow-sm">
          <div className="flex justify-between items-center border-b pb-2">
            <h2 className="text-sm font-bold text-gray-800">全文章リスト ({segments.length}文)</h2>
            <button
              onClick={handleCheckAllAnswers}
              className="px-3 py-1.5 bg-green-600 text-white rounded-lg font-bold text-xs hover:bg-green-700 shadow-sm"
            >
              全体を一括チェック
            </button>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {segments.map((seg, idx) => {
              const isCurrent = idx === activeSegIndex;
              return (
                <div
                  key={seg.id}
                  onClick={() => {
                    setActiveSegIndex(idx);
                    setSeekToTime(seg.start_ms / 1000);
                  }}
                  className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-colors flex justify-between items-center ${
                    isCurrent ? 'bg-blue-50 border-blue-500 font-bold text-blue-900' : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <span className="font-mono">#{ (idx + 1).toString().padStart(2, '0') }</span>
                  <span className="truncate max-w-[280px] font-mono">{ seg.corrected_text || seg.text }</span>
                  <span className="text-[10px] text-gray-400 font-mono">{ ((seg.start_ms || 0) / 1000).toFixed(1) }s</span>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </main>
  );
}