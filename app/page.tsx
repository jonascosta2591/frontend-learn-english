"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import FlashcardModal from "./components/FlashcardModal";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

type Score = "correct" | "partial" | "incorrect";

interface EvalResult {
  score: Score;
  hasSpellingErrors: boolean;
  feedback: string;
  xp: number;
  correctedText?: string;
}

interface WordTooltip {
  word: string;
  translation: string;
  phonetic?: string;
  partOfSpeech?: string;
  loading: boolean;
  saved: boolean;
  saving: boolean;
  x: number;
  y: number;
}

const XP_MAX = 100;

type CEFRLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

const levelConfig: Record<CEFRLevel, { color: string; bg: string; border: string; desc: string }> = {
  A1: { color: "text-green-400",  bg: "bg-green-500/20",  border: "border-green-500/50",  desc: "Beginner" },
  A2: { color: "text-lime-400",   bg: "bg-lime-500/20",   border: "border-lime-500/50",   desc: "Elementary" },
  B1: { color: "text-yellow-400", bg: "bg-yellow-500/20", border: "border-yellow-500/50", desc: "Intermediate" },
  B2: { color: "text-orange-400", bg: "bg-orange-500/20", border: "border-orange-500/50", desc: "Upper-Inter." },
  C1: { color: "text-rose-400",   bg: "bg-rose-500/20",   border: "border-rose-500/50",   desc: "Advanced" },
  C2: { color: "text-purple-400", bg: "bg-purple-500/20", border: "border-purple-500/50", desc: "Mastery" },
};

const scoreConfig: Record<Score, { label: string; color: string; emoji: string }> = {
  correct: { label: "Correct!", color: "text-emerald-400", emoji: "🎯" },
  partial: { label: "Almost there!", color: "text-yellow-400", emoji: "🤔" },
  incorrect: { label: "Not quite...", color: "text-red-400", emoji: "❌" },
};

// Highlights words that differ between original and corrected text
function DiffText({ original, corrected }: { original: string; corrected: string }) {
  const origWords = original.trim().split(/\s+/);
  const corrWords = corrected.trim().split(/\s+/);

  // Simple LCS-based diff: mark words added/changed in corrected
  const result: { word: string; changed: boolean }[] = [];
  let i = 0, j = 0;
  while (j < corrWords.length) {
    if (i < origWords.length && origWords[i].toLowerCase().replace(/[^a-z]/g, "") === corrWords[j].toLowerCase().replace(/[^a-z]/g, "")) {
      result.push({ word: corrWords[j], changed: false });
      i++; j++;
    } else {
      result.push({ word: corrWords[j], changed: true });
      j++;
      // try to skip one original word to re-sync
      if (i < origWords.length) i++;
    }
  }

  return (
    <p className="text-sm leading-relaxed">
      {result.map((token, idx) =>
        token.changed ? (
          <mark key={idx} className="bg-emerald-500/30 text-emerald-300 rounded px-0.5 mx-0.5 not-italic font-semibold">
            {token.word}
          </mark>
        ) : (
          <span key={idx} className="text-gray-300">{token.word}{" "}</span>
        )
      )}
    </p>
  );
}

export default function Home() {
  const [text, setText] = useState("");
  const [topic, setTopic] = useState("");
  const [loadingText, setLoadingText] = useState(false);
  const [explanation, setExplanation] = useState("");
  const [evaluating, setEvaluating] = useState(false);
  const [result, setResult] = useState<EvalResult | null>(null);
  const [totalXP, setTotalXP] = useState(0);
  const [level, setLevel] = useState(1);
  const [xpInLevel, setXpInLevel] = useState(0);
  const [showXPAnim, setShowXPAnim] = useState(false);
  const [gainedXP, setGainedXP] = useState(0);
  const [streak, setStreak] = useState(0);
  const [roundCount, setRoundCount] = useState(0);
  const [cefrLevel, setCefrLevel] = useState<CEFRLevel>("B1");
  const [tooltip, setTooltip] = useState<WordTooltip | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const translationCache = useRef<Record<string, { translation: string; phonetic?: string; partOfSpeech?: string }>>({});
  const [showFlashcards, setShowFlashcards] = useState(false);
  const [dueCount, setDueCount] = useState(0);

  const fetchText = useCallback(async (level?: CEFRLevel) => {
    setLoadingText(true);
    setResult(null);
    setExplanation("");
    setShowXPAnim(false);
    setTooltip(null);
    try {
      const res = await fetch(`${API}/text?level=${level ?? cefrLevel}`);
      const data = await res.json();
      setText(data.text);
      setTopic(data.topic);
    } catch {
      setText("Failed to load text. Make sure the backend is running.");
    } finally {
      setLoadingText(false);
    }
  }, [cefrLevel]);

  useEffect(() => { fetchText(); }, [fetchText]);

  // Load XP from DB on mount
  useEffect(() => {
    fetch(`${API}/xp`).then(r => r.json()).then(d => {
      setTotalXP(d.xp);
    }).catch(() => {});
  }, []);

  // Fetch due flashcard count periodically
  const fetchDueCount = useCallback(() => {
    fetch(`${API}/words/due`).then(r => r.json()).then((words: unknown[]) => {
      setDueCount(words.length);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    fetchDueCount();
    const interval = setInterval(fetchDueCount, 60000);
    return () => clearInterval(interval);
  }, [fetchDueCount]);

  useEffect(() => {
    const lvl = Math.floor(totalXP / XP_MAX) + 1;
    const xpIn = totalXP % XP_MAX;
    setLevel(lvl);
    setXpInLevel(xpIn);
  }, [totalXP]);

  const handleSubmit = async () => {
    if (!explanation.trim() || explanation.trim().length < 10) return;
    setEvaluating(true);
    try {
      const res = await fetch(`${API}/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ originalText: text, userExplanation: explanation }),
      });
      const data: EvalResult = await res.json();
      setResult(data);
      setRoundCount((r) => r + 1);

      if (data.xp > 0) {
        setGainedXP(data.xp);
        setShowXPAnim(true);
        setTotalXP((prev) => prev + data.xp);
        // Persist XP to DB
        fetch(`${API}/xp/add`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: data.xp }),
        }).then(r => r.json()).then(d => setTotalXP(d.xp)).catch(() => {});
        if (data.score === "correct") setStreak((s) => s + 1);
        else setStreak(0);
        setTimeout(() => setShowXPAnim(false), 2000);
      } else {
        setStreak(0);
      }
    } catch {
      alert("Error evaluating. Check if backend is running.");
    } finally {
      setEvaluating(false);
    }
  };

  const handleWordClick = async (word: string, e: React.MouseEvent) => {
    const clean = word.replace(/[^a-zA-Z'-]/g, "").toLowerCase();
    if (!clean) return;

    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top;

    // Show cached result instantly
    if (translationCache.current[clean]) {
      setTooltip({ word: clean, ...translationCache.current[clean], loading: false, saved: false, saving: false, x, y });
      return;
    }

    setTooltip({ word: clean, translation: "", loading: true, saved: false, saving: false, x, y });

    try {
      const res = await fetch(`${API}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: clean, save: false }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      translationCache.current[clean] = {
        translation: data.translation,
        phonetic: data.phonetic,
        partOfSpeech: data.partOfSpeech,
      };
      setTooltip({ word: clean, ...translationCache.current[clean], loading: false, saved: false, saving: false, x, y });
    } catch (err) {
      console.error("Translation error:", err);
      setTooltip({ word: clean, translation: "Erro ao traduzir", loading: false, saved: false, saving: false, x, y });
    }
  };

  const handleAddToFlashcards = async () => {
    if (!tooltip || tooltip.saved || tooltip.saving || tooltip.loading) return;
    setTooltip(t => t ? { ...t, saving: true } : t);
    try {
      await fetch(`${API}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: tooltip.word, save: true }),
      });
      setTooltip(t => t ? { ...t, saved: true, saving: false } : t);
    } catch {
      setTooltip(t => t ? { ...t, saving: false } : t);
    }
  };

  // Close tooltip on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        setTooltip(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleFlashcardXP = useCallback((amount: number) => {
    fetch(`${API}/xp/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount }),
    }).then(r => r.json()).then(d => setTotalXP(d.xp)).catch(() => {});
  }, []);

  const progressPercent = (xpInLevel / XP_MAX) * 100;

  return (
    <main className="min-h-screen bg-[#0f0f1a] text-white flex flex-col items-center px-4 py-10">
      {/* Header */}
      <div className="w-full max-w-2xl mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
              ReadXP
            </h1>
            <p className="text-gray-400 text-sm mt-1">Read. Understand. Earn XP.</p>
          </div>
          <div className="flex items-center gap-4">
            {streak >= 2 && (
              <div className="flex items-center gap-1 bg-orange-500/20 border border-orange-500/40 rounded-full px-3 py-1">
                <span className="text-orange-400 text-sm font-semibold">🔥 {streak} streak</span>
              </div>
            )}
            {/* Flashcard button */}
            <button
              onClick={() => { setShowFlashcards(true); fetchDueCount(); }}
              className="relative flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-violet-500/40 text-gray-300 hover:text-white px-3 py-2 rounded-xl transition-all text-sm font-semibold"
            >
              🃏 Flashcards
              {dueCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-orange-500 text-white text-[10px] font-black rounded-full w-5 h-5 flex items-center justify-center">
                  {dueCount > 9 ? "9+" : dueCount}
                </span>
              )}
            </button>
            <Link
              href="/practice"
              className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-cyan-500/40 text-gray-300 hover:text-white px-3 py-2 rounded-xl transition-all text-sm font-semibold"
            >
              🎯 Practice
            </Link>
            <Link
              href="/dialogue"
              className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-cyan-500/40 text-gray-300 hover:text-white px-3 py-2 rounded-xl transition-all text-sm font-semibold"
            >
              💬 Dialogue
            </Link>
            <Link
              href="/sentences"
              className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-cyan-500/40 text-gray-300 hover:text-white px-3 py-2 rounded-xl transition-all text-sm font-semibold"
            >
              ✨ i+1
            </Link>
            <Link
              href="/game-comparation"
              className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-cyan-500/40 text-gray-300 hover:text-white px-3 py-2 rounded-xl transition-all text-sm font-semibold"
            >
              🎮 Match
            </Link>
            <div className="text-right">
              <div className="text-xs text-gray-400">Round {roundCount}</div>
              <div className="text-lg font-bold text-violet-300">{totalXP} XP</div>
            </div>
          </div>
        </div>

        {/* Level + Progress Bar */}
        <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-semibold text-violet-300">Level {level}</span>
            <span className="text-xs text-gray-400">{xpInLevel} / {XP_MAX} XP</span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-3 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-500 transition-all duration-700"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* CEFR Level Selector */}
      <div className="w-full max-w-2xl mb-6">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-3">Text difficulty</p>
          <div className="grid grid-cols-6 gap-2">
            {(Object.keys(levelConfig) as CEFRLevel[]).map((lvl) => {
              const cfg = levelConfig[lvl];
              const active = cefrLevel === lvl;
              return (
                <button
                  key={lvl}
                  onClick={() => {
                    setCefrLevel(lvl);
                    fetchText(lvl);
                  }}
                  disabled={loadingText}
                  className={`flex flex-col items-center py-2 px-1 rounded-xl border transition-all text-xs font-bold disabled:opacity-50 ${
                    active
                      ? `${cfg.bg} ${cfg.border} ${cfg.color}`
                      : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <span className="text-sm font-black">{lvl}</span>
                  <span className={`text-[10px] font-normal mt-0.5 ${active ? cfg.color : "text-gray-500"}`}>
                    {levelConfig[lvl].desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Text Card */}
      <div className="w-full max-w-2xl mb-6 animate-fade-in">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 relative overflow-hidden glow-purple">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-violet-500 to-cyan-500" />
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Read this</span>
              <span className={`text-xs font-bold border rounded-full px-2 py-0.5 ${levelConfig[cefrLevel].color} ${levelConfig[cefrLevel].bg} ${levelConfig[cefrLevel].border}`}>
                {cefrLevel}
              </span>
              {topic && (
                <span className="text-xs bg-violet-500/20 text-violet-300 border border-violet-500/30 rounded-full px-2 py-0.5 capitalize">
                  {topic}
                </span>
              )}
            </div>
            <button
              onClick={() => fetchText(cefrLevel)}
              disabled={loadingText}
              className="text-xs text-gray-400 hover:text-white transition-colors flex items-center gap-1 disabled:opacity-50"
            >
              {loadingText ? "Loading..." : "↻ New text"}
            </button>
          </div>

          {loadingText ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-4 bg-white/10 rounded animate-pulse" style={{ width: `${85 + i * 3}%` }} />
              ))}
            </div>
          ) : (
            <p className="text-gray-100 leading-relaxed text-base leading-8">
              {text.split(/(\s+)/).map((token, i) =>
                /\s+/.test(token) ? (
                  <span key={i}>{token}</span>
                ) : (
                  <span
                    key={i}
                    onClick={(e) => handleWordClick(token, e)}
                    className="cursor-pointer hover:text-cyan-300 hover:underline decoration-dotted underline-offset-4 transition-colors rounded px-0.5"
                  >
                    {token}
                  </span>
                )
              )}
            </p>
          )}
        </div>
      </div>

      {/* Input Area */}
      {!loadingText && text && (
        <div className="w-full max-w-2xl mb-6 animate-fade-in">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <label className="block text-sm font-semibold text-gray-300 mb-3">
              💬 What is this text about? Explain in English:
            </label>
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              disabled={evaluating || !!result}
              placeholder="Write your explanation here... (at least 10 characters)"
              rows={4}
              className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder-gray-500 resize-none focus:outline-none focus:border-violet-500/60 focus:bg-white/8 transition-all text-sm disabled:opacity-60"
            />
            <div className="flex items-center justify-between mt-3">
              <span className="text-xs text-gray-500">{explanation.length} chars</span>
              {!result ? (
                <button
                  onClick={handleSubmit}
                  disabled={evaluating || explanation.trim().length < 10}
                  className="bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-6 py-2.5 rounded-xl transition-all text-sm"
                >
                  {evaluating ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Evaluating...
                    </span>
                  ) : "Submit →"}
                </button>
              ) : (
                <button
                  onClick={() => fetchText(cefrLevel)}
                  className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold px-6 py-2.5 rounded-xl transition-all text-sm"
                >
                  Next text →
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Result Card */}
      {result && (
        <div className="w-full max-w-2xl animate-fade-in">
          <div className={`rounded-2xl p-6 border ${
            result.score === "correct" ? "bg-emerald-500/10 border-emerald-500/30" :
            result.score === "partial" ? "bg-yellow-500/10 border-yellow-500/30" :
            "bg-red-500/10 border-red-500/30"
          }`}>
            <div className="flex items-start justify-between">
              <div>
                <div className={`text-xl font-bold ${scoreConfig[result.score].color} flex items-center gap-2`}>
                  <span>{scoreConfig[result.score].emoji}</span>
                  <span>{scoreConfig[result.score].label}</span>
                </div>
                <p className="text-gray-300 text-sm mt-2">{result.feedback}</p>
                {result.hasSpellingErrors && result.score === "correct" && (
                  <p className="text-yellow-400 text-xs mt-1">⚠️ Watch your spelling next time!</p>
                )}
              </div>
              <div className="text-right ml-4">
                <div className={`text-3xl font-black ${result.xp > 0 ? "text-violet-300" : "text-gray-500"}`}>
                  +{result.xp}
                </div>
                <div className="text-xs text-gray-400">XP earned</div>
              </div>
            </div>

            {/* XP breakdown */}
            <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-3 gap-3 text-center text-xs text-gray-400">
              <div className="bg-white/5 rounded-xl p-2">
                <div className="text-emerald-400 font-bold text-base">15 XP</div>
                <div>Perfect answer</div>
              </div>
              <div className="bg-white/5 rounded-xl p-2">
                <div className="text-yellow-400 font-bold text-base">5 XP</div>
                <div>Correct + spelling errors</div>
              </div>
              <div className="bg-white/5 rounded-xl p-2">
                <div className="text-orange-400 font-bold text-base">3 XP</div>
                <div>Partially correct</div>
              </div>
            </div>

            {/* Writing correction */}
            {result.correctedText && (
              <div className="mt-4 pt-4 border-t border-white/10">
                <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-3">✍️ Writing correction</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="bg-white/5 rounded-xl p-3">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Your answer</p>
                    <p className="text-gray-300 text-sm leading-relaxed">{explanation}</p>
                  </div>
                  <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3">
                    <p className="text-[10px] text-emerald-500 uppercase tracking-wider mb-2">Corrected</p>
                    <DiffText original={explanation} corrected={result.correctedText} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Flashcard Modal */}
      {showFlashcards && (
        <FlashcardModal
          onClose={() => { setShowFlashcards(false); fetchDueCount(); }}
          onXPEarned={handleFlashcardXP}
        />
      )}

      {/* Word Tooltip */}
      {tooltip && (
        <div
          ref={tooltipRef}
          className="fixed z-50 animate-fade-in"
          style={{ left: tooltip.x, top: tooltip.y - 8, transform: "translate(-50%, -100%)" }}
        >
          <div className="bg-[#1e1e30] border border-violet-500/40 rounded-xl shadow-2xl px-4 py-3 min-w-[140px] max-w-[220px]">
            <div className="flex items-center justify-between gap-3 mb-1">
              <span className="text-white font-bold text-sm">{tooltip.word}</span>
              {tooltip.partOfSpeech && (
                <span className="text-[10px] text-violet-400 bg-violet-500/20 rounded-full px-2 py-0.5 shrink-0">
                  {tooltip.partOfSpeech}
                </span>
              )}
            </div>
            {tooltip.phonetic && (
              <div className="text-gray-400 text-xs mb-1">{tooltip.phonetic}</div>
            )}
            {tooltip.loading ? (
              <div className="flex items-center gap-2 text-gray-400 text-xs">
                <span className="w-3 h-3 border border-violet-400/40 border-t-violet-400 rounded-full animate-spin" />
                Translating...
              </div>
            ) : (
              <>
                <div className="text-cyan-300 font-semibold text-sm mb-2">{tooltip.translation}</div>
                <button
                  onClick={handleAddToFlashcards}
                  disabled={tooltip.saved || tooltip.saving}
                  className={`w-full text-xs font-semibold py-1.5 rounded-lg transition-all ${
                    tooltip.saved
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-default"
                      : "bg-violet-600/40 hover:bg-violet-600/60 text-violet-200 border border-violet-500/30"
                  }`}
                >
                  {tooltip.saving ? "Saving..." : tooltip.saved ? "✓ Added to flashcards" : "+ Add to flashcards"}
                </button>
              </>
            )}
            {/* Arrow */}
            <div className="absolute left-1/2 -translate-x-1/2 bottom-0 translate-y-full w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-[#1e1e30]" />
          </div>
        </div>
      )}

      {/* XP Floating Animation */}
      {showXPAnim && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-50 animate-xp-pop">
          <div className="text-6xl font-black text-transparent bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text drop-shadow-2xl">
            +{gainedXP} XP
          </div>
        </div>
      )}
    </main>
  );
}
