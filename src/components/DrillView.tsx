"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ClipPlayer from "@/components/ClipPlayer";

interface ClozeItem {
  id: string;
  segment_id: string;
  word_from: number;
  word_to: number;
  answer: string;
  variants: string[];
  tags: string[];
}

interface Segment {
  id: string;
  idx: number;
  start_ms: number;
  end_ms: number;
  text: string;
}

interface Props {
  clipId: string;
  signedUrl: string;
}

export default function DrillView({ clipId, signedUrl }: Props) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [clozeItems, setClozeItems] = useState<ClozeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<
    Record<string, { isCorrect: boolean; score: number; tags: string[] }>
  >({});
  const [submitting, setSubmitting] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    async function fetchData() {
      setLoading(true);

      const { data: clip } = await supabase
        .from("clips")
        .select("video_id, seg_from, seg_to")
        .eq("id", clipId)
        .single();

      if (!clip) return;

      const { data: segData } = await supabase
        .from("segments")
        .select("id, idx, start_ms, end_ms, text")
        .eq("video_id", clip.video_id)
        .gte("idx", clip.seg_from)
        .lte("idx", clip.seg_to)
        .order("idx", { ascending: true });

      if (segData) setSegments(segData);

      const { data: itemData } = await supabase
        .from("cloze_items")
        .select("id, segment_id, word_from, word_to, answer, variants, tags")
        .eq("clip_id", clipId);

      if (itemData) setClozeItems(itemData);

      setLoading(false);
    }

    void fetchData();
  }, [clipId, supabase]);

  const handleInputChange = (itemId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [itemId]: value }));
  };

  const handleCheckAnswers = async () => {
    setSubmitting(true);
    const newResults: Record<
      string,
      { isCorrect: boolean; score: number; tags: string[] }
    > = {};

    const {
      data: { user },
    } = await supabase.auth.getUser();

    for (const item of clozeItems) {
      const userRaw = (answers[item.id] || "").trim().toLowerCase();
      const gold = item.answer.trim().toLowerCase();
      const variants = (item.variants || []).map((v) => v.trim().toLowerCase());

      let isCorrect = false;
      let score = 0.0;
      let errorTags: string[] = [];

      if (userRaw === gold) {
        isCorrect = true;
        score = 1.0;
      } else if (variants.includes(userRaw)) {
        isCorrect = true;
        score = 0.85;
        errorTags.push("EXPANDED");
      } else {
        isCorrect = false;
        score = 0.0;
        errorTags.push("MISHEARD");
      }

      newResults[item.id] = { isCorrect, score, tags: errorTags };

      if (user) {
        await supabase.from("attempts").insert({
          owner_id: user.id,
          item_id: item.id,
          mode: "typing",
          input_raw: answers[item.id] || "",
          score,
          is_correct: isCorrect,
          error_tags: errorTags,
          video_shown: true,
          is_first_try: true,
        });
      }
    }

    setResults(newResults);
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-500">
        ドリル画面を読み込み中...
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto p-4 space-y-6">
      <ClipPlayer src={signedUrl} />

      <div className="bg-white border rounded-xl p-4 space-y-4 shadow-sm">
        <h2 className="text-sm font-bold text-gray-700 border-b pb-2">
          ディクテーション穴埋め問題
        </h2>

        <div className="space-y-4">
          {segments.map((seg) => {
            const items = clozeItems.filter((it) => it.segment_id === seg.id);
            if (items.length === 0) return null;

            return (
              <div
                key={seg.id}
                className="p-3 border rounded-lg bg-gray-50 space-y-2"
              >
                <div className="text-[10px] text-gray-400 font-mono">
                  #{(seg.idx + 1).toString().padStart(2, "0")} (
                  {(seg.start_ms / 1000).toFixed(1)}s -{" "}
                  {(seg.end_ms / 1000).toFixed(1)}s)
                </div>

                <div className="text-sm text-gray-800 leading-relaxed font-mono">
                  {seg.text.split(" ").map((word, wIdx) => {
                    // ★修正ポイント：文字列の一致ではなく、単語の位置番号(word_from)で正確に識別
                    const item = items.find((it) => it.word_from === wIdx);

                    if (item) {
                      const res = results[item.id];
                      return (
                        <span key={wIdx} className="inline-block mx-1 my-1">
                          <input
                            type="text"
                            value={answers[item.id] || ""}
                            onChange={(e) =>
                              handleInputChange(item.id, e.target.value)
                            }
                            className={`w-28 border-b-2 px-1 py-0.5 text-center text-sm font-bold font-mono focus:outline-none ${
                              res
                                ? res.isCorrect
                                  ? "border-green-500 bg-green-50 text-green-800"
                                  : "border-red-500 bg-red-50 text-red-800"
                                : "border-blue-500 bg-white"
                            }`}
                            placeholder="___"
                          />
                          {res && (
                            <span className="text-[10px] block text-center font-bold text-gray-500">
                              {res.isCorrect
                                ? res.score === 1.0
                                  ? "○ 100%"
                                  : "○ 85%"
                                : `× (${item.answer})`}
                            </span>
                          )}
                        </span>
                      );
                    }
                    return (
                      <span key={wIdx} className="mx-0.5">
                        {word}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={handleCheckAnswers}
          disabled={submitting}
          className="w-full py-3 bg-green-600 text-white rounded-lg font-bold text-sm hover:bg-green-700 disabled:opacity-50"
        >
          {submitting ? "採点・保存中..." : "回答をチェックする"}
        </button>
      </div>
    </div>
  );
}