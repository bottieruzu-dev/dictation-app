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

  const supabase = createClient();

  const fetchHistoryAndAnalytics = async () => {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();

    // 1. 間違い記録一覧の取得
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

    // 2. 学習セッション（play_sessions）の累積分析データ集計
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

  const handlePrintPdf = () => {
    window.print();
  };

  return (
    <main className="min-h-screen bg-gray-50 py-8 print:bg-white print:py-0">
      <div className="max-w-3xl mx-auto px-4 space-y-6">
        
        {/* ヘッダー領域 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b pb-4 gap-3 print:hidden">
          <div>
            <h1 className="text-xl font-bold text-gray-900">📝 間違いノート・学習レポート</h1>
            <p className="text-xs text-gray-500 mt-1">累積のディクテーション分析データと誤答ログを管理できます</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handlePrintPdf}
              className="px-3.5 py-2 bg-green-600 text-white font-bold text-xs rounded-lg hover:bg-green-700 shadow-sm transition-colors"
            >
              📄 分析PDFを印刷 / 出力
            </button>
            <Link
              href="/"
              className="px-3.5 py-2 bg-gray-200 text-gray-700 font-bold text-xs rounded-lg hover:bg-gray-300 transition-colors"
            >
              ← ダッシュボード
            </Link>
          </div>
        </div>

        {/* 印刷/PDF専用ヘッダー */}
        <div className="hidden print:block border-b pb-2 mb-4">
          <h1 className="text-2xl font-bold text-black">Dictation App - 総合学習分析レポート</h1>
          <p className="text-xs text-gray-500">出力日時: {new Date().toLocaleString()}</p>
        </div>

        {/* 分析サマリーパネル（印刷時も出力） */}
        <div className="bg-white border rounded-2xl p-5 shadow-sm space-y-3">
          <h2 className="text-xs font-extrabold text-gray-700 tracking-wider">📊 累積学習パフォーマンス</h2>
          <div className="grid grid-cols-3 gap-3 font-mono text-center">
            <div className="bg-gray-50 p-3 rounded-xl border">
              <div className="text-[10px] text-gray-500 font-bold">総セッション数</div>
              <div className="text-xl font-black text-gray-900 mt-0.5">{summary.totalSessions} 回</div>
            </div>
            <div className="bg-blue-50 p-3 rounded-xl border border-blue-100">
              <div className="text-[10px] text-blue-600 font-bold">平均素の正答率 (raw)</div>
              <div className="text-xl font-black text-blue-900 mt-0.5">{summary.avgRawAccuracy}%</div>
            </div>
            <div className="bg-purple-50 p-3 rounded-xl border border-purple-100">
              <div className="text-[10px] text-purple-600 font-bold">獲得モンスター数</div>
              <div className="text-xl font-black text-purple-900 mt-0.5">{summary.totalDroppedCount} 体</div>
            </div>
          </div>
        </div>

        {/* 一括操作バー */}
        {!loading && attempts.length > 0 && (
          <div className="flex items-center justify-between bg-white p-3 border rounded-xl shadow-sm print:hidden">
            <label className="flex items-center gap-2 text-xs font-bold text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedIds.length === attempts.length && attempts.length > 0}
                onChange={handleSelectAll}
                className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
              />
              すべて選択 ({selectedIds.length} / {attempts.length} 件)
            </label>

            <button
              onClick={handleDeleteSelected}
              disabled={selectedIds.length === 0 || deleting}
              className="px-3.5 py-1.5 bg-red-600 text-white font-bold text-xs rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors flex items-center gap-1"
            >
              🗑️ 選択した項目を削除
            </button>
          </div>
        )}

        {/* 一覧カード */}
        {loading ? (
          <p className="text-xs text-gray-500 text-center py-8">履歴を読み込み中...</p>
        ) : attempts.length === 0 ? (
          <div className="bg-white p-8 text-center border rounded-xl text-gray-400 text-sm">
            間違えた問題の記録はありません！素晴らしいです。
          </div>
        ) : (
          <div className="space-y-3">
            {attempts.map((att) => {
              const isChecked = selectedIds.includes(att.id);
              return (
                <div
                  key={att.id}
                  className={`p-4 bg-white border rounded-xl shadow-sm space-y-2.5 transition-all print:border-gray-300 print:shadow-none ${
                    isChecked ? 'border-blue-500 ring-2 ring-blue-100 bg-blue-50/20' : ''
                  }`}
                >
                  <div className="flex items-center justify-between border-b pb-2 text-xs text-gray-400 font-mono">
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleSelect(att.id)}
                        className="w-4 h-4 rounded accent-blue-600 cursor-pointer print:hidden"
                      />
                      <span>📅 {new Date(att.created_at).toLocaleString()}</span>
                    </div>

                    <div className="flex items-center gap-3 print:hidden">
                      <Link
                        href={`/clips/${att.clip_id}`}
                        className="text-blue-600 font-bold hover:underline"
                      >
                        {att.clips?.label || 'クリップを開く'} ➔
                      </Link>
                      <button
                        onClick={() => handleDeleteSingle(att.id)}
                        className="text-gray-400 hover:text-red-500 transition-colors p-1"
                        title="削除"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm font-mono pt-1">
                    <div className="bg-red-50 p-2.5 rounded-lg border border-red-100">
                      <span className="text-[10px] text-red-500 block font-bold mb-0.5">あなたの回答:</span>
                      <span className="font-bold text-red-800 break-all">
                        {att.input_raw || '（未入力）'}
                      </span>
                    </div>
                    <div className="bg-green-50 p-2.5 rounded-lg border border-green-100">
                      <span className="text-[10px] text-green-600 block font-bold mb-0.5">正解:</span>
                      <span className="font-bold text-green-800 break-all">{att.answer_gold}</span>
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