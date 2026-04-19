"use client";

import { Light as SyntaxHighlighter } from "react-syntax-highlighter";
import { atomOneDark } from "react-syntax-highlighter/dist/esm/styles/hljs";
import js from "react-syntax-highlighter/dist/esm/languages/hljs/javascript";
import ts from "react-syntax-highlighter/dist/esm/languages/hljs/typescript";
import python from "react-syntax-highlighter/dist/esm/languages/hljs/python";
import java from "react-syntax-highlighter/dist/esm/languages/hljs/java";
import bash from "react-syntax-highlighter/dist/esm/languages/hljs/bash";

SyntaxHighlighter.registerLanguage("javascript", js);
SyntaxHighlighter.registerLanguage("js", js);
SyntaxHighlighter.registerLanguage("typescript", ts);
SyntaxHighlighter.registerLanguage("ts", ts);
SyntaxHighlighter.registerLanguage("tsx", ts);
SyntaxHighlighter.registerLanguage("jsx", js);
SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("java", java);
SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("sh", bash);

interface TextRendererProps {
  text: string;
  onWordClick: (word: string, e: React.MouseEvent) => void;
}

// Splits raw text into segments: plain text paragraphs and fenced code blocks
function parseSegments(raw: string): { type: "text" | "code"; content: string; lang?: string }[] {
  const segments: { type: "text" | "code"; content: string; lang?: string }[] = [];
  const fenceRegex = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = fenceRegex.exec(raw)) !== null) {
    if (match.index > lastIndex) {
      const textPart = raw.slice(lastIndex, match.index).trim();
      if (textPart) segments.push({ type: "text", content: textPart });
    }
    segments.push({ type: "code", content: match[2].trim(), lang: match[1] || "javascript" });
    lastIndex = match.index + match[0].length;
  }

  const remaining = raw.slice(lastIndex).trim();
  if (remaining) segments.push({ type: "text", content: remaining });

  return segments;
}

function WordSpan({ word, onWordClick }: { word: string; onWordClick: (w: string, e: React.MouseEvent) => void }) {
  return (
    <span
      onClick={(e) => onWordClick(word, e)}
      className="cursor-pointer hover:text-cyan-300 hover:underline decoration-dotted underline-offset-4 transition-colors rounded px-0.5"
    >
      {word}
    </span>
  );
}

function renderTextWithWords(text: string, onWordClick: (w: string, e: React.MouseEvent) => void) {
  return text.split(/(\s+)/).map((token, i) =>
    /\s+/.test(token) ? (
      <span key={i}>{token}</span>
    ) : (
      <WordSpan key={i} word={token} onWordClick={onWordClick} />
    )
  );
}

export default function TextRenderer({ text, onWordClick }: TextRendererProps) {
  const segments = parseSegments(text);

  return (
    <div className="space-y-4">
      {segments.map((seg, i) =>
        seg.type === "code" ? (
          <div key={i} className="rounded-xl overflow-hidden border border-violet-500/20">
            {/* Language label */}
            <div className="flex items-center justify-between bg-[#1a1a2e] px-4 py-1.5 border-b border-violet-500/20">
              <span className="text-[11px] text-violet-400 font-mono font-semibold uppercase tracking-widest">
                {seg.lang}
              </span>
              <span className="text-[10px] text-gray-500">example</span>
            </div>
            <SyntaxHighlighter
              language={seg.lang}
              style={atomOneDark}
              customStyle={{
                margin: 0,
                padding: "1rem",
                background: "#12121f",
                fontSize: "0.82rem",
                lineHeight: "1.6",
                borderRadius: 0,
              }}
              showLineNumbers={false}
            >
              {seg.content}
            </SyntaxHighlighter>
          </div>
        ) : (
          <p key={i} className="text-gray-100 leading-8 text-base">
            {renderTextWithWords(seg.content, onWordClick)}
          </p>
        )
      )}
    </div>
  );
}
