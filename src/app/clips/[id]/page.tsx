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
    return 1.5;
  }
  if (
    (p === 'fire' && b === 'water') ||
    (p === 'water' && b === 'wind') ||
    (p === 'wind' && b === 'fire')
  ) {
    return 0.7;
  }
  return 1.0;
};

function ClipBattleInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = params?.id as string;

  const speedParam = parseFloat(searchParams.get('speed') || '1.0');

  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  const [clip, setClip] = useState<any>(null);
  const [targetMonster, setTargetMonster] = useState<Monster | null>(null);
  const [partyMonsters, setPartyMonsters] = useState<PartyMonster[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [clozeItems, setClozeItems] = useState<ClozeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [playerMaxHp, setPlayerMaxHp] = useState(1000);
  const [playerHp, setPlayerHp] = useState(1000);
  const [playerBaseAtk, setPlayerAtk] = useState(100);

  const [bossMaxHp, setBossMaxHp] = useState(5000);
  const [bossHp, setBossHp] = useState(5000);
  const [bossAtk, setBossAtk] = useState(120);

  const [comboCount, setComboCount] = useState(0);
  const [activeSegIndex, setActiveSegIndex] = useState(0);
  const [isAwakened, setIsAwakened] = useState(false);
  const [clearedWaves, setClearedWaves] = useState<Record<string, boolean>>({});

  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, { isCorrect: boolean; score: number; answer: string }>>({});

  const [damagePopup, setDamagePopup] = useState<number | null>(null);
  const [isAttackingAnim, setIsAttackingAnim] = useState(false);
  const [skillMessage, setSkillMessage] = useState<string | null>(null);

  const [seekToTime, setSeekToTime] = useState<number | null>(null);
  const [hintCharges, setHintCharges] = useState(0);

  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isContinueModalOpen, setIsContinueModalOpen] = useState(false);
  const [isGameOverModalOpen, setIsGameOverModalOpen] = useState(false);
  const [dropResult, setDropResult] = useState<any>(null);
  const [isSubmittingSession, setIsSubmittingSession] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const { url: signedUrl } = useSignedUrl(signedIn ? id : null, 'video');
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSignedIn(!!data.session);
    });
  }, [supabase]);

  useEffect(() => {
    if (!id || signedIn === null) return;

    if (!signedIn) {
      setLoading(false);
      return;
    }

    async function fetchData() {
      setLoading(true);
      setErrorMsg(null);

      try {
        const { data: { user }, error: userErr } = await supabase.auth.getUser();
        if (userErr || !user) {
          setSignedIn(false);
          return;
        }

        const { data: clipData, error: clipErr } = await supabase
          .from('clips')
          .select('*, videos(youtube_id, title), monsters(*)')
          .eq('id', id)
          .maybeSingle();

        if (clipErr) throw clipErr;

        if (!clipData) {
          setErrorMsg('指定されたクリップが見つかりませんでした。');
          return;
        }

        setClip(clipData);

        let boss = clipData.monsters;
        if (!boss) {
          const { data: allMonsters } = await supabase.from('monsters').select('*');
          if (allMonsters && allMonsters.length > 0) {
            boss = allMonsters[Math.floor(Math.random() * allMonsters.length)];
          }
        }
        setTargetMonster(boss);

        // 難易度ティアごとの敵ステータス調整倍率（プレイヤーの総ダメージ量に合わせて大幅調整）
        const tier = clipData.difficulty_tier || '中級';
        const dScore = clipData.difficulty_score || 50;

        const tierMultMap: Record<string, { hp: number; atk: number }> = {
          '初級': { hp: 0.08, atk: 0.15 },
          '中級': { hp: 0.18, atk: 0.25 },
          '上級': { hp: 0.30, atk: 0.40 },  // 👈 HP 1,500〜2,100前後に抑え、★2パーティで撃破可能化
          '超上級': { hp: 0.65, atk: 0.80 },
          '超絶': { hp: 1.20, atk: 1.20 },
        };

        const mult = tierMultMap[tier] || { hp: 0.30, atk: 0.40 };
        const baseHp = dScore * 100 + (boss?.rarity || 1) * 500;
        const baseAtk = dScore * 1.2 + (boss?.rarity || 1) * 20;

        const bMaxHp = Math.max(300, Math.round(baseHp * mult.hp));
        const bAtk = Math.max(20, Math.round(baseAtk * mult.atk));

        setBossMaxHp(bMaxHp);
        setBossHp(bMaxHp);
        setBossAtk(bAtk);

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
            if (!pm.monster) return;
            gutSum += pm.monster.stat_gut || 50;
            focSum += pm.monster.stat_foc || 50;
            intSum += pm.monster.stat_int || 50;
            vocSum += pm.monster.stat_voc || 50;
          });

          const pHp = gutSum * 8 + focSum * 4 + 400;
          const pAtk = Math.round(intSum * 0.4 + vocSum * 0.3 + 30);

          setPlayerMaxHp(pHp);
          setPlayerHp(pHp);
          setPlayerAtk(pAtk);

          const leader = formatted.find((p) => p.slot === 1);
          if (leader && leader.monster) {
            setHintCharges(Math.min(5, Math.floor((leader.monster.stat_voc || 0) / 400)) + 1);
          }
        }

        const { data: segData, error: segErr } = await supabase
          .from('segments')
          .select('*')
          .eq('video_id', clipData.video_id)
          .gte('idx', clipData.seg_from ?? 0)
          .lte('idx', clipData.seg_to ?? 9999)
          .order('idx', { ascending: true });

        if (segErr) throw segErr;
        if (segData) setSegments(segData);

        const { data: itemData, error: itemErr } = await supabase
          .from('cloze_items')
          .select('*')
          .eq('clip_id', id);

        if (itemErr) throw itemErr;
        if (itemData) setClozeItems(itemData);

      } catch (err: any) {
        console.error('Fetch error:', err);
        setErrorMsg(`データ読み込みエラー: ${err.message || String(err)}`);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [id, signedIn, supabase]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthError(error.message);
    else setSignedIn(true);
  };

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
          setSkillMessage(`⚡【${pm.monster.name}】のスキルで空欄1つ完全回答！`);
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
      setSkillMessage(`⚡【${pm.monster.name}】のスキルで頭文字を解放！`);
    }

    if (effectApplied) {
      setUserAnswers(newAnswers);
      setPartyMonsters((prev) =>
        prev.map((p) => (p.slot === slotIdx ? { ...p, used: true } : p))
      );
    }
  };

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

    setIsAttackingAnim(true);
    setDamagePopup(damageToBoss);

    setTimeout(() => {
      setIsAttackingAnim(false);
      const newBossHp = Math.max(0, bossHp - damageToBoss);
      setBossHp(newBossHp);

      setTimeout(() => {
        setDamagePopup(null);
      }, 1000);

      const bossDamage = Math.round(bossAtk * (1.0 - roundAccuracy * 0.5));
      const newPlayerHp = Math.max(0, playerHp - bossDamage);
      setPlayerHp(newPlayerHp);

      if (newPlayerHp <= 0) {
        setIsContinueModalOpen(true);
        return;
      }

      setSaveMessage(null);
      setIsReviewModalOpen(true);

    }, 400);
  };

  const handleProceedNextRound = () => {
    setIsReviewModalOpen(false);

    if (activeSegIndex < segments.length - 1) {
      const nextIdx = activeSegIndex + 1;
      setActiveSegIndex(nextIdx);
      setSeekToTime(segments[nextIdx].start_ms / 1000);
    } else {
      if (bossHp > bossMaxHp * 0.5) {
        setIsGameOverModalOpen(true);
      } else {
        setIsAwakened(true);
      }
    }
  };

  const handleSaveMistakes = async () => {
    const currentSeg = segments[activeSegIndex];
    if (!currentSeg) return;

    const words = (currentSeg.corrected_text || currentSeg.text).split(' ');
    const segItems = clozeItems.filter((it) => it.segment_id === currentSeg.id);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return;

    let savedCount = 0;
    for (let wIdx = 0; wIdx < words.length; wIdx++) {
      const key = `${currentSeg.id}-${wIdx}`;
      const res = results[key];

      if (res && !res.isCorrect) {
        const item = segItems.find((it) => it.word_from === wIdx);
        await supabase.from('attempts').insert({
          owner_id: user.id,
          clip_id: id,
          segment_id: currentSeg.id,
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
      setSaveMessage('🎉 全問正解です！保存する誤答はありません。');
    }
  };

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
    const finalDamage = Math.round(playerBaseAtk * (rawAccuracy / 100) * 4.0);

    setIsAttackingAnim(true);
    setDamagePopup(finalDamage);

    setTimeout(async () => {
      setIsAttackingAnim(false);
      const finalBossHp = Math.max(0, bossHp - finalDamage);
      setBossHp(finalBossHp);

      setTimeout(() => setDamagePopup(null), 1000);

      if (finalBossHp > 0) {
        setIsGameOverModalOpen(true);
        setIsSubmittingSession(false);
        return;
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {

          const spdBonus = speedParam >= 1.5 ? 2 : 0;
          const diffBonus = clip?.difficulty_tier === '超絶' ? 5 : 0;
          const earnedRp = 10 + spdBonus + diffBonus;

          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: currentProf } = await supabase
              .from('profiles')
              .select('romance_points')
              .eq('id', user.id)
              .maybeSingle();

            const updatedRp = (currentProf?.romance_points || 0) + earnedRp;
            await supabase
              .from('profiles')
              .upsert({ id: user.id, romance_points: updatedRp });
          }

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
    }, 400);
  };

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
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (signedIn === false) {
    return (
      <form onSubmit={handleSignIn} className="max-w-sm mx-auto my-16 p-6 space-y-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl text-white">
        <h2 className="text-xl font-black text-center tracking-wide">PLAYER LOGIN</h2>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="メールアドレス" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm focus:border-cyan-500 focus:outline-none" required />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="パスワード" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm focus:border-cyan-500 focus:outline-none" required />
        <button className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:opacity-90 text-white py-3 rounded-xl font-black text-sm shadow-lg transition-all">ログイン</button>
        {authError && <p className="text-red-400 text-xs text-center font-mono">{authError}</p>}
      </form>
    );
  }

  if (loading) return <div className="min-h-screen bg-slate-950 text-slate-400 p-8 text-center text-xs font-mono">LOADING BATTLE HUD...</div>;

  if (errorMsg) {
    return (
      <div className="min-h-screen bg-slate-950 text-white p-8 flex flex-col items-center justify-center space-y-4 text-center">
        <p className="text-sm text-red-400 font-mono">{errorMsg}</p>
        <Link href="/" className="px-4 py-2 bg-slate-800 text-cyan-400 rounded-xl text-xs font-bold">
          ◀ ダッシュボードに戻る
        </Link>
      </div>
    );
  }

  const currentSeg = segments[activeSegIndex];

  const clipStartMs = clip?.start_ms ?? (segments[0]?.start_ms || 0);
  const relSegStart = currentSeg ? Math.max(0, (currentSeg.start_ms - clipStartMs) / 1000) : null;
  const relSegEnd = currentSeg ? Math.max(0, (currentSeg.end_ms - clipStartMs) / 1000) : null;
  const relSeekTo = seekToTime !== null && seekToTime !== undefined ? Math.max(0, (seekToTime * 1000 - clipStartMs) / 1000) : null;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 font-sans p-2 sm:p-4 flex flex-col justify-between max-w-md mx-auto relative overflow-hidden select-none">
      
      {/* 1. ヘッダー */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-2">
        <h1 className="text-xs font-black text-white truncate max-w-[200px]">
          {clip?.label || 'ダンジョン'}
        </h1>
        <Link href={`/clips/${id}/prepare`} className="text-[10px] text-cyan-400 font-bold hover:underline">
          ◀ 撤退
        </Link>
      </div>

      {/* 2. 巨大敵ボス表示 ＆ HPバー */}
      {targetMonster && (
        <div className="relative bg-slate-900/90 border border-slate-800 rounded-2xl p-3 shadow-2xl flex flex-col items-center space-y-2 overflow-hidden">
          
          {isAttackingAnim && (
            <div className="absolute inset-0 bg-cyan-400/40 backdrop-blur-[1px] z-30 flex items-center justify-center animate-ping" />
          )}

          {damagePopup !== null && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 text-4xl font-black text-red-500 font-mono drop-shadow-[0_4px_8px_rgba(0,0,0,0.9)] animate-bounce">
              -{damagePopup}
            </div>
          )}

          <div className="relative w-36 h-36 bg-slate-950 rounded-2xl overflow-hidden border-2 border-red-500/50 shadow-xl my-0.5">
            <img
              src={targetMonster.image_url}
              alt=""
              className={`w-full h-full object-cover object-top transition-all duration-300 ${isAttackingAnim ? "scale-95 filter brightness-150" : ""}`}
            />
            <div className="absolute top-1.5 right-1.5 text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-red-950 text-red-400 border border-red-800 shadow">
              {targetMonster.element} {isAwakened && "🔥AWAKENED"}
            </div>
          </div>

          <div className="w-full space-y-0.5 z-10">
            <div className="flex justify-between items-center text-[9px] font-mono text-slate-400">
              <span>BOSS HP</span>
              <span className="text-red-400 font-bold">{bossHp} / {bossMaxHp}</span>
            </div>
            <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-gradient-to-r from-red-600 via-orange-500 to-amber-400 transition-all duration-300"
                style={{ width: `${Math.max(0, (bossHp / bossMaxHp) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* 3. 味方パーティ ＆ プレイヤーHPバー */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-2.5 space-y-2 shadow-xl my-2">
        <div className="flex justify-between items-center text-[10px] font-mono">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-cyan-300">⚔️ 味方パーティ</span>
            {comboCount > 0 && (
              <span className="bg-amber-500 text-black text-[9px] font-black px-1.5 py-0.2 rounded-full animate-bounce">
                {comboCount} COMBO!
              </span>
            )}
          </div>
          <div>
            <span className="text-slate-400">HP: </span>
            <strong className="text-green-400">{playerHp} / {playerMaxHp}</strong>
          </div>
        </div>

        <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-green-400 transition-all duration-300"
            style={{ width: `${Math.max(0, (playerHp / playerMaxHp) * 100)}%` }}
          />
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {partyMonsters.map((p) => (
            <button
              key={p.slot}
              disabled={p.used}
              onClick={() => handleActivateMonsterSkill(p.slot)}
              className={`p-1.5 rounded-xl border text-center transition-all flex items-center gap-1.5 ${
                p.used
                  ? "bg-slate-950 border-slate-800 opacity-40 grayscale cursor-not-allowed"
                  : "bg-indigo-950/80 border-indigo-600 hover:border-cyan-400 active:scale-95 cursor-pointer shadow"
              }`}
            >
              <img src={p.monster?.image_url} alt="" className="w-8 h-8 object-cover rounded-lg border border-indigo-500/40 shrink-0" />
              <div className="text-left min-w-0 flex-1">
                <div className="text-[9px] font-bold text-slate-200 truncate">{p.monster?.name}</div>
                <div className={`text-[8px] font-black px-1 py-0.2 rounded inline-block ${p.used ? "bg-slate-800 text-slate-500" : "bg-cyan-500 text-black"}`}>
                  {p.used ? "USED" : "SKILL"}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {skillMessage && (
        <div className="p-1.5 bg-cyan-950 border border-cyan-500/50 text-cyan-200 text-[10px] font-black rounded-xl text-center animate-bounce shadow">
          {skillMessage}
        </div>
      )}

      {/* 4. 動画 ＆ 穴埋め入力エリア */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 shadow-2xl space-y-3">
        
        {signedUrl && currentSeg && (
          <ClipPlayer
            src={signedUrl}
            seekToTime={relSeekTo}
            playbackSpeed={speedParam}
            segmentStart={relSegStart}
            segmentEnd={relSegEnd}
          />
        )}

        {!isAwakened && currentSeg && (
          <div className="space-y-3">
            <div className="flex justify-between items-center text-xs font-mono border-b border-slate-800 pb-1.5">
              <span className="bg-cyan-500 text-black font-black px-2 py-0.5 rounded-full text-[10px]">
                WAVE #{ (activeSegIndex + 1).toString().padStart(2, '0') } / { segments.length }
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                ({ ((currentSeg.start_ms || 0) / 1000).toFixed(1) }s - { ((currentSeg.end_ms || 0) / 1000).toFixed(1) }s)
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5 items-center font-mono py-1 min-h-[50px] justify-center">
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
                          onKeyDown={(e) => { if (e.key === 'Enter') handleAttackRound(); }}
                          placeholder="---"
                          className={`w-20 border-b-2 px-1 py-0.5 text-center text-xs font-black font-mono focus:outline-none transition-colors ${
                            res ? (res.isCorrect ? 'border-green-500 bg-green-950 text-green-300' : 'border-red-500 bg-red-950 text-red-300') : 'border-cyan-500 bg-slate-950 text-white'
                          }`}
                        />
                        {hintCharges > 0 && !res && (
                          <button
                            onClick={() => handleUseHint(currentSeg.id, wIdx, targetAnswer)}
                            className="absolute -top-2 -right-2 bg-amber-400 text-black text-[8px] font-black w-3.5 h-3.5 rounded-full flex items-center justify-center shadow"
                            title="ヒント"
                          >
                            💡
                          </button>
                        )}
                      </div>
                      {res && (
                        <span className={`text-[9px] font-bold ${res.isCorrect ? 'text-green-400' : 'text-red-400'}`}>
                          {res.isCorrect ? '○' : `× ${res.answer}`}
                        </span>
                      )}
                    </div>
                  );
                }

                return (
                  <span key={wIdx} className="text-xs font-bold text-slate-200">
                    {word}
                  </span>
                );
              })}
            </div>

            <button
              onClick={handleAttackRound}
              className="w-full py-2.5 bg-gradient-to-r from-red-600 via-orange-600 to-amber-600 hover:opacity-95 active:translate-y-0.5 text-white font-black text-xs rounded-xl shadow-lg border border-orange-400/30 transition-all uppercase tracking-widest flex items-center justify-center gap-1"
            >
              <span>⚔️ 攻 撃 (回答判定 / Enter)</span>
            </button>
          </div>
        )}

        {isAwakened && (
          <div className="text-center space-y-2 py-2">
            <span className="bg-red-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full uppercase animate-bounce inline-block">
              🔥 FINAL WAVE - BOSS AWAKENED
            </span>
            <button
              onClick={handleFinalAttack}
              disabled={isSubmittingSession}
              className="w-full py-3 bg-gradient-to-r from-red-600 via-purple-600 to-indigo-600 hover:opacity-95 active:translate-y-0.5 text-white font-black text-xs rounded-xl shadow-xl border border-red-400/30 transition-all uppercase tracking-widest"
            >
              <span>🔥 ト ー タ ル ア タ ッ ク （最終判定）</span>
            </button>
          </div>
        )}

      </div>

      {/* 5. ラウンド解説モーダル */}
      {isReviewModalOpen && currentSeg && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 z-50 animate-fadeIn">
          <div className="bg-slate-900 border-2 border-cyan-500/80 rounded-2xl p-4 max-w-xs sm:max-w-sm w-full space-y-3 text-white shadow-2xl font-sans max-h-[90vh] overflow-y-auto min-w-0">
            <div className="text-center space-y-1 border-b border-slate-800 pb-2">
              <span className="bg-cyan-500 text-black text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase">
                ROUND #{activeSegIndex + 1} RESULT
              </span>
              <h3 className="text-sm font-black text-white">ラウンド結果 ＆ 解説</h3>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs font-bold leading-relaxed text-slate-200 flex flex-wrap gap-1 items-center font-mono w-full min-w-0 break-words">
              { (currentSeg.corrected_text || currentSeg.text).split(' ').map((word, wIdx) => {
                const segItems = clozeItems.filter((it) => it.segment_id === currentSeg.id);
                const item = segItems.find((it) => it.word_from === wIdx);
                const isTarget = segItems.length > 0 ? !!item : true;
                const key = `${currentSeg.id}-${wIdx}`;
                const res = results[key];

                if (isTarget && res) {
                  return (
                    <span key={wIdx} className={`px-1 py-0.5 rounded font-black border text-[11px] inline-block break-all ${res.isCorrect ? 'text-green-400 bg-green-950/80 border-green-800' : 'text-red-400 bg-red-950/80 border-red-800 underline'}`}>
                      {res.answer}
                    </span>
                  );
                }
                return <span key={wIdx} className="inline-block break-all">{word}</span>;
              })}
            </div>

            {currentSeg.ja_text && (
              <div className="bg-slate-800/50 text-slate-200 p-2.5 rounded-xl text-xs leading-relaxed border border-slate-700 break-words">
                <span className="text-amber-400 font-bold mr-1">💡 訳:</span> 
                {currentSeg.ja_text}
              </div>
            )}

            <div className="bg-slate-950 p-2.5 rounded-xl space-y-1.5 border border-slate-800 text-xs font-mono max-h-32 overflow-y-auto break-all min-w-0">
              <div className="text-[10px] text-slate-400 font-bold border-b border-slate-800 pb-1">
                【単語入力チェック】
              </div>
              { (currentSeg.corrected_text || currentSeg.text).split(' ').map((word, wIdx) => {
                const segItems = clozeItems.filter((it) => it.segment_id === currentSeg.id);
                const key = `${currentSeg.id}-${wIdx}`;
                const item = segItems.find((it) => it.word_from === wIdx);
                const res = results[key];
                const isTarget = segItems.length > 0 ? !!item : true;

                if (!isTarget) return null;

                return (
                  <div key={wIdx} className="flex justify-between items-center text-[10px] py-0.5 gap-2 break-all">
                    <span className="text-slate-400 shrink-0">#Word {wIdx + 1}:</span>
                    {res ? (
                      res.isCorrect ? (
                        <span className="text-green-400 font-bold break-all text-right">○ {res.answer}</span>
                      ) : (
                        <span className="text-red-400 font-bold break-all text-right">
                          × {userAnswers[key] || "（未入力）"} ➔ <u className="underline">{res.answer}</u>
                        </span>
                      )
                    ) : null}
                  </div>
                );
              })}
            </div>

            {currentSeg.skeletons && currentSeg.skeletons.length > 0 && (
              <div className="space-y-1">
                {currentSeg.skeletons.map((sk, idx) => (
                  <div key={idx} className="bg-blue-950/80 text-blue-300 p-2 rounded-lg font-mono text-[10px] break-words">
                    💡 構文: <strong>{sk.text}</strong> ({sk.label})
                  </div>
                ))}
              </div>
            )}

            {saveMessage && (
              <p className="text-[10px] text-cyan-300 font-mono text-center bg-cyan-950 p-2 rounded-lg border border-cyan-800 break-words">
                {saveMessage}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSaveMistakes}
                className="flex-1 py-2.5 bg-purple-900/80 hover:bg-purple-800 text-purple-200 font-bold text-xs rounded-xl border border-purple-600 transition-colors"
              >
                💾 ノート保存
              </button>
              <button
                onClick={handleProceedNextRound}
                className="flex-1 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:opacity-90 text-white font-black text-xs rounded-xl shadow-lg transition-all"
              >
                次へ進む ➔
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 💎 コンティニューモーダル */}
      {isContinueModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-slate-900 border-2 border-red-500 rounded-2xl p-5 max-w-xs w-full text-center space-y-3 text-white">
            <div className="text-2xl animate-bounce">💀</div>
            <h3 className="text-base font-black text-red-400">プレイヤー全滅...</h3>
            <p className="text-xs text-slate-300 font-mono">
              HPが0になりました。オーブ1個でHP全回復して復活しますか？
            </p>
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setIsContinueModalOpen(false); setIsGameOverModalOpen(true); }} className="flex-1 py-2 bg-slate-800 text-slate-400 rounded-xl text-xs font-bold">
                あきらめる
              </button>
              <button onClick={handleContinue} className="flex-1 py-2 bg-cyan-600 text-white font-black text-xs rounded-xl shadow">
                💎 復活する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🚨 ゲームオーバーモーダル */}
      {isGameOverModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-xs w-full text-center space-y-3 text-white">
            <div className="text-2xl">💦</div>
            <h3 className="text-base font-black text-slate-300">GAME OVER</h3>
            <p className="text-xs text-slate-400 font-mono">ボスを撃破できませんでした。</p>
            <button onClick={() => router.push(`/clips/${id}/prepare`)} className="w-full py-2 bg-slate-800 text-white rounded-xl text-xs font-bold">
              出撃準備へ戻る
            </button>
          </div>
        </div>
      )}

      {/* 🏆 クエストクリア */}
      {dropResult && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-slate-900 border-2 border-emerald-500 text-white p-5 rounded-2xl max-w-xs w-full text-center space-y-3 shadow-2xl">
            <div className="text-2xl animate-bounce">🏆</div>
            <h3 className="text-base font-black text-emerald-400">QUEST CLEAR!</h3>
            {dropResult.isDropped ? (
              <div className="space-y-2">
                <img src={dropResult.monster.image_url} alt="" className="w-20 h-20 object-cover rounded-2xl mx-auto border-2 border-emerald-400 shadow" />
                <div className="text-xs font-black">{dropResult.monster.name} GET!</div>
                <div className="text-[10px] text-cyan-400 font-mono">☘️ ラック {dropResult.newLuck}</div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 font-mono">ドロップならず... (確率: {dropResult.dropRateUsed}%)</p>
            )}
            <button onClick={() => router.push(`/clips/${id}/prepare`)} className="w-full py-2 bg-emerald-600 text-white rounded-xl text-xs font-black">
              確認画面へ戻る
            </button>
          </div>
        </div>
      )}

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