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
  const [isTimeOutOfBounds, setIsTimeOutOfBounds] = useState(false);
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

  // 安全なシーク処理（動画の総再生時間を超えないようガード）
  const safeSeek = (targetTime: number) => {
    const v = videoRef.current;
    if (!v) return;

    const duration = v.duration;
    // メタデータ読み込み前、または動画長さを超えている場合の安全ガード
    if (isNaN(duration) || duration <= 0) return;

    if (targetTime >= duration) {
      setIsTimeOutOfBounds(true);
      console.warn(`⚠️ [ClipPlayer] 指定時間(${targetTime.toFixed(1)}s)が動画長さ(${duration.toFixed(1)}s)を超えています。`);
      return;
    }

    setIsTimeOutOfBounds(false);
    isCoolingDownRef.current = true;
    v.currentTime = targetTime;
    setTimeout(() => {
      isCoolingDownRef.current = false;
    }, 500);
  };

  // 再生速度の自動適用
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed, src]);

  // セグメント切り替え時のシーク
  useEffect(() => {
    if (bufferedStart !== null && videoRef.current) {
      safeSeek(bufferedStart);
      void videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  }, [segmentStart]);

  // 特定時間のシーク対応
  useEffect(() => {
    if (seekToTime !== undefined && seekToTime !== null && videoRef.current) {
      safeSeek(Math.max(0, seekToTime - 0.3));
      void videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  }, [seekToTime]);

  const handleLoadedMetadata = () => {
    if (bufferedStart !== null) {
      safeSeek(bufferedStart);
    }
  };

  // 厳密なループチェック (安全ガード付き)
  const checkAndLoop = () => {
    const v = videoRef.current;
    const { start, end } = rangeRef.current;

    if (v && !v.paused && start !== null && end !== null && !isCoolingDownRef.current) {
      if (onTimeUpdate) onTimeUpdate(v.currentTime);

      const duration = v.duration;
      // 動画の長さを超えているタイムスタンプの場合はループ判定を行わない
      if (!isNaN(duration) && start >= duration) {
        return;
      }

      // 終了時間を超えたら巻き戻す
      if (v.currentTime >= end) {
        safeSeek(start);
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
        v.duration &&
        start < v.duration &&
        (v.currentTime >= end || v.currentTime < start - 0.5)
      ) {
        safeSeek(start);
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

      {/* タイムスタンプ不整合警告表示 */}
      {isTimeOutOfBounds && (
        <div className="absolute bottom-2 left-2 bg-red-950/90 border border-red-500 text-red-200 text-[10px] font-mono px-2 py-1 rounded shadow">
          ⚠️ 字幕時間({segmentStart?.toFixed(1)}s)が動画長さ({videoRef.current?.duration.toFixed(1)}s)を超えています
        </div>
      )}

      <div className="absolute top-2 right-2 bg-slate-950/80 backdrop-blur-md text-cyan-300 font-mono text-[9px] font-bold px-2 py-0.5 rounded border border-slate-800">
        ⚡ {playbackSpeed.toFixed(1)}x
      </div>
    </div>
  );
}