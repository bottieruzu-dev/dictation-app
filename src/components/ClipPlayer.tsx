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
  const isLoopingCoolingDown = useRef(false);

  // 再生速度の自動適用
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed, src]);

  // セグメント切り替え時に先頭へ移動して再生開始
  useEffect(() => {
    if (segmentStart !== null && videoRef.current) {
      videoRef.current.currentTime = segmentStart;
      void videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  }, [segmentStart]);

  // 特定時間のシーク対応
  useEffect(() => {
    if (seekToTime !== undefined && seekToTime !== null && videoRef.current) {
      videoRef.current.currentTime = seekToTime;
      void videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  }, [seekToTime]);

  // iOS/スマホ対応：timeupdate による安全な1文ループ制御
  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;

    if (onTimeUpdate) onTimeUpdate(v.currentTime);

    if (
      segmentStart !== null &&
      segmentEnd !== null &&
      segmentEnd > segmentStart &&
      !isLoopingCoolingDown.current
    ) {
      if (v.currentTime >= segmentEnd - 0.05) {
        isLoopingCoolingDown.current = true;
        v.currentTime = segmentStart;
        if (v.paused) {
          void v.play().catch(() => {});
        }
        setTimeout(() => {
          isLoopingCoolingDown.current = false;
        }, 300);
      }
    }
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
        onTimeUpdate={handleTimeUpdate}
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