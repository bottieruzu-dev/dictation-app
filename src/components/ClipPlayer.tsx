"use client";

import { useEffect, useRef, useState } from "react";

interface ClipPlayerProps {
  src: string;
}

export default function ClipPlayer({ src }: ClipPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);

  // 画面にログを記録する関数
  const addLog = (msg: string) => {
    const time = new Date().toISOString().split("T")[1].slice(3, -1);
    setLogs((prev) => [`[${time}] ${msg}`, ...prev].slice(0, 30)); // 最新30件を降順表示
  };

  // 動画のイベントを監視
  const logEvent = (eventName: string) => {
    const v = videoRef.current;
    const rs = v ? v.readyState : "null";
    addLog(`event: ${eventName} (readyState: ${rs})`);
  };

  useEffect(() => {
    let animId: number;
    const checkTime = () => {
      if (videoRef.current) {
        setCurrentTime(videoRef.current.currentTime);
      }
      animId = requestAnimationFrame(checkTime);
    };
    animId = requestAnimationFrame(checkTime);
    return () => cancelAnimationFrame(animId);
  }, []);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    const v = videoRef.current;
    if (!v) return;

    try {
      addLog(`--- シーク操作開始 ---`);
      addLog(`変更前: ${v.currentTime.toFixed(2)} -> 変更後: ${newTime.toFixed(2)}`);
      addLog(`現在の readyState: ${v.readyState}`);
      
      v.currentTime = newTime;
      
      addLog(`v.currentTime への代入完了`);
    } catch (err: any) {
      addLog(`🚨エラー発生: ${err.name} / ${err.message}`);
    }
  };

  return (
    <div className="max-w-md mx-auto p-4 bg-white rounded-xl shadow-md space-y-4 border border-gray-200">
      <video
        ref={videoRef}
        src={src}
        playsInline
        preload="auto"
        onLoadStart={() => logEvent("loadstart")}
        onLoadedMetadata={() => {
          logEvent("loadedmetadata");
          if (videoRef.current) setDuration(videoRef.current.duration);
        }}
        onCanPlay={() => logEvent("canplay")}
        onPlay={() => logEvent("play")}
        onPlaying={() => logEvent("playing")}
        onPause={() => logEvent("pause")}
        onWaiting={() => logEvent("waiting")}
        onSeeking={() => logEvent("seeking")}
        onSeeked={() => logEvent("seeked")}
        onError={(e) => addLog(`🚨動画エラー: ${videoRef.current?.error?.message}`)}
        className="w-full rounded-lg bg-black aspect-video object-contain"
      />

      <div className="space-y-1">
        <input
          type="range"
          min={0}
          max={duration || 100}
          step={0.01}
          value={currentTime}
          onChange={handleSeek}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
        />
        <div className="flex justify-between text-xs text-gray-500 font-mono">
          <span>{currentTime.toFixed(2)}s</span>
          <span>{duration.toFixed(2)}s</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => {
            addLog("PLAYボタン押下");
            videoRef.current?.play().catch((e) => addLog(`🚨Play拒否: ${e.message}`));
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold text-sm"
        >
          PLAY
        </button>
        <button
          onClick={() => {
            addLog("PAUSEボタン押下");
            videoRef.current?.pause();
          }}
          className="px-4 py-2 bg-gray-600 text-white rounded-lg font-bold text-sm"
        >
          PAUSE
        </button>
      </div>

      {/* デバッグログ表示エリア */}
      <div className="bg-gray-900 text-green-400 text-[10px] font-mono p-2 rounded h-64 overflow-y-auto whitespace-pre-wrap">
        <div>【内部動作ログ (最新が上)】</div>
        {logs.map((log, i) => (
          <div key={i}>{log}</div>
        ))}
      </div>
    </div>
  );
}