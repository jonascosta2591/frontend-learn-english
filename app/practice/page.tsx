"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import FlashcardModal from "../components/FlashcardModal";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

type CEFRLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
type Score = "great" | "good" | "needs_work";

interface Question {
  question: string;
  hint: string;
  level: string;
  category?: string;
}

interface EvalResult {
  relevant: boolean;
  score: Score;
  feedback: string;
  correctedAnswer: string;
  xp: number;
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

const levelConfig: Record<CEFRLevel, { color: string; bg: string; border: string; desc: string }> = {
  A1: { color: "text-green-400",  bg: "bg-green-500/20",  border: "border-green-500/50",  desc: "Beginner" },
  A2: { color: "text-lime-400",   bg: "bg-lime-500/20",   border: "border-lime-500/50",   desc: "Elementary" },
  B1: { color: "text-yellow-400", bg: "bg-yellow-500/20", border: "border-yellow-500/50", desc: "Intermediate" },
  B2: { color: "text-orange-400", bg: "bg-orange-500/20", border: "border-orange-500/50", desc: "Upper-Inter." },
  C1: { color: "text-rose-400",   bg: "bg-rose-500/20",   border: "border-rose-500/50",   desc: "Advanced" },
  C2: { color: "text-purple-400", bg: "bg-purple-500/20", border: "border-purple-500/50", desc: "Mastery" },
};

const scoreConfig: Record<Score, { label: string; color: string; emoji: string }> = {
  great:      { label: "Great answer!", color: "text-emerald-400", emoji: "🌟" },
  good:       { label: "Good job!",     color: "text-cyan-400",    emoji: "👍" },
  needs_work: { label: "Keep trying!",  color: "text-orange-400",  emoji: "💪" },
};

function DiffText({ original, corrected }: { original: string; corrected: string }) {
  const origWords = original.trim().split(/\s+/);
  const corrWords = corrected.trim().split(/\s+/);
  const result: { word: string; changed: boolean }[] = [];
  let i = 0, j = 0;
  while (j < corrWords.length) {
    if (i < origWords.length && origWords[i].toLowerCase().replace(/[^a-z]/g, "") === corrWords[j].toLowerCase().replace(/[^a-z]/g, "")) {
      result.push({ word: corrWords[j], changed: false });
      i++; j++;
    } else {
      result.push({ word: corrWords[j], changed: true });
      j++;
      if (i < origWords.length) i++;
    }
  }
  return (
    <p className="text-sm leading-relaxed">
      {result.map((t, idx) =>
        t.changed ? (
          <mark key={idx} className="bg-emerald-500/30 text-emerald-300 rounded px-0.5 mx-0.5 font-semibold not-italic">
            {t.word}
          </mark>
        ) : (
          <span key={idx} className="text-gray-300">{t.word}{" "}</span>
        )
      )}
    </p>
  );
}

export default function PracticePage() {
  const [cefrLevel, setCefrLevel] = useState<CEFRLevel>("B1");
  const [question, setQuestion] = useState<Question | null>(null);
  const [loadingQ, setLoadingQ] = useState(false);
  const [answer, setAnswer] = useState("");
  const [evaluating, setEvaluating] = useState(false);
  const [result, setResult] = useState<EvalResult | null>(null);
  const [sessionXP, setSessionXP] = useState(0);
  const [showFlashcards, setShowFlashcards] = useState(false);
  const [dueCount, setDueCount] = useState(0);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<WordTooltip | null>(null);
  const translationCache = useRef<Record<string, { translation: string; phonetic?: string; partOfSpeech?: string }>>({});

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

  // Close tooltip on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) setTooltip(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleWordClick = async (word: string, e: React.MouseEvent) => {
    const clean = word.replace(/[^a-zA-Z'-]/g, "").toLowerCase();
    if (!clean || clean.length < 2) return;
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top;
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
      const data = await res.json();
      translationCache.current[clean] = { translation: data.translation, phonetic: data.phonetic, partOfSpeech: data.partOfSpeech };
      setTooltip({ word: clean, ...translationCache.current[clean], loading: false, saved: false, saving: false, x, y });
    } catch {
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
      fetchDueCount();
    } catch {
      setTooltip(t => t ? { ...t, saving: false } : t);
    }
  };

  const fetchQuestion = useCallback(async (level?: CEFRLevel) => {
    setLoadingQ(true);
    setResult(null);
    setAnswer("");
    try {
      const res = await fetch(`${API}/practice/question?level=${level ?? cefrLevel}`);
      setQuestion(await res.json());
    } catch {
      setQuestion({ question: "What do you like to do on weekends?", hint: "Fale sobre suas atividades favoritas", level: cefrLevel });
    } finally {
      setLoadingQ(false);
    }
  }, [cefrLevel]);

  const handleSubmit = async () => {
    if (!question || answer.trim().length < 5) return;
    setEvaluating(true);
    try {
      const res = await fetch(`${API}/practice/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.question, answer, level: cefrLevel }),
      });
      const data: EvalResult = await res.json();
      setResult(data);
      if (data.xp > 0) setSessionXP((s) => s + data.xp);
    } catch {
      alert("Error evaluating. Check if backend is running.");
    } finally {
      setEvaluating(false);
    }
  };

  const cfg = levelConfig[cefrLevel];

  return (
    <main className="min-h-screen bg-[#0f0f1a] text-white flex flex-col items-center px-4 py-10">
      {/* Header */}
      <div className="w-full max-w-2xl mb-8">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
              Speaking Practice
            </h1>
            <p className="text-gray-400 text-sm mt-1">Answer questions in English and get feedback.</p>
          </div>
          <div className="flex items-center gap-3">
            {sessionXP > 0 && (
              <span className="text-violet-300 font-bold text-sm">+{sessionXP} XP</span>
            )}
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
              href="/"
              className="text-xs text-gray-400 hover:text-white border border-white/10 hover:border-white/30 rounded-xl px-3 py-2 transition-all"
            >
              ← Reading
            </Link>
            <Link
              href="/dialogue"
              className="text-xs text-gray-400 hover:text-white border border-white/10 hover:border-white/30 rounded-xl px-3 py-2 transition-all"
            >
              💬 Dialogue
            </Link>
          </div>
        </div>
      </div>

      {/* Level selector */}
      <div className="w-full max-w-2xl mb-6">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-3">Question difficulty</p>
          <div className="grid grid-cols-6 gap-2">
            {(Object.keys(levelConfig) as CEFRLevel[]).map((lvl) => {
              const c = levelConfig[lvl];
              const active = cefrLevel === lvl;
              return (
                <button
                  key={lvl}
                  onClick={() => { setCefrLevel(lvl); setQuestion(null); setResult(null); setAnswer(""); }}
                  className={`flex flex-col items-center py-2 px-1 rounded-xl border transition-all text-xs font-bold ${
                    active ? `${c.bg} ${c.border} ${c.color}` : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <span className="text-sm font-black">{lvl}</span>
                  <span className={`text-[10px] font-normal mt-0.5 ${active ? c.color : "text-gray-500"}`}>{c.desc}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Question card or start prompt */}
      {!question && !loadingQ && (
        <div className="w-full max-w-2xl mb-6">
          <button
            onClick={() => fetchQuestion(cefrLevel)}
            className="w-full bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white font-bold py-5 rounded-2xl transition-all text-lg"
          >
            🎯 Get a question
          </button>
        </div>
      )}

      {loadingQ && (
        <div className="w-full max-w-2xl mb-6">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-8 flex items-center justify-center gap-3">
            <span className="w-5 h-5 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin" />
            <span className="text-gray-400 text-sm">Generating question...</span>
          </div>
        </div>
      )}

      {question && !loadingQ && (
        <>
          {/* Question */}
          <div className="w-full max-w-2xl mb-6 animate-fade-in">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-violet-500 to-cyan-500" />
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Question</span>
                <span className={`text-xs font-bold border rounded-full px-2 py-0.5 ${cfg.color} ${cfg.bg} ${cfg.border}`}>
                  {cefrLevel}
                </span>
                {question.category && (
                  <span className="text-xs bg-white/10 text-gray-300 border border-white/10 rounded-full px-2 py-0.5 capitalize">
                    {question.category}
                  </span>
                )}
              </div>
              <p className="text-white text-xl font-semibold leading-snug">
                {question.question.split(/(\s+)/).map((token, i) =>
                  /\s+/.test(token) ? <span key={i}>{token}</span> : (
                    <span
                      key={i}
                      onClick={(e) => handleWordClick(token, e)}
                      className="cursor-pointer hover:text-cyan-300 hover:underline decoration-dotted underline-offset-4 transition-colors rounded px-0.5"
                    >{token}</span>
                  )
                )}
              </p>
              {question.hint && (
                <p className="text-gray-500 text-xs mt-3">💡 {question.hint}</p>
              )}
            </div>
          </div>

          {/* Answer area */}
          <div className="w-full max-w-2xl mb-6 animate-fade-in">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <label className="block text-sm font-semibold text-gray-300 mb-3">
                ✍️ Your answer in English:
              </label>
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                disabled={evaluating || !!result}
                placeholder="Write your answer here..."
                rows={4}
                className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder-gray-500 resize-none focus:outline-none focus:border-violet-500/60 transition-all text-sm disabled:opacity-60"
              />
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-gray-500">{answer.length} chars</span>
                {!result ? (
                  <button
                    onClick={handleSubmit}
                    disabled={evaluating || answer.trim().length < 5}
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
                    onClick={() => fetchQuestion(cefrLevel)}
                    className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold px-6 py-2.5 rounded-xl transition-all text-sm"
                  >
                    Next question →
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Result */}
          {result && (
            <div className="w-full max-w-2xl animate-fade-in">
              <div className={`rounded-2xl p-6 border ${
                result.score === "great"      ? "bg-emerald-500/10 border-emerald-500/30" :
                result.score === "good"       ? "bg-cyan-500/10 border-cyan-500/30" :
                                               "bg-orange-500/10 border-orange-500/30"
              }`}>
                {/* Score row */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className={`text-xl font-bold flex items-center gap-2 ${scoreConfig[result.score].color}`}>
                      <span>{scoreConfig[result.score].emoji}</span>
                      <span>{scoreConfig[result.score].label}</span>
                    </div>
                    {!result.relevant && (
                      <p className="text-orange-400 text-xs mt-1">⚠️ Sua resposta não parece responder a pergunta.</p>
                    )}
                    <p className="text-gray-300 text-sm mt-2">{result.feedback}</p>
                  </div>
                  <div className="text-right ml-4 shrink-0">
                    <div className={`text-3xl font-black ${result.xp > 0 ? "text-violet-300" : "text-gray-500"}`}>
                      +{result.xp}
                    </div>
                    <div className="text-xs text-gray-400">XP earned</div>
                  </div>
                </div>

                {/* Writing correction */}
                {result.correctedAnswer && (
                  <div className="pt-4 border-t border-white/10">
                    <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-3">✍️ Writing correction</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="bg-white/5 rounded-xl p-3">
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Your answer</p>
                        <p className="text-gray-300 text-sm leading-relaxed">{answer}</p>
                      </div>
                      <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3">
                        <p className="text-[10px] text-emerald-500 uppercase tracking-wider mb-2">Corrected</p>
                        <DiffText original={answer} corrected={result.correctedAnswer} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
      
      {showFlashcards && (
        <FlashcardModal
          onClose={() => { setShowFlashcards(false); fetchDueCount(); }}
          onXPEarned={() => {}}
        />
      )}

      {/* Word Tooltip */}
      {tooltip && (
        <div
          ref={tooltipRef}
          className="fixed z-50 animate-fade-in"
          style={{ left: tooltip.x, top: tooltip.y - 8, transform: "translate(-50%, -100%)" }}
        >
          <div className="bg-[#1e1e30] border border-violet-500/40 rounded-xl shadow-2xl px-4 py-3 min-w-[160px] max-w-[230px]">
            <div className="flex items-center justify-between gap-3 mb-1">
              <span className="text-white font-bold text-sm">{tooltip.word}</span>
              {tooltip.partOfSpeech && (
                <span className="text-[10px] text-violet-400 bg-violet-500/20 rounded-full px-2 py-0.5 shrink-0">{tooltip.partOfSpeech}</span>
              )}
            </div>
            {tooltip.phonetic && <div className="text-gray-400 text-xs mb-1">{tooltip.phonetic}</div>}
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
            <div className="absolute left-1/2 -translate-x-1/2 bottom-0 translate-y-full w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-[#1e1e30]" />
          </div>
        </div>
      )}
    </main>
  );
}
