"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  src: string;
};

const SPEEDS = [0.5, 0.6, 0.75, 0.85, 1.0];

export default function ClipPlayer({ src }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const rangeRef = useRef<{ start: number; end: number } | null>(null);
  const armedRef = useRef(true);
  const loopStartTsRef = useRef<number | null>(null);

  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [speed, setSpeed] = useState(0.6);
  const [loopOn, setLoopOn] = useState(false);
  const [range, setRange] = useState({ start: 0, end: 0 });
  const [gapMs, setGapMs] = useState<number | null>(null);
  const [seekable, setSeekable] = useState<boolean | null>(null);

  const onLoadedMetadata = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration);
    setRange({ start: 0, end: Math.min(5, v.duration) });
    setSeekable(v.seekable.length > 0 && v.seekable.end(0) > 0);

    v.playsInline = true;
    // @ts-expect-error prefix
    v.webkitPreservesPitch = true;
    v.preservesPitch = true;
    v.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    rangeRef.current = loopOn ? range : null;
  }, [loopOn, range]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || typeof v.requestVideoFrameCallback !== "function") return;

    let handle = 0;
    const tick = () => {
      const r = rangeRef.current;
      setCurrent(v.currentTime);

      if (r && armedRef.current && v.currentTime >= r.end - 0.02) {
        armedRef.current = false;
        loopStartTsRef.current = performance.now();
        v.currentTime = r.start;
        v.addEventListener(
          "seeked",
          () => {
            if (loopStartTsRef.current !== null) {
              setGapMs(
                Math.round(performance.now() - loopStartTsRef.current),
              );
              loopStartTsRef.current = null;
            }
            armedRef.current = true;
          },
          { once: true },
        );
      }
      handle = v.requestVideoFrameCallback(tick);
    };

    handle = v.requestVideoFrameCallback(tick);
    return () => v.cancelVideoFrameCallback(handle);
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (v) v.playbackRate = speed;
  }, [speed]);

  const seekTo = (t: number) => {
    const v = videoRef.current;
    if (v) v.currentTime = Math.max(0, Math.min(t, duration));
  };

  return (
    <div className="w-full max-w-xl mx-auto space-y-3 p-4">
      <video
        ref={videoRef}
        src={src}
        controls
        playsInline
        preload="metadata"
        onLoadedMetadata={onLoadedMetadata}
        className="w-full rounded-lg bg-black aspect-video"
      />

      <div className="space-y-1">
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.01}
          value={current}
          onChange={(e) => seekTo(Number(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-gray-500 tabular-nums">
          <span>{current.toFixed(2)}s</span>
          <span>{duration.toFixed(2)}s</span>
        </div>
      </div>

      <div className="flex gap-2">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => setSpeed(s)}
            className={
              "flex-1 py-3 rounded-lg text-sm font-semibold " +
              (speed === s
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700")
            }
          >
            {s}x
          </button>
        ))}
      </div>

      <div className="rounded-lg border p-3 space-y-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLoopOn((v) => !v)}
            className={
              "flex-1 py-4 rounded-lg font-bold " +
              (loopOn ? "bg-green-600 text-white" : "bg-gray-200 text-gray-800")
            }
          >
            {loopOn ? "⟲ LOOP ON" : "⟲ LOOP OFF"}
          </button>
          <button
            onClick={() => setRange({ start: current, end: current + 3 })}
            className="px-4 py-4 rounded-lg bg-gray-100 text-sm font-medium"
          >
            ここから3秒
          </button>
        </div>
        <div className="flex gap-2 text-sm">
          <label className="flex-1">
            start
            <input
              type="number"
              step={0.1}
              value={range.start.toFixed(1)}
              onChange={(e) =>
                setRange((r) => ({ ...r, start: Number(e.target.value) }))
              }
              className="w-full border rounded px-2 py-1"
            />
          </label>
          <label className="flex-1">
            end
            <input
              type="number"
              step={0.1}
              value={range.end.toFixed(1)}
              onChange={(e) =>
                setRange((r) => ({ ...r, end: Number(e.target.value) }))
              }
              className="w-full border rounded px-2 py-1"
            />
          </label>
        </div>
      </div>

      <dl className="text-xs bg-gray-50 rounded-lg p-3 space-y-1 tabular-nums">
        <div className="flex justify-between">
          <dt>duration</dt>
          <dd>{duration.toFixed(2)} s</dd>
        </div>
        <div className="flex justify-between">
          <dt>seekable (Range対応)</dt>
          <dd className={seekable ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
            {seekable === null ? "-" : seekable ? "OK" : "NG"}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt>loop gap</dt>
          <dd className={gapMs === null ? "" : gapMs < 80 ? "text-green-600 font-bold" : "text-orange-600 font-bold"}>
            {gapMs === null ? "-" : `${gapMs} ms`}
          </dd>
        </div>
      </dl>
    </div>
  );
}