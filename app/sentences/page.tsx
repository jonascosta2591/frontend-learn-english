"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import SentenceFlashcardModal from "../components/SentenceFlashcardModal";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

type CEFRLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

interface Word {
  id: number;
  word: string;
  translation: string;
  part_of_speech?: string;
}

interface Sentence {
  sentence: string;
  translation: string;
  highlight: string;
}

interface SavedSentence {
  id: number;
  sentence: string;
  translation: string;
  word: string;
  level: string;
  next_review: string;
  repetitions: number;
}

const levelConfig: Record<CEFRLevel, { color: string; bg: string; border: string; desc: string }> = {
  A1: { color: "text-green-400",  bg: "bg-green-500/20",  border: "border-green-500/50",  desc: "Beginner" },
  A2: { color: "text-lime-400",   bg: "bg-lime-500/20",   border: "border-lime-500/50",   desc: "Elementary" },
  B1: { color: "text-yellow-400", bg: "bg-yellow-500/20", border: "border-yellow-500/50", desc: "Intermediate" },
  B2: { color: "text-orange-400", bg: "bg-orange-500/20", border: "border-orange-500/50", desc: "Upper-Inter." },
  C1: { color: "text-rose-400",   bg: "bg-rose-500/20",   border: "border-rose-500/50",   desc: "Advanced" },
  C2: { color: "text-purple-400", bg: "bg-purple-500/20", border: "border-purple-500/50", desc: "Mastery" },
};

export default function SentencesPage() {
  const [level, setLevel] = useState<CEFRLevel>("B1");
  const [words, setWords] = useState<Word[]>([]);
  const [wordSearch, setWordSearch] = useState("");
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
  const [sentences, setSentences] = useState<Sentence[]>([]);
  const [generating, setGenerating] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [savingIdx, setSavingIdx] = useState<number | null>(null);
  const [tab, setTab] = useState<"generate" | "saved">("generate");
  const [savedSentences, setSavedSentences] = useState<SavedSentence[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [showFlashcards, setShowFlashcards] = useState(false);
  const [dueCount, setDueCount] = useState(0);

  const fetchDueCount = useCallback(async () => {
    try {
      const res = await fetch(`${API}/sentences/due`);
      const data = await res.json();
      setDueCount(Array.isArray(data) ? data.length : 0);
    } catch { /* ignore */ }
  }, []);

  const fetchWords = useCallback(async () => {
    try {
      const [wordsRes, sentencesRes] = await Promise.all([
        fetch(`${API}/words`),
        fetch(`${API}/sentences`),
      ]);
      const allWords: Word[] = await wordsRes.json();
      const allSentences: { word: string }[] = await sentencesRes.json();
      const usedWords = new Set(allSentences.map(s => s.word.toLowerCase()));
      setWords(allWords.filter(w => !usedWords.has(w.word.toLowerCase())));
    } catch { /* ignore */ }
  }, []);

  const fetchSaved = useCallback(async () => {
    setLoadingSaved(true);
    try {
      const res = await fetch(`${API}/sentences`);
      setSavedSentences(await res.json());
    } finally {
      setLoadingSaved(false);
    }
  }, []);

  useEffect(() => { fetchWords(); }, [fetchWords]);
  useEffect(() => { if (tab === "saved") fetchSaved(); }, [tab, fetchSaved]);
  useEffect(() => { fetchDueCount(); }, [fetchDueCount]);

  const handleGenerate = async () => {
    if (!selectedWord) return;
    setGenerating(true);
    setSentences([]);
    setSavedIds(new Set());
    try {
      const res = await fetch(`${API}/sentences/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: selectedWord.word, translation: selectedWord.translation, level }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const list = Array.isArray(data.sentences) ? data.sentences : [];
      if (list.length === 0) throw new Error("No sentences returned");
      setSentences(list);
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : "Check backend."}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async (s: Sentence, idx: number) => {
    if (!selectedWord || savedIds.has(idx)) return;
    setSavingIdx(idx);
    try {
      await fetch(`${API}/sentences/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sentence: s.sentence, translation: s.translation, word: selectedWord.word, level }),
      });
      setSavedIds(prev => new Set(prev).add(idx));
      fetchWords(); // remove word from picker
    } finally {
      setSavingIdx(null);
    }
  };

  const filtered = words.filter(w =>
    w.word.toLowerCase().includes(wordSearch.toLowerCase()) ||
    w.translation.toLowerCase().includes(wordSearch.toLowerCase())
  );

  const cfg = levelConfig[level];

  // Highlight the target word in a sentence
  const highlightWord = (sentence: string, word: string) => {
    const regex = new RegExp(`(\\b${word}\\b)`, "gi");
    const parts = sentence.split(regex);
    return parts.map((part, i) =>
      regex.test(part)
        ? <mark key={i} className="bg-violet-500/30 text-violet-200 rounded px-0.5 not-italic font-semibold">{part}</mark>
        : <span key={i}>{part}</span>
    );
  };

  return (
    <main className="min-h-screen bg-[#0f0f1a] text-white flex flex-col items-center px-4 py-10">
      {/* Header */}
      <div className="w-full max-w-2xl mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
              i+1 Sentences
            </h1>
            <p className="text-gray-400 text-sm mt-1">Pick a word and generate comprehensible input sentences.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFlashcards(true)}
              className="relative flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-violet-500/40 text-gray-300 hover:text-white px-3 py-2 rounded-xl transition-all text-sm font-semibold"
            >
              🃏 Practice
              {dueCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-orange-500 text-white text-[10px] font-black rounded-full w-5 h-5 flex items-center justify-center">
                  {dueCount > 9 ? "9+" : dueCount}
                </span>
              )}
            </button>
            <Link href="/" className="text-xs text-gray-400 hover:text-white border border-white/10 hover:border-white/30 rounded-xl px-3 py-2 transition-all">
              ← Reading
            </Link>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="w-full max-w-2xl mb-6">
        <div className="flex bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
          <button
            onClick={() => setTab("generate")}
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${tab === "generate" ? "bg-violet-600/30 text-violet-300" : "text-gray-400 hover:text-white"}`}
          >
            ✨ Generate
          </button>
          <button
            onClick={() => setTab("saved")}
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${tab === "saved" ? "bg-violet-600/30 text-violet-300" : "text-gray-400 hover:text-white"}`}
          >
            📚 Saved sentences
          </button>
        </div>
      </div>

      {tab === "generate" && (
        <>
          {/* Level selector */}
          <div className="w-full max-w-2xl mb-6">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-3">Sentence level (i+1)</p>
              <div className="grid grid-cols-6 gap-2">
                {(Object.keys(levelConfig) as CEFRLevel[]).map((lvl) => {
                  const c = levelConfig[lvl];
                  const active = level === lvl;
                  return (
                    <button key={lvl}
                      onClick={() => { setLevel(lvl); setSentences([]); setSavedIds(new Set()); }}
                      className={`flex flex-col items-center py-2 px-1 rounded-xl border transition-all text-xs font-bold ${active ? `${c.bg} ${c.border} ${c.color}` : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white"}`}
                    >
                      <span className="text-sm font-black">{lvl}</span>
                      <span className={`text-[10px] font-normal mt-0.5 ${active ? c.color : "text-gray-500"}`}>{c.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Word picker */}
          <div className="w-full max-w-2xl mb-6">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-3">
                Choose a word from your flashcards
              </p>

              {words.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">
                  No words yet. Translate words in the Reading or Dialogue pages first.
                </p>
              ) : (
                <>
                  <input
                    type="text"
                    value={wordSearch}
                    onChange={e => setWordSearch(e.target.value)}
                    placeholder="Search words..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/60 transition-all mb-3"
                  />
                  <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-1">
                    {filtered.map(w => {
                      const active = selectedWord?.id === w.id;
                      return (
                        <button
                          key={w.id}
                          onClick={() => { setSelectedWord(w); setSentences([]); setSavedIds(new Set()); }}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm transition-all ${
                            active
                              ? "bg-violet-600/30 border-violet-500/50 text-violet-200"
                              : "bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white"
                          }`}
                        >
                          <span className="font-semibold">{w.word}</span>
                          <span className="text-xs text-gray-400">{w.translation}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Generate button */}
          {selectedWord && (
            <div className="w-full max-w-2xl mb-6">
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="w-full bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 disabled:opacity-50 text-white font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-3"
              >
                {generating ? (
                  <>
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Generating 10 sentences...
                  </>
                ) : (
                  <>
                    ✨ Generate i+1 sentences for
                    <span className={`px-2 py-0.5 rounded-lg text-sm ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
                      "{selectedWord.word}"
                    </span>
                    at {level}
                  </>
                )}
              </button>
            </div>
          )}

          {/* Sentences list */}
          {sentences.length > 0 && (
            <div className="w-full max-w-2xl space-y-3 mb-6">
              <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold px-1">
                Choose one to save to your flashcards
              </p>
              {sentences.map((s, idx) => {
                const isSaved = savedIds.has(idx);
                const isSaving = savingIdx === idx;
                return (
                  <div
                    key={idx}
                    className={`bg-white/5 border rounded-2xl p-4 transition-all ${isSaved ? "border-emerald-500/40 bg-emerald-500/5" : "border-white/10 hover:border-violet-500/30"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Sentence number */}
                        <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">#{idx + 1}</span>
                        {/* Sentence with word highlighted */}
                        <p className="text-white text-base leading-relaxed mt-1">
                          {highlightWord(s.sentence, selectedWord?.word ?? "")}
                        </p>
                        {/* Translation */}
                        <p className="text-gray-400 text-sm mt-1 italic">{s.translation}</p>
                        {/* i+1 highlight */}
                        {s.highlight && (
                          <div className="mt-2 flex items-center gap-1.5">
                            <span className="text-[10px] text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 rounded-full px-2 py-0.5">
                              i+1: {s.highlight}
                            </span>
                          </div>
                        )}
                      </div>
                      {/* Save button */}
                      <button
                        onClick={() => handleSave(s, idx)}
                        disabled={isSaved || isSaving}
                        className={`shrink-0 text-xs font-semibold px-3 py-2 rounded-xl border transition-all ${
                          isSaved
                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 cursor-default"
                            : "bg-violet-600/30 hover:bg-violet-600/50 text-violet-200 border-violet-500/30"
                        }`}
                      >
                        {isSaving ? "..." : isSaved ? "✓ Saved" : "Save"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Saved sentences tab */}
      {tab === "saved" && (
        <div className="w-full max-w-2xl">
          {loadingSaved ? (
            <div className="flex justify-center py-12">
              <span className="w-8 h-8 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin" />
            </div>
          ) : savedSentences.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-4xl mb-3">📭</p>
              <p>No saved sentences yet.</p>
              <p className="text-sm mt-1">Generate some and save the ones you like.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {savedSentences.map((s) => {
                const isDue = new Date(s.next_review) <= new Date();
                const lvlCfg = levelConfig[s.level as CEFRLevel] ?? levelConfig["B1"];
                return (
                  <div key={s.id} className="bg-white/5 border border-white/10 rounded-2xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`text-[10px] font-bold border rounded-full px-2 py-0.5 ${lvlCfg.color} ${lvlCfg.bg} ${lvlCfg.border}`}>
                            {s.level}
                          </span>
                          <span className="text-xs text-violet-300 bg-violet-500/20 rounded-full px-2 py-0.5">
                            {s.word}
                          </span>
                        </div>
                        <p className="text-white text-sm leading-relaxed">{s.sentence}</p>
                        <p className="text-gray-400 text-xs mt-1 italic">{s.translation}</p>
                      </div>
                      <div className="text-right text-xs text-gray-500 shrink-0">
                        <div>{isDue ? <span className="text-orange-400 font-semibold">Review due</span> : `Next: ${s.next_review}`}</div>
                        <div className="mt-0.5">{s.repetitions}× reviewed</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {showFlashcards && (
        <SentenceFlashcardModal
          onClose={() => { setShowFlashcards(false); fetchDueCount(); }}
        />
      )}
    </main>
  );
}
