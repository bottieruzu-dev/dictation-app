"use client";

import { use } from "react";
import TranscriptView from "@/components/TranscriptView";

export default function VideoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);

  return (
    <main className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4 space-y-6">
        <div className="flex items-center justify-between border-b pb-3">
          <h1 className="text-xl font-bold text-gray-900">
            動画詳細 &amp; クリップ切り出し
          </h1>
          <a href="/" className="text-sm text-blue-600 hover:underline font-bold">
            ← ダッシュボードに戻る
          </a>
        </div>
        <TranscriptView videoId={resolvedParams.id} />
      </div>
    </main>
  );
}