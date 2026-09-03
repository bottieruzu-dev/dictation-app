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
    if (!confirm('この誤答ログを削除しますか？')) return;
    setDeleting(true);
    await supabase.from('attempts').delete().eq('id', id);
    setSelectedSelectedIds((prev) => prev.filter((i) => i !== id));
    await fetchHistoryAndAnalytics();
    setDeleting(false);
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`選択した ${selectedIds.length} 件の誤答ログを削除しますか？`)) return;

    setDeleting(true);
    await supabase.from('attempts').delete().in('id', selectedIds);
    setSelectedSelectedIds([]);
    await fetchHistoryAndAnalytics();
    setDeleting(false);
  };

  const handleCompleteReview = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const reviewList = attempts.slice(0, 5);
    let correctCount = 0;

    for (const item of reviewList) {
      const input = (reviewInput[item.id] || "").trim().toLowerCase();
      const gold = item.answer_gold.trim().toLowerCase();
      if (input === gold) {
        correctCount++;
        await supabase.from('attempts').update({ is_correct: true }).eq('id', item.id);
      }
    }

    if (correctCount > 0) {
      await supabase.from("orb_ledger").insert({
        owner_id: user.id,
        delta: 1,
        reason: "history_review_complete",
      });

      setRewardMsg(`復習完了！${correctCount}問クリアで オーブ1個 を獲得しました！`);
    } else {
      setRewardMsg("正解がありませんでした。再度挑戦しましょう。");
    }

    setReviewCompleted(true);
    void fetchHistoryAndAnalytics();
  };

  return (
    <main className="min-h-screen pb-20 pt-4 px-3 sm:px-6">
      <div className="max-w-3xl mx-auto space-y-4">
        
        <div className="game-panel p-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-black text-white">鍛錬手記 ＆ 復習</h1>
            <p className="text-[10px] text-slate-400 font-mono mt-0.5">ドリル完了でオーブ1個を獲得</p>
          </div>
          <div className="flex items-center gap-2">
            {attempts.length > 0 && !isReviewMode && (
              <button
                onClick={() => { setIsReviewMode(true); setReviewCompleted(false); setRewardMsg(null); }}
                className="btn-game-yellow text-xs px-3 py-1.5 rounded-xl font-black"
              >
                復習特訓 (💎1)
              </button>
            )}
            <Link href="/" className="btn-game-blue text-xs px-3 py-1.5 rounded-xl">
              ◀ ホーム
            </Link>
          </div>
        </div>

        {/* 特訓ドリル */}
        {isReviewMode && (
          <div className="game-panel border-2 border-amber-500/80 p-4 space-y-3">
            <div className="flex justify-between items-center border-b border-[#213757] pb-1.5">
              <span className="text-xs font-bold text-amber-300 font-num">
                弱点克服ドリル ({Math.min(5, attempts.length)}問)
              </span>
              <button onClick={() => setIsReviewMode(false)} className="text-xs text-slate-400">✕</button>
            </div>

            {!reviewCompleted ? (
              <div className="space-y-2">
                {attempts.slice(0, 5).map((att, idx) => (
                  <div key={att.id} className="bg-[#09111c] p-2.5 rounded-xl border border-[#213757] space-y-1 font-mono text-xs">
                    <div className="text-[9px] text-slate-400">
                      #{idx + 1}: {att.clips?.label || '単語'}
                    </div>
                    <input
                      type="text"
                      value={reviewInput[att.id] || ''}
                      onChange={(e) => setReviewInput({ ...reviewInput, [att.id]: e.target.value })}
                      placeholder="正しい英文を入力..."
                      className="w-full bg-[#050a12] border border-[#213757] rounded-lg px-3 py-1 text-xs text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                ))}

                <button
                  onClick={handleCompleteReview}
                  className="w-full py-2.5 btn-game-yellow text-xs rounded-xl"
                >
                  回答を判定する
                </button>
              </div>
            ) : (
              <div className="text-center py-3 space-y-2 font-mono">
                <p className="text-xs text-amber-300 font-bold">{rewardMsg}</p>
                <button onClick={() => setIsReviewMode(false)} className="btn-game-blue text-xs px-4 py-1.5 rounded-xl">
                  戻る
                </button>
              </div>
            )}
          </div>
        )}

        {/* サマリー */}
        <div className="game-panel p-3.5 space-y-2">
          <h2 className="text-xs font-bold text-slate-300">📊 累積分析</h2>
          <div className="grid grid-cols-3 gap-2 font-num text-center text-xs">
            <div className="bg-[#09111c] p-2 rounded-xl border border-[#213757]">
              <div className="text-[8px] text-slate-400">総セッション</div>
              <div className="text-base font-bold text-white mt-0.5">{summary.totalSessions}</div>
            </div>
            <div className="bg-[#09111c] p-2 rounded-xl border border-[#213757]">
              <div className="text-[8px] text-sky-400">平均正答率</div>
              <div className="text-base font-bold text-sky-300 mt-0.5">{summary.avgRawAccuracy}%</div>
            </div>
            <div className="bg-[#09111c] p-2 rounded-xl border border-[#213757]">
              <div className="text-[8px] text-purple-400">獲得偉人</div>
              <div className="text-base font-bold text-purple-300 mt-0.5">{summary.totalDroppedCount}</div>
            </div>
          </div>
        </div>

        {/* 誤答ログ一覧 */}
        {!loading && attempts.length > 0 && (
          <div className="flex items-center justify-between game-panel p-2.5">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedIds.length === attempts.length && attempts.length > 0}
                onChange={handleSelectAll}
                className="w-3.5 h-3.5 rounded accent-sky-500"
              />
              全選択 ({selectedIds.length} / {attempts.length})
            </label>

            <button
              onClick={handleDeleteSelected}
              disabled={selectedIds.length === 0 || deleting}
              className="px-3 py-1 bg-red-900/80 hover:bg-red-800 text-red-200 font-bold text-xs rounded-lg disabled:opacity-40"
            >
              選択項目を削除
            </button>
          </div>
        )}

        {loading ? (
          <p className="text-xs text-slate-500 text-center py-8">履歴を読み込み中...</p>
        ) : attempts.length === 0 ? (
          <div className="game-panel p-8 text-center text-slate-400 text-xs font-mono">
            間違えた問題の記録はありません。
          </div>
        ) : (
          <div className="space-y-2">
            {attempts.map((att) => {
              const isChecked = selectedIds.includes(att.id);
              return (
                <div
                  key={att.id}
                  className={`game-panel p-3 space-y-2 ${isChecked ? 'border-sky-400' : ''}`}
                >
                  <div className="flex items-center justify-between border-b border-[#213757] pb-1.5 text-[10px] text-slate-400 font-mono">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleSelect(att.id)}
                        className="w-3.5 h-3.5 rounded accent-sky-500"
                      />
                      <span>📅 {new Date(att.created_at).toLocaleString()}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Link href={`/clips/${att.clip_id}`} className="text-sky-400 font-bold">
                        {att.clips?.label || 'ステージ'} ➔
                      </Link>
                      <button onClick={() => handleDeleteSingle(att.id)} className="text-slate-400 hover:text-red-400">✕</button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <div className="bg-red-950/40 p-2 rounded-lg border border-red-900/50">
                      <span className="text-[8px] text-red-400 block font-bold mb-0.5">あなたの回答:</span>
                      <span className="font-bold text-red-300 break-all">{att.input_raw || '（未入力）'}</span>
                    </div>
                    <div className="bg-emerald-950/40 p-2 rounded-lg border border-emerald-900/50">
                      <span className="text-[8px] text-emerald-400 block font-bold mb-0.5">正解:</span>
                      <span className="font-bold text-emerald-300 break-all">{att.answer_gold}</span>
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