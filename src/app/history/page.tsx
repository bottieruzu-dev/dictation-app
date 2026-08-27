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

export default function HistoryPage() {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function fetchAttempts() {
      setLoading(true);
      const { data } = await supabase
        .from('attempts')
        .select('*, clips(label)')
        .eq('is_correct', false)
        .order('created_at', { ascending: false });

      if (data) setAttempts(data);
      setLoading(false);
    }

    fetchAttempts();
  }, []);

  const handlePrintPdf = () => {
    window.print();
  };

  return (
    <main className="min-h-screen bg-gray-50 py-8 print:bg-white print:py-0">
      <div className="max-w-3xl mx-auto px-4 space-y-6">
        
        <div className="flex items-center justify-between border-b pb-4 print:hidden">
          <h1 className="text-xl font-bold text-gray-900">📝 間違いノート・学習履歴</h1>
          <div className="flex gap-2">
            <button
              onClick={handlePrintPdf}
              className="px-4 py-2 bg-green-600 text-white font-bold text-xs rounded-lg hover:bg-green-700 shadow-sm"
            >
              📄 PDF一覧をダウンロード
            </button>
            <Link href="/" className="px-3 py-2 bg-gray-200 text-gray-700 font-bold text-xs rounded-lg hover:bg-gray-300">
              ← ダッシュボード
            </Link>
          </div>
        </div>

        {/* 印刷/PDF専用ヘッダー */}
        <div className="hidden print:block border-b pb-2 mb-4">
          <h1 className="text-2xl font-bold text-black">Dictation App - 間違いデータ分析レポート</h1>
          <p className="text-xs text-gray-500">出力日時: {new Date().toLocaleString()}</p>
        </div>

        {loading ? (
          <p className="text-xs text-gray-500 text-center py-8">履歴を読み込み中...</p>
        ) : attempts.length === 0 ? (
          <div className="bg-white p-8 text-center border rounded-xl text-gray-400 text-sm">
            間違えた問題の記録はありません！素晴らしいです。
          </div>
        ) : (
          <div className="space-y-3">
            {attempts.map((att) => (
              <div key={att.id} className="p-4 bg-white border rounded-xl shadow-sm space-y-2 print:border-gray-300 print:shadow-none">
                <div className="flex justify-between items-center text-xs text-gray-400 font-mono border-b pb-1">
                  <span>📅 {new Date(att.created_at).toLocaleString()}</span>
                  <Link href={`/clips/${att.clip_id}`} className="text-blue-600 font-bold hover:underline print:hidden">
                    {att.clips?.label || 'クリップを開く'} ➔
                  </Link>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm font-mono pt-1">
                  <div className="bg-red-50 p-2 rounded border border-red-100">
                    <span className="text-[10px] text-red-500 block font-bold">あなたの回答:</span>
                    <span className="font-bold text-red-800">{att.input_raw || '（未入力）'}</span>
                  </div>
                  <div className="bg-green-50 p-2 rounded border border-green-100">
                    <span className="text-[10px] text-green-600 block font-bold">正解:</span>
                    <span className="font-bold text-green-800">{att.answer_gold}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </main>
  );
}