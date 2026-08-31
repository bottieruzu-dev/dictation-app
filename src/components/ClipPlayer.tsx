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

  const bufferedStart = segmentStart !== null ? Math.max(0, segmentStart - 0.3) : null;
  const bufferedEnd = segmentEnd !== null ? segmentEnd + 0.1 : null;

  const rangeRef = useRef<{ start: number | null; end: number | null }>({
    start: bufferedStart,
    end: bufferedEnd,
  });

  useEffect(() => {
    rangeRef.current = { start: bufferedStart, end: bufferedEnd };
    console.log("📍 [Range Update]", { bufferedStart, bufferedEnd });
  }, [bufferedStart, bufferedEnd]);

  const seekToSegmentStart = (reason: string) => {
    const v = videoRef.current;
    const start = rangeRef.current.start;
    if (v && start !== null) {
      console.log(`🚨 【SEEK TRIGGERED】理由: ${reason} | 現在地: ${v.currentTime.toFixed(3)}s ➔ 移動先: ${start.toFixed(3)}s`);
      isCoolingDownRef.current = true;
      v.currentTime = start;
      setTimeout(() => {
        isCoolingDownRef.current = false;
      }, 500);
    }
  };

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed, src]);

  useEffect(() => {
    if (bufferedStart !== null && videoRef.current) {
      seekToSegmentStart("segmentStart変更");
      void videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  }, [segmentStart]);

  useEffect(() => {
    if (seekToTime !== undefined && seekToTime !== null && videoRef.current) {
      isCoolingDownRef.current = true;
      videoRef.current.currentTime = Math.max(0, seekToTime - 0.3);
      void videoRef.current.play().catch(() => {});
      setIsPlaying(true);
      setTimeout(() => {
        isCoolingDownRef.current = false;
      }, 500);
    }
  }, [seekToTime]);

  const handleLoadedMetadata = () => {
    console.log("🎬 [Loaded Metadata]", videoRef.current?.duration);
    seekToSegmentStart("メタデータ読み込み完了");
  };

  const checkAndLoop = () => {
    const v = videoRef.current;
    const { start, end } = rangeRef.current;

    if (v && !v.paused && start !== null && end !== null) {
      if (onTimeUpdate) onTimeUpdate(v.currentTime);

      if (!isCoolingDownRef.current) {
        if (v.currentTime >= end) {
          seekToSegmentStart("終了時間超過(124.3s超え)");
        } else if (v.currentTime < start - 0.5) {
          seekToSegmentStart(`開始位置より手前(現在地:${v.currentTime.toFixed(2)}s < 開始:${(start-0.5).toFixed(2)}s)`);
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
      if (
        start !== null &&
        end !== null &&
        (v.currentTime >= end || v.currentTime < start - 0.5)
      ) {
        seekToSegmentStart("再生ボタンタップ時の範囲外検出");
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