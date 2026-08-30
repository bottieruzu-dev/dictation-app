'use client';

import { useEffect, useState, Suspense } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
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
  element: string;
  image_url: string;
  skill_code: string;
  stat_int: number;
  stat_ear: number;
  stat_voc: number;
  stat_foc: number;
  stat_luk: number;
  stat_gut: number;
}

interface PartyMonster {
  slot: number;
  monster: Monster;
  used: boolean;
}

// 属性相性判定 (1.5倍 / 0.7倍 / 1.0倍)
const getAttributeMultiplier = (pElem?: string, bElem?: string) => {
  if (!pElem || !bElem) return 1.0;
  const p = pElem.toLowerCase();
  const b = bElem.toLowerCase();

  if (
    (p === 'fire' && b === 'wind') ||
    (p === 'water' && b === 'fire') ||
    (p === 'wind' && b === 'water') ||
    (p === 'light' && b === 'dark') ||
    (p === 'dark' && b === 'light')
  ) {
    return 1.5; // 有利
  }
  if (
    (p === 'fire' && b === 'water') ||
    (p === 'water' && b === 'wind') ||
    (p === 'wind' && b === 'fire')
  ) {
    return 0.7; // 不利
  }
  return 1.0;
};

function ClipBattleInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = params?.id as string;

  // 再生速度（prepare画面からの引き継ぎ）
  const speedParam = parseFloat(searchParams.get('speed') || '1.0');

  const [clip, setClip] = useState<any>(null);
  const [targetMonster, setTargetMonster] = useState<Monster | null>(null);
  const [partyMonsters, setPartyMonsters] = useState<PartyMonster[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [clozeItems, setClozeItems] = useState<ClozeItem[]>([]);
  const [loading, setLoading] = useState(true);

  // バトルステータス
  const [playerMaxHp, setPlayerMaxHp] = useState(1000);
  const [playerHp, setPlayerHp] = useState(1000);
  const [playerBaseAtk, setPlayerAtk] = useState(200);

  const [bossMaxHp, setBossMaxHp] = useState(2000);
  const [bossHp, setBossHp] = useState(2000);
  const [bossAtk, setBossAtk] = useState(150);

  const [comboCount, setComboCount] = useState(0);
  const [activeSegIndex, setActiveSegIndex] = useState(0);
  const [isAwakened, setIsAwakened] = useState(false); // ボス覚醒状態（ファイナルウェーブ）
  const [clearedWaves, setClearedWaves] = useState<Record<string, boolean>>({});

  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, { isCorrect: boolean; score: number; answer: string }>>({});
  const [battleLog, setBattleLog] = useState<string | null>(null);
  const [skillMessage, setSkillMessage] = useState<string | null>(null);

  const [seekToTime, setSeekToTime] = useState<number | null>(null);
  const [currentVideoTime, setCurrentVideoTime] = useState(0);
  const [hintCharges, setHintCharges] = useState(0);

  // モーダル管理
  const [isContinueModalOpen, setIsContinueModalOpen] = useState(false);
  const [isGameOverModalOpen, setIsGameOverModalOpen] = useState(false);
  const [dropResult, setDropResult] = useState<any>(null);
  const [isSubmittingSession, setIsSubmittingSession] = useState(false);

  const { url: signedUrl } = useSignedUrl(id, 'video');
  const supabase = createClient();

  useEffect(() => {
    if (!id) return;

    async function fetchData() {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();

      // 1. クリップ ＆ ボスモンスター情報
      const { data: clipData } = await supabase
        .from('clips')
        .select('*, videos(youtube_id, title), monsters(*)')
        .eq('id', id)
        .maybeSingle();

      if (clipData) {
        setClip(clipData);

        let boss = clipData.monsters;
        if (!boss) {
          const { data: allMonsters } = await supabase.from('monsters').select('*');
          if (allMonsters && allMonsters.length > 0) {
            boss = allMonsters[Math.floor(Math.random() * allMonsters.length)];
          }
        }
        setTargetMonster(boss);

        // ボスステータス算定
        const dScore = clipData.difficulty_score || 50;
        const bMaxHp = Math.round(dScore * 40 + (boss?.rarity || 1) * 300);
        const bAtk = Math.round(dScore * 2 + (boss?.rarity || 1) * 20);
        setBossMaxHp(bMaxHp);
        setBossHp(bMaxHp);
        setBossAtk(bAtk);

        // 2. プレイヤーのパーティステータス算定
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

            let gutSum = 0, focSum = 0, intSum = 0, vocSum = 0;
            formatted.forEach((pm) => {
              gutSum += pm.monster.stat_gut || 50;
              focSum += pm.monster.stat_foc || 50;
              intSum += pm.monster.stat_int || 50;
              vocSum += pm.monster.stat_voc || 50;
            });

            const pHp = gutSum * 10 + focSum * 5 + 500;
            const pAtk = Math.round(intSum * 1.5 + vocSum * 1.0 + 100);

            setPlayerMaxHp(pHp);
            setPlayerHp(pHp);
            setPlayerAtk(pAtk);

            const leader = formatted.find((p) => p.slot === 1);
            if (leader) {
              setHintCharges(Math.min(5, Math.floor((leader.monster.stat_voc || 0) / 400)) + 1);
            }
          }
        }

        // 3. 文章セグメント ＆ 穴埋めアイテム
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
    if (segments.length === 0 || isAwakened) return;
    const foundIdx = segments.findIndex((seg) => {
      const startSec = (seg.start_ms || 0) / 1000;
      const endSec = (seg.end_ms || 0) / 1000;
      return currentVideoTime >= startSec && currentVideoTime <= endSec;
    });

    if (foundIdx !== -1 && foundIdx !== activeSegIndex) {
      setActiveSegIndex(foundIdx);
    }
  }, [currentVideoTime, segments, activeSegIndex, isAwakened]);

  const handleInputChange = (key: string, value: string) => {
    setUserAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const handleUseHint = (segId: string, wIdx: number, targetAnswer: string) => {
    if (hintCharges <= 0) return;
    const key = `${segId}-${wIdx}`;
    const currentVal = userAnswers[key] || '';
    if (currentVal.toLowerCase() === targetAnswer.toLowerCase()) return;

    setUserAnswers((prev) => ({ ...prev, [key]: targetAnswer.charAt(0) }));
    setHintCharges((prev) => prev - 1);
  };

  const handleActivateMonsterSkill = (slotIdx: number) => {
    const pm = partyMonsters.find((p) => p.slot === slotIdx);
    if (!pm || pm.used) return;

    const currentSeg = segments[activeSegIndex];
    if (!currentSeg) return;

    const words = (currentSeg.corrected_text || currentSeg.text).split(' ');
    const segItems = clozeItems.filter((it) => it.segment_id === currentSeg.id);
    const newAnswers = { ...userAnswers };

    let effectApplied = false;

    if (pm.monster.skill_code === 'VOCAB_HINT_1' || pm.monster.skill_code === 'COMBO_PROTECT_1') {
      for (let wIdx = 0; wIdx < words.length; wIdx++) {
        const item = segItems.find((it) => it.word_from === wIdx);
        const key = `${currentSeg.id}-${wIdx}`;
        const targetAns = item ? item.answer : words[wIdx].replace(/[^a-zA-Z0-9]/g, '');

        if (!newAnswers[key] || newAnswers[key].trim().toLowerCase() !== targetAns.toLowerCase()) {
          newAnswers[key] = targetAns;
          effectApplied = true;
          setSkillMessage(`⚡ スキル発動【${pm.monster.name}】: 空欄1つを完全自動入力！`);
          break;
        }
      }
    } else {
      for (let wIdx = 0; wIdx < words.length; wIdx++) {
        const item = segItems.find((it) => it.word_from === wIdx);
        const key = `${currentSeg.id}-${wIdx}`;
        const targetAns = item ? item.answer : words[wIdx].replace(/[^a-zA-Z0-9]/g, '');

        if (!newAnswers[key] && targetAns.length > 0) {
          newAnswers[key] = targetAns.charAt(0);
          effectApplied = true;
        }
      }
      setSkillMessage(`⚡ スキル発動【${pm.monster.name}】: 頭文字ヒント解放！`);
    }

    if (effectApplied) {
      setUserAnswers(newAnswers);
      setPartyMonsters((prev) =>
        prev.map((p) => (p.slot === slotIdx ? { ...p, used: true } : p))
      );
    }
  };

  // ⚔️ シングルラウンド（1文章）攻撃処理
  const handleAttackRound = () => {
    const currentSeg = segments[activeSegIndex];
    if (!currentSeg) return;

    const words = (currentSeg.corrected_text || currentSeg.text).split(' ');
    const segItems = clozeItems.filter((it) => it.segment_id === currentSeg.id);
    const newResults = { ...results };

    let targetCount = 0;
    let correctCount = 0;

    for (let wIdx = 0; wIdx < words.length; wIdx++) {
      const word = words[wIdx];
      const key = `${currentSeg.id}-${wIdx}`;
      const item = segItems.find((it) => it.word_from === wIdx);
      const isTarget = segItems.length > 0 ? !!item : true;

      if (isTarget) {
        targetCount++;
        const targetAnswer = item ? item.answer : word.replace(/[^a-zA-Z0-9]/g, '');
        const userInput = (userAnswers[key] || '').trim().toLowerCase();
        const gold = targetAnswer.trim().toLowerCase();
        const isCorrect = userInput === gold;

        if (isCorrect) correctCount++;
        newResults[key] = { isCorrect, score: isCorrect ? 1.0 : 0.0, answer: targetAnswer };
      }
    }

    setResults(newResults);
    setClearedWaves((prev) => ({ ...prev, [currentSeg.id]: true }));

    const roundAccuracy = targetCount > 0 ? correctCount / targetCount : 1.0;
    const leaderElem = partyMonsters[0]?.monster.element;
    const attrMult = getAttributeMultiplier(leaderElem, targetMonster?.element);

    // ダメージ算定（正答率 × 基本攻撃力 × 属性 × コンボ倍率）
    let currentCombo = comboCount;
    if (roundAccuracy >= 0.8) {
      currentCombo += 1;
      setComboCount(currentCombo);
    } else {
      setComboCount(0);
      currentCombo = 0;
    }

    const comboMult = 1.0 + currentCombo * 0.1;
    const damageToBoss = Math.round(playerBaseAtk * roundAccuracy * attrMult * comboMult);

    const newBossHp = Math.max(0, bossHp - damageToBoss);
    setBossHp(newBossHp);

    // ボスの反撃ダメージ
    const bossDamage = Math.round(bossAtk * (1.0 - roundAccuracy * 0.5));
    const newPlayerHp = Math.max(0, playerHp - bossDamage);
    setPlayerHp(newPlayerHp);

    setBattleLog(
      `💥 攻撃成功! ボスに ${damageToBoss} ダメージ! (コンボ: ${currentCombo}x) / 🚨 ボスの反撃で ${bossDamage} ダメージを受けた!`
    );

    // プレイヤー死亡時 ➔ コンティニューモーダル
    if (newPlayerHp <= 0) {
      setIsContinueModalOpen(true);
      return;
    }

    // 次の文章へ移動、または全文章終了判定
    if (activeSegIndex < segments.length - 1) {
      const nextIdx = activeSegIndex + 1;
      setActiveSegIndex(nextIdx);
      setSeekToTime(segments[nextIdx].start_ms / 1000);
    } else {
      // 全文章ラウンド終了時 ➔ 50%判定
      if (newBossHp > bossMaxHp * 0.5) {
        setIsGameOverModalOpen(true); // ダメージ不足によるゲームオーバー
      } else {
        setIsAwakened(true); // 🔥 ボス覚醒状態（ファイナルウェーブ）突入！
        setBattleLog('🔥 ボスが覚醒状態に突入！全文章一括判定で残りのHPを削りきれ！');
      }
    }
  };

  // 🔥 覚醒ボス（全文章一括判定）へのファイナルアタック
  const handleFinalAttack = async () => {
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
    }

    const rawAccuracy = totalTargetCount > 0 ? (totalCorrectCount / totalTargetCount) * 100 : 0;
    const finalDamage = Math.round(playerBaseAtk * (rawAccuracy / 100) * 3.0);
    const finalBossHp = Math.max(0, bossHp - finalDamage);
    setBossHp(finalBossHp);

    if (finalBossHp > 0) {
      setBattleLog(`💦 削りきれなかった...（残HP: ${finalBossHp}）`);
      setIsGameOverModalOpen(true);
      setIsSubmittingSession(false);
      return;
    }

    // 🏆 撃破成功！ドロップ判定API呼び出し
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

  // 💎 オーブ1個でコンティニュー
  const handleContinue = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: bal } = await supabase
        .from('orb_balance')
        .select('balance')
        .eq('owner_id', user.id)
        .single();

      if ((bal?.balance ?? 0) < 1) {
        alert('オーブが足りません。');
        return;
      }

      await supabase.from('orb_ledger').insert({
        owner_id: user.id,
        delta: -1,
        reason: 'battle_continue',
      });

      setPlayerHp(playerMaxHp);
      setIsContinueModalOpen(false);
      setBattleLog('💎 オーブを1個消費して復活した！');
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) return <div className="min-h-screen bg-slate-950 text-slate-400 p-8 text-center text-xs font-mono">LOADING BATTLE HUD...</div>;

  const currentSeg = segments[activeSegIndex];

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 font-sans py-6 selection:bg-cyan-500 selection:text-black">
      <div className="max-w-xl mx-auto px-4 space-y-5">
        
        {/* ヘッダー */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
          <h1 className="text-sm font-black text-white truncate max-w-[220px]">
            {clip?.label || 'ディクテーションバトル'}
          </h1>
          <Link href={`/clips/${id}/prepare`} className="text-xs text-cyan-400 hover:underline font-bold">
            ← 出撃準備に戻る
          </Link>
        </div>

        {/* ================= ボス (敵モンスター) パズドラ風ステータスバー ================= */}
        {targetMonster && (
          <div className="bg-slate-900 border-2 border-red-500/60 rounded-2xl p-3.5 space-y-2 shadow-2xl shadow-red-950/30 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src={targetMonster.image_url} alt={targetMonster.name} className="w-12 h-12 object-cover rounded-xl border border-amber-500/50 shadow" />
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-amber-400 font-black">{"★".repeat(targetMonster.rarity)}</span>
                    <span className="text-[9px] uppercase font-mono px-1.5 py-0.2 rounded bg-red-950 text-red-400 border border-red-800">
                      {targetMonster.element}
                    </span>
                  </div>
                  <div className="text-xs font-black text-white">{targetMonster.name} {isAwakened && "🔥 [AWAKENED]"}</div>
                </div>
              </div>
              <div className="text-right font-mono">
                <div className="text-[10px] text-slate-400">BOSS HP</div>
                <div className="text-sm font-black text-red-400">{bossHp} / {bossMaxHp}</div>
              </div>
            </div>

            {/* ボスHPゲージ */}
            <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-gradient-to-r from-red-600 via-orange-500 to-amber-400 transition-all duration-300"
                style={{ width: `${Math.max(0, (bossHp / bossMaxHp) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* ================= プレイヤー ＆ パーティ ステータスバー ================= */}
        <div className="bg-slate-900 border border-indigo-500/50 rounded-2xl p-3.5 space-y-2.5 shadow-xl">
          <div className="flex justify-between items-center text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="font-bold text-cyan-300">⚔️ 味方パーティ</span>
              {comboCount > 0 && (
                <span className="bg-amber-500 text-black text-[10px] font-black px-2 py-0.5 rounded-full animate-bounce">
                  {comboCount} COMBO!
                </span>
              )}
            </div>
            <div>
              <span className="text-slate-400">PLAYER HP: </span>
              <strong className="text-green-400 text-sm">{playerHp} / {playerMaxHp}</strong>
            </div>
          </div>

          {/* プレイヤーHPゲージ */}
          <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-green-400 transition-all duration-300"
              style={{ width: `${Math.max(0, (playerHp / playerMaxHp) * 100)}%` }}
            />
          </div>

          {/* パーティ3体 ＆ アクティブスキル発動アイコン */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            {partyMonsters.map((p) => (
              <button
                key={p.slot}
                disabled={p.used}
                onClick={() => handleActivateMonsterSkill(p.slot)}
                className={`p-2 rounded-xl border text-center transition-all flex flex-col items-center justify-between ${
                  p.used
                    ? "bg-slate-950 border-slate-800 opacity-40 grayscale cursor-not-allowed"
                    : "bg-indigo-950/80 border-indigo-600 hover:border-cyan-400 active:scale-95 cursor-pointer shadow-md"
                }`}
              >
                <div className="text-[9px] text-amber-400 font-mono">SLOT #{p.slot}</div>
                <img src={p.monster.image_url} alt={p.monster.name} className="w-9 h-9 object-cover rounded-lg my-1 border border-indigo-500/40" />
                <div className="text-[10px] font-bold truncate w-full text-slate-200">{p.monster.name}</div>
                <span className={`text-[8px] font-black px-1.5 py-0.5 rounded mt-1 ${p.used ? "bg-slate-800 text-slate-500" : "bg-cyan-500 text-black"}`}>
                  {p.used ? "USED" : "SKILL"}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* バトルログ ＆ 通知 */}
        {battleLog && (
          <div className="p-2.5 bg-slate-900 border border-slate-800 text-cyan-300 text-xs font-mono rounded-xl text-center shadow-inner">
            {battleLog}
          </div>
        )}

        {skillMessage && (
          <div className="p-2.5 bg-cyan-950 border border-cyan-500/50 text-cyan-200 text-xs font-black rounded-xl text-center animate-bounce shadow-md">
            {skillMessage}
          </div>
        )}

        {/* ================= 動画プレイヤー（指定速度再生） ================= */}
        {signedUrl ? (
          <ClipPlayer
            src={signedUrl}
            seekToTime={seekToTime}
            onTimeUpdate={(t) => setCurrentVideoTime(t)}
          />
        ) : (
          <div className="p-8 bg-slate-900 border border-slate-800 rounded-xl text-center text-xs text-slate-500 font-mono">
            LOADING MEDIA STREAM...
          </div>
        )}

        {/* ================= 1文章フォーカス入力カード (Wave 1 ～ N) ================= */}
        {!isAwakened && currentSeg && (
          <div className="bg-slate-900 border-2 border-cyan-500/80 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="bg-cyan-500 text-black font-mono text-xs font-black px-2.5 py-0.5 rounded-full">
                  WAVE #{ (activeSegIndex + 1).toString().padStart(2, '0') } / { segments.length }
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  ({ ((currentSeg.start_ms || 0) / 1000).toFixed(1) }s - { ((currentSeg.end_ms || 0) / 1000).toFixed(1) }s)
                </span>
              </div>

              <button
                onClick={() => setSeekToTime(currentSeg.start_ms / 1000)}
                className="px-2.5 py-1 bg-cyan-950 text-cyan-300 border border-cyan-800 font-bold rounded-lg text-xs hover:bg-cyan-900 transition-colors flex items-center gap-1"
              >
                ▶️ 再生
              </button>
            </div>

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
                          className={`w-24 border-b-2 px-1 py-1 text-center text-sm font-black font-mono focus:outline-none transition-colors ${
                            res ? (res.isCorrect ? 'border-green-500 bg-green-950 text-green-300' : 'border-red-500 bg-red-950 text-red-300') : 'border-cyan-500 bg-slate-950 text-white'
                          }`}
                        />
                        {hintCharges > 0 && !res && (
                          <button
                            onClick={() => handleUseHint(currentSeg.id, wIdx, targetAnswer)}
                            className="absolute -top-2 -right-2 bg-amber-400 text-black text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow"
                            title="ヒント"
                          >
                            💡
                          </button>
                        )}
                      </div>
                      {res && (
                        <span className={`text-[10px] font-bold mt-0.5 ${res.isCorrect ? 'text-green-400' : 'text-red-400'}`}>
                          {res.isCorrect ? '○ 100%' : `× (${res.answer})`}
                        </span>
                      )}
                    </div>
                  );
                }

                return (
                  <span key={wIdx} className="text-sm font-bold text-slate-200">
                    {word}
                  </span>
                );
              })}
            </div>

            {/* ⚔️ 攻撃ボタン */}
            <button
              onClick={handleAttackRound}
              className="w-full py-3.5 bg-gradient-to-r from-red-600 via-orange-600 to-amber-600 hover:opacity-95 active:translate-y-0.5 text-white font-black text-sm rounded-xl shadow-xl border border-orange-400/30 transition-all uppercase tracking-widest flex items-center justify-center gap-2"
            >
              <span>⚔️ ボ ス へ 攻 撃 (回答判定)</span>
            </button>
          </div>
        )}

        {/* ================= 🔥 ボス覚醒状態（ファイナルウェーブ・一括問題） ================= */}
        {isAwakened && (
          <div className="bg-slate-900 border-2 border-red-500 rounded-2xl p-5 shadow-2xl space-y-4 animate-fadeIn">
            <div className="text-center space-y-1 border-b border-slate-800 pb-3">
              <span className="bg-red-600 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest animate-bounce inline-block">
                🔥 FINAL WAVE - BOSS AWAKENED
              </span>
              <h2 className="text-lg font-black text-amber-300">覚醒ボス・トータルアタック</h2>
              <p className="text-xs text-slate-400 font-mono">全文章の空欄を入力し、最後の特大ダメージで引導を渡せ！</p>
            </div>

            <button
              onClick={handleFinalAttack}
              disabled={isSubmittingSession}
              className="w-full py-4 bg-gradient-to-r from-red-600 via-purple-600 to-indigo-600 hover:opacity-95 active:translate-y-0.5 text-white font-black text-sm rounded-xl shadow-2xl border border-red-400/30 transition-all uppercase tracking-widest flex items-center justify-center gap-2"
            >
              <span>🔥 ト ー タ ル ア タ ッ ク （最終一括判定）</span>
            </button>
          </div>
        )}

        {/* ================= 全文章リスト（ネタバレ防止マスク化） ================= */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-lg">
          <div className="flex justify-between items-center border-b border-slate-800 pb-2 text-xs font-mono">
            <span className="font-bold text-slate-300">📋 ダンジョン文章ログ ({segments.length}文)</span>
            <span className="text-[10px] text-slate-500">クリア文のみ解読表示</span>
          </div>

          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {segments.map((seg, idx) => {
              const isCurrent = idx === activeSegIndex;
              const isCleared = clearedWaves[seg.id];

              return (
                <div
                  key={seg.id}
                  onClick={() => {
                    if (!isAwakened) {
                      setActiveSegIndex(idx);
                      setSeekToTime(seg.start_ms / 1000);
                      setSkillMessage(null);
                    }
                  }}
                  className={`p-2.5 rounded-xl border text-xs font-mono cursor-pointer transition-all flex justify-between items-center ${
                    isCurrent
                      ? 'bg-cyan-950/80 border-cyan-400 text-cyan-200 font-bold'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:bg-slate-900'
                  }`}
                >
                  <span>WAVE #{ (idx + 1).toString().padStart(2, '0') }</span>
                  
                  {/* ネタバレ防止マスク */}
                  <span className="truncate max-w-[240px]">
                    {isCleared ? (seg.corrected_text || seg.text) : '🔒 [ 未解読の音声 ]'}
                  </span>

                  <span className="text-[10px] text-slate-500">{ ((seg.start_ms || 0) / 1000).toFixed(1) }s</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 💎 オーブコンティニューモーダル */}
        {isContinueModalOpen && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fadeIn">
            <div className="bg-slate-900 border-2 border-red-500 rounded-2xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl text-white">
              <div className="text-3xl animate-bounce">💀</div>
              <h3 className="text-lg font-black text-red-400">プレイヤー全滅...</h3>
              <p className="text-xs text-slate-300 font-mono">
                HPが0になりました。オーブ1個を消費してHP全回復で復帰しますか？
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setIsContinueModalOpen(false);
                    setIsGameOverModalOpen(true);
                  }}
                  className="flex-1 py-2.5 bg-slate-800 text-slate-400 rounded-xl text-xs font-bold"
                >
                  あきらめる
                </button>
                <button
                  onClick={handleContinue}
                  className="flex-1 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-black text-xs rounded-xl shadow-lg"
                >
                  💎 1個でコンティニュー
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 🚨 ゲームオーバーモーダル */}
        {isGameOverModalOpen && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fadeIn">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-sm w-full text-center space-y-4 text-white">
              <div className="text-3xl">💦</div>
              <h3 className="text-lg font-black text-slate-300">GAME OVER</h3>
              <p className="text-xs text-slate-400 font-mono">
                ボスの削り残しまたは撤退によりクエスト失敗となりました。
              </p>
              <button
                onClick={() => router.push(`/clips/${id}/prepare`)}
                className="w-full py-2.5 bg-slate-800 text-white rounded-xl text-xs font-bold"
              >
                出撃準備へ戻る
              </button>
            </div>
          </div>
        )}

        {/* 🎁 ドロップ勝利モーダル */}
        {dropResult && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fadeIn">
            <div className="bg-slate-900 border-2 border-emerald-500 text-white p-6 rounded-2xl max-w-sm w-full text-center space-y-4 shadow-2xl">
              <div className="text-3xl animate-bounce">🏆</div>
              <h3 className="text-lg font-black text-emerald-400">QUEST CLEAR!</h3>

              {dropResult.isFirstClear && (
                <span className="bg-amber-500 text-black font-black px-3 py-1 rounded-full text-[10px] uppercase">
                  🎉 初回クリア！確定ドロップ！
                </span>
              )}

              {dropResult.isDropped ? (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-cyan-300">モンスタードロップ成功!</h4>
                  <img src={dropResult.monster.image_url} alt={dropResult.monster.name} className="w-24 h-24 object-cover rounded-2xl mx-auto border-2 border-emerald-400 shadow-lg" />
                  <div>
                    <div className="text-xs font-black">{dropResult.monster.name}</div>
                    <div className="text-[10px] text-cyan-400 font-mono mt-0.5">現在のラック: ☘️ {dropResult.newLuck}</div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 font-mono">
                  ドロップ獲得ならず...（今回の確率: {dropResult.dropRateUsed}%）
                </p>
              )}

              <button
                onClick={() => router.push(`/clips/${id}/prepare`)}
                className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl text-xs font-black shadow-lg"
              >
                出撃確認へ戻る
              </button>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}

export default function ClipPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 text-slate-400 p-8 text-center text-xs font-mono">LOADING BATTLE HUD...</div>}>
      <ClipBattleInner />
    </Suspense>
  );
}