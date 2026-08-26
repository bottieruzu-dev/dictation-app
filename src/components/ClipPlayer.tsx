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
  
  // ドラッグ状態をRefでも管理し、常に最新の判定を行う
  const isDraggingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  const loopStartRef = useRef(0);
  const loopEndRef = useRef(3); // 3秒ループ
  const isLoopingRef = useRef(isLooping);
  const isSeekingRef = useRef(false);
  const seekStartTimeRef = useRef<number | null>(null);

  isLoopingRef.current = isLooping;

  const setDragging = (val: boolean) => {
    isDraggingRef.current = val;
    setIsDragging(val);
  };

  // 再生時間の監視 & ループ判定 (rAF)
  useEffect(() => {
    let animId: number;

    const checkLoop = () => {
      const v = videoRef.current;
      // ドラッグ中やシーク中は時間を上書きしない
      if (v && !isSeekingRef.current && !isDraggingRef.current) {
        setCurrentTime(v.currentTime);

        // ループ判定
        if (isLoopingRef.current && v.currentTime >= loopEndRef.current) {
          isSeekingRef.current = true;
          seekStartTimeRef.current = performance.now();
          v.currentTime = loopStartRef.current;
        }
      }
      animId = requestAnimationFrame(checkLoop);
    };

    animId = requestAnimationFrame(checkLoop);
    return () => cancelAnimationFrame(animId);
  }, []);

  // シーク完了時の処理
  const handleSeeked = () => {
    if (seekStartTimeRef.current !== null) {
      const gap = Math.round(performance.now() - seekStartTimeRef.current);
      setLoopGap(gap);
      seekStartTimeRef.current = null;
    }
    isSeekingRef.current = false;
  };

  // 動画読み込み完了時の処理
  const handleLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration);
    setSeekableOk(v.seekable.length > 0);
  };

  // 再生/一時停止
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

  // 速度変更
  const changeSpeed = (rate: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = rate;
    setPlaybackRate(rate);
  };

  // シークバー操作中（表示だけ更新）
  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentTime(parseFloat(e.target.value));
  };

  // シークバー操作完了時（指を離した瞬間に確実に動画を更新）
  const handlePointerUp = (e: React.SyntheticEvent<HTMLInputElement>) => {
    setDragging(false);
    const newTime = parseFloat((e.currentTarget as HTMLInputElement).value);
    const v = videoRef.current;
    // 動画の準備ができている場合のみ時間を更新する
    if (v && v.readyState >= 1) {
      v.currentTime = newTime;
    }
  };

  // ループ切り替え
  const toggleLoop = () => {
    const newLoop = !isLooping;
    setIsLooping(newLoop);
    if (newLoop && videoRef.current) {
      loopStartRef.current = videoRef.current.currentTime;
      loopEndRef.current = Math.min(
        videoRef.current.currentTime + 3,
        videoRef.current.duration || 3
      );
    }
  };

  return (
    <div className="max-w-md mx-auto p-4 bg-white rounded-xl shadow-md space-y-4 border border-gray-200">
      <video
        ref={videoRef}
        src={src}
        playsInline
        onLoadedMetadata={handleLoadedMetadata}
        onSeeked={handleSeeked}
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
          onPointerDown={() => setDragging(true)}
          onTouchStart={() => setDragging(true)}
          onInput={handleInput}
          onPointerUp={handlePointerUp}
          onTouchEnd={handlePointerUp}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
        />
        <div className="flex justify-between text-xs text-gray-500 font-mono">
          <span>{currentTime.toFixed(2)}s</span>
          <span>{duration.toFixed(2)}s</span>
        </div>
      </div>

      {/* コントロールボタン */}
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
          loop gap (v1.2):{" "}
          <b>{loopGap !== null ? `${loopGap} ms` : "ー"}</b>
        </div>
      </div>
    </div>
  );
}