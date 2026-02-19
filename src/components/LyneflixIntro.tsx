import { useState, useEffect, useRef } from "react";
import lyneflixLogo from "@/assets/lyneflix-logo.png";

interface LyneflixIntroProps {
  onComplete: () => void;
  /** Skip intro if video is already buffered */
  skip?: boolean;
}

/**
 * Premium cinematic intro with logo reveal + synthesized sound.
 * Plays a short "THX-style" deep tone using Web Audio API.
 */
const LyneflixIntro = ({ onComplete, skip }: LyneflixIntroProps) => {
  const [phase, setPhase] = useState<"enter" | "hold" | "exit">("enter");
  const audioCtx = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (skip) { onComplete(); return; }

    // Play cinematic intro sound using Web Audio API
    try {
      const ctx = new AudioContext();
      audioCtx.current = ctx;

      // Deep cinematic boom/whoosh
      const now = ctx.currentTime;

      // Sub bass hit
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(80, now);
      osc1.frequency.exponentialRampToValueAtTime(35, now + 1.2);
      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.4, now + 0.1);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 2.0);
      osc1.connect(gain1).connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 2.0);

      // Shimmer / high harmonic
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(1200, now + 0.05);
      osc2.frequency.exponentialRampToValueAtTime(800, now + 1.5);
      gain2.gain.setValueAtTime(0, now);
      gain2.gain.linearRampToValueAtTime(0.08, now + 0.3);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 1.8);
      osc2.connect(gain2).connect(ctx.destination);
      osc2.start(now + 0.05);
      osc2.stop(now + 1.8);

      // Mid tone swell
      const osc3 = ctx.createOscillator();
      const gain3 = ctx.createGain();
      osc3.type = "triangle";
      osc3.frequency.setValueAtTime(220, now);
      osc3.frequency.exponentialRampToValueAtTime(160, now + 1.5);
      gain3.gain.setValueAtTime(0, now);
      gain3.gain.linearRampToValueAtTime(0.15, now + 0.2);
      gain3.gain.exponentialRampToValueAtTime(0.001, now + 1.8);
      osc3.connect(gain3).connect(ctx.destination);
      osc3.start(now);
      osc3.stop(now + 1.8);

      // Noise burst for cinematic impact
      const bufferSize = ctx.sampleRate * 0.5;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) output[i] = (Math.random() * 2 - 1) * 0.3;
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      const noiseGain = ctx.createGain();
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = "lowpass";
      noiseFilter.frequency.setValueAtTime(500, now);
      noiseGain.gain.setValueAtTime(0, now);
      noiseGain.gain.linearRampToValueAtTime(0.12, now + 0.05);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      noise.connect(noiseFilter).connect(noiseGain).connect(ctx.destination);
      noise.start(now);
      noise.stop(now + 0.6);
    } catch {
      // Audio not available, continue silently
    }

    // Phase transitions
    timerRef.current = setTimeout(() => setPhase("hold"), 100);
    const holdTimer = setTimeout(() => setPhase("exit"), 1800);
    const exitTimer = setTimeout(() => onComplete(), 2500);

    return () => {
      clearTimeout(timerRef.current);
      clearTimeout(holdTimer);
      clearTimeout(exitTimer);
      audioCtx.current?.close().catch(() => {});
    };
  }, [skip, onComplete]);

  if (skip) return null;

  return (
    <div className={`fixed inset-0 z-[200] bg-black flex items-center justify-center lyneflix-intro lyneflix-intro--${phase}`}>
      {/* Ambient light behind logo */}
      <div className="absolute w-[600px] h-[300px] rounded-full blur-[120px] pointer-events-none" style={{ background: "hsl(40 50% 50% / 0.04)" }} />
      
      <div className="lyneflix-intro__logo">
        <img
          src={lyneflixLogo}
          alt="LYNEFLIX"
          className="w-[280px] sm:w-[400px] md:w-[500px] h-auto select-none pointer-events-none"
          draggable={false}
        />
      </div>
    </div>
  );
};

export default LyneflixIntro;
