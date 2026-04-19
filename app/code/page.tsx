"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import ChallengeUI from "./ChallengeUI";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

interface TestCase { input: unknown; expected: unknown; label: string; }

interface Challenge {
  id: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  bugDescription: string;
  expectedBehavior: string;
  functionName: string;
  buggyCode: string;
  uiType: string;
  testCases: TestCase[];
}

const difficultyConfig = {
  easy:   { color: "text-emerald-400", bg: "bg-emerald-500/20", border: "border-emerald-500/40", label: "Easy" },
  medium: { color: "text-yellow-400",  bg: "bg-yellow-500/20",  border: "border-yellow-500/40",  label: "Medium" },
  hard:   { color: "text-red-400",     bg: "bg-red-500/20",     border: "border-red-500/40",     label: "Hard" },
};

const scoreConfig = {
  perfect: { color: "text-emerald-400", emoji: "🏆", label: "Perfect fix!" },
  good:    { color: "text-cyan-400",    emoji: "✅", label: "Good fix!" },
  partial: { color: "text-yellow-400",  emoji: "🔧", label: "Partially fixed" },
  wrong:   { color: "text-red-400",     emoji: "❌", label: "Not fixed yet" },
};

interface TestResult { label: string; passed: boolean; got: unknown; expected: unknown; buggyGot: unknown; }

function makeFunction(code: string, name: string): ((...args: unknown[]) => unknown) | null {
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(`${cleanCode(code)}; return ${name};`)();
    return typeof fn === "function" ? fn as (...args: unknown[]) => unknown : null;
  } catch { return null; }
}

function runTests(challenge: Challenge, fn: ((...args: unknown[]) => unknown) | null): TestResult[] {
  if (!fn) return [];
  const buggyFn = makeFunction(challenge.buggyCode, challenge.functionName);
  return challenge.testCases.map(tc => {
    try {
      const args = Array.isArray(tc.input) ? tc.input as unknown[] : [tc.input];
      const got = fn(...args);
      const buggyGot = buggyFn ? (() => { try { return buggyFn(...args); } catch { return "error"; } })() : "n/a";
      const passed = JSON.stringify(got) === JSON.stringify(tc.expected);
      return { label: tc.label, passed, got, expected: tc.expected, buggyGot };
    } catch (e) {
      return { label: tc.label, passed: false, got: String(e), expected: tc.expected, buggyGot: "n/a" };
    }
  });
}

function cleanCode(raw: string) {
  return raw.replace(/^```[\w]*\n?/gm, "").replace(/```$/gm, "").trim();
}

export default function CodePage() {
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [loadingChallenge, setLoadingChallenge] = useState(false);
  const [code, setCode] = useState("");
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState<{ fixed: boolean; score: string; feedback: string; hint: string | null; xp: number } | null>(null);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [totalXP, setTotalXP] = useState(0);
  const [solvedCount, setSolvedCount] = useState(0);
  const [syntaxError, setSyntaxError] = useState<string | null>(null);

  const fetchChallenge = useCallback(async () => {
    setLoadingChallenge(true);
    setResult(null);
    setTestResults([]);
    setSyntaxError(null);
    try {
      const res = await fetch(`${API}/code/generate`);
      const data: Challenge = await res.json();
      data.buggyCode = cleanCode(data.buggyCode);
      setChallenge(data);
      setCode(data.buggyCode);
    } catch {
      alert("Failed to generate challenge. Is the backend running?");
    } finally {
      setLoadingChallenge(false);
    }
  }, []);

  useEffect(() => { fetchChallenge(); }, [fetchChallenge]);

  const userFn = useMemo(() => {
    if (!challenge) return null;
    const fn = makeFunction(code, challenge.functionName);
    if (!fn) {
      try { cleanCode(code); setSyntaxError("Syntax error"); } catch (e) { setSyntaxError(String(e)); }
    } else {
      setSyntaxError(null);
    }
    return fn;
  }, [code, challenge]);

  const handleRunTests = () => {
    if (!challenge) return;
    setTestResults(runTests(challenge, userFn));
  };

  const handleValidate = async () => {
    if (!challenge) return;
    setValidating(true);
    setResult(null);
    setTestResults(runTests(challenge, userFn));
    try {
      const res = await fetch(`${API}/code/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: challenge.id,
          userCode: code,
          functionName: challenge.functionName,
          testCases: challenge.testCases,
          bugDescription: challenge.bugDescription,
          expectedBehavior: challenge.expectedBehavior,
        }),
      });
      const data = await res.json();
      setResult(data);
      if (data.fixed) {
        setTotalXP(x => x + data.xp);
        setSolvedCount(c => c + 1);
      }
    } catch {
      setResult({ fixed: false, score: "wrong", feedback: "Erro ao validar. Backend rodando?", hint: null, xp: 0 });
    } finally {
      setValidating(false);
    }
  };

  const allTestsPassed = testResults.length > 0 && testResults.every(t => t.passed);
  const dc = challenge ? difficultyConfig[challenge.difficulty] ?? difficultyConfig.easy : difficultyConfig.easy;

  return (
    <main className="min-h-screen bg-[#0f0f1a] text-white flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-6xl">

        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
              Bug Fix Challenges
            </h1>
            <p className="text-gray-400 text-sm mt-1">Read the buggy code on the left, write your fix on the right.</p>
          </div>
          <div className="flex items-center gap-4">
            {totalXP > 0 && (
              <div className="text-right">
                <div className="text-2xl font-black text-violet-300">{totalXP} XP</div>
                <div className="text-xs text-gray-400">{solvedCount} solved</div>
              </div>
            )}
            <button
              onClick={fetchChallenge}
              disabled={loadingChallenge}
              className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-violet-500/40 text-gray-300 hover:text-white px-4 py-2.5 rounded-xl transition-all text-sm font-semibold disabled:opacity-50"
            >
              {loadingChallenge
                ? <><span className="w-4 h-4 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin" /> Generating...</>
                : "↻ New challenge"}
            </button>
          </div>
        </div>

        {/* Loading */}
        {loadingChallenge && (
          <div className="flex items-center justify-center py-32 gap-3">
            <span className="w-8 h-8 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin" />
            <span className="text-gray-400">AI is generating a unique challenge...</span>
          </div>
        )}

        {challenge && !loadingChallenge && (
          <div className="space-y-6">
            {/* Challenge info bar */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-lg font-bold text-white">{challenge.title}</h2>
                <span className={`text-[10px] font-bold border rounded-full px-2 py-0.5 ${dc.color} ${dc.bg} ${dc.border}`}>{dc.label}</span>
                <span className="text-[10px] text-gray-500 bg-white/5 rounded-full px-2 py-0.5 capitalize">{challenge.uiType}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] text-red-400 uppercase tracking-widest font-semibold mb-1">🐛 Bug</p>
                  <p className="text-gray-300 text-sm">{challenge.bugDescription}</p>
                </div>
                <div>
                  <p className="text-[10px] text-emerald-400 uppercase tracking-widest font-semibold mb-1">✅ Expected</p>
                  <p className="text-gray-300 text-sm">{challenge.expectedBehavior}</p>
                </div>
              </div>
            </div>

            {/* Code side-by-side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* LEFT — buggy code (read-only) */}
              <div className="bg-[#0d0d1a] border border-red-500/20 rounded-2xl overflow-hidden flex flex-col">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-red-500/20 bg-red-500/5">
                  <span className="w-2 h-2 rounded-full bg-red-400" />
                  <span className="text-[10px] text-red-400 uppercase tracking-widest font-semibold">Buggy code</span>
                </div>
                <pre className="px-4 py-3 text-sm text-gray-300 font-mono leading-relaxed overflow-x-auto whitespace-pre flex-1">
                  {challenge.buggyCode}
                </pre>
              </div>

              {/* RIGHT — user fix editor */}
              <div className="bg-[#0d0d1a] border border-violet-500/20 rounded-2xl overflow-hidden flex flex-col">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-violet-500/20 bg-violet-500/5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-violet-400" />
                    <span className="text-[10px] text-violet-400 uppercase tracking-widest font-semibold">Your fix</span>
                  </div>
                  <button
                    onClick={() => { setCode(challenge.buggyCode); setResult(null); setTestResults([]); }}
                    className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    ↺ Reset
                  </button>
                </div>
                <textarea
                  value={code}
                  onChange={e => { setCode(e.target.value); setResult(null); }}
                  spellCheck={false}
                  rows={Math.max(10, challenge.buggyCode.split("\n").length)}
                  className="w-full bg-transparent px-4 py-3 text-sm text-gray-100 font-mono resize-none focus:outline-none leading-relaxed flex-1"
                />
              </div>
            </div>

            {/* Actions + status */}
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <div className="flex gap-2 flex-1">
                <button
                  onClick={handleRunTests}
                  disabled={!userFn}
                  className="flex-1 bg-white/8 hover:bg-white/12 disabled:opacity-40 border border-white/10 text-gray-300 font-semibold py-2.5 rounded-xl text-sm transition-all"
                >
                  ▶ Run Tests
                </button>
                <button
                  onClick={handleValidate}
                  disabled={validating || !userFn}
                  className="flex-1 bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl text-sm transition-all"
                >
                  {validating
                    ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Validating...</span>
                    : "✓ Submit"}
                </button>
              </div>
              <div className={`text-xs px-3 py-2 rounded-xl border shrink-0 ${
                userFn
                  ? allTestsPassed
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                    : "bg-white/5 border-white/10 text-gray-400"
                  : "bg-red-500/10 border-red-500/20 text-red-400"
              }`}>
                {userFn
                  ? allTestsPassed ? "✓ All tests passing" : "⚙ Compiled"
                  : syntaxError ? `✗ ${syntaxError.split(":")[0]}` : "✗ Syntax error"}
              </div>
            </div>

            {/* Bottom: tests + live preview */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Test results */}
              <div className="space-y-3">
                {testResults.length > 0 && (
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
                    <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">
                      Tests — {testResults.filter(t => t.passed).length}/{testResults.length} passed
                    </p>
                    {testResults.map((t, i) => (
                      <div key={i} className={`text-xs rounded-xl px-3 py-2.5 border ${t.passed ? "bg-emerald-500/10 border-emerald-500/20" : "bg-red-500/10 border-red-500/20"}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={t.passed ? "text-emerald-400" : "text-red-400"}>{t.passed ? "✓" : "✗"}</span>
                          <p className={`font-semibold ${t.passed ? "text-emerald-300" : "text-red-300"}`}>{t.label}</p>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-[10px] mt-1">
                          <div>
                            <span className="text-gray-500">Buggy:</span>
                            <code className="ml-1 text-red-400">{JSON.stringify(t.buggyGot)}</code>
                          </div>
                          <div>
                            <span className="text-gray-500">Yours:</span>
                            <code className={`ml-1 ${t.passed ? "text-emerald-400" : "text-yellow-400"}`}>{JSON.stringify(t.got)}</code>
                          </div>
                          <div>
                            <span className="text-gray-500">Expected:</span>
                            <code className="ml-1 text-gray-300">{JSON.stringify(t.expected)}</code>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* AI result */}
                {result && (
                  <div className={`rounded-2xl p-5 border animate-fade-in ${result.fixed ? "bg-emerald-500/10 border-emerald-500/30" : "bg-red-500/10 border-red-500/30"}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className={`text-lg font-bold flex items-center gap-2 ${scoreConfig[result.score as keyof typeof scoreConfig]?.color ?? "text-gray-400"}`}>
                          <span>{scoreConfig[result.score as keyof typeof scoreConfig]?.emoji}</span>
                          <span>{scoreConfig[result.score as keyof typeof scoreConfig]?.label}</span>
                        </div>
                        <p className="text-gray-300 text-sm mt-2">{result.feedback}</p>
                        {result.hint && <p className="text-yellow-400 text-xs mt-1">💡 {result.hint}</p>}
                      </div>
                      {result.xp > 0 && result.fixed && (
                        <div className="text-right ml-4">
                          <div className="text-2xl font-black text-violet-300">+{result.xp}</div>
                          <div className="text-xs text-gray-400">XP</div>
                        </div>
                      )}
                    </div>
                    {result.fixed && (
                      <button onClick={fetchChallenge} className="mt-4 w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold py-2.5 rounded-xl text-sm transition-all">
                        Next challenge →
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Live preview */}
              <ChallengeUI uiType={challenge.uiType} userFn={userFn} />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
