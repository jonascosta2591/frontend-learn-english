"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "../context/AuthContext";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

interface Question {
  id: number;
  category: string;
  question: string;
  expected_answer?: string;
  interval: number;
  repetitions: number;
  next_review: string;
  last_score?: string;
}

interface ValidationResult {
  score: "perfect" | "good" | "partial" | "wrong";
  feedback: string;
  idealAnswer: string;
  xp: number;
}

const CATEGORIES = ["General", "JavaScript", "TypeScript", "React", "Node.js", "Python", "Java", "System Design", "Algorithms", "Databases", "DevOps", "Behavioral"];

const scoreColors = { perfect: "text-emerald-400", good: "text-cyan-400", partial: "text-yellow-400", wrong: "text-red-400" };
const scoreEmoji = { perfect: "🎯", good: "✅", partial: "🤔", wrong: "❌" };
const scoreBg = { perfect: "bg-emerald-500/10 border-emerald-500/30", good: "bg-cyan-500/10 border-cyan-500/30", partial: "bg-yellow-500/10 border-yellow-500/30", wrong: "bg-red-500/10 border-red-500/30" };

export default function InterviewPage() {
  const { authFetch } = useAuth();
  const [mode, setMode] = useState<"browse" | "review">("browse");

  // Browse state
  const [questions, setQuestions] = useState<Question[]>([]);
  const [filterCategory, setFilterCategory] = useState("All");
  const [activeQuestion, setActiveQuestion] = useState<Question | null>(null);
  const [answer, setAnswer] = useState("");
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [expandedAnswers, setExpandedAnswers] = useState<Set<number>>(new Set());

  // Add question modal
  const [showAdd, setShowAdd] = useState(false);
  const [newQuestion, setNewQuestion] = useState("");
  const [newCategory, setNewCategory] = useState("General");
  const [newExpected, setNewExpected] = useState("");
  const [adding, setAdding] = useState(false);

  // Review state
  const [dueQueue, setDueQueue] = useState<Question[]>([]);
  const [dueIndex, setDueIndex] = useState(0);
  const [reviewAnswer, setReviewAnswer] = useState("");
  const [reviewValidating, setReviewValidating] = useState(false);
  const [reviewResult, setReviewResult] = useState<ValidationResult | null>(null);
  const [reviewDone, setReviewDone] = useState(false);
  const [dueCount, setDueCount] = useState(0);

  const fetchDueCount = useCallback(() => {
    authFetch(`${API}/interview-questions/due`).then(r => r.json()).then((d: Question[]) => setDueCount(d.length)).catch(() => {});
  }, [authFetch]);

  const fetchQuestions = useCallback(() => {
    authFetch(`${API}/interview-questions`).then(r => r.json()).then(setQuestions).catch(() => {});
  }, [authFetch]);

  useEffect(() => { fetchQuestions(); fetchDueCount(); }, [fetchQuestions, fetchDueCount]);

  const handleAdd = async () => {
    if (!newQuestion.trim()) return;
    setAdding(true);
    const q = await authFetch(`${API}/interview-questions`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: newCategory, question: newQuestion.trim(), expectedAnswer: newExpected.trim() || undefined }),
    }).then(r => r.json());
    setQuestions(prev => [q, ...prev]);
    setNewQuestion(""); setNewExpected(""); setShowAdd(false); setAdding(false);
  };

  const handleDelete = async (id: number) => {
    await authFetch(`${API}/interview-questions/${id}`, { method: "DELETE" });
    setQuestions(prev => prev.filter(q => q.id !== id));
    if (activeQuestion?.id === id) { setActiveQuestion(null); setAnswer(""); setResult(null); }
  };

  const handleValidate = async () => {
    if (!activeQuestion || !answer.trim()) return;
    setValidating(true); setResult(null);
    try {
      const data = await authFetch(`${API}/interview-questions/validate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: activeQuestion.question, answer, expectedAnswer: activeQuestion.expected_answer }),
      }).then(r => r.json());
      setResult(data);
      await authFetch(`${API}/interview-questions/${activeQuestion.id}/review`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score: data.score }),
      });
      fetchDueCount();
      fetchQuestions();
    } catch {
      setResult({ score: "wrong", feedback: "Erro ao validar.", idealAnswer: "", xp: 0 });
    } finally { setValidating(false); }
  };

  // Review mode
  const startReview = async () => {
    const due: Question[] = await authFetch(`${API}/interview-questions/due`).then(r => r.json());
    setDueQueue(due); setDueIndex(0); setReviewAnswer(""); setReviewResult(null); setReviewDone(false);
    setMode("review");
  };

  const currentDue = dueQueue[dueIndex];

  const handleReviewValidate = async () => {
    if (!currentDue || !reviewAnswer.trim()) return;
    setReviewValidating(true); setReviewResult(null);
    try {
      const data = await authFetch(`${API}/interview-questions/validate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: currentDue.question, answer: reviewAnswer, expectedAnswer: currentDue.expected_answer }),
      }).then(r => r.json());
      setReviewResult(data);
      await authFetch(`${API}/interview-questions/${currentDue.id}/review`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score: data.score }),
      });
      fetchDueCount();
    } catch {
      setReviewResult({ score: "wrong", feedback: "Erro ao validar.", idealAnswer: "", xp: 0 });
    } finally { setReviewValidating(false); }
  };

  const handleReviewNext = () => {
    const score = reviewResult?.score;
    if (score === "wrong" || score === "partial") {
      setDueQueue(q => { const next = q.filter((_, i) => i !== dueIndex); return [...next, currentDue]; });
      if (dueQueue.length <= 1) { setReviewDone(true); return; }
      setReviewAnswer(""); setReviewResult(null);
      return;
    }
    if (dueIndex + 1 >= dueQueue.length) { setReviewDone(true); return; }
    setDueIndex(i => i + 1); setReviewAnswer(""); setReviewResult(null);
  };

  const filtered = questions.filter(q => filterCategory === "All" || q.category === filterCategory);
  const categories = ["All", ...Array.from(new Set(questions.map(q => q.category)))];

  return (
    <main className="min-h-screen bg-[#0f0f1a] text-white flex flex-col px-4 py-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/" className="text-gray-500 hover:text-gray-300 text-sm mb-1 inline-block transition-colors">← Back</Link>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">Interview Prep</h1>
          <p className="text-gray-400 text-sm mt-0.5">Practice programming interview questions with AI feedback.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setMode("browse")}
            className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${mode === "browse" ? "bg-violet-500/20 border-violet-500/50 text-violet-300" : "bg-white/5 border-white/10 text-gray-400 hover:text-white"}`}>
            📚 Browse
          </button>
          <button onClick={startReview}
            className={`relative px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${mode === "review" ? "bg-orange-500/20 border-orange-500/50 text-orange-300" : "bg-white/5 border-white/10 text-gray-400 hover:text-white"}`}>
            🔁 Review
            {dueCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-orange-500 text-white text-[10px] font-black rounded-full w-5 h-5 flex items-center justify-center">
                {dueCount > 9 ? "9+" : dueCount}
              </span>
            )}
          </button>
          <button onClick={() => setShowAdd(true)}
            className="px-4 py-2 rounded-xl text-sm font-semibold border bg-violet-600/40 hover:bg-violet-600/60 border-violet-500/40 text-violet-300 transition-all">
            + Add Question
          </button>
        </div>
      </div>

      {/* ── REVIEW MODE ── */}
      {mode === "review" && (
        <div className="max-w-2xl mx-auto w-full">
          {reviewDone || dueQueue.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <div className="text-5xl">🎉</div>
              <p className="text-xl font-bold">{dueQueue.length === 0 ? "No questions due today!" : "All done for today!"}</p>
              <p className="text-gray-400 text-sm">Come back tomorrow for more reviews.</p>
              <button onClick={() => setMode("browse")} className="mt-2 bg-violet-600 hover:bg-violet-500 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-all">Browse questions</button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Progress */}
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>{dueIndex + 1} / {dueQueue.length} questions</span>
                <span className="text-violet-400 font-semibold">{currentDue.category}</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-1.5">
                <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-500 transition-all duration-500"
                  style={{ width: `${(dueIndex / dueQueue.length) * 100}%` }} />
              </div>

              {/* Question */}
              <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-5">
                <p className="text-xs text-cyan-400 uppercase tracking-widest font-semibold mb-2">Question</p>
                <p className="text-gray-100 leading-relaxed">{currentDue.question}</p>
                {currentDue.last_score && (
                  <p className="text-xs text-gray-500 mt-2">Last: <span className={scoreColors[currentDue.last_score as keyof typeof scoreColors]}>{currentDue.last_score}</span></p>
                )}
              </div>

              {/* Answer textarea */}
              <textarea value={reviewAnswer} onChange={e => setReviewAnswer(e.target.value)}
                placeholder="Type your answer here..."
                rows={6}
                className="w-full bg-[#12121f] border border-violet-500/20 rounded-xl p-4 text-gray-100 text-sm font-mono resize-none focus:outline-none focus:border-violet-500/50 placeholder-gray-600 leading-relaxed" />

              <div className="flex items-center justify-between">
                <button onClick={() => setReviewAnswer("")} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">Clear</button>
                {!reviewResult ? (
                  <button onClick={handleReviewValidate} disabled={!reviewAnswer.trim() || reviewValidating}
                    className="bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-6 py-2.5 rounded-xl transition-all text-sm">
                    {reviewValidating ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Evaluating...</span> : "Submit →"}
                  </button>
                ) : null}
              </div>

              {reviewResult && <ResultCard result={reviewResult} onNext={handleReviewNext} />}
            </div>
          )}
        </div>
      )}

      {/* ── BROWSE MODE ── */}
      {mode === "browse" && (
        <div className="flex gap-6">
          {/* Sidebar — categories */}
          <div className="w-44 shrink-0">
            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-3">Category</p>
            <div className="flex flex-col gap-1">
              {categories.map(cat => (
                <button key={cat} onClick={() => setFilterCategory(cat)}
                  className={`text-left px-3 py-2 rounded-xl text-sm transition-all ${filterCategory === cat ? "bg-violet-500/20 border border-violet-500/40 text-violet-300" : "text-gray-400 hover:text-white hover:bg-white/5"}`}>
                  {cat}
                  <span className="ml-1 text-xs text-gray-600">
                    ({cat === "All" ? questions.length : questions.filter(q => q.category === cat).length})
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Main */}
          <div className="flex-1 flex flex-col gap-3">
            {filtered.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-gray-500 text-sm py-16">
                No questions yet. Click "+ Add Question" to get started.
              </div>
            ) : (
              filtered.map(q => (
                <div key={q.id}
                  className={`group bg-white/5 border rounded-2xl p-4 transition-all ${activeQuestion?.id === q.id ? "border-cyan-500/40 bg-cyan-500/5" : "border-white/10 hover:border-violet-500/30"}`}>
                  <div className="flex items-start justify-between gap-3"
                    onClick={() => { setActiveQuestion(q); setAnswer(""); setResult(null); }}
                    style={{ cursor: "pointer" }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs bg-violet-500/20 text-violet-300 border border-violet-500/30 rounded-full px-2 py-0.5">{q.category}</span>
                        {q.last_score && <span className={`text-xs font-semibold ${scoreColors[q.last_score as keyof typeof scoreColors]}`}>{scoreEmoji[q.last_score as keyof typeof scoreEmoji]}</span>}
                        {new Date(q.next_review) <= new Date() && <span className="text-xs text-orange-400 font-semibold">due</span>}
                      </div>
                      <p className="text-gray-200 text-sm leading-relaxed">{q.question}</p>
                      <p className="text-xs text-gray-500 mt-1">{q.repetitions}× reviewed · next: {q.next_review}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {q.expected_answer && (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setExpandedAnswers(prev => {
                              const next = new Set(prev);
                              next.has(q.id) ? next.delete(q.id) : next.add(q.id);
                              return next;
                            });
                          }}
                          className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-cyan-300 px-2 py-1 rounded-lg transition-all"
                        >
                          {expandedAnswers.has(q.id) ? "Hide answer" : "Show answer"}
                        </button>
                      )}
                      <button onClick={e => { e.stopPropagation(); handleDelete(q.id); }}
                        className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all text-xs">✕</button>
                    </div>
                  </div>
                  {expandedAnswers.has(q.id) && q.expected_answer && (
                    <div className="mt-3 pt-3 border-t border-white/10">
                      <p className="text-xs text-cyan-400 uppercase tracking-widest font-semibold mb-1">Expected Answer</p>
                      <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{q.expected_answer}</p>
                    </div>
                  )}
                </div>
              ))
            )}

            {/* Answer panel */}
            {activeQuestion && (
              <div className="mt-2 flex flex-col gap-3 border-t border-white/10 pt-4">
                <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-4">
                  <p className="text-xs text-cyan-400 uppercase tracking-widest font-semibold mb-1">Question</p>
                  <p className="text-gray-100 leading-relaxed">{activeQuestion.question}</p>
                  {activeQuestion.expected_answer && (
                    <div className="mt-3 pt-3 border-t border-white/10">
                      <button
                        onClick={() => setExpandedAnswers(prev => {
                          const next = new Set(prev);
                          next.has(activeQuestion.id) ? next.delete(activeQuestion.id) : next.add(activeQuestion.id);
                          return next;
                        })}
                        className="text-xs text-gray-400 hover:text-cyan-300 transition-colors"
                      >
                        {expandedAnswers.has(activeQuestion.id) ? "▾ Hide expected answer" : "▸ Show expected answer"}
                      </button>
                      {expandedAnswers.has(activeQuestion.id) && (
                        <p className="text-gray-300 text-sm leading-relaxed mt-2 whitespace-pre-wrap">{activeQuestion.expected_answer}</p>
                      )}
                    </div>
                  )}
                </div>
                <textarea value={answer} onChange={e => setAnswer(e.target.value)}
                  placeholder="Type your answer here..."
                  rows={6}
                  className="w-full bg-[#12121f] border border-violet-500/20 rounded-xl p-4 text-gray-100 text-sm resize-none focus:outline-none focus:border-violet-500/50 placeholder-gray-600 leading-relaxed" />
                <div className="flex items-center justify-between">
                  <button onClick={() => { setAnswer(""); setResult(null); }} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">Clear</button>
                  <button onClick={handleValidate} disabled={!answer.trim() || validating}
                    className="bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-6 py-2.5 rounded-xl transition-all text-sm">
                    {validating ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Evaluating...</span> : "Submit →"}
                  </button>
                </div>
                {result && <ResultCard result={result} />}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Question Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1a1a2e] border border-violet-500/30 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Add Interview Question</h3>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Category</label>
                <select value={newCategory} onChange={e => setNewCategory(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500/60">
                  {CATEGORIES.map(c => <option key={c} value={c} className="bg-[#1a1a2e]">{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Question</label>
                <textarea value={newQuestion} onChange={e => setNewQuestion(e.target.value)}
                  placeholder="e.g. What is the difference between == and === in JavaScript?"
                  rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:border-violet-500/60" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Expected answer hint (optional — helps AI evaluate)</label>
                <textarea value={newExpected} onChange={e => setNewExpected(e.target.value)}
                  placeholder="Key points the answer should cover..."
                  rows={2}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:border-violet-500/60" />
              </div>
              <div className="flex gap-2 mt-1">
                <button onClick={() => setShowAdd(false)} className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 py-2.5 rounded-xl text-sm transition-all">Cancel</button>
                <button onClick={handleAdd} disabled={!newQuestion.trim() || adding}
                  className="flex-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl text-sm transition-all">
                  {adding ? "Adding..." : "Add Question"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function ResultCard({ result, onNext }: { result: ValidationResult; onNext?: () => void }) {
  return (
    <div className={`rounded-2xl p-5 border ${scoreBg[result.score]}`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`text-lg font-bold flex items-center gap-2 ${scoreColors[result.score]}`}>
          <span>{scoreEmoji[result.score]}</span>
          <span className="capitalize">{result.score}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className={`text-2xl font-black ${result.xp > 0 ? "text-violet-300" : "text-gray-500"}`}>+{result.xp}</div>
            <div className="text-xs text-gray-400">XP</div>
          </div>
          {onNext && (
            <button onClick={onNext} className="bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-all">
              Next →
            </button>
          )}
        </div>
      </div>
      <p className="text-gray-300 text-sm leading-relaxed mb-3">{result.feedback}</p>
      {result.idealAnswer && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-3">
          <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-1">Ideal Answer</p>
          <p className="text-gray-200 text-sm leading-relaxed">{result.idealAnswer}</p>
        </div>
      )}
    </div>
  );
}
