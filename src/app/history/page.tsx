'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

interface Attempt {
  id: string;
  clip_id: string;
  input_raw: string;
  answer_gold: string;
  created_at: string;
  clips?: {
    label: string;
  };
}

interface SessionSummary {
  totalSessions: number;
  avgRawAccuracy: number;
  totalDroppedCount: number;
}

export default function HistoryPage() {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [summary, setSummary] = useState<SessionSummary>({
    totalSessions: 0,
    avgRawAccuracy: 0,
    totalDroppedCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedSelectedIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);

  // 📝 復習特訓（ドリル）モード用ステート
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [reviewInput, setReviewInput] = useState<Record<string, string>>({});
  const [reviewCompleted, setReviewCompleted] = useState(false);
  const [rewardMsg, setRewardMsg] = useState<string | null>(null);

  const supabase = createClient();

  const fetchHistoryAndAnalytics = async () => {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();

    const { data: attData, error } = await supabase
      .from('attempts')
      .select('*, clips(label)')
      .eq('is_correct', false)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching attempts:', error);
    } else if (attData) {
      setAttempts(attData);
    }

    if (user) {
      const { data: sessData } = await supabase
        .from('play_sessions')
        .select('raw_accuracy, dropped_count')
        .eq('owner_id', user.id);

      if (sessData && sessData.length > 0) {
        const total = sessData.length;
        const avgAcc = sessData.reduce((acc, row) => acc + (row.raw_accuracy || 0), 0) / total;
        const drops = sessData.reduce((acc, row) => acc + (row.dropped_count || 0), 0);

        setSummary({
          totalSessions: total,
          avgRawAccuracy: Math.round(avgAcc),
          totalDroppedCount: drops,
        });
      }
    }

    setLoading(false);
  };

  useEffect(() => {
    void fetchHistoryAndAnalytics();
  }, []);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedSelectedIds(attempts.map((a) => a.id));
    } else {
      setSelectedSelectedIds([]);
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleDeleteSingle = async (id: string) => {
    if (!confirm('この間違い記録を削除しますか？')) return;
    setDeleting(true);
    await supabase.from('attempts').delete().eq('id', id);
    setSelectedSelectedIds((prev) => prev.filter((i) => i !== id));
    await fetchHistoryAndAnalytics();
    setDeleting(false);
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`選択した ${selectedIds.length} 件の間違い記録を削除しますか？`)) return;

    setDeleting(true);
    await supabase.from('attempts').delete().in('id', selectedIds);
    setSelectedSelectedIds([]);
    await fetchHistoryAndAnalytics();
    setDeleting(false);
  };

  // 📝 復習特訓クリア時のオーブ1個獲得処理
  const handleCompleteReview = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // 正解判定
    const reviewList = attempts.slice(0, 5);
    let correctCount = 0;

    for (const item of reviewList) {
      const input = (reviewInput[item.id] || "").trim().toLowerCase();
      const gold = item.answer_gold.trim().toLowerCase();
      if (input === gold) {
        correctCount++;
        // 克服した項目は正解済みフラグに更新
        await supabase.from('attempts').update({ is_correct: true }).eq('id', item.id);
      }
    }

    if (correctCount > 0) {
      // オーブ1個獲得
      await supabase.from("orb_ledger").insert({
        owner_id: user.id,
        delta: 1,
        reason: "history_review_complete",
      });

      setRewardMsg(`🎉 復習完了！${correctCount}問クリアで 💎 オーブ1個 を獲得しました！`);
    } else {
      setRewardMsg("💦 正解がありませんでした。もう一度チャレンジしましょう！");
    }

    setReviewCompleted(true);
    void fetchHistoryAndAnalytics();
  };

  return (
    <main className="min-h-screen bg-gray-950 text-white py-8 print:bg-white print:py-0">
      <div className="max-w-3xl mx-auto px-4 space-y-6">
        
        {/* ヘッダー領域 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-800 pb-4 gap-3 print:hidden">
          <div>
            <h1 className="text-xl font-bold text-white">📝 間違いノート・復習特訓</h1>
            <p className="text-xs text-gray-400 mt-1">復習ドリルをクリアして 💎 オーブ1個 を獲得しよう！</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {attempts.length > 0 && !isReviewMode && (
              <button
                onClick={() => { setIsReviewMode(true); setReviewCompleted(false); setRewardMsg(null); }}
                className="px-3.5 py-2 bg-gradient-to-r from-amber-500 to-orange-600 text-black font-black text-xs rounded-xl shadow-lg animate-bounce"
              >
                🔥 復習特訓スタート (💎 1個)
              </button>
            )}
            <Link
              href="/"
              className="px-3.5 py-2 bg-gray-800 text-gray-200 font-bold text-xs rounded-xl hover:bg-gray-700 transition-colors"
            >
              ← ダッシュボード
            </Link>
          </div>
        </div>

        {/* 📝 復習特訓ドリルモード */}
        {isReviewMode && (
          <div className="bg-gray-900 border-2 border-amber-500/80 rounded-2xl p-5 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-gray-800 pb-2">
              <span className="text-xs font-black text-amber-400 font-mono">
                📝 弱点克服復習ドリル ({Math.min(5, attempts.length)}問)
              </span>
              <button
                onClick={() => setIsReviewMode(false)}
                className="text-xs text-gray-400 hover:text-white"
              >
                ✕ 閉じる
              </button>
            </div>

            {!reviewCompleted ? (
              <div className="space-y-3">
                {attempts.slice(0, 5).map((att, idx) => (
                  <div key={att.id} className="bg-gray-950 p-3 rounded-xl border border-gray-800 space-y-1.5 font-mono text-xs">
                    <div className="text-[10px] text-gray-500">
                      問題 #{idx + 1}: {att.clips?.label || 'クリップ単語'}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={reviewInput[att.id] || ''}
                        onChange={(e) => setReviewInput({ ...reviewInput, [att.id]: e.target.value })}
                        placeholder="正しい英文を入力..."
                        className="flex-1 bg-slate-900 border border-amber-500/50 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none"
                      />
                    </div>
                  </div>
                ))}

                <button
                  onClick={handleCompleteReview}
                  className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-black font-black text-xs rounded-xl shadow-lg"
                >
                  回答を判定して 💎 オーブを獲得
                </button>
              </div>
            ) : (
              <div className="text-center py-4 space-y-3 font-mono">
                <p className="text-xs text-amber-300 font-bold">{rewardMsg}</p>
                <button
                  onClick={() => setIsReviewMode(false)}
                  className="px-6 py-2 bg-gray-800 text-white text-xs font-bold rounded-xl"
                >
                  ノート一覧へ戻る
                </button>
              </div>
            )}
          </div>
        )}

        {/* 分析サマリー */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-sm space-y-3">
          <h2 className="text-xs font-extrabold text-gray-300 tracking-wider">📊 累積学習パフォーマンス</h2>
          <div className="grid grid-cols-3 gap-3 font-mono text-center">
            <div className="bg-gray-950 p-3 rounded-xl border border-gray-800">
              <div className="text-[10px] text-gray-500 font-bold">総セッション数</div>
              <div className="text-xl font-black text-white mt-0.5">{summary.totalSessions} 回</div>
            </div>
            <div className="bg-gray-950 p-3 rounded-xl border border-gray-800">
              <div className="text-[10px] text-cyan-400 font-bold">平均正答率 (raw)</div>
              <div className="text-xl font-black text-cyan-300 mt-0.5">{summary.avgRawAccuracy}%</div>
            </div>
            <div className="bg-gray-950 p-3 rounded-xl border border-gray-800">
              <div className="text-[10px] text-purple-400 font-bold">獲得偉人数</div>
              <div className="text-xl font-black text-purple-300 mt-0.5">{summary.totalDroppedCount} 体</div>
            </div>
          </div>
        </div>

        {/* 一括操作バー */}
        {!loading && attempts.length > 0 && (
          <div className="flex items-center justify-between bg-gray-900 p-3 border border-gray-800 rounded-xl print:hidden">
            <label className="flex items-center gap-2 text-xs font-bold text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedIds.length === attempts.length && attempts.length > 0}
                onChange={handleSelectAll}
                className="w-4 h-4 rounded accent-cyan-500 cursor-pointer"
              />
              すべて選択 ({selectedIds.length} / {attempts.length} 件)
            </label>

            <button
              onClick={handleDeleteSelected}
              disabled={selectedIds.length === 0 || deleting}
              className="px-3.5 py-1.5 bg-red-600 text-white font-bold text-xs rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors"
            >
              🗑️ 選択項目を削除
            </button>
          </div>
        )}

        {/* 一覧カード */}
        {loading ? (
          <p className="text-xs text-gray-500 text-center py-8 font-mono">履歴を読み込み中...</p>
        ) : attempts.length === 0 ? (
          <div className="bg-gray-900 p-8 text-center border border-gray-800 rounded-xl text-gray-400 text-sm font-mono">
            間違えた問題の記録はありません！素晴らしいです。
          </div>
        ) : (
          <div className="space-y-3">
            {attempts.map((att) => {
              const isChecked = selectedIds.includes(att.id);
              return (
                <div
                  key={att.id}
                  className={`p-4 bg-gray-900 border rounded-xl shadow-sm space-y-2.5 transition-all ${
                    isChecked ? 'border-cyan-500 bg-cyan-950/20' : 'border-gray-800'
                  }`}
                >
                  <div className="flex items-center justify-between border-b border-gray-800 pb-2 text-xs text-gray-400 font-mono">
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleSelect(att.id)}
                        className="w-4 h-4 rounded accent-cyan-500 cursor-pointer"
                      />
                      <span>📅 {new Date(att.created_at).toLocaleString()}</span>
                    </div>

                    <div className="flex items-center gap-3">
                      <Link
                        href={`/clips/${att.clip_id}`}
                        className="text-cyan-400 font-bold hover:underline"
                      >
                        {att.clips?.label || 'クリップを開く'} ➔
                      </Link>
                      <button
                        onClick={() => handleDeleteSingle(att.id)}
                        className="text-gray-500 hover:text-red-400"
                        title="削除"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs font-mono pt-1">
                    <div className="bg-red-950/40 p-2.5 rounded-lg border border-red-900">
                      <span className="text-[10px] text-red-400 block font-bold mb-0.5">あなたの回答:</span>
                      <span className="font-bold text-red-300 break-all">
                        {att.input_raw || '（未入力）'}
                      </span>
                    </div>
                    <div className="bg-green-950/40 p-2.5 rounded-lg border border-green-900">
                      <span className="text-[10px] text-green-400 block font-bold mb-0.5">正解:</span>
                      <span className="font-bold text-green-300 break-all">{att.answer_gold}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </main>
  );
}