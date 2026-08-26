"use client";

import { useEffect, useRef, useState } from "react";

interface ClipPlayerProps {
  src: string;
}

export default function ClipPlayer({ src }: ClipPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [isLooping, setIsLooping] = useState(false);
  const [loopGap, setLoopGap] = useState<number | null>(null);
  const [seekableOk, setSeekableOk] = useState(false);

  // ドラッグ状態
  const isDraggingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  const loopStartRef = useRef(0);
  const loopEndRef = useRef(3);
  const isLoopingRef = useRef(isLooping);
  const lastLoopTimeRef = useRef<number | null>(null);

  isLoopingRef.current = isLooping;

  // 再生時間の監視 & ループ判定 (rAF)
  useEffect(() => {
    let animId: number;
    const checkLoop = () => {
      const v = videoRef.current;
      // 指でシークバーを触っていない時だけ、動画の時間をUIに反映
      if (v && !isDraggingRef.current) {
        setCurrentTime(v.currentTime);

        // ループ判定
        if (isLoopingRef.current && v.currentTime >= loopEndRef.current) {
          const now = performance.now();
          if (lastLoopTimeRef.current !== null) {
            const expectedDuration = (loopEndRef.current - loopStartRef.current) * 1000;
            const pureGap = Math.max(0, Math.round(now - lastLoopTimeRef.current - expectedDuration));
            setLoopGap(pureGap);
          }
          v.currentTime = loopStartRef.current;
          lastLoopTimeRef.current = performance.now();
        }
      }
      animId = requestAnimationFrame(checkLoop);
    };
    animId = requestAnimationFrame(checkLoop);
    return () => cancelAnimationFrame(animId);
  }, []);

  // 動画読み込み完了時
  const handleLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration);
    setSeekableOk(v.seekable.length > 0);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (isPlaying) {
      v.pause();
      setIsPlaying(false);
    } else {
      void v.play();
      setIsPlaying(true);
    }
  };

  const changeSpeed = (rate: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = rate;
    setPlaybackRate(rate);
  };

  // 1. スワイプ中：UIの見た目だけを変える（動画へは一切命令しない）
  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    isDraggingRef.current = true;
    setIsDragging(true);
    setCurrentTime(parseFloat(e.target.value));
  };

  // 2. 指を離した時：1回だけ動画へ位置を伝達する
  const handleSeekEnd = (e: React.SyntheticEvent<HTMLInputElement>) => {
    const newTime = parseFloat((e.currentTarget as HTMLInputElement).value);
    const v = videoRef.current;
    if (v) {
      v.currentTime = newTime; // ここで初めて動画へ1回だけ命令
    }
    // Safariの内部処理完了を待つため、200ms後にUIロックを解除
    setTimeout(() => {
      isDraggingRef.current = false;
      setIsDragging(false);
    }, 200);
  };

  const toggleLoop = () => {
    const newLoop = !isLooping;
    setIsLooping(newLoop);
    if (newLoop && videoRef.current) {
      loopStartRef.current = videoRef.current.currentTime;
      loopEndRef.current = Math.min(
        videoRef.current.currentTime + 3,
        videoRef.current.duration || 3
      );
      lastLoopTimeRef.current = performance.now();
    }
  };

  return (
    <div className="max-w-md mx-auto p-4 bg-white rounded-xl shadow-md space-y-4 border border-gray-200">
      <video
        ref={videoRef}
        src={src}
        playsInline
        preload="auto"
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        className="w-full rounded-lg bg-black aspect-video object-contain"
      />

      {/* シークバー */}
      <div className="space-y-1">
        <input
          type="range"
          min={0}
          max={duration || 100}
          step={0.01}
          value={currentTime}
          onChange={handleSeekChange}
          onPointerUp={handleSeekEnd}
          onTouchEnd={handleSeekEnd}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
        />
        <div className="flex justify-between text-xs text-gray-500 font-mono">
          <span>{currentTime.toFixed(2)}s</span>
          <span>{duration.toFixed(2)}s</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          onClick={togglePlay}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold text-sm"
        >
          {isPlaying ? "PAUSE" : "PLAY"}
        </button>

        <div className="flex gap-1">
          {[0.6, 1.0, 1.2].map((rate) => (
            <button
              key={rate}
              onClick={() => changeSpeed(rate)}
              className={`px-2 py-1 rounded text-xs font-bold ${
                playbackRate === rate
                  ? "bg-gray-800 text-white"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              {rate}x
            </button>
          ))}
        </div>

        <button
          onClick={toggleLoop}
          className={`px-3 py-2 rounded-lg font-bold text-xs ${
            isLooping
              ? "bg-green-600 text-white"
              : "bg-gray-200 text-gray-700"
          }`}
        >
          {isLooping ? "LOOP ON" : "LOOP OFF"}
        </button>
      </div>

      {/* デバッグ情報 */}
      <div className="p-3 bg-gray-50 rounded-lg text-xs space-y-1 font-mono text-gray-700">
        <div>
          seekable (Range対応):{" "}
          <b className={seekableOk ? "text-green-600" : "text-red-600"}>
            {seekableOk ? "OK" : "NG"}
          </b>
        </div>
        <div>
          loop gap (v1.4):{" "}
          <b>{loopGap !== null ? `${loopGap} ms` : "ー"}</b>
        </div>
      </div>
    </div>
  );
}