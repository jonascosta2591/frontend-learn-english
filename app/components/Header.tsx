"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../context/AuthContext";

const englishLinks = [
  { href: "/", label: "📖 Reading" },
  { href: "/practice", label: "🎯 Practice" },
  { href: "/dialogue", label: "💬 Dialogue" },
  { href: "/speak", label: "🎙️ Speak" },
  { href: "/sentences", label: "✨ i+1" },
  { href: "/game-comparation", label: "🎮 Match" },
];

const programmingLinks = [
  { href: "/code", label: "🐛 Bug Fix" },
  { href: "/practice-coding", label: "💻 Practice" },
  { href: "/interview", label: "🎤 Interview" },
];

export default function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();

  return (
    <header className="w-full bg-[#0a0a14] border-b border-white/8 sticky top-0 z-40">
      {/* Top row: logo + user */}
      <div className="max-w-6xl mx-auto px-4 h-11 flex items-center justify-between">
        <Link href="/" className="text-lg font-black bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
          ReadXP
        </Link>
        <div className="flex items-center gap-3">
          {user && (
            <>
              <span className="text-xs text-gray-400 hidden sm:block">
                👤 {user.username}
              </span>
              <button
                onClick={logout}
                className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white px-3 py-1.5 rounded-lg transition-all"
              >
                Sign out
              </button>
            </>
          )}
          <button onClick={() => setOpen(o => !o)} className="md:hidden text-gray-400 hover:text-white p-1">
            {open ? "✕" : "☰"}
          </button>
        </div>
      </div>

      {/* Bottom row: nav links */}
      <div className="hidden md:block border-t border-white/5">
        <div className="max-w-6xl mx-auto px-4 h-9 flex items-center gap-1">
          {/* English section */}
          <span className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold px-2 shrink-0">🇺🇸</span>
          {englishLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-xs px-3 py-1 rounded-lg transition-all whitespace-nowrap ${
                pathname === link.href
                  ? "bg-violet-600/30 text-violet-300 border border-violet-500/40"
                  : "text-gray-400 hover:text-white hover:bg-white/8"
              }`}
            >
              {link.label}
            </Link>
          ))}

          <div className="w-px h-4 bg-white/10 mx-2 shrink-0" />

          {/* Programming section */}
          <span className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold px-2 shrink-0">💻</span>
          {programmingLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-xs px-3 py-1 rounded-lg transition-all whitespace-nowrap ${
                pathname === link.href
                  ? "bg-violet-600/30 text-violet-300 border border-violet-500/40"
                  : "text-gray-400 hover:text-white hover:bg-white/8"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-white/8 bg-[#0a0a14] px-4 py-4 space-y-4">
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-2">🇺🇸 English</p>
            <div className="grid grid-cols-3 gap-2">
              {englishLinks.map(link => (
                <Link key={link.href} href={link.href} onClick={() => setOpen(false)}
                  className={`text-xs px-3 py-2 rounded-xl text-center transition-all ${
                    pathname === link.href
                      ? "bg-violet-600/30 text-violet-300 border border-violet-500/40"
                      : "bg-white/5 text-gray-300 hover:bg-white/10"
                  }`}>
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-2">💻 Programming</p>
            <div className="grid grid-cols-3 gap-2">
              {programmingLinks.map(link => (
                <Link key={link.href} href={link.href} onClick={() => setOpen(false)}
                  className={`text-xs px-3 py-2 rounded-xl text-center transition-all ${
                    pathname === link.href
                      ? "bg-violet-600/30 text-violet-300 border border-violet-500/40"
                      : "bg-white/5 text-gray-300 hover:bg-white/10"
                  }`}>
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
