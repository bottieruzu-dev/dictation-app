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
  const isSeekingRef = useRef(false);

  // 文頭の切れ防止バッファ (0.3秒前から再生開始)
  const bufferedStart = segmentStart !== null ? Math.max(0, segmentStart - 0.3) : null;
  const bufferedEnd = segmentEnd !== null ? segmentEnd + 0.1 : null;

  // 再生速度の自動適用
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed, src]);

  // セグメント切り替え時に先頭へ移動して再生開始
  useEffect(() => {
    if (bufferedStart !== null && videoRef.current) {
      isSeekingRef.current = true;
      videoRef.current.currentTime = bufferedStart;
      void videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  }, [segmentStart]);

  // 特定時間のシーク対応
  useEffect(() => {
    if (seekToTime !== undefined && seekToTime !== null && videoRef.current) {
      isSeekingRef.current = true;
      videoRef.current.currentTime = Math.max(0, seekToTime - 0.3);
      void videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  }, [seekToTime]);

  // 高精度 ＆ スマホ対応の厳密区間ループ監視
  useEffect(() => {
    let animId: number;

    const checkLoop = () => {
      const v = videoRef.current;
      if (v && !v.paused && bufferedStart !== null && bufferedEnd !== null) {
        if (onTimeUpdate) onTimeUpdate(v.currentTime);

        // シーク中（巻き戻し中）でなければループ判定を行う
        if (!isSeekingRef.current) {
          // 区間終了を超えたか、区間開始より前に大きく外れた場合に巻き戻す
          if (v.currentTime >= bufferedEnd || v.currentTime < bufferedStart - 0.5) {
            isSeekingRef.current = true;
            v.currentTime = bufferedStart;
          }
        }
      }
      animId = requestAnimationFrame(checkLoop);
    };

    animId = requestAnimationFrame(checkLoop);
    return () => cancelAnimationFrame(animId);
  }, [bufferedStart, bufferedEnd, onTimeUpdate]);

  const handleSeeking = () => {
    isSeekingRef.current = true;
  };

  const handleSeeked = () => {
    // シーク完了後にフラグ解除
    setTimeout(() => {
      isSeekingRef.current = false;
    }, 50);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (isPlaying) {
      v.pause();
      setIsPlaying(false);
    } else {
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
        onSeeking={handleSeeking}
        onSeeked={handleSeeked}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        className="w-full aspect-video object-contain pointer-events-none"
      />

      {/* 動画中央再生/一時停止アイコン */}
      {!isPlaying && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-cyan-500/80 text-black flex items-center justify-center text-xl font-black shadow-lg shadow-cyan-500/50 animate-pulse">
            ▶
          </div>
        </div>
      )}

      {/* 現在の再生速度バッジ */}
      <div className="absolute top-2 right-2 bg-slate-950/80 backdrop-blur-md text-cyan-300 font-mono text-[9px] font-bold px-2 py-0.5 rounded border border-slate-800">
        ⚡ {playbackSpeed.toFixed(1)}x
      </div>
    </div>
  );
}