"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useTTS } from "../hooks/useTTS";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

interface Message {
  role: "user" | "assistant";
  content: string;
  translation?: string;
  loadingTranslation?: boolean;
}

interface WordTooltip {
  word: string;
  translation: string;
  phonetic?: string;
  partOfSpeech?: string;
  expression?: string | null;
  loading: boolean;
  saved: boolean;
  saving: boolean;
  x: number;
  y: number;
}

// ── Kokoro TTS singleton ──────────────────────────────────────────────
let kokoroInstance: import("kokoro-js").KokoroTTS | null = null;
let kokoroLoading = false;
let kokoroReady = false;

async function getKokoro() {
  if (kokoroInstance) return kokoroInstance;
  if (kokoroLoading) {
    await new Promise<void>((resolve) => {
      const check = setInterval(() => { if (kokoroReady) { clearInterval(check); resolve(); } }, 200);
    });
    return kokoroInstance!;
  }
  kokoroLoading = true;
  const { KokoroTTS } = await import("kokoro-js");
  kokoroInstance = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8", device: "wasm" });
  kokoroReady = true;
  kokoroLoading = false;
  return kokoroInstance;
}

async function speakWithKokoro(text: string, audioCtx: AudioContext) {
  const tts = await getKokoro();
  const audio = await tts.generate(text, { voice: "af_heart" });
  const pcm = audio.audio as Float32Array;
  const sampleRate = (audio.sampling_rate as number) ?? 24000;
  const buffer = audioCtx.createBuffer(1, pcm.length, sampleRate);
  buffer.copyToChannel(pcm as unknown as Float32Array<ArrayBuffer>, 0);
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(audioCtx.destination);
  source.start();
  return new Promise<void>((resolve) => { source.onended = () => resolve(); });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SR = any;
declare global {
  interface Window { SpeechRecognition: SR; webkitSpeechRecognition: SR; }
}

// Clickable word component
function ClickableText({ text, onWordClick }: { text: string; onWordClick: (word: string, e: React.MouseEvent) => void }) {
  return (
    <>
      {text.split(/(\s+)/).map((token, i) =>
        /\s+/.test(token) ? <span key={i}>{token}</span> : (
          <span
            key={i}
            onClick={(e) => onWordClick(token, e)}
            className="cursor-pointer hover:text-cyan-300 hover:underline decoration-dotted underline-offset-4 transition-colors rounded px-0.5"
          >
            {token}
          </span>
        )
      )}
    </>
  );
}

export default function SpeakPage() {
  const { speak } = useTTS();
  const [messages, setMessages] = useState<Message[]>([]);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [loadingTTS, setLoadingTTS] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [thinking, setThinking] = useState(false);
  const [ttsReady, setTtsReady] = useState(false);
  const [error, setError] = useState("");
  const [tooltip, setTooltip] = useState<WordTooltip | null>(null);
  const [inputMode, setInputMode] = useState<"voice" | "text">("voice");
  const [textInput, setTextInput] = useState("");

  const recognitionRef = useRef<SR | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<Message[]>([]);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const translationCache = useRef<Record<string, Omit<WordTooltip, "word" | "loading" | "saved" | "saving" | "x" | "y">>>({});

  useEffect(() => { historyRef.current = messages; }, [messages]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, thinking]);

  useEffect(() => {
    setLoadingTTS(true);
    getKokoro().then(() => { setTtsReady(true); setLoadingTTS(false); }).catch(() => setLoadingTTS(false));
  }, []);

  // Close tooltip on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) setTooltip(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleWordClick = useCallback(async (word: string, e: React.MouseEvent) => {
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
    speak(clean);

    try {
      const res = await fetch(`${API}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: clean, save: false }),
      });
      const data = await res.json();
      translationCache.current[clean] = { translation: data.translation, phonetic: data.phonetic, partOfSpeech: data.partOfSpeech, expression: data.expression ?? null };
      setTooltip({ word: clean, ...translationCache.current[clean], loading: false, saved: false, saving: false, x, y });
    } catch {
      setTooltip({ word: clean, translation: "Erro ao traduzir", loading: false, saved: false, saving: false, x, y });
    }
  }, [speak]);

  const translateMessage = useCallback(async (index: number) => {
    setMessages(prev => prev.map((m, i) => i === index ? { ...m, loadingTranslation: true } : m));
    try {
      const msg = messages[index];
      const res = await fetch(`${API}/translate-sentence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sentence: msg.content }),
      });
      const data = await res.json();
      setMessages(prev => prev.map((m, i) => i === index ? { ...m, translation: data.translation, loadingTranslation: false } : m));
    } catch {
      setMessages(prev => prev.map((m, i) => i === index ? { ...m, loadingTranslation: false } : m));
    }
  }, [messages]);

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

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setMessages(prev => [...prev, { role: "user", content: text }]);
    setThinking(true);
    setError("");
    try {
      const res = await fetch(`${API}/speak/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: historyRef.current.map(m => ({ role: m.role, content: m.content })) }),
      });
      const data = await res.json();
      const reply = data.reply as string;
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
      setThinking(false);
      setSpeaking(true);
      try {
        if (!audioCtxRef.current || audioCtxRef.current.state === "closed") audioCtxRef.current = new AudioContext();
        await speakWithKokoro(reply, audioCtxRef.current);
      } catch {
        const utt = new SpeechSynthesisUtterance(reply);
        utt.lang = "en-US"; utt.rate = 0.9;
        const american = window.speechSynthesis.getVoices().find(v => v.lang === "en-US");
        if (american) utt.voice = american;
        window.speechSynthesis.speak(utt);
        await new Promise<void>(resolve => { utt.onend = () => resolve(); });
      } finally {
        setSpeaking(false);
      }
    } catch {
      setThinking(false);
      setError("Failed to get response. Is the backend running?");
    }
  }, []);

  const startListening = useCallback(() => {
    if (listening || speaking || thinking) return;
    setError("");
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) { setError("Speech recognition not supported. Try Chrome."); return; }
    const recognition = new SR();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onresult = (e: { results: { [k: number]: { [k: number]: { transcript: string }; isFinal: boolean }; length: number } }) => {
      const result = e.results[e.results.length - 1];
      const text = result[0].transcript;
      setTranscript(text);
      if (result.isFinal) { setTranscript(""); sendMessage(text); }
    };
    recognition.onerror = (e: { error: string }) => {
      setListening(false);
      if (e.error !== "no-speech") setError(`Mic error: ${e.error}`);
    };
    recognitionRef.current = recognition;
    recognition.start();
  }, [listening, speaking, thinking, sendMessage]);

  const stopListening = useCallback(() => { recognitionRef.current?.stop(); setListening(false); }, []);

  return (
    <main className="min-h-screen bg-[#0f0f1a] text-white flex flex-col items-center px-4 py-10">
      {/* Header */}
      <div className="w-full max-w-2xl mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">Voice Chat</h1>
            <p className="text-gray-400 text-sm mt-1">Speak English with an AI. Click any word to translate.</p>
          </div>
          <div className="flex items-center gap-2">
            {loadingTTS && <span className="text-xs text-gray-500 flex items-center gap-1.5"><span className="w-3 h-3 border border-violet-400/30 border-t-violet-400 rounded-full animate-spin" />Loading voice...</span>}
            {ttsReady && <span className="text-xs text-emerald-400 flex items-center gap-1"><span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />Voice ready</span>}
            <button onClick={() => { setMessages([]); setTranscript(""); setError(""); }} className="text-xs text-gray-400 hover:text-white border border-white/10 hover:border-white/30 rounded-xl px-3 py-2 transition-all">Clear</button>
            <Link href="/" className="text-xs text-gray-400 hover:text-white border border-white/10 hover:border-white/30 rounded-xl px-3 py-2 transition-all">← Back</Link>
          </div>
        </div>
      </div>

      {/* Chat */}
      <div className="w-full max-w-2xl flex-1 mb-6">
        {messages.length === 0 && !thinking && (
          <div className="text-center py-16 text-gray-500">
            <div className="text-5xl mb-4">🎙️</div>
            <p className="text-lg font-semibold text-gray-400">Press the mic and start speaking</p>
            <p className="text-sm mt-1">Click any word in the AI response to translate it</p>
          </div>
        )}
        <div className="space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed leading-7 ${
                msg.role === "user"
                  ? "bg-violet-600/30 border border-violet-500/30 text-white rounded-br-sm"
                  : "bg-white/8 border border-white/10 text-gray-100 rounded-bl-sm"
              }`}>
                {msg.role === "assistant" && (
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[10px] text-cyan-400 font-semibold uppercase tracking-wider">AI</span>
                    {speaking && i === messages.length - 1 && (
                      <span className="flex gap-0.5">
                        {[0,1,2].map(j => <span key={j} className="w-1 h-3 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: `${j * 150}ms` }} />)}
                      </span>
                    )}
                  </div>
                )}
                <ClickableText text={msg.content} onWordClick={handleWordClick} />
              </div>
              {/* Translate sentence button */}
              {!msg.translation && !msg.loadingTranslation && (
                <button
                  onClick={() => translateMessage(i)}
                  className="mt-1 text-[10px] text-gray-500 hover:text-violet-400 transition-colors px-1"
                >
                  🌐 Traduzir frase
                </button>
              )}
              {msg.loadingTranslation && (
                <div className="mt-1 flex items-center gap-1 text-[10px] text-gray-500 px-1">
                  <span className="w-2.5 h-2.5 border border-violet-400/30 border-t-violet-400 rounded-full animate-spin" />
                  Traduzindo...
                </div>
              )}
              {msg.translation && (
                <div className="mt-1 max-w-[80%] text-xs text-gray-400 italic px-1 animate-fade-in">
                  {msg.translation}
                </div>
              )}
            </div>
          ))}
          {thinking && (
            <div className="flex justify-start">
              <div className="bg-white/8 border border-white/10 rounded-2xl rounded-bl-sm px-4 py-3">
                <div className="flex gap-1">{[0,1,2].map(i => <span key={i} className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />)}</div>
              </div>
            </div>
          )}
          {transcript && (
            <div className="flex justify-end">
              <div className="max-w-[80%] bg-violet-600/15 border border-violet-500/20 rounded-2xl rounded-br-sm px-4 py-3 text-sm text-violet-300 italic">{transcript}...</div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {error && <div className="w-full max-w-2xl mb-4"><p className="text-red-400 text-sm text-center">{error}</p></div>}

      {/* Input area */}
      <div className="w-full max-w-2xl flex flex-col items-center gap-3">
        {/* Mode toggle */}
        <div className="flex bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          <button
            onClick={() => setInputMode("voice")}
            className={`px-4 py-2 text-xs font-semibold transition-colors ${inputMode === "voice" ? "bg-violet-600/40 text-violet-300" : "text-gray-400 hover:text-white"}`}
          >
            🎙️ Voice
          </button>
          <button
            onClick={() => setInputMode("text")}
            className={`px-4 py-2 text-xs font-semibold transition-colors ${inputMode === "text" ? "bg-violet-600/40 text-violet-300" : "text-gray-400 hover:text-white"}`}
          >
            ⌨️ Type
          </button>
        </div>

        {/* Voice mode */}
        {inputMode === "voice" && (
          <>
            <button
              onClick={listening ? stopListening : startListening}
              disabled={speaking || thinking}
              className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl transition-all shadow-2xl disabled:opacity-40 disabled:cursor-not-allowed ${
                listening ? "bg-red-500 hover:bg-red-400 shadow-red-500/40 scale-110 animate-pulse"
                : speaking ? "bg-cyan-600 shadow-cyan-500/40 scale-105"
                : thinking ? "bg-gray-600 shadow-gray-500/20"
                : "bg-gradient-to-br from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 shadow-violet-500/30 hover:scale-105"
              }`}
            >
              {listening ? "⏹" : speaking ? "🔊" : thinking ? "⏳" : "🎙️"}
            </button>
            <p className="text-xs text-gray-500">
              {listening ? "Listening... tap to stop" : speaking ? "AI is speaking..." : thinking ? "Thinking..." : "Tap to speak"}
            </p>
          </>
        )}

        {/* Text mode */}
        {inputMode === "text" && (
          <div className="w-full flex gap-2">
            <input
              type="text"
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey && textInput.trim()) {
                  e.preventDefault();
                  sendMessage(textInput.trim());
                  setTextInput("");
                }
              }}
              disabled={speaking || thinking}
              placeholder="Type your message in English..."
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-violet-500/60 transition-all disabled:opacity-50"
            />
            <button
              onClick={() => { if (textInput.trim()) { sendMessage(textInput.trim()); setTextInput(""); } }}
              disabled={speaking || thinking || !textInput.trim()}
              className="bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-4 py-3 rounded-xl transition-all text-sm"
            >
              {thinking ? "⏳" : speaking ? "🔊" : "Send"}
            </button>
          </div>
        )}
      </div>

      {/* Word Tooltip */}
      {tooltip && (
        <div ref={tooltipRef} className="fixed z-50 animate-fade-in" style={{ left: tooltip.x, top: tooltip.y - 8, transform: "translate(-50%, -100%)" }}>
          <div className="bg-[#1e1e30] border border-violet-500/40 rounded-xl shadow-2xl px-4 py-3 min-w-[160px] max-w-[230px]">
            <div className="flex items-center justify-between gap-3 mb-1">
              <div>
                <span className="text-white font-bold text-sm">{tooltip.word}</span>
                {tooltip.expression && tooltip.expression !== tooltip.word && (
                  <div className="text-[10px] text-cyan-400 mt-0.5">🔗 "{tooltip.expression}"</div>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {tooltip.partOfSpeech && (
                  <span className="text-[10px] text-violet-400 bg-violet-500/20 rounded-full px-2 py-0.5 shrink-0">{tooltip.partOfSpeech}</span>
                )}
                <button onClick={() => speak(tooltip.word)} className="text-gray-400 hover:text-white transition-colors text-base leading-none" title="Play pronunciation">🔊</button>
              </div>
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
                    tooltip.saved ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-default"
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
