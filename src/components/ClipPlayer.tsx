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
    console.log("📍 [Range Updated]", { bufferedStart, bufferedEnd, rawStart: segmentStart, rawEnd: segmentEnd });
  }, [bufferedStart, bufferedEnd, segmentStart, segmentEnd]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed, src]);

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

  const checkAndLoop = () => {
    const v = videoRef.current;
    const { start, end } = rangeRef.current;

    if (v && !v.paused) {
      if (onTimeUpdate) onTimeUpdate(v.currentTime);

      // 🔍 デバッグ用ログ（再生中に定期出力）
      if (Math.floor(v.currentTime * 10) % 5 === 0) {
        console.log(`⏱️ current: ${v.currentTime.toFixed(2)}s | targetEnd: ${end}s | cooldown: ${isCoolingDownRef.current}`);
      }

      if (start !== null && end !== null && !isCoolingDownRef.current && v.currentTime >= end) {
        console.log("🔄 【LOOP TRIGGERED】 巻き戻しを実行します");
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
        (v.currentTime >= end || v.currentTime < start - 1.0)
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