"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Light as SyntaxHighlighter } from "react-syntax-highlighter";
import { atomOneDark } from "react-syntax-highlighter/dist/esm/styles/hljs";
import js from "react-syntax-highlighter/dist/esm/languages/hljs/javascript";
import ts from "react-syntax-highlighter/dist/esm/languages/hljs/typescript";
import python from "react-syntax-highlighter/dist/esm/languages/hljs/python";
import java from "react-syntax-highlighter/dist/esm/languages/hljs/java";
import bash from "react-syntax-highlighter/dist/esm/languages/hljs/bash";
import { useAuth } from "../context/AuthContext";

SyntaxHighlighter.registerLanguage("javascript", js);
SyntaxHighlighter.registerLanguage("typescript", ts);
SyntaxHighlighter.registerLanguage("tsx", ts);
SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("java", java);
SyntaxHighlighter.registerLanguage("bash", bash);

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

interface Topic { id: number; name: string; language: string; }
interface Challenge {
  id: number; topic_id: number; question: string;
  interval?: number; repetitions?: number; next_review?: string; last_score?: string;
  topic_name?: string; language?: string;
}
interface ValidationResult {
  correct: boolean; score: "perfect" | "good" | "partial" | "wrong";
  feedback: string; suggestion: string | null; xp: number;
}

const LANGUAGES = [
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "tsx", label: "React/TSX" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "bash", label: "Bash" },
];

const scoreColors = { perfect: "text-emerald-400", good: "text-cyan-400", partial: "text-yellow-400", wrong: "text-red-400" };
const scoreEmoji = { perfect: "🎯", good: "✅", partial: "🤔", wrong: "❌" };
const scoreBg = { perfect: "bg-emerald-500/10 border-emerald-500/30", good: "bg-cyan-500/10 border-cyan-500/30", partial: "bg-yellow-500/10 border-yellow-500/30", wrong: "bg-red-500/10 border-red-500/30" };

function CodeEditor({ language, value, onChange }: { language: string; value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const handleTab = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const el = ref.current!;
    const s = el.selectionStart, end = el.selectionEnd;
    const next = value.substring(0, s) + "  " + value.substring(end);
    onChange(next);
    setTimeout(() => { el.selectionStart = el.selectionEnd = s + 2; }, 0);
  };
  return (
    <div className="rounded-xl overflow-hidden border border-violet-500/20">
      <div className="flex items-center justify-between bg-[#1a1a2e] px-4 py-1.5 border-b border-violet-500/20">
        <span className="text-[11px] text-violet-400 font-mono font-semibold uppercase tracking-widest">{language}</span>
        <span className="text-[10px] text-gray-500">Tab = 2 spaces</span>
      </div>
      <textarea
        ref={ref} value={value} onChange={e => onChange(e.target.value)} onKeyDown={handleTab}
        spellCheck={false} placeholder={`// Write your ${language} code here...`} rows={14}
        className="w-full bg-[#12121f] text-gray-100 font-mono text-sm p-4 resize-none focus:outline-none placeholder-gray-600 leading-relaxed"
      />
    </div>
  );
}

function ResultCard({ result, language, onNext }: { result: ValidationResult; language: string; onNext?: () => void }) {
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
      <p className="text-gray-300 text-sm leading-relaxed">{result.feedback}</p>
      {result.suggestion && (
        <div className="mt-4">
          <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-2">Suggested solution</p>
          <div className="rounded-xl overflow-hidden border border-white/10">
            <SyntaxHighlighter language={language} style={atomOneDark} showLineNumbers
              customStyle={{ margin: 0, padding: "1rem", background: "#12121f", fontSize: "0.8rem", lineHeight: "1.7", whiteSpace: "pre" }}>
              {result.suggestion}
            </SyntaxHighlighter>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PracticeCoding() {
  const { authFetch } = useAuth();
  const [mode, setMode] = useState<"browse" | "review">("browse");
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [activeChallenge, setActiveChallenge] = useState<Challenge | null>(null);
  const [code, setCode] = useState("");
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null);

  // Review mode
  const [dueQueue, setDueQueue] = useState<Challenge[]>([]);
  const [dueIndex, setDueIndex] = useState(0);
  const [dueCount, setDueCount] = useState(0);
  const [reviewCode, setReviewCode] = useState("");
  const [reviewValidating, setReviewValidating] = useState(false);
  const [reviewResult, setReviewResult] = useState<ValidationResult | null>(null);
  const [reviewDone, setReviewDone] = useState(false);

  // Modals
  const [showAddTopic, setShowAddTopic] = useState(false);
  const [newTopicName, setNewTopicName] = useState("");
  const [newTopicLang, setNewTopicLang] = useState("javascript");
  const [showManage, setShowManage] = useState(false);
  const [newQuestion, setNewQuestion] = useState("");
  const [addingQuestion, setAddingQuestion] = useState(false);

  const fetchDueCount = () => {
    authFetch(`${API}/coding-challenges/due`).then(r => r.json()).then((d: Challenge[]) => setDueCount(d.length)).catch(() => {});
  };

  useEffect(() => {
    authFetch(`${API}/coding-topics`).then(r => r.json()).then(setTopics).catch(() => {});
    fetchDueCount();
  }, [authFetch]);

  const loadChallenges = async (topic: Topic) => {
    setSelectedTopic(topic); setActiveChallenge(null); setCode(""); setResult(null);
    const data = await authFetch(`${API}/coding-topics/${topic.id}/challenges`).then(r => r.json());
    setChallenges(data);
  };

  const handleAddTopic = async () => {
    if (!newTopicName.trim()) return;
    const t = await authFetch(`${API}/coding-topics`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newTopicName.trim(), language: newTopicLang }),
    }).then(r => r.json());
    setTopics(prev => [...prev, t]);
    setNewTopicName(""); setShowAddTopic(false);
  };

  const handleDeleteTopic = async (id: number) => {
    await authFetch(`${API}/coding-topics/${id}`, { method: "DELETE" });
    setTopics(prev => prev.filter(t => t.id !== id));
    if (selectedTopic?.id === id) { setSelectedTopic(null); setChallenges([]); }
  };

  const handleAddChallenge = async () => {
    if (!newQuestion.trim() || !selectedTopic) return;
    setAddingQuestion(true);
    const c = await authFetch(`${API}/coding-topics/${selectedTopic.id}/challenges`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: newQuestion.trim() }),
    }).then(r => r.json());
    setChallenges(prev => [...prev, c]);
    setNewQuestion(""); setAddingQuestion(false);
  };

  const handleDeleteChallenge = async (id: number) => {
    await authFetch(`${API}/coding-challenges/${id}`, { method: "DELETE" });
    setChallenges(prev => prev.filter(c => c.id !== id));
    if (activeChallenge?.id === id) { setActiveChallenge(null); setCode(""); setResult(null); }
  };

  const handleValidate = async () => {
    if (!activeChallenge || !code.trim() || !selectedTopic) return;
    setValidating(true); setResult(null);
    try {
      const data = await authFetch(`${API}/coding-practice/validate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: activeChallenge.question, code, language: selectedTopic.language }),
      }).then(r => r.json());
      setResult(data);
      await authFetch(`${API}/coding-challenges/${activeChallenge.id}/review`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score: data.score }),
      });
      fetchDueCount();
    } catch {
      setResult({ correct: false, score: "wrong", feedback: "Erro ao validar.", suggestion: null, xp: 0 });
    } finally { setValidating(false); }
  };

  const startReview = async () => {
    const due: Challenge[] = await authFetch(`${API}/coding-challenges/due`).then(r => r.json());
    setDueQueue(due); setDueIndex(0); setReviewCode(""); setReviewResult(null); setReviewDone(false);
    setMode("review");
  };

  const currentDue = dueQueue[dueIndex];

  const handleReviewValidate = async () => {
    if (!currentDue || !reviewCode.trim()) return;
    setReviewValidating(true); setReviewResult(null);
    try {
      const data = await authFetch(`${API}/coding-practice/validate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: currentDue.question, code: reviewCode, language: currentDue.language }),
      }).then(r => r.json());
      setReviewResult(data);
      await authFetch(`${API}/coding-challenges/${currentDue.id}/review`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score: data.score }),
      });
      fetchDueCount();
    } catch {
      setReviewResult({ correct: false, score: "wrong", feedback: "Erro ao validar.", suggestion: null, xp: 0 });
    } finally { setReviewValidating(false); }
  };

  const handleReviewNext = () => {
    const score = reviewResult?.score;
    if (score === "wrong" || score === "partial") {
      // Requeue at the end, remove from current position
      setDueQueue(q => {
        const next = q.filter((_, i) => i !== dueIndex);
        return [...next, currentDue];
      });
      // Keep index the same (now points to next item), reset code/result
      setReviewCode(""); setReviewResult(null);
      // If removing current made queue shorter and index is now out of bounds, done
      if (dueQueue.length <= 1) { setReviewDone(true); }
      return;
    }
    if (dueIndex + 1 >= dueQueue.length) { setReviewDone(true); return; }
    setDueIndex(i => i + 1); setReviewCode(""); setReviewResult(null);
  };

  return (
    <main className="min-h-screen bg-[#0f0f1a] text-white flex flex-col px-4 py-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/" className="text-gray-500 hover:text-gray-300 text-sm mb-1 inline-block transition-colors">← Back</Link>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">Practice Coding</h1>
          <p className="text-gray-400 text-sm mt-0.5">Choose a topic, pick a challenge, write your code.</p>
        </div>
        {/* Mode switcher */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMode("browse")}
            className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${mode === "browse" ? "bg-violet-500/20 border-violet-500/50 text-violet-300" : "bg-white/5 border-white/10 text-gray-400 hover:text-white"}`}
          >📚 Browse</button>
          <button
            onClick={startReview}
            className={`relative px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${mode === "review" ? "bg-orange-500/20 border-orange-500/50 text-orange-300" : "bg-white/5 border-white/10 text-gray-400 hover:text-white"}`}
          >
            🔁 Review
            {dueCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-orange-500 text-white text-[10px] font-black rounded-full w-5 h-5 flex items-center justify-center">
                {dueCount > 9 ? "9+" : dueCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── REVIEW MODE ── */}
      {mode === "review" && (
        <div className="flex-1">
          {reviewDone || dueQueue.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <div className="text-5xl">🎉</div>
              <p className="text-xl font-bold text-white">{dueQueue.length === 0 ? "No challenges due today!" : "All done for today!"}</p>
              <p className="text-gray-400 text-sm">Come back tomorrow for more reviews.</p>
              <button onClick={() => setMode("browse")} className="mt-2 bg-violet-600 hover:bg-violet-500 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-all">
                Browse challenges
              </button>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto flex flex-col gap-4">
              {/* Progress */}
              <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                <span>{dueIndex + 1} / {dueQueue.length} challenges</span>
                <span className="text-violet-400 font-semibold">{currentDue.topic_name} · {currentDue.language}</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-1.5 mb-2">
                <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-500 transition-all duration-500"
                  style={{ width: `${((dueIndex) / dueQueue.length) * 100}%` }} />
              </div>

              {/* Challenge */}
              <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-4">
                <p className="text-xs text-cyan-400 uppercase tracking-widest font-semibold mb-1">Challenge</p>
                <p className="text-gray-100 text-sm leading-relaxed">{currentDue.question}</p>
                {currentDue.last_score && (
                  <p className="text-xs text-gray-500 mt-2">Last attempt: <span className={scoreColors[currentDue.last_score as keyof typeof scoreColors]}>{currentDue.last_score}</span></p>
                )}
              </div>

              <CodeEditor language={currentDue.language ?? "javascript"} value={reviewCode} onChange={setReviewCode} />

              <div className="flex items-center justify-between">
                <button onClick={() => setReviewCode("")} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">Clear</button>
                {!reviewResult ? (
                  <button onClick={handleReviewValidate} disabled={!reviewCode.trim() || reviewValidating}
                    className="bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-6 py-2.5 rounded-xl transition-all text-sm">
                    {reviewValidating ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Validating...</span> : "Validate →"}
                  </button>
                ) : null}
              </div>

              {reviewResult && (
                <ResultCard result={reviewResult} language={currentDue.language ?? "javascript"} onNext={handleReviewNext} />
              )}
            </div>
          )}
        </div>
      )}

      {/* ── BROWSE MODE ── */}
      {mode === "browse" && (
        <div className="flex gap-6 flex-1">
          {/* Sidebar */}
          <div className="w-56 shrink-0">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-gray-400 uppercase tracking-widest font-semibold">Topics</span>
              <button onClick={() => setShowAddTopic(true)} className="text-xs bg-violet-600/40 hover:bg-violet-600/60 border border-violet-500/40 text-violet-300 px-2 py-1 rounded-lg transition-all">+ Add</button>
            </div>
            <div className="flex flex-col gap-1.5">
              {topics.map(t => (
                <div key={t.id}
                  className={`group flex items-center justify-between px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${selectedTopic?.id === t.id ? "bg-violet-500/20 border-violet-500/50 text-violet-300" : "bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white"}`}
                  onClick={() => loadChallenges(t)}>
                  <div>
                    <div className="text-sm font-semibold">{t.name}</div>
                    <div className="text-[10px] text-gray-500 font-mono">{t.language}</div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); handleDeleteTopic(t.id); }} className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all text-xs">✕</button>
                </div>
              ))}
            </div>
          </div>

          {/* Main */}
          <div className="flex-1 flex flex-col gap-4">
            {!selectedTopic ? (
              <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">Select a topic to start practicing</div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-white">{selectedTopic.name}</h2>
                  <button onClick={() => setShowManage(true)} className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white px-3 py-1.5 rounded-lg transition-all">⚙ Manage challenges</button>
                </div>

                {challenges.length === 0 ? (
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center text-gray-500 text-sm">No challenges yet. Click "Manage challenges" to add some.</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {challenges.map((c, i) => (
                      <button key={c.id} onClick={() => { setActiveChallenge(c); setCode(""); setResult(null); }}
                        className={`text-left px-4 py-3 rounded-xl border transition-all ${activeChallenge?.id === c.id ? "bg-cyan-500/10 border-cyan-500/40 text-cyan-300" : "bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white"}`}>
                        <div className="flex items-center justify-between">
                          <span><span className="text-xs text-gray-500 font-mono mr-2">#{i + 1}</span>{c.question}</span>
                          {c.last_score && <span className={`text-xs font-semibold ml-2 shrink-0 ${scoreColors[c.last_score as keyof typeof scoreColors]}`}>{scoreEmoji[c.last_score as keyof typeof scoreEmoji]}</span>}
                        </div>
                        {c.next_review && (
                          <div className="text-[10px] text-gray-500 mt-1 ml-6">
                            Next review: {new Date(c.next_review) <= new Date() ? <span className="text-orange-400">due now</span> : c.next_review}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {activeChallenge && (
                  <div className="flex flex-col gap-3 mt-2">
                    <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-4">
                      <p className="text-xs text-cyan-400 uppercase tracking-widest font-semibold mb-1">Challenge</p>
                      <p className="text-gray-100 text-sm leading-relaxed">{activeChallenge.question}</p>
                    </div>
                    <CodeEditor language={selectedTopic.language} value={code} onChange={setCode} />
                    <div className="flex items-center justify-between">
                      <button onClick={() => { setCode(""); setResult(null); }} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">Clear</button>
                      <button onClick={handleValidate} disabled={!code.trim() || validating}
                        className="bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-6 py-2.5 rounded-xl transition-all text-sm">
                        {validating ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Validating...</span> : "Validate →"}
                      </button>
                    </div>
                    {result && <ResultCard result={result} language={selectedTopic.language} />}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Add Topic Modal */}
      {showAddTopic && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1a1a2e] border border-violet-500/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4">New Topic</h3>
            <input type="text" value={newTopicName} onChange={e => setNewTopicName(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAddTopic()}
              placeholder="e.g. Node.js, Python, React..." autoFocus
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/60 mb-3" />
            <select value={newTopicLang} onChange={e => setNewTopicLang(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500/60 mb-4">
              {LANGUAGES.map(l => <option key={l.value} value={l.value} className="bg-[#1a1a2e]">{l.label}</option>)}
            </select>
            <div className="flex gap-2">
              <button onClick={() => setShowAddTopic(false)} className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 py-2 rounded-xl text-sm transition-all">Cancel</button>
              <button onClick={handleAddTopic} disabled={!newTopicName.trim()} className="flex-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-semibold py-2 rounded-xl text-sm transition-all">Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Challenges Modal */}
      {showManage && selectedTopic && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1a1a2e] border border-violet-500/30 rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">{selectedTopic.name} — Challenges</h3>
              <button onClick={() => setShowManage(false)} className="text-gray-400 hover:text-white transition-colors">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto flex flex-col gap-2 mb-4">
              {challenges.length === 0 && <p className="text-gray-500 text-sm text-center py-4">No challenges yet.</p>}
              {challenges.map((c, i) => (
                <div key={c.id} className="flex items-start gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                  <span className="text-xs text-gray-500 font-mono mt-0.5 shrink-0">#{i + 1}</span>
                  <p className="text-gray-300 text-sm flex-1 leading-relaxed">{c.question}</p>
                  <button onClick={() => handleDeleteChallenge(c.id)} className="text-gray-500 hover:text-red-400 transition-colors text-xs shrink-0">✕</button>
                </div>
              ))}
            </div>
            <div className="border-t border-white/10 pt-4">
              <textarea value={newQuestion} onChange={e => setNewQuestion(e.target.value)}
                placeholder="Describe the challenge, e.g: Create a function that reads a file and returns its content as a string..."
                rows={3} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:border-violet-500/60 mb-3" />
              <button onClick={handleAddChallenge} disabled={!newQuestion.trim() || addingQuestion}
                className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl text-sm transition-all">
                {addingQuestion ? "Adding..." : "+ Add Challenge"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
