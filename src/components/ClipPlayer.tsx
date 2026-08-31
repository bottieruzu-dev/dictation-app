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

  // 再生速度の自動適用
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed, src]);

  // セグメント切り替え時に先頭へ移動して再生開始
  useEffect(() => {
    if (bufferedStart !== null && videoRef.current) {
      isCoolingDownRef.current = true;
      videoRef.current.currentTime = bufferedStart;
      void videoRef.current.play().catch(() => {});
      setIsPlaying(true);
      setTimeout(() => {
        isCoolingDownRef.current = false;
      }, 300);
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

  // 厳密なループ監視 (終了時間超えのみ巻き戻し)
  useEffect(() => {
    let animId: number;

    const checkLoop = () => {
      const v = videoRef.current;
      if (v && !v.paused && bufferedStart !== null && bufferedEnd !== null) {
        if (onTimeUpdate) onTimeUpdate(v.currentTime);

        // クールダウン中でなく、終了時間を超えた場合のみ巻き戻す
        if (!isCoolingDownRef.current && v.currentTime >= bufferedEnd) {
          isCoolingDownRef.current = true;
          v.currentTime = bufferedStart;
          if (v.paused) {
            void v.play().catch(() => {});
          }
          setTimeout(() => {
            isCoolingDownRef.current = false;
          }, 300);
        }
      }
      animId = requestAnimationFrame(checkLoop);
    };

    animId = requestAnimationFrame(checkLoop);
    return () => cancelAnimationFrame(animId);
  }, [bufferedStart, bufferedEnd, onTimeUpdate]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (isPlaying) {
      v.pause();
      setIsPlaying(false);
    } else {
      // 指定範囲外にいる場合は開始位置へ移動してから再生
      if (
        bufferedStart !== null &&
        bufferedEnd !== null &&
        (v.currentTime >= bufferedEnd || v.currentTime < bufferedStart - 1.0)
      ) {
        v.currentTime = bufferedStart;
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