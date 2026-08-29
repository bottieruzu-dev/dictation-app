'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useSignedUrl } from '@/lib/useSignedUrl';
import ClipPlayer from '@/components/ClipPlayer';

interface Segment {
  id: string;
  idx: number;
  start_ms: number;
  end_ms: number;
  text: string;
  ja_text?: string;
  corrected_text?: string;
  skeletons?: { text: string; label: string }[];
}

interface ClozeItem {
  id: string;
  segment_id: string;
  word_from: number;
  word_to: number;
  answer: string;
  variants: string[];
}

interface Monster {
  id: number;
  name: string;
  name_en: string;
  rarity: number;
  image_url: string;
  skill_code: string;
  stat_voc: number;
}

interface PartyMonster {
  slot: number;
  monster: Monster;
  used: boolean;
}

export default function ClipPage() {
  const params = useParams();
  const id = params?.id as string;

  const [clip, setClip] = useState<any>(null);
  const [targetMonster, setTargetMonster] = useState<Monster | null>(null);
  const [partyMonsters, setPartyMonsters] = useState<PartyMonster[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [clozeItems, setClozeItems] = useState<ClozeItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeSegIndex, setActiveSegIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, { isCorrect: boolean; score: number; answer: string }>>({});
  const [checkedSegments, setCheckedSegments] = useState<Record<string, boolean>>({});
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [skillMessage, setSkillMessage] = useState<string | null>(null);

  const [seekToTime, setSeekToTime] = useState<number | null>(null);
  const [currentVideoTime, setCurrentVideoTime] = useState(0);

  const [hintCharges, setHintCharges] = useState(0);

  // ドロップ結果モーダル用ステート
  const [dropResult, setDropResult] = useState<{
    isDropped: boolean;
    dropRateUsed: number;
    monster: Monster;
    newLuck: number;
    isFirstClear: boolean;
  } | null>(null);
  const [isSubmittingSession, setIsSubmittingSession] = useState(false);

  const { url: signedUrl } = useSignedUrl(id, 'video');
  const supabase = createClient();

  useEffect(() => {
    if (!id) return;

    async function fetchData() {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();

      const { data: clipData } = await supabase
        .from('clips')
        .select('*, videos(youtube_id, title), monsters(*)')
        .eq('id', id)
        .maybeSingle();

      if (clipData) {
        setClip(clipData);

        if (clipData.monsters) {
          setTargetMonster(clipData.monsters);
        } else {
          const { data: allMonsters } = await supabase.from('monsters').select('*');
          if (allMonsters && allMonsters.length > 0) {
            const randomMonster = allMonsters[Math.floor(Math.random() * allMonsters.length)];
            await supabase.from('clips').update({ monster_id: randomMonster.id }).eq('id', id);
            setTargetMonster(randomMonster);
          }
        }

        // パーティ3体を全取得
        if (user) {
          const { data: pList } = await supabase
            .from('party')
            .select('slot, monsters(*)')
            .eq('owner_id', user.id)
            .order('slot', { ascending: true });

          if (pList) {
            const formatted: PartyMonster[] = pList.map((p) => ({
              slot: p.slot,
              monster: p.monsters as any,
              used: false,
            }));
            setPartyMonsters(formatted);

            // リーダー（スロット1）の語彙ステータスからヒント回数を計算
            const leader = formatted.find((p) => p.slot === 1);
            if (leader) {
              const charges = Math.min(5, Math.floor((leader.monster.stat_voc || 0) / 400)) + 1;
              setHintCharges(charges);
            }
          }
        }

        const { data: segData } = await supabase
          .from('segments')
          .select('*')
          .eq('video_id', clipData.video_id)
          .gte('idx', clipData.seg_from ?? 0)
          .lte('idx', clipData.seg_to ?? 9999)
          .order('idx', { ascending: true });

        if (segData) setSegments(segData);

        const { data: itemData } = await supabase
          .from('cloze_items')
          .select('*')
          .eq('clip_id', id);

        if (itemData) setClozeItems(itemData);
      }

      setLoading(false);
    }

    fetchData();
  }, [id]);

  useEffect(() => {
    if (segments.length === 0) return;
    const foundIdx = segments.findIndex((seg) => {
      const startSec = (seg.start_ms || 0) / 1000;
      const endSec = (seg.end_ms || 0) / 1000;
      return currentVideoTime >= startSec && currentVideoTime <= endSec;
    });

    if (foundIdx !== -1 && foundIdx !== activeSegIndex) {
      setActiveSegIndex(foundIdx);
    }
  }, [currentVideoTime, segments]);

  const handleInputChange = (key: string, value: string) => {
    setUserAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const handleUseHint = (segId: string, wIdx: number, targetAnswer: string) => {
    if (hintCharges <= 0) return;

    const key = `${segId}-${wIdx}`;
    const currentVal = userAnswers[key] || '';
    if (currentVal.toLowerCase() === targetAnswer.toLowerCase()) return;

    const firstChar = targetAnswer.charAt(0);
    setUserAnswers((prev) => ({ ...prev, [key]: firstChar }));
    setHintCharges((prev) => prev - 1);
  };

  // ★ モンスターアイコンタップ時の固有アクティブスキル発動処理
  const handleActivateMonsterSkill = (slotIdx: number) => {
    const pm = partyMonsters.find((p) => p.slot === slotIdx);
    if (!pm || pm.used) return;

    const currentSeg = segments[activeSegIndex];
    if (!currentSeg) return;

    const words = (currentSeg.corrected_text || currentSeg.text).split(' ');
    const segItems = clozeItems.filter((it) => it.segment_id === currentSeg.id);
    const newAnswers = { ...userAnswers };

    let effectApplied = false;

    // スキルコードに応じた固有効果発動
    if (pm.monster.skill_code === 'VOCAB_HINT_1' || pm.monster.skill_code === 'COMBO_PROTECT_1') {
      // 効果: 未入力の空欄1つを「完全自動で即座に正解入力」！
      for (let wIdx = 0; wIdx < words.length; wIdx++) {
        const item = segItems.find((it) => it.word_from === wIdx);
        const key = `${currentSeg.id}-${wIdx}`;
        const targetAns = item ? item.answer : words[wIdx].replace(/[^a-zA-Z0-9]/g, '');

        if (!newAnswers[key] || newAnswers[key].trim().toLowerCase() !== targetAns.toLowerCase()) {
          newAnswers[key] = targetAns;
          effectApplied = true;
          setSkillMessage(`⚡ スキル発動【${pm.monster.name}】: 空欄1つを完全クリア！`);
          break;
        }
      }
    } else {
      // 効果: 現在の文章のすべての未入力空欄に頭文字（1文字目）をセット！
      for (let wIdx = 0; wIdx < words.length; wIdx++) {
        const item = segItems.find((it) => it.word_from === wIdx);
        const key = `${currentSeg.id}-${wIdx}`;
        const targetAns = item ? item.answer : words[wIdx].replace(/[^a-zA-Z0-9]/g, '');

        if (!newAnswers[key] && targetAns.length > 0) {
          newAnswers[key] = targetAns.charAt(0);
          effectApplied = true;
        }
      }
      setSkillMessage(`⚡ スキル発動【${pm.monster.name}】: 現在の文章の頭文字を解放！`);
    }

    if (effectApplied) {
      setUserAnswers(newAnswers);
      setPartyMonsters((prev) =>
        prev.map((p) => (p.slot === slotIdx ? { ...p, used: true } : p))
      );
    }
  };

  const handlePrevSegment = () => {
    if (activeSegIndex > 0) {
      const newIdx = activeSegIndex - 1;
      setActiveSegIndex(newIdx);
      setSeekToTime(segments[newIdx].start_ms / 1000);
      setSaveMessage(null);
      setSkillMessage(null);
    }
  };

  const handleNextSegment = () => {
    if (activeSegIndex < segments.length - 1) {
      const newIdx = activeSegIndex + 1;
      setActiveSegIndex(newIdx);
      setSeekToTime(segments[newIdx].start_ms / 1000);
      setSaveMessage(null);
      setSkillMessage(null);
    }
  };

  const checkSingleSegment = async (segId: string) => {
    setSaveMessage(null);
    const seg = segments.find((s) => s.id === segId);
    if (!seg) return;

    const words = (seg.corrected_text || seg.text).split(' ');
    const segItems = clozeItems.filter((it) => it.segment_id === seg.id);
    const newResults = { ...results };

    let wrongCount = 0;

    for (let wIdx = 0; wIdx < words.length; wIdx++) {
      const word = words[wIdx];
      const key = `${seg.id}-${wIdx}`;
      const item = segItems.find((it) => it.word_from === wIdx);

      const targetAnswer = item ? item.answer : word.replace(/[^a-zA-Z0-9]/g, '');
      const userInput = (userAnswers[key] || '').trim().toLowerCase();
      const gold = targetAnswer.trim().toLowerCase();
      const isCorrect = userInput === gold;

      if (!isCorrect) wrongCount++;

      newResults[key] = { isCorrect, score: isCorrect ? 1.0 : 0.0, answer: targetAnswer };
    }

    setResults(newResults);
    setCheckedSegments((prev) => ({ ...prev, [segId]: true }));

    if (wrongCount > 0) {
      await saveMistakesToDb(segId, newResults);
    }
  };

  const saveMistakesToDb = async (segId: string, currentResults = results) => {
    const seg = segments.find((s) => s.id === segId);
    if (!seg) return;

    const words = (seg.corrected_text || seg.text).split(' ');
    const segItems = clozeItems.filter((it) => it.segment_id === seg.id);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setSaveMessage('🚨 ログインが必要です');
      return;
    }

    let savedCount = 0;

    for (let wIdx = 0; wIdx < words.length; wIdx++) {
      const key = `${seg.id}-${wIdx}`;
      const res = currentResults[key];

      if (res && !res.isCorrect) {
        const item = segItems.find((it) => it.word_from === wIdx);
        await supabase.from('attempts').insert({
          owner_id: user.id,
          clip_id: id,
          segment_id: seg.id,
          item_id: item?.id || null,
          input_raw: userAnswers[key] || '',
          answer_gold: res.answer,
          score: 0.0,
          is_correct: false,
        });
        savedCount++;
      }
    }

    if (savedCount > 0) {
      setSaveMessage(`💾 ${savedCount} 件の間違いをノートに保存しました！`);
    } else {
      setSaveMessage('🎉 全問正解です！保存する間違いはありません。');
    }
  };

  const handleCheckAllAnswers = async () => {
    setIsSubmittingSession(true);

    let totalTargetCount = 0;
    let totalCorrectCount = 0;
    let filledCount = 0;

    for (const seg of segments) {
      const words = (seg.corrected_text || seg.text).split(' ');
      const segItems = clozeItems.filter((it) => it.segment_id === seg.id);

      for (let wIdx = 0; wIdx < words.length; wIdx++) {
        const word = words[wIdx];
        const key = `${seg.id}-${wIdx}`;
        const item = segItems.find((it) => it.word_from === wIdx);

        const isTarget = segItems.length > 0 ? !!item : true;

        if (isTarget) {
          totalTargetCount++;
          const targetAnswer = item ? item.answer : word.replace(/[^a-zA-Z0-9]/g, '');
          const userInput = (userAnswers[key] || '').trim().toLowerCase();
          if (userInput !== '') filledCount++;

          if (userInput === targetAnswer.trim().toLowerCase()) {
            totalCorrectCount++;
          }
        }
      }
      await checkSingleSegment(seg.id);
    }

    const rawAccuracy = totalTargetCount > 0 ? (totalCorrectCount / totalTargetCount) * 100 : 0;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/drop`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              clipId: id,
              rawAccuracy: Math.round(rawAccuracy),
              blankTotal: totalTargetCount,
              blankFilled: filledCount,
            }),
          }
        );

        const data = await res.json();
        if (res.ok) {
          setDropResult(data);
        }
      }
    } catch (err) {
      console.error('Drop error:', err);
    } finally {
      setIsSubmittingSession(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">読み込み中...</div>;

  const currentSeg = segments[activeSegIndex];

  return (
    <main className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-xl mx-auto px-4 space-y-6">
        
        <div className="flex items-center justify-between border-b pb-3">
          <h1 className="text-lg font-bold text-gray-900">
            {clip?.label || 'ディクテーション穴埋め'}
          </h1>
          <Link href="/" className="text-sm text-blue-600 hover:underline font-bold">
            ← ダッシュボードに戻る
          </Link>
        </div>

        {/* ドロップターゲット情報 */}
        {targetMonster && (
          <div className="bg-gray-900 text-white p-3 rounded-xl flex items-center justify-between shadow-md">
            <div className="flex items-center gap-3">
              <img src={targetMonster.image_url} alt={targetMonster.name} className="w-10 h-10 object-cover rounded-lg border border-gray-700" />
              <div>
                <div className="text-[10px] text-amber-400 font-bold">ドロップ対象 {"★".repeat(targetMonster.rarity)}</div>
                <div className="text-xs font-black">{targetMonster.name}</div>
              </div>
            </div>
            <div className="text-right text-[10px] text-gray-400 font-mono">
              空欄0クリアで<br /><span className="text-cyan-400 font-bold">ドロップのチャンス!</span>
            </div>
          </div>
        )}

        {/* ★ 新機能：パーティ3体 ＆ タップでスキル発動バー */}
        <div className="bg-indigo-950 border border-indigo-800 text-white p-3 rounded-2xl space-y-2 shadow-lg">
          <div className="flex justify-between items-center text-xs font-mono border-b border-indigo-900 pb-1.5">
            <span className="font-bold text-indigo-300">⚔️ パーティモンスター (タップで固有スキル発動)</span>
            <span className="text-[10px] text-cyan-300 font-bold">💡 ヒント可能: {hintCharges} 回</span>
          </div>

          {partyMonsters.length === 0 ? (
            <div className="text-[11px] text-gray-400 text-center py-1 font-mono">
              パーティが未設定です。<Link href="/party" className="text-cyan-400 underline font-bold">パーティ編成画面</Link> でモンスターを設定しましょう。
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 pt-1">
              {partyMonsters.map((p) => (
                <button
                  key={p.slot}
                  disabled={p.used}
                  onClick={() => handleActivateMonsterSkill(p.slot)}
                  className={`p-2 rounded-xl border text-center transition-all flex flex-col items-center justify-between ${
                    p.used
                      ? "bg-gray-900 border-gray-800 opacity-40 grayscale cursor-not-allowed"
                      : "bg-indigo-900/80 border-indigo-600 hover:border-cyan-400 hover:scale-105 active:scale-95 cursor-pointer shadow-md"
                  }`}
                >
                  <div className="text-[9px] text-amber-400 font-mono">SLOT #{p.slot}</div>
                  <img src={p.monster.image_url} alt={p.monster.name} className="w-10 h-10 object-cover rounded-lg my-1 border border-indigo-500/50" />
                  <div className="text-[10px] font-bold truncate w-full">{p.monster.name}</div>
                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded mt-1 ${p.used ? "bg-gray-800 text-gray-500" : "bg-cyan-500 text-black animate-pulse"}`}>
                    {p.used ? "USED" : "SKILL READY"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 1. プレイヤー領域 */}
        {signedUrl ? (
          <ClipPlayer
            src={signedUrl}
            seekToTime={seekToTime}
            onTimeUpdate={(t) => setCurrentVideoTime(t)}
          />
        ) : (
          <div className="p-8 bg-amber-50 border border-amber-200 rounded-xl text-center text-xs text-amber-800">
            動画準備中...
          </div>
        )}

        {/* 2. フォーカス学習カード */}
        {currentSeg && (
          <div className="bg-white border-2 border-blue-500 rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <div className="flex items-center gap-2">
                <span className="bg-blue-600 text-white font-mono text-xs font-bold px-2.5 py-0.5 rounded-full">
                  #{ (activeSegIndex + 1).toString().padStart(2, '0') } / { segments.length }
                </span>
                <span className="text-xs text-gray-400 font-mono">
                  ({ ((currentSeg.start_ms || 0) / 1000).toFixed(1) }s - { ((currentSeg.end_ms || 0) / 1000).toFixed(1) }s)
                </span>
              </div>

              <button
                onClick={() => setSeekToTime(currentSeg.start_ms / 1000)}
                className="px-2.5 py-1 bg-blue-50 text-blue-700 font-bold rounded-lg text-xs hover:bg-blue-100 transition-colors flex items-center gap-1"
              >
                ▶️ この文を再生
              </button>
            </div>

            {/* スキル発動通知メッセージ */}
            {skillMessage && (
              <div className="p-2.5 bg-cyan-50 border border-cyan-300 text-cyan-900 text-xs font-black rounded-xl text-center animate-bounce shadow-sm">
                {skillMessage}
              </div>
            )}

            {/* 穴埋め入力エリア */}
            <div className="flex flex-wrap gap-2 items-center font-mono py-2 min-h-[60px]">
              { (currentSeg.corrected_text || currentSeg.text).split(' ').map((word, wIdx) => {
                const segItems = clozeItems.filter((it) => it.segment_id === currentSeg.id);
                const key = `${currentSeg.id}-${wIdx}`;
                const item = segItems.find((it) => it.word_from === wIdx);
                const res = results[key];

                const isTarget = segItems.length > 0 ? !!item : true;
                const targetAnswer = item ? item.answer : word.replace(/[^a-zA-Z0-9]/g, '');

                if (isTarget) {
                  return (
                    <div key={wIdx} className="inline-flex flex-col items-center">
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          value={userAnswers[key] || ''}
                          onChange={(e) => handleInputChange(key, e.target.value)}
                          placeholder="---"
                          className={`w-24 border-b-2 px-1 py-1 text-center text-sm font-bold font-mono focus:outline-none transition-colors ${
                            res ? (res.isCorrect ? 'border-green-500 bg-green-50 text-green-800' : 'border-red-500 bg-red-50 text-red-800') : 'border-blue-500 bg-white text-gray-900'
                          }`}
                        />
                        {hintCharges > 0 && !res && (
                          <button
                            onClick={() => handleUseHint(currentSeg.id, wIdx, targetAnswer)}
                            className="absolute -top-2 -right-2 bg-amber-400 hover:bg-amber-500 text-black text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow"
                            title="頭文字ヒントを使う"
                          >
                            💡
                          </button>
                        )}
                      </div>
                      {res && (
                        <span className={`text-[10px] font-bold mt-0.5 ${res.isCorrect ? 'text-green-600' : 'text-red-600'}`}>
                          {res.isCorrect ? '○ 100%' : `× (${res.answer})`}
                        </span>
                      )}
                    </div>
                  );
                }

                return (
                  <span key={wIdx} className="text-sm font-bold text-gray-800">
                    {word}
                  </span>
                );
              })}
            </div>

            {/* 保存メッセージ */}
            {saveMessage && (
              <div className="p-2.5 bg-purple-50 border border-purple-200 text-purple-800 text-xs font-bold rounded-lg text-center">
                {saveMessage}
              </div>
            )}

            {/* コントロール */}
            <div className="flex items-center justify-between gap-2 pt-3 border-t">
              <button
                disabled={activeSegIndex === 0}
                onClick={handlePrevSegment}
                className="px-3 py-2 bg-gray-100 text-gray-700 rounded-xl text-xs font-bold hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                ⬅️ 前の文
              </button>

              <div className="flex gap-1">
                <button
                  onClick={() => checkSingleSegment(currentSeg.id)}
                  className="px-3 py-2 bg-gray-900 text-white rounded-xl text-xs font-bold hover:bg-black transition-colors"
                >
                  この文章をチェック
                </button>

                {checkedSegments[currentSeg.id] && (
                  <button
                    onClick={() => saveMistakesToDb(currentSeg.id)}
                    className="px-3 py-2 bg-purple-600 text-white rounded-xl text-xs font-bold hover:bg-purple-700 transition-colors shadow-sm"
                  >
                    💾 間違いを保存
                  </button>
                )}
              </div>

              <button
                disabled={activeSegIndex === segments.length - 1}
                onClick={handleNextSegment}
                className="px-3 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                次の文 ➡️
              </button>
            </div>

            {/* 解説・日本語訳 */}
            {checkedSegments[currentSeg.id] && (
              <div className="space-y-2 pt-3 border-t border-dashed">
                {currentSeg.skeletons && currentSeg.skeletons.length > 0 && (
                  <div className="space-y-1">
                    {currentSeg.skeletons.map((sk, idx) => (
                      <div key={idx} className="text-xs bg-blue-50 text-blue-800 p-2 rounded-lg font-semibold">
                        💡 構文: <strong>{sk.text}</strong> ({sk.label})
                      </div>
                    ))}
                  </div>
                )}
                {currentSeg.ja_text && (
                  <div className="text-xs bg-gray-50 text-gray-700 p-2 rounded-lg">
                    💡 <strong>訳:</strong> {currentSeg.ja_text}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 3. 全文章リスト */}
        <div className="bg-white border rounded-xl p-5 space-y-4 shadow-sm">
          <div className="flex justify-between items-center border-b pb-2">
            <h2 className="text-sm font-bold text-gray-800">全文章リスト ({segments.length}文)</h2>
            <button
              onClick={handleCheckAllAnswers}
              disabled={isSubmittingSession}
              className="px-3.5 py-2 bg-green-600 text-white rounded-lg font-bold text-xs hover:bg-green-700 disabled:opacity-50 shadow-sm"
            >
              {isSubmittingSession ? '判定中...' : '全体を一括チェック＆判定'}
            </button>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {segments.map((seg, idx) => {
              const isCurrent = idx === activeSegIndex;
              return (
                <div
                  key={seg.id}
                  onClick={() => {
                    setActiveSegIndex(idx);
                    setSeekToTime(seg.start_ms / 1000);
                    setSaveMessage(null);
                    setSkillMessage(null);
                  }}
                  className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-colors flex justify-between items-center ${
                    isCurrent ? 'bg-blue-50 border-blue-500 font-bold text-blue-900' : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <span className="font-mono">#{ (idx + 1).toString().padStart(2, '0') }</span>
                  <span className="truncate max-w-[280px] font-mono">{ seg.corrected_text || seg.text }</span>
                  <span className="text-[10px] text-gray-400 font-mono">{ ((seg.start_ms || 0) / 1000).toFixed(1) }s</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ドロップ結果表示モーダル */}
        {dropResult && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <div className="bg-gray-900 border border-gray-800 text-white p-6 rounded-2xl max-w-sm w-full text-center space-y-4 shadow-2xl">
              {dropResult.isFirstClear && (
                <span className="bg-amber-500 text-black font-black px-3 py-1 rounded-full text-xs animate-bounce inline-block">
                  🎉 初回クリア！確定ドロップ！
                </span>
              )}

              {dropResult.isDropped ? (
                <div className="space-y-3">
                  <div className="text-3xl animate-pulse">🎁</div>
                  <h3 className="text-lg font-black text-green-400">モンスターGET!</h3>
                  <img src={dropResult.monster.image_url} alt={dropResult.monster.name} className="w-24 h-24 object-cover rounded-xl mx-auto border-2 border-green-500 shadow-md" />
                  <div>
                    <div className="text-sm font-bold">{dropResult.monster.name}</div>
                    <div className="text-xs text-blue-400 font-mono mt-0.5">現在のラック: ☘️ {dropResult.newLuck}</div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 py-4">
                  <div className="text-3xl">💦</div>
                  <h3 className="text-base font-bold text-gray-300">ドロップ失敗...</h3>
                  <p className="text-xs text-gray-400 font-mono">
                    今回のドロップ確率: {dropResult.dropRateUsed}%
                  </p>
                </div>
              )}

              <button
                onClick={() => setDropResult(null)}
                className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors"
              >
                閉じる
              </button>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}