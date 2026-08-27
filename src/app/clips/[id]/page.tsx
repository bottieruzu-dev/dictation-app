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

  // 回答状態管理
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, { isCorrect: boolean; score: number; answer: string }>>({});
  const [showResult, setShowResult] = useState(false);

  // R2 署名付き URL
  const { url: signedUrl, loading: urlLoading } = useSignedUrl(id, 'video');

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

  const handleCheckAnswers = () => {
    const newResults: Record<string, { isCorrect: boolean; score: number; answer: string }> = {};

    segments.forEach((seg) => {
      const words = (seg.corrected_text || seg.text).split(' ');
      const segItems = clozeItems.filter((it) => it.segment_id === seg.id);

      words.forEach((word, wIdx) => {
        const key = `${seg.id}-${wIdx}`;
        const item = segItems.find((it) => it.word_from === wIdx);

        const targetAnswer = item ? item.answer : word.replace(/[^a-zA-Z0-9]/g, '');
        const userInput = (userAnswers[key] || '').trim().toLowerCase();
        const gold = targetAnswer.trim().toLowerCase();

        if (userInput === gold) {
          newResults[key] = { isCorrect: true, score: 1.0, answer: targetAnswer };
        } else {
          newResults[key] = { isCorrect: false, score: 0.0, answer: targetAnswer };
        }
      });
    });

    setResults(newResults);
    setShowResult(true);
  };

  if (loading) return <div className="p-8 text-center text-gray-500">読み込み中...</div>;

  if (!clip) return (
    <div className="max-w-xl mx-auto p-6 space-y-4">
      <p className="text-gray-700 font-bold">クリップが見つかりませんでした。</p>
      <Link href="/" className="inline-block px-4 py-2 bg-gray-800 text-white rounded-lg text-sm font-bold">
        ← ダッシュボードに戻る
      </Link>
    </div>
  );

  return (
    <main className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-xl mx-auto px-4 space-y-6">
        
        <div className="flex items-center justify-between border-b pb-3">
          <h1 className="text-lg font-bold text-gray-900">
            {clip.label || clip.videos?.title || 'ディクテーション穴埋め'}
          </h1>
          <Link href="/" className="text-sm text-blue-600 hover:underline font-bold">
            ← ダッシュボードに戻る
          </Link>
        </div>

        {/* 1. プレイヤー領域 */}
        {signedUrl ? (
          /* R2に動画準備完了 ➔ 独自ClipPlayerを起動 */
          <ClipPlayer src={signedUrl} />
        ) : urlLoading ? (
          <div className="p-8 bg-white border rounded-xl text-center text-gray-500 text-sm">
            動画プレイヤーを準備中...
          </div>
        ) : (
          /* ワーカー未処理の場合の表示 */
          <div className="p-8 bg-amber-50 border border-amber-200 rounded-xl text-center space-y-2">
            <p className="text-sm font-bold text-amber-800">
              ⏳ 動画の切り出し処理中です
            </p>
            <p className="text-xs text-amber-700">
              PCで <code className="bg-amber-100 px-1 py-0.5 rounded">run_worker.bat</code> を起動して処理が完了すると、専用プレイヤー（ループ機能付き）で再生できるようになります。
            </p>
          </div>
        )}

        {/* 2. 穴埋めドリルカード */}
        <div className="bg-white border rounded-xl p-5 space-y-5 shadow-sm">
          <h2 className="text-base font-bold text-gray-800 border-b pb-2">
            ディクテーション穴埋め問題
          </h2>

          <div className="space-y-4">
            {segments.map((seg) => {
              const words = (seg.corrected_text || seg.text).split(' ');
              const segItems = clozeItems.filter((it) => it.segment_id === seg.id);

              return (
                <div key={seg.id} className="p-4 border rounded-xl bg-gray-50 space-y-3">
                  <div className="text-xs text-gray-400 font-mono">
                    #{(seg.idx + 1).toString().padStart(2, '0')} ({((seg.start_ms || 0) / 1000).toFixed(1)}s - {((seg.end_ms || 0) / 1000).toFixed(1)}s)
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
                                res
                                  ? res.isCorrect
                                    ? 'border-green-500 bg-green-50 text-green-800'
                                    : 'border-red-500 bg-red-50 text-red-800'
                                  : 'border-blue-500 bg-white text-gray-900'
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
                        <span key={wIdx} className="text-sm font-bold text-gray-800 self-center">
                          {word}
                        </span>
                      );
                    })}
                  </div>

                  {seg.ja_text && showResult && (
                    <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-600">
                      💡 <strong>訳:</strong> {seg.ja_text}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button
            onClick={handleCheckAnswers}
            className="w-full py-3 bg-green-600 text-white rounded-lg font-bold text-sm hover:bg-green-700 shadow-md transition-colors"
          >
            回答をチェックする
          </button>
        </div>

      </div>
    </main>
  );
}