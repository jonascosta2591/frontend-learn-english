"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Word, Tile, isPair, formatTime, shuffle } from "./gameLogic";
import { useAuth } from "../context/AuthContext";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
const RECORD_KEY = "game-comparation-record";
const GAME_DURATION = 120;
const MAX_TILES = 12; // always keep up to 12 tiles on screen

type Phase = "loading" | "error" | "playing" | "gameover";

function readRecord(): number {
  try { return parseInt(localStorage.getItem(RECORD_KEY) ?? "0", 10) || 0; } catch { return 0; }
}
function saveRecord(score: number) {
  try { localStorage.setItem(RECORD_KEY, String(score)); } catch { /* ignore */ }
}

// Build 2 tiles (en + pt) for a single word, inserted at random positions
function makePairTiles(word: Word): [Tile, Tile] {
  return [
    { id: `en-${word.id}`, pairId: word.id, text: word.word, lang: "en", state: "idle" },
    { id: `pt-${word.id}`, pairId: word.id, text: word.translation, lang: "pt", state: "idle" },
  ];
}

// Insert tiles at random positions in the existing array
function insertAtRandom(existing: Tile[], newTiles: Tile[]): Tile[] {
  const result = [...existing];
  for (const t of newTiles) {
    const pos = Math.floor(Math.random() * (result.length + 1));
    result.splice(pos, 0, t);
  }
  return result;
}

export default function GameComparationPage() {
  const { authFetch } = useAuth();
  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [selection, setSelection] = useState<Tile | null>(null);
  const [score, setScore] = useState(0);
  const [record, setRecord] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [newRecord, setNewRecord] = useState(false);
  const wordPoolRef = useRef<Word[]>([]);
  const pendingPoolRef = useRef<Word[]>([]); // words not yet on screen
  const locked = useRef(false);

  const buildInitialTiles = (pool: Word[]): Tile[] => {
    const pairs = shuffle([...pool]).slice(0, MAX_TILES / 2);
    const tiles: Tile[] = [];
    for (const w of pairs) {
      tiles.push({ id: `en-${w.id}`, pairId: w.id, text: w.word, lang: "en", state: "idle" });
      tiles.push({ id: `pt-${w.id}`, pairId: w.id, text: w.translation, lang: "pt", state: "idle" });
    }
    // remaining words go to pending pool
    const usedIds = new Set(pairs.map(w => w.id));
    pendingPoolRef.current = shuffle(pool.filter(w => !usedIds.has(w.id)));
    return shuffle(tiles);
  };

  const loadWords = useCallback(async () => {
    setPhase("loading");
    setErrorMsg("");
    try {
      const res = await authFetch(`${API}/words`);
      const data: Word[] = await res.json();
      if (!Array.isArray(data) || data.length < 6) {
        setErrorMsg("Not enough words. Translate at least 6 words first.");
        setPhase("error");
        return;
      }
      wordPoolRef.current = data;
      setRecord(readRecord());
      setTiles(buildInitialTiles(data));
      setScore(0);
      setTimeLeft(GAME_DURATION);
      setSelection(null);
      setNewRecord(false);
      locked.current = false;
      setPhase("playing");
    } catch {
      setErrorMsg("Failed to load words. Is the backend running?");
      setPhase("error");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { loadWords(); }, [loadWords]);

  // Timer
  useEffect(() => {
    if (phase !== "playing") return;
    const id = setInterval(() => {
      setTimeLeft(t => (t <= 1 ? 0 : t - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  // Game over
  useEffect(() => {
    if (phase === "playing" && timeLeft === 0) {
      setPhase("gameover");
      setScore(prev => {
        const rec = readRecord();
        if (prev >= rec) {
          saveRecord(prev);
          setRecord(prev);
          setNewRecord(prev > rec || rec === 0);
        }
        return prev;
      });
    }
  }, [timeLeft, phase]);

  const handleTileClick = (tile: Tile) => {
    if (phase !== "playing" || locked.current || tile.state !== "idle" && tile.state !== "selected") return;

    if (!selection) {
      setTiles(prev => prev.map(t => t.id === tile.id ? { ...t, state: "selected" } : t));
      setSelection(tile);
      return;
    }

    if (selection.id === tile.id) {
      setTiles(prev => prev.map(t => t.id === tile.id ? { ...t, state: "idle" } : t));
      setSelection(null);
      return;
    }

    if (selection.lang === tile.lang) {
      setTiles(prev => prev.map(t => {
        if (t.id === selection.id) return { ...t, state: "idle" };
        if (t.id === tile.id) return { ...t, state: "selected" };
        return t;
      }));
      setSelection(tile);
      return;
    }

    // Evaluate
    locked.current = true;
    const selId = selection.id;
    const tileId = tile.id;

    if (isPair(selection, tile)) {
      // Match — flash green, then remove and inject new pair
      setTiles(prev => prev.map(t =>
        t.id === selId || t.id === tileId ? { ...t, state: "matched" } : t
      ));
      setSelection(null);
      setScore(s => s + 1);

      setTimeout(() => {
        setTiles(prev => {
          const remaining = prev.filter(t => t.state !== "matched");
          // Inject next pair from pending pool if available
          const pending = pendingPoolRef.current;
          if (pending.length > 0) {
            const next = pending[0];
            pendingPoolRef.current = pending.slice(1);
            const [t1, t2] = makePairTiles(next);
            return insertAtRandom(remaining, [t1, t2]);
          }
          // Pool exhausted — refill from full word pool
          if (remaining.length === 0) {
            pendingPoolRef.current = shuffle([...wordPoolRef.current]);
            const next = pendingPoolRef.current[0];
            pendingPoolRef.current = pendingPoolRef.current.slice(1);
            const [t1, t2] = makePairTiles(next);
            return [t1, t2];
          }
          return remaining;
        });
        locked.current = false;
      }, 350);
    } else {
      // Mismatch — flash red
      setTiles(prev => prev.map(t =>
        t.id === selId || t.id === tileId ? { ...t, state: "wrong" } : t
      ));
      setSelection(null);
      setTimeout(() => {
        setTiles(prev => prev.map(t =>
          t.id === selId || t.id === tileId ? { ...t, state: "idle" } : t
        ));
        locked.current = false;
      }, 600);
    }
  };

  const handlePlayAgain = () => {
    setTiles(buildInitialTiles(wordPoolRef.current));
    setScore(0);
    setTimeLeft(GAME_DURATION);
    setSelection(null);
    setNewRecord(false);
    locked.current = false;
    setPhase("playing");
  };

  const tileStyle = (t: Tile) => {
    const base = "relative flex items-center justify-center text-center px-3 py-4 rounded-2xl border text-sm font-semibold cursor-pointer select-none transition-all duration-200 min-h-[64px]";
    if (t.state === "selected") return `${base} bg-violet-600/40 border-violet-400 text-white scale-105 shadow-lg shadow-violet-500/20`;
    if (t.state === "matched") return `${base} bg-emerald-500/30 border-emerald-400 text-emerald-300`;
    if (t.state === "wrong") return `${base} bg-red-500/30 border-red-400 text-red-300 animate-pulse`;
    return `${base} bg-white/5 border-white/10 text-gray-200 hover:bg-white/10 hover:border-violet-500/40 hover:text-white`;
  };

  return (
    <main className="min-h-screen bg-[#0f0f1a] text-white flex flex-col items-center px-4 py-10">
      {/* Header */}
      <div className="w-full max-w-2xl mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
              Match Game
            </h1>
            <p className="text-gray-400 text-sm mt-1">Match English words with their Portuguese translations.</p>
          </div>
          <Link href="/" className="text-xs text-gray-400 hover:text-white border border-white/10 hover:border-white/30 rounded-xl px-3 py-2 transition-all">
            ← Reading
          </Link>
        </div>
      </div>

      {phase === "loading" && (
        <div className="flex items-center gap-3 py-20">
          <span className="w-6 h-6 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin" />
          <span className="text-gray-400">Loading words...</span>
        </div>
      )}

      {phase === "error" && (
        <div className="text-center py-20">
          <p className="text-red-400 mb-4">{errorMsg}</p>
          <button onClick={loadWords} className="bg-violet-600 hover:bg-violet-500 text-white font-semibold px-6 py-2.5 rounded-xl transition-all text-sm">
            Retry
          </button>
        </div>
      )}

      {(phase === "playing" || phase === "gameover") && (
        <>
          {/* Score bar */}
          <div className="w-full max-w-2xl mb-6">
            <div className="bg-white/5 border border-white/10 rounded-2xl px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <div className="text-2xl font-black text-violet-300">{score}</div>
                  <div className="text-[10px] text-gray-400 uppercase tracking-widest">Score</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-black text-cyan-300">{record}</div>
                  <div className="text-[10px] text-gray-400 uppercase tracking-widest">Record</div>
                </div>
              </div>
              <div className={`text-3xl font-black font-mono tabular-nums ${timeLeft <= 10 ? "text-red-400 animate-pulse" : "text-white"}`}>
                {formatTime(timeLeft)}
              </div>
            </div>
          </div>

          {/* Tile grid */}
          {phase === "playing" && (
            <div className="w-full max-w-2xl">
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {tiles.map(tile => (
                  <div key={tile.id} className={tileStyle(tile)} onClick={() => handleTileClick(tile)}>
                    <span className="leading-tight">{tile.text}</span>
                    {tile.lang === "en" && (
                      <span className="absolute top-1.5 right-2 text-[9px] text-gray-500 font-normal">EN</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Game over */}
          {phase === "gameover" && (
            <div className="w-full max-w-md animate-fade-in">
              <div className="bg-[#13131f] border border-white/10 rounded-2xl p-8 text-center shadow-2xl">
                <div className="text-5xl mb-4">{newRecord ? "🏆" : "⏱️"}</div>
                <h2 className="text-2xl font-black text-white mb-1">Time&apos;s up!</h2>
                {newRecord && (
                  <div className="inline-flex items-center gap-1.5 bg-yellow-500/20 border border-yellow-500/40 rounded-full px-3 py-1 mb-4">
                    <span className="text-yellow-400 text-sm font-bold">🎉 New Record!</span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4 my-6">
                  <div className="bg-white/5 rounded-2xl p-4">
                    <div className="text-4xl font-black text-violet-300">{score}</div>
                    <div className="text-xs text-gray-400 mt-1 uppercase tracking-widest">Score</div>
                  </div>
                  <div className="bg-white/5 rounded-2xl p-4">
                    <div className="text-4xl font-black text-cyan-300">{record}</div>
                    <div className="text-xs text-gray-400 mt-1 uppercase tracking-widest">Record</div>
                  </div>
                </div>
                <button
                  onClick={handlePlayAgain}
                  className="w-full bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white font-bold py-3.5 rounded-xl transition-all"
                >
                  Play again →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
