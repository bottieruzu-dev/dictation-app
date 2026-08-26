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
  const [seekableOk, setSeekableOk] = useState(false);
  const [logs, setLogs] = useState<string[]>([]); // 診断ログ用

  const isDraggingRef = useRef(false);
  const pendingSeekTimeRef = useRef<number | null>(null);

  const loopStartRef = useRef(0);
  const loopEndRef = useRef(3);
  const isLoopingRef = useRef(isLooping);
  
  // 計測用タイマー
  const lastLoopTimeRef = useRef<number | null>(null);
  const seekStartTimeRef = useRef<number | null>(null);

  isLoopingRef.current = isLooping;

  const addLog = (msg: string) => {
    const time = new Date().toISOString().split("T")[1].slice(3, -1);
    setLogs((prev) => [`[${time}] ${msg}`, ...prev].slice(0, 40));
  };

  useEffect(() => {
    let animId: number;
    const checkLoop = () => {
      const v = videoRef.current;
      if (v && !isDraggingRef.current) {
        if (pendingSeekTimeRef.current === null) {
          setCurrentTime(v.currentTime);
        }

        // ループ終端に到達した瞬間
        if (isLoopingRef.current && v.currentTime >= loopEndRef.current) {
          const now = performance.now();
          
          if (lastLoopTimeRef.current !== null) {
            const realElapsed = now - lastLoopTimeRef.current;
            addLog(`🔄 ループ発動 (現在時間: ${v.currentTime.toFixed(3)}s)`);
            addLog(` ├ 前回の開始から実時間で [${Math.round(realElapsed)} ms] 経過`);
            addLog(` ├ 現在の再生速度: ${v.playbackRate}x`);
          }

          // Safariに巻き戻しを命令し、その時間を記録
          seekStartTimeRef.current = performance.now();
          v.currentTime = loopStartRef.current;
          lastLoopTimeRef.current = performance.now();
        }
      }
      animId = requestAnimationFrame(checkLoop);
    };
    animId = requestAnimationFrame(checkLoop);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Safariが巻き戻し（シーク）を物理的に完了した瞬間
  const handleSeeked = () => {
    if (seekStartTimeRef.current !== null) {
      const hardwareDelay = performance.now() - seekStartTimeRef.current;
      addLog(` ✅ 巻き戻し完了！ Safariの処理時間(遅延): [${Math.round(hardwareDelay)} ms]`);
      addLog(`-----------------------------------`);
      seekStartTimeRef.current = null;
    }
  };

  const handleLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration);
    setSeekableOk(v.seekable.length > 0);
  };

  const handlePlayEvent = () => {
    setIsPlaying(true);
    const v = videoRef.current;
    if (v && pendingSeekTimeRef.current !== null) {
      v.currentTime = pendingSeekTimeRef.current;
      pendingSeekTimeRef.current = null;
    }
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (isPlaying) {
      v.pause();
      setIsPlaying(false);
    } else {
      void v.play();
    }
  };

  const changeSpeed = (rate: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = rate;
    setPlaybackRate(rate);
  };

  const handlePointerDown = () => {
    isDraggingRef.current = true;
  };

  const handleSeekInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentTime(parseFloat(e.target.value));
  };

  const handleSeekEnd = (e: React.SyntheticEvent<HTMLInputElement>) => {
    const newTime = parseFloat((e.currentTarget as HTMLInputElement).value);
    const v = videoRef.current;
    if (v) {
      if (v.readyState <= 1 && !isPlaying) {
        pendingSeekTimeRef.current = newTime;
        setCurrentTime(newTime);
      } else {
        v.currentTime = newTime;
      }
    }
    setTimeout(() => {
      isDraggingRef.current = false;
    }, 100);
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
      addLog(`▶️ ループON (開始: ${loopStartRef.current.toFixed(2)}s, 終了: ${loopEndRef.current.toFixed(2)}s)`);
    } else {
      addLog(`⏹️ ループOFF`);
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
        onSeeked={handleSeeked}
        onPlay={handlePlayEvent}
        onPause={() => setIsPlaying(false)}
        className="w-full rounded-lg bg-black aspect-video object-contain"
      />

      <div className="space-y-1">
        <input
          type="range"
          min={0}
          max={duration || 100}
          step={0.01}
          value={currentTime}
          onPointerDown={handlePointerDown}
          onTouchStart={handlePointerDown}
          onChange={handleSeekInput}
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
        <button onClick={togglePlay} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold text-sm">
          {isPlaying ? "PAUSE" : "PLAY"}
        </button>

        <div className="flex gap-1">
          {[0.6, 1.0, 1.2].map((rate) => (
            <button
              key={rate}
              onClick={() => changeSpeed(rate)}
              className={`px-2 py-1 rounded text-xs font-bold ${
                playbackRate === rate ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-700"
              }`}
            >
              {rate}x
            </button>
          ))}
        </div>

        <button
          onClick={toggleLoop}
          className={`px-3 py-2 rounded-lg font-bold text-xs ${
            isLooping ? "bg-green-600 text-white" : "bg-gray-200 text-gray-700"
          }`}
        >
          {isLooping ? "LOOP ON" : "LOOP OFF"}
        </button>
      </div>

      {/* 診断ログ表示エリア */}
      <div className="bg-gray-900 text-green-400 text-[10px] font-mono p-2 rounded h-64 overflow-y-auto whitespace-pre-wrap">
        <div>【ループ診断ログ (v1.6-diag)】</div>
        {logs.map((log, i) => (
          <div key={i}>{log}</div>
        ))}
      </div>
    </div>
  );
}