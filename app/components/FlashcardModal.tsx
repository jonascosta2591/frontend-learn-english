"use client";

import { useState, useEffect, useCallback, useRef } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
const AGAIN_DELAY_MS = 60_000; // 1 minute

interface Word {
  id: number;
  word: string;
  translation: string;
  phonetic?: string;
  part_of_speech?: string;
  interval: number;
  repetitions: number;
  ease_factor: number;
  next_review: string;
}

interface PendingWord {
  word: Word;
  readyAt: number; // timestamp ms
}

interface Props {
  onClose: () => void;
  onXPEarned: (amount: number) => void;
}

const qualityLabels = [
  { q: 5, label: "Easy", color: "bg-emerald-600 hover:bg-emerald-500", emoji: "😄" },
  { q: 3, label: "Good", color: "bg-cyan-600 hover:bg-cyan-500", emoji: "🙂" },
  { q: 1, label: "Hard", color: "bg-orange-600 hover:bg-orange-500", emoji: "😓" },
  { q: 0, label: "Again", color: "bg-red-700 hover:bg-red-600", emoji: "❌" },
];

export default function FlashcardModal({ onClose, onXPEarned }: Props) {
  const [dueWords, setDueWords] = useState<Word[]>([]);
  const [pendingWords, setPendingWords] = useState<PendingWord[]>([]);
  const [current, setCurrent] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [sessionXP, setSessionXP] = useState(0);
  const [tab, setTab] = useState<"review" | "all">("review");
  const [allWords, setAllWords] = useState<Word[]>([]);
  const [loadingAll, setLoadingAll] = useState(false);
  const [totalOriginal, setTotalOriginal] = useState(0);
  const [passed, setPassed] = useState(0);
  const [repeatingIds, setRepeatingIds] = useState<Set<number>>(new Set());
  const [now, setNow] = useState(Date.now());
  const firstSeenRef = useRef<Set<number>>(new Set());

  // Tick every second to update countdowns and release pending words
  useEffect(() => {
    const id = setInterval(() => {
      const ts = Date.now();
      setNow(ts);
      setPendingWords((prev) => {
        const ready = prev.filter((p) => ts >= p.readyAt);
        if (ready.length === 0) return prev;
        setDueWords((q) => {
          const readyWords = ready.map((p) => p.word);
          const existingIds = new Set(q.map((w) => w.id));
          // Only insert words not already in the queue
          const toInsert = readyWords.filter((w) => !existingIds.has(w.id));
          if (toInsert.length === 0) return q;
          if (q.length === 0) {
            setCurrent(0);
            setRevealed(false);
            return toInsert;
          }
          const next = [...q];
          next.splice(1, 0, ...toInsert);
          return next;
        });
        setDone(false);
        return prev.filter((p) => ts < p.readyAt);
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const fetchDue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/words/due`);
      const data = await res.json();
      // Deduplicate by id just in case
      const seen = new Set<number>();
      const unique = data.filter((w: Word) => seen.has(w.id) ? false : (seen.add(w.id), true));
      setDueWords(unique);
      setTotalOriginal(unique.length);
      setPassed(0);
      setPendingWords([]);
      setRepeatingIds(new Set());
      firstSeenRef.current = new Set();
      setDone(unique.length === 0);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setLoadingAll(true);
    try {
      const res = await fetch(`${API}/words`);
      setAllWords(await res.json());
    } finally {
      setLoadingAll(false);
    }
  }, []);

  useEffect(() => { fetchDue(); }, [fetchDue]);
  useEffect(() => { if (tab === "all") fetchAll(); }, [tab, fetchAll]);

  const currentWord = dueWords[current];
  const progress = totalOriginal > 0 ? (passed / totalOriginal) * 100 : 100;

  // Track seen words for "Repetindo" badge
  useEffect(() => {
    if (!currentWord) return;
    if (firstSeenRef.current.has(currentWord.id)) {
      setRepeatingIds((prev) => new Set(prev).add(currentWord.id));
    } else {
      firstSeenRef.current.add(currentWord.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWord?.id]);

  // Check done: no active cards AND no pending
  useEffect(() => {
    if (!loading && dueWords.length === 0 && pendingWords.length === 0 && totalOriginal > 0) {
      setDone(true);
    } else if (dueWords.length > 0) {
      setDone(false);
    }
  }, [dueWords.length, pendingWords.length, loading, totalOriginal]);

  const handleQuality = async (quality: number) => {
    const word = dueWords[current];

    // Only persist to DB when passing — Again is session-only
    if (quality >= 3) {
      await fetch(`${API}/words/${word.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quality }),
      });
      const earned = 2;
      setSessionXP((s) => s + earned);
      onXPEarned(earned);
      setPassed((p) => p + 1);
      const remaining = dueWords.filter((_, i) => i !== current);
      setDueWords(remaining);
      setCurrent(0);
      setRevealed(false);
    } else {
      // Again — park word for 1 minute, no DB update
      setPendingWords((prev) => [...prev, { word, readyAt: Date.now() + AGAIN_DELAY_MS }]);
      const remaining = dueWords.filter((_, i) => i !== current);
      setDueWords(remaining);
      setCurrent(0);
      setRevealed(false);
    }
  };

  // Smallest countdown among pending words
  const nextReadyIn = pendingWords.length > 0
    ? Math.max(0, Math.ceil((Math.min(...pendingWords.map((p) => p.readyAt)) - now) / 1000))
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#13131f] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/10">
          <div>
            <h2 className="text-lg font-bold text-white">Flashcards</h2>
            {sessionXP > 0 && (
              <span className="text-xs text-violet-400">+{sessionXP} XP esta sessão</span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl transition-colors">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10">
          <button
            onClick={() => setTab("review")}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${tab === "review" ? "text-violet-400 border-b-2 border-violet-400" : "text-gray-400 hover:text-white"}`}
          >
            Revisar {dueWords.length > 0 && !done && (
              <span className="ml-1 bg-violet-500/30 text-violet-300 text-xs rounded-full px-1.5">{dueWords.length}</span>
            )}
          </button>
          <button
            onClick={() => setTab("all")}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${tab === "all" ? "text-violet-400 border-b-2 border-violet-400" : "text-gray-400 hover:text-white"}`}
          >
            Todas as palavras
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* REVIEW TAB */}
          {tab === "review" && (
            <div className="p-6">
              {loading ? (
                <div className="flex justify-center py-12">
                  <span className="w-8 h-8 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin" />
                </div>
              ) : done ? (
                <div className="text-center py-12">
                  <div className="text-5xl mb-4">🎉</div>
                  <p className="text-white font-bold text-lg">Tudo revisado!</p>
                  <p className="text-gray-400 text-sm mt-1">Volte amanhã para novas revisões.</p>
                  {sessionXP > 0 && (
                    <p className="text-violet-400 font-semibold mt-3">+{sessionXP} XP ganhos</p>
                  )}
                </div>
              ) : dueWords.length === 0 && pendingWords.length > 0 ? (
                /* Waiting screen */
                <div className="text-center py-12">
                  <div className="text-5xl mb-4">⏳</div>
                  <p className="text-white font-bold text-lg">Aguardando...</p>
                  <p className="text-gray-400 text-sm mt-1">
                    {pendingWords.length} palavra{pendingWords.length > 1 ? "s" : ""} voltando em breve.
                  </p>
                  <div className="mt-4 inline-flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-full px-4 py-2">
                    <span className="w-2 h-2 bg-red-400 rounded-full animate-pulse" />
                    <span className="text-red-300 font-mono font-bold text-lg">
                      {String(Math.floor((nextReadyIn ?? 0) / 60)).padStart(2, "0")}:
                      {String((nextReadyIn ?? 0) % 60).padStart(2, "0")}
                    </span>
                  </div>
                  <div className="mt-4 space-y-2">
                    {pendingWords.map((p) => {
                      const secs = Math.max(0, Math.ceil((p.readyAt - now) / 1000));
                      return (
                        <div key={p.word.id} className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-2 text-sm">
                          <span className="text-white font-semibold">{p.word.word}</span>
                          <span className="text-gray-400 font-mono text-xs">
                            {String(Math.floor(secs / 60)).padStart(2, "0")}:{String(secs % 60).padStart(2, "0")}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <>
                  {/* Progress */}
                  <div className="mb-5">
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>{passed} / {totalOriginal} concluídas</span>
                      <div className="flex items-center gap-2">
                        {pendingWords.length > 0 && (
                          <span className="text-red-400">⏳ {pendingWords.length} aguardando</span>
                        )}
                        <span>{dueWords.length} restantes</span>
                      </div>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-1.5">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-500 transition-all duration-500"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  {/* Card */}
                  <div
                    className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center cursor-pointer select-none min-h-[180px] flex flex-col items-center justify-center transition-all hover:bg-white/8"
                    onClick={() => { if (!revealed) setRevealed(true); }}
                  >
                    {repeatingIds.has(currentWord.id) && (
                      <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 rounded-full px-2 py-0.5 mb-3">
                        🔁 Repetindo
                      </span>
                    )}
                    <div className="text-2xl font-black text-white mb-1">{currentWord.word}</div>
                    {currentWord.part_of_speech && (
                      <span className="text-xs bg-violet-500/20 text-violet-300 border border-violet-500/30 rounded-full px-2 py-0.5 mb-4">
                        {currentWord.part_of_speech}
                      </span>
                    )}
                    {!revealed ? (
                      <p className="text-gray-500 text-sm mt-4">Clique para revelar a tradução</p>
                    ) : (
                      <div className="mt-4 animate-fade-in">
                        <div className="text-2xl font-bold text-cyan-300">{currentWord.translation}</div>
                      </div>
                    )}
                  </div>

                  {/* Quality buttons */}
                  {revealed && (
                    <div className="mt-5 animate-fade-in">
                      <p className="text-xs text-gray-400 text-center mb-3">Como foi?</p>
                      <div className="grid grid-cols-4 gap-2">
                        {qualityLabels.map(({ q, label, color, emoji }) => (
                          <button
                            key={q}
                            onClick={() => handleQuality(q)}
                            className={`${color} text-white text-xs font-semibold py-2.5 rounded-xl transition-all flex flex-col items-center gap-1`}
                          >
                            <span>{emoji}</span>
                            <span>{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {!revealed && (
                    <button
                      onClick={() => setRevealed(true)}
                      className="w-full mt-4 bg-violet-600 hover:bg-violet-500 text-white font-semibold py-3 rounded-xl transition-all text-sm"
                    >
                      Mostrar tradução
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* ALL WORDS TAB */}
          {tab === "all" && (
            <div className="p-4">
              {loadingAll ? (
                <div className="flex justify-center py-12">
                  <span className="w-8 h-8 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin" />
                </div>
              ) : allWords.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">
                  Nenhuma palavra ainda. Clique nas palavras do texto para traduzir!
                </div>
              ) : (
                <div className="space-y-2">
                  {allWords.map((w) => {
                    const isDue = new Date(w.next_review) <= new Date();
                    return (
                      <div key={w.id} className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                        <div>
                          <span className="text-white font-semibold text-sm">{w.word}</span>
                          {w.part_of_speech && (
                            <span className="ml-2 text-[10px] text-violet-400 bg-violet-500/20 rounded-full px-1.5 py-0.5">{w.part_of_speech}</span>
                          )}
                          <div className="text-cyan-300 text-xs mt-0.5">{w.translation}</div>
                        </div>
                        <div className="text-right text-xs text-gray-500 shrink-0 ml-3">
                          <div>{isDue ? <span className="text-orange-400 font-semibold">Revisar</span> : `em ${w.next_review}`}</div>
                          <div className="mt-0.5">{w.repetitions}× revisado</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
