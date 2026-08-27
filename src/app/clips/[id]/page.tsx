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

  const handleInputChange = (key: string, value: string) => {
    setUserAnswers((prev) => ({ ...prev, [key]: value }));
  };

  // 単一セグメント（文章）ごとの採点 & DB保存
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

      // DBに試行履歴/間違いデータを非同期保存
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

  // クリップ全体一括チェック
  const handleCheckAllAnswers = async () => {
    for (const seg of segments) {
      await checkSingleSegment(seg.id);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">読み込み中...</div>;

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

        <div className="bg-white border rounded-xl p-5 space-y-5 shadow-sm">
          <h2 className="text-base font-bold text-gray-800 border-b pb-2">
            ディクテーション穴埋め問題
          </h2>

          <div className="space-y-4">
            {segments.map((seg) => {
              const words = (seg.corrected_text || seg.text).split(' ');
              const segItems = clozeItems.filter((it) => it.segment_id === seg.id);
              
              // 現在再生中の文かどうか判定
              const startSec = (seg.start_ms || 0) / 1000;
              const endSec = (seg.end_ms || 0) / 1000;
              const isActive = currentVideoTime >= startSec && currentVideoTime <= endSec;
              const isChecked = checkedSegments[seg.id];

              return (
                <div
                  key={seg.id}
                  className={`p-4 border rounded-xl transition-all space-y-3 ${
                    isActive ? 'border-blue-500 bg-blue-50/40 ring-2 ring-blue-200 shadow-md' : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex justify-between items-center text-xs text-gray-400 font-mono">
                    <span className={isActive ? 'font-bold text-blue-600' : ''}>
                      #{ (seg.idx + 1).toString().padStart(2, '0') } ({startSec.toFixed(1)}s - {endSec.toFixed(1)}s)
                    </span>
                    <button
                      onClick={() => setSeekToTime(startSec)}
                      className="px-2 py-1 bg-blue-100 text-blue-700 font-bold rounded-lg text-[11px] hover:bg-blue-200 transition-colors"
                    >
                      ▶️ ここから再生
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2 items-center font-mono">
                    {words.map((word, wIdx) => {
                      const key = `${seg.id}-${wIdx}`;
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

                  {/* この文章単体の回答チェックボタン */}
                  <div className="flex justify-end pt-2 border-t border-gray-200/60">
                    <button
                      onClick={() => checkSingleSegment(seg.id)}
                      className="px-3 py-1.5 bg-gray-800 text-white rounded-lg text-xs font-bold hover:bg-gray-900"
                    >
                      この文章をチェック
                    </button>
                  </div>

                  {/* チェック後にのみ表示される構文と日本語訳 */}
                  {isChecked && seg.skeletons && seg.skeletons.length > 0 && (
                    <div className="space-y-1 pt-1">
                      {seg.skeletons.map((sk, idx) => (
                        <div key={idx} className="text-xs bg-blue-50 text-blue-800 px-2 py-1 rounded font-semibold">
                          💡 構文: <strong>{sk.text}</strong> ({sk.label})
                        </div>
                      ))}
                    </div>
                  )}

                  {isChecked && seg.ja_text && (
                    <div className="text-xs text-gray-600 pt-1">
                      💡 <strong>訳:</strong> {seg.ja_text}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button
            onClick={handleCheckAllAnswers}
            className="w-full py-3 bg-green-600 text-white rounded-lg font-bold text-sm hover:bg-green-700 shadow-md transition-colors"
          >
            全体を一括チェックする
          </button>
        </div>

      </div>
    </main>
  );
}