"use client";

import { useState, useEffect, useCallback, useRef } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
const AGAIN_DELAY_MS = 60_000;

interface SentenceCard {
  id: number;
  sentence: string;
  translation: string;
  word: string;
  level: string;
  interval: number;
  repetitions: number;
  next_review: string;
}

interface PendingCard {
  card: SentenceCard;
  readyAt: number;
}

interface Props {
  onClose: () => void;
}

const qualityLabels = [
  { q: 5, label: "Easy",  color: "bg-emerald-600 hover:bg-emerald-500", emoji: "😄" },
  { q: 3, label: "Good",  color: "bg-cyan-600 hover:bg-cyan-500",       emoji: "🙂" },
  { q: 1, label: "Hard",  color: "bg-orange-600 hover:bg-orange-500",   emoji: "😓" },
  { q: 0, label: "Again", color: "bg-red-700 hover:bg-red-600",         emoji: "❌" },
];

export default function SentenceFlashcardModal({ onClose }: Props) {
  const [queue, setQueue] = useState<SentenceCard[]>([]);
  const [pending, setPending] = useState<PendingCard[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [passed, setPassed] = useState(0);
  const [total, setTotal] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [tab, setTab] = useState<"review" | "all">("review");
  const [allCards, setAllCards] = useState<SentenceCard[]>([]);
  const [loadingAll, setLoadingAll] = useState(false);
  const firstSeenRef = useRef<Set<number>>(new Set());
  const [repeatingIds, setRepeatingIds] = useState<Set<number>>(new Set());

  // Tick for pending countdown
  useEffect(() => {
    const id = setInterval(() => {
      const ts = Date.now();
      setNow(ts);
      setPending((prev) => {
        const ready = prev.filter((p) => ts >= p.readyAt);
        if (ready.length === 0) return prev;
        setQueue((q) => {
          const existingIds = new Set(q.map((c) => c.id));
          const toInsert = ready.map((p) => p.card).filter((c) => !existingIds.has(c.id));
          if (toInsert.length === 0) return q;
          if (q.length === 0) { setRevealed(false); setDone(false); return toInsert; }
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
      const res = await fetch(`${API}/sentences/due`);
      const data: SentenceCard[] = await res.json();
      const seen = new Set<number>();
      const unique = data.filter((c) => seen.has(c.id) ? false : (seen.add(c.id), true));
      setQueue(unique);
      setTotal(unique.length);
      setPassed(0);
      setPending([]);
      firstSeenRef.current = new Set();
      setRepeatingIds(new Set());
      setDone(unique.length === 0);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setLoadingAll(true);
    try {
      const res = await fetch(`${API}/sentences`);
      setAllCards(await res.json());
    } finally {
      setLoadingAll(false);
    }
  }, []);

  useEffect(() => { fetchDue(); }, [fetchDue]);
  useEffect(() => { if (tab === "all") fetchAll(); }, [tab, fetchAll]);

  const current = queue[0];
  const progress = total > 0 ? (passed / total) * 100 : 100;

  // Track repeating
  useEffect(() => {
    if (!current) return;
    if (firstSeenRef.current.has(current.id)) {
      setRepeatingIds((prev) => new Set(prev).add(current.id));
    } else {
      firstSeenRef.current.add(current.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  // Done check
  useEffect(() => {
    if (!loading && queue.length === 0 && pending.length === 0 && total > 0) setDone(true);
    else if (queue.length > 0) setDone(false);
  }, [queue.length, pending.length, loading, total]);

  const handleQuality = async (quality: number) => {
    const card = queue[0];
    const remaining = queue.slice(1);

    if (quality >= 3) {
      await fetch(`${API}/sentences/${card.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quality }),
      });
      setPassed((p) => p + 1);
      setQueue(remaining);
      setRevealed(false);
    } else {
      // Again — park for 1 minute, no DB update
      setPending((prev) => [...prev, { card, readyAt: Date.now() + AGAIN_DELAY_MS }]);
      setQueue(remaining);
      setRevealed(false);
    }
  };

  const nextReadyIn = pending.length > 0
    ? Math.max(0, Math.ceil((Math.min(...pending.map((p) => p.readyAt)) - now) / 1000))
    : null;

  // Highlight target word in sentence
  const highlightWord = (sentence: string, word: string) => {
    if (!word) return sentence;
    const regex = new RegExp(`(\\b${word}\\b)`, "gi");
    const parts = sentence.split(regex);
    return parts.map((part, i) =>
      regex.test(part)
        ? <mark key={i} className="bg-violet-500/30 text-violet-200 rounded px-0.5 not-italic font-semibold">{part}</mark>
        : <span key={i}>{part}</span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#13131f] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/10">
          <h2 className="text-lg font-bold text-white">Sentence Flashcards</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl transition-colors">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10">
          <button
            onClick={() => setTab("review")}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${tab === "review" ? "text-violet-400 border-b-2 border-violet-400" : "text-gray-400 hover:text-white"}`}
          >
            Revisar {queue.length > 0 && !done && <span className="ml-1 bg-violet-500/30 text-violet-300 text-xs rounded-full px-1.5">{queue.length}</span>}
          </button>
          <button
            onClick={() => setTab("all")}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${tab === "all" ? "text-violet-400 border-b-2 border-violet-400" : "text-gray-400 hover:text-white"}`}
          >
            Todas
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
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
                </div>
              ) : queue.length === 0 && pending.length > 0 ? (
                <div className="text-center py-12">
                  <div className="text-5xl mb-4">⏳</div>
                  <p className="text-white font-bold text-lg">Aguardando...</p>
                  <div className="mt-4 inline-flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-full px-4 py-2">
                    <span className="w-2 h-2 bg-red-400 rounded-full animate-pulse" />
                    <span className="text-red-300 font-mono font-bold text-lg">
                      {String(Math.floor((nextReadyIn ?? 0) / 60)).padStart(2, "0")}:
                      {String((nextReadyIn ?? 0) % 60).padStart(2, "0")}
                    </span>
                  </div>
                </div>
              ) : (
                <>
                  {/* Progress */}
                  <div className="mb-5">
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>{passed} / {total} concluídas</span>
                      <div className="flex gap-2">
                        {pending.length > 0 && <span className="text-red-400">⏳ {pending.length}</span>}
                        <span>{queue.length} restantes</span>
                      </div>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-1.5">
                      <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-500 transition-all duration-500" style={{ width: `${progress}%` }} />
                    </div>
                  </div>

                  {/* Card */}
                  {current && (<>
                  <div
                    className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center cursor-pointer select-none min-h-[200px] flex flex-col items-center justify-center transition-all hover:bg-white/8"
                    onClick={() => { if (!revealed) setRevealed(true); }}
                  >
                    {repeatingIds.has(current.id) && (
                      <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 rounded-full px-2 py-0.5 mb-3">
                        🔁 Repetindo
                      </span>
                    )}

                    {/* Front: sentence in English */}
                    <p className="text-xs text-gray-400 uppercase tracking-widest mb-3">Read the sentence</p>
                    <p className="text-white text-base leading-relaxed">
                      {highlightWord(current.sentence, current.word)}
                    </p>
                    <span className="text-xs bg-violet-500/20 text-violet-300 border border-violet-500/30 rounded-full px-2 py-0.5 mt-3">
                      word: {current.word}
                    </span>

                    {!revealed ? (
                      <p className="text-gray-500 text-sm mt-5">Clique para revelar a tradução</p>
                    ) : (
                      <div className="mt-5 animate-fade-in w-full">
                        <div className="h-px bg-white/10 mb-4" />
                        <p className="text-lg font-semibold text-cyan-300 leading-relaxed">
                          {current.translation}
                        </p>
                      </div>
                    )}
                  </div>

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
                  </>)}
                </>
              )}
            </div>
          )}

          {tab === "all" && (
            <div className="p-4">
              {loadingAll ? (
                <div className="flex justify-center py-12">
                  <span className="w-8 h-8 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin" />
                </div>
              ) : allCards.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">
                  Nenhuma frase salva ainda.
                </div>
              ) : (
                <div className="space-y-2">
                  {allCards.map((c) => {
                    const isDue = new Date(c.next_review) <= new Date();
                    return (
                      <div key={c.id} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm leading-relaxed">{c.sentence}</p>
                            <p className="text-gray-400 text-xs mt-0.5 italic">{c.translation}</p>
                            <span className="text-[10px] text-violet-400 bg-violet-500/20 rounded-full px-1.5 py-0.5 mt-1 inline-block">{c.word}</span>
                          </div>
                          <div className="text-right text-xs text-gray-500 shrink-0">
                            <div>{isDue ? <span className="text-orange-400 font-semibold">Revisar</span> : `em ${c.next_review}`}</div>
                            <div className="mt-0.5">{c.repetitions}× revisado</div>
                          </div>
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
