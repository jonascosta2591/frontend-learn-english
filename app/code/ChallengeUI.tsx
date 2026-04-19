"use client";

import { useState, useEffect } from "react";

interface Props {
  uiType: string;
  userFn: ((...args: unknown[]) => unknown) | null;
}

// ── Search UI ──────────────────────────────────────────────────────────
const SEARCH_ITEMS = [
  { name: "Apple" }, { name: "Banana" }, { name: "Apricot" },
  { name: "Blueberry" }, { name: "Cherry" }, { name: "Avocado" },
];

function SearchUI({ fn }: { fn: ((...args: unknown[]) => unknown) | null }) {
  const [query, setQuery] = useState("");
  let results: { name: string }[] = SEARCH_ITEMS;
  try {
    if (fn) results = (fn(SEARCH_ITEMS, query) as { name: string }[]) ?? SEARCH_ITEMS;
    if (!Array.isArray(results)) results = SEARCH_ITEMS;
  } catch { results = SEARCH_ITEMS; }
  return (
    <div className="space-y-3">
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search fruits..."
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-violet-500/50"
      />
      <div className="space-y-1">
        {Array.isArray(results) && results.length > 0
          ? results.map((item, i) => (
              <div key={i} className="bg-white/5 rounded-lg px-3 py-2 text-sm text-gray-200">{item.name}</div>
            ))
          : <p className="text-gray-500 text-sm">No results</p>
        }
      </div>
    </div>
  );
}

// ── Counter UI ─────────────────────────────────────────────────────────
function CounterUI({ fn }: { fn: ((...args: unknown[]) => unknown) | null }) {
  const [count, setCount] = useState(0);
  return (
    <div className="flex items-center justify-center gap-6 py-4">
      <button onClick={() => setCount(c => Math.max(0, c - 1))} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white text-xl font-bold transition-all">−</button>
      <span className="text-4xl font-black text-white w-16 text-center">{count}</span>
      <button
        onClick={() => {
          try {
            const next = fn ? (fn(count) as number) : count + 1;
            setCount(typeof next === "number" && isFinite(next) ? next : count + 1);
          } catch { setCount(c => c + 1); }
        }}
        className="w-10 h-10 rounded-full bg-violet-600 hover:bg-violet-500 text-white text-xl font-bold transition-all"
      >+</button>
    </div>
  );
}

// ── Todo UI ────────────────────────────────────────────────────────────
const INITIAL_TODOS = [
  { id: 1, text: "Buy groceries", done: false },
  { id: 2, text: "Walk the dog", done: false },
  { id: 3, text: "Read a book", done: true },
];

function TodoUI({ fn }: { fn: ((...args: unknown[]) => unknown) | null }) {
  const [todos, setTodos] = useState(INITIAL_TODOS);
  return (
    <div className="space-y-2">
      {todos.map(todo => (
        <div
          key={todo.id}
          onClick={() => {
            if (fn) {
              try {
                const next = fn(todos, todo.id) as typeof todos;
                if (Array.isArray(next)) setTodos(next);
              } catch { /* ignore */ }
            }
          }}
          className={`flex items-center gap-3 px-4 py-2.5 rounded-xl cursor-pointer transition-all ${todo.done ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-white/5 border border-white/10 hover:bg-white/10"}`}
        >
          <span className={`w-4 h-4 rounded border flex items-center justify-center text-xs ${todo.done ? "bg-emerald-500 border-emerald-500 text-white" : "border-gray-500"}`}>
            {todo.done ? "✓" : ""}
          </span>
          <span className={`text-sm ${todo.done ? "line-through text-gray-500" : "text-gray-200"}`}>{todo.text}</span>
        </div>
      ))}
      <button onClick={() => setTodos(INITIAL_TODOS)} className="text-xs text-gray-500 hover:text-gray-300 mt-1">↺ Reset</button>
    </div>
  );
}

// ── Cart UI ────────────────────────────────────────────────────────────
const CART_ITEMS = [
  { name: "Apple", price: 1.5, qty: 3 },
  { name: "Bread", price: 2.0, qty: 1 },
  { name: "Milk", price: 1.2, qty: 2 },
];

function CartUI({ fn }: { fn: ((...args: unknown[]) => unknown) | null }) {
  let total: number = 0;
  try {
    if (fn) total = (fn(CART_ITEMS) as number) ?? 0;
    if (typeof total !== "number" || !isFinite(total)) total = 0;
  } catch { total = 0; }
  return (
    <div className="space-y-2">
      {CART_ITEMS.map((item, i) => (
        <div key={i} className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-2.5 text-sm">
          <span className="text-gray-200">{item.name}</span>
          <span className="text-gray-400">{item.qty} × ${item.price.toFixed(2)}</span>
          <span className="text-white font-semibold">${(item.price * item.qty).toFixed(2)}</span>
        </div>
      ))}
      <div className="flex justify-between px-4 py-2.5 border-t border-white/10 text-sm font-bold">
        <span className="text-gray-300">Total</span>
        <span className={`text-lg ${typeof total === "number" && Math.abs(total - 8.9) < 0.01 ? "text-emerald-400" : "text-red-400"}`}>
          ${typeof total === "number" ? total.toFixed(2) : "?"}
        </span>
      </div>
    </div>
  );
}

// ── Form UI ────────────────────────────────────────────────────────────
function FormUI({ fn }: { fn: ((...args: unknown[]) => unknown) | null }) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const isValid = fn ? !!(fn(email) as boolean) : false;
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-gray-400 mb-1 block">Email address</label>
        <input
          value={email}
          onChange={e => { setEmail(e.target.value); setSubmitted(false); }}
          placeholder="you@example.com"
          className={`w-full bg-white/5 border rounded-xl px-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none transition-all ${
            email ? (isValid ? "border-emerald-500/50" : "border-red-500/50") : "border-white/10"
          }`}
        />
        {email && (
          <p className={`text-xs mt-1 ${isValid ? "text-emerald-400" : "text-red-400"}`}>
            {isValid ? "✓ Valid email" : "✗ Invalid email"}
          </p>
        )}
      </div>
      <button
        onClick={() => setSubmitted(true)}
        disabled={!isValid}
        className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-xl text-sm transition-all"
      >
        Submit
      </button>
      {submitted && isValid && <p className="text-emerald-400 text-sm text-center">✓ Form submitted!</p>}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────
export default function ChallengeUI({ uiType, userFn }: Props) {
  const [error, setError] = useState("");

  useEffect(() => { setError(""); }, [userFn]);

  const props = { fn: userFn };

  return (
    <div className="bg-[#0d0d1a] border border-white/10 rounded-2xl p-5">
      <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-4">Live Preview</p>
      {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
      {uiType === "search"  && <SearchUI  {...props} />}
      {uiType === "counter" && <CounterUI {...props} />}
      {uiType === "todo"    && <TodoUI    {...props} />}
      {uiType === "cart"    && <CartUI    {...props} />}
      {uiType === "form"    && <FormUI    {...props} />}
    </div>
  );
}
