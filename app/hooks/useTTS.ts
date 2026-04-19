"use client";

import { useCallback } from "react";

// Use the browser's built-in SpeechSynthesis API — zero loading time, no blocking
export function useTTS() {
  const speak = useCallback((text: string) => {
    if (!text || typeof window === "undefined") return;
    try {
      // Cancel any ongoing speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = 0.9;
      utterance.pitch = 1;

      // Pick an American English voice if available
      const voices = window.speechSynthesis.getVoices();
      const american = voices.find(
        (v) => v.lang === "en-US" && (v.name.includes("Google") || v.name.includes("Samantha") || v.name.includes("Alex"))
      ) ?? voices.find((v) => v.lang === "en-US");

      if (american) utterance.voice = american;

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.error("TTS error:", err);
    }
  }, []);

  return { speak };
}
