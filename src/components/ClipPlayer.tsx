"use client";

import { useEffect, useRef, useState } from "react";

interface ClipPlayerProps {
  src: string;
  seekToTime?: number | null;
  playbackSpeed?: number;
  segmentStart?: number | null;
  segmentEnd?: number | null;
  onTimeUpdate?: (time: number) => void;
}

export default function ClipPlayer({
  src,
  seekToTime,
  playbackSpeed = 1.0,
  segmentStart = null,
  segmentEnd = null,
  onTimeUpdate,
}: ClipPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const isCoolingDownRef = useRef(false);

  // 文頭の切れ防止バッファ (0.3秒前から再生開始)
  const bufferedStart = segmentStart !== null ? Math.max(0, segmentStart - 0.3) : null;
  const bufferedEnd = segmentEnd !== null ? segmentEnd + 0.1 : null;

  const rangeRef = useRef<{ start: number | null; end: number | null }>({
    start: bufferedStart,
    end: bufferedEnd,
  });

  useEffect(() => {
    rangeRef.current = { start: bufferedStart, end: bufferedEnd };
  }, [bufferedStart, bufferedEnd]);

  // 指定範囲の先頭に確実にジャンプさせる関数
  const seekToSegmentStart = () => {
    const v = videoRef.current;
    const start = rangeRef.current.start;
    if (v && start !== null) {
      isCoolingDownRef.current = true;
      v.currentTime = start;
      setTimeout(() => {
        isCoolingDownRef.current = false;
      }, 300);
    }
  };

  // 再生速度の自動適用
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed, src]);

  // セグメント切り替え時に先頭へ移動して再生開始
  useEffect(() => {
    if (bufferedStart !== null && videoRef.current) {
      seekToSegmentStart();
      void videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  }, [segmentStart]);

  // 特定時間のシーク対応
  useEffect(() => {
    if (seekToTime !== undefined && seekToTime !== null && videoRef.current) {
      isCoolingDownRef.current = true;
      videoRef.current.currentTime = Math.max(0, seekToTime - 0.3);
      void videoRef.current.play().catch(() => {});
      setIsPlaying(true);
      setTimeout(() => {
        isCoolingDownRef.current = false;
      }, 300);
    }
  }, [seekToTime]);

  // 動画データの読み込み完了時に正しい位置へジャンプさせる
  const handleLoadedMetadata = () => {
    seekToSegmentStart();
  };

  // 厳密なループ＆範囲内維持チェック
  const checkAndLoop = () => {
    const v = videoRef.current;
    const { start, end } = rangeRef.current;

    if (v && !v.paused && start !== null && end !== null) {
      if (onTimeUpdate) onTimeUpdate(v.currentTime);

      if (!isCoolingDownRef.current) {
        // 終了時間を超えたか、または開始時間より大幅に手前(0秒付近)にいる場合は範囲の先頭へ移動
        if (v.currentTime >= end || v.currentTime < start - 0.5) {
          isCoolingDownRef.current = true;
          v.currentTime = start;
          if (v.paused) {
            void v.play().catch(() => {});
          }
          setTimeout(() => {
            isCoolingDownRef.current = false;
          }, 300);
        }
      }
    }
  };

  useEffect(() => {
    let animId: number;
    const loop = () => {
      checkAndLoop();
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, []);

  const togglePlay = () => {
    const v = videoRef.current;
    const { start, end } = rangeRef.current;
    if (!v) return;

    if (isPlaying) {
      v.pause();
      setIsPlaying(false);
    } else {
      // 範囲外にいる場合は強制的に開始位置へ移動して再生
      if (
        start !== null &&
        end !== null &&
        (v.currentTime >= end || v.currentTime < start - 0.5)
      ) {
        v.currentTime = start;
      }
      void v.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  return (
    <div
      className="relative w-full rounded-2xl overflow-hidden bg-black border border-slate-800 shadow-xl group cursor-pointer select-none"
      onClick={togglePlay}
    >
      <video
        ref={videoRef}
        src={src}
        playsInline
        preload="auto"
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={checkAndLoop}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        className="w-full aspect-video object-contain pointer-events-none"
      />

      {!isPlaying && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-cyan-500/80 text-black flex items-center justify-center text-xl font-black shadow-lg shadow-cyan-500/50 animate-pulse">
            ▶
          </div>
        </div>
      )}

      <div className="absolute top-2 right-2 bg-slate-950/80 backdrop-blur-md text-cyan-300 font-mono text-[9px] font-bold px-2 py-0.5 rounded border border-slate-800">
        ⚡ {playbackSpeed.toFixed(1)}x
      </div>
    </div>
  );
}