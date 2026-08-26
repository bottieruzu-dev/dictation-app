"use client";

import { useEffect, useRef, useState } from "react";

export default function ClipPlayer({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  // ログを追加する関数（最新が一番上に来るように40件保持）
  const addLog = (msg: string) => {
    const time = new Date().toISOString().split("T")[1].slice(3, -1);
    setLogs((prev) => [`[${time}] ${msg}`, ...prev].slice(0, 40));
  };

  // シークバーから指を離した時の処理
  const handlePointerUp = (e: React.SyntheticEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v) return;
    const targetTime = parseFloat((e.currentTarget as HTMLInputElement).value);
    
    addLog(`--- 指を離した ---`);
    addLog(`1. 目標時間: ${targetTime.toFixed(2)}`);
    addLog(`2. 代入前の readyState: ${v.readyState}`);
    addLog(`3. 代入前の currentTime: ${v.currentTime.toFixed(2)}`);
    
    try {
      v.currentTime = targetTime;
      addLog(`4. 代入直後の currentTime: ${v.currentTime.toFixed(2)}`);
    } catch (err: any) {
      addLog(`🚨 代入エラー: ${err.message}`);
    }

    // 200ミリ秒後にSafariが値をどう処理したか確認
    setTimeout(() => {
      if (videoRef.current) {
        addLog(`5. 代入200ms後の currentTime: ${videoRef.current.currentTime.toFixed(2)}`);
      }
    }, 200);
  };

  // PLAYボタンを押した時の処理
  const handlePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    addLog(`--- PLAY押下 ---`);
    addLog(`6. Play直前の currentTime: ${v.currentTime.toFixed(2)}`);
    
    v.play().then(() => {
      addLog(`7. Play成功時の currentTime: ${v.currentTime.toFixed(2)}`);
    }).catch((err) => {
      addLog(`🚨 Play失敗: ${err.message}`);
    });
  };

  // 常に時間を監視し、Safariが勝手に0秒にリセットした瞬間を捕まえる
  useEffect(() => {
    let animId: number;
    let lastTime = -1;
    const checkTime = () => {
      const v = videoRef.current;
      if (v) {
         setCurrentTime(v.currentTime);
         // 時間が突然1秒以上ワープした（リセットされた）場合ログに出す
         if (lastTime !== -1 && Math.abs(v.currentTime - lastTime) > 1) {
             addLog(`⚠️ ワープ検知: ${lastTime.toFixed(2)}秒 -> ${v.currentTime.toFixed(2)}秒`);
         }
         lastTime = v.currentTime;
      }
      animId = requestAnimationFrame(checkTime);
    };
    animId = requestAnimationFrame(checkTime);
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <div className="max-w-md mx-auto p-4 bg-white rounded-xl shadow-md space-y-4 border border-gray-200">
      <video
        ref={videoRef}
        src={src}
        playsInline
        preload="auto"
        onLoadedMetadata={() => {
          addLog("● loadedmetadata発火");
          if (videoRef.current) setDuration(videoRef.current.duration);
        }}
        onSeeking={() => addLog(`● seeking発火 (現在地: ${videoRef.current?.currentTime.toFixed(2)})`)}
        onSeeked={() => addLog(`● seeked発火 (現在地: ${videoRef.current?.currentTime.toFixed(2)})`)}
        onPlay={() => addLog(`● playイベント発火 (現在地: ${videoRef.current?.currentTime.toFixed(2)})`)}
        className="w-full rounded-lg bg-black aspect-video object-contain"
      />

      <div className="space-y-1">
        <input
          type="range"
          min={0}
          max={duration || 100}
          step={0.01}
          value={currentTime}
          onChange={(e) => setCurrentTime(parseFloat(e.target.value))}
          onPointerUp={handlePointerUp}
          onTouchEnd={handlePointerUp}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
        />
        <div className="flex justify-between text-xs text-gray-500 font-mono">
          <span>{currentTime.toFixed(2)}s</span>
          <span>{duration.toFixed(2)}s</span>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={handlePlay} className="px-4 py-2 bg-blue-600 text-white rounded font-bold text-sm">PLAY</button>
        <button onClick={() => videoRef.current?.pause()} className="px-4 py-2 bg-gray-600 text-white rounded font-bold text-sm">PAUSE</button>
      </div>

      <div className="bg-gray-900 text-green-400 text-[10px] font-mono p-2 rounded h-64 overflow-y-auto whitespace-pre-wrap">
        <div>【調査ログ (最新が上)】</div>
        {logs.map((log, i) => (
          <div key={i}>{log}</div>
        ))}
      </div>
    </div>
  );
}