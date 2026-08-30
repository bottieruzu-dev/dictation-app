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

  // 再生速度の自動適用
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed, src]);

  // 特定時間のシーク対応
  useEffect(() => {
    if (seekToTime !== undefined && seekToTime !== null && videoRef.current) {
      videoRef.current.currentTime = seekToTime;
      void videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  }, [seekToTime]);

  // 1文厳密自動ループ再生制御
  useEffect(() => {
    let animId: number;

    const checkSegmentLoop = () => {
      const v = videoRef.current;
      if (v) {
        if (onTimeUpdate) onTimeUpdate(v.currentTime);

        if (segmentStart !== null && segmentEnd !== null && segmentEnd > segmentStart) {
          if (v.currentTime >= segmentEnd || v.currentTime < segmentStart - 0.2) {
            v.currentTime = segmentStart;
            if (v.paused) void v.play().catch(() => {});
          }
        }
      }
      animId = requestAnimationFrame(checkSegmentLoop);
    };

    animId = requestAnimationFrame(checkSegmentLoop);
    return () => cancelAnimationFrame(animId);
  }, [segmentStart, segmentEnd, onTimeUpdate]);

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
    <div className="relative w-full rounded-2xl overflow-hidden bg-black border border-slate-800 shadow-xl group cursor-pointer" onClick={togglePlay}>
      <video
        ref={videoRef}
        src={src}
        playsInline
        preload="auto"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        className="w-full aspect-video object-contain pointer-events-none"
      />

      {/* 動画中央再生/一時停止オーバレイ */}
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