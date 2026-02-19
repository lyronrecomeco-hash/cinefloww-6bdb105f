import { useState, useEffect, useRef } from "react";

interface LyneflixIntroProps {
  onComplete: () => void;
  skip?: boolean;
}

/**
 * Netflix-style cinematic intro: "L" zooms in, then reveals full "LYNEFLIX" text.
 * Blue color scheme with deep cinematic boom via Web Audio API.
 */
const LyneflixIntro = ({ onComplete, skip }: LyneflixIntroProps) => {
  const [phase, setPhase] = useState<"letter" | "reveal" | "exit">("letter");
  const audioCtx = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (skip) { onComplete(); return; }

    // Play cinematic boom sound via Web Audio API
    try {
      const ctx = new AudioContext();
      audioCtx.current = ctx;
      const now = ctx.currentTime;

      // Deep sub bass boom
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(65, now);
      osc1.frequency.exponentialRampToValueAtTime(30, now + 1.5);
      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.5, now + 0.08);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 2.2);
      osc1.connect(gain1).connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 2.2);

      // Cinematic shimmer (blue tone)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(880, now + 0.1);
      osc2.frequency.exponentialRampToValueAtTime(440, now + 1.8);
      gain2.gain.setValueAtTime(0, now);
      gain2.gain.linearRampToValueAtTime(0.06, now + 0.4);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 2.0);
      osc2.connect(gain2).connect(ctx.destination);
      osc2.start(now + 0.1);
      osc2.stop(now + 2.0);

      // Mid-range swell
      const osc3 = ctx.createOscillator();
      const gain3 = ctx.createGain();
      osc3.type = "triangle";
      osc3.frequency.setValueAtTime(180, now);
      osc3.frequency.exponentialRampToValueAtTime(120, now + 1.8);
      gain3.gain.setValueAtTime(0, now);
      gain3.gain.linearRampToValueAtTime(0.18, now + 0.15);
      gain3.gain.exponentialRampToValueAtTime(0.001, now + 2.0);
      osc3.connect(gain3).connect(ctx.destination);
      osc3.start(now);
      osc3.stop(now + 2.0);

      // Noise burst for cinematic impact
      const bufferSize = ctx.sampleRate * 0.4;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) output[i] = (Math.random() * 2 - 1) * 0.25;
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      const noiseGain = ctx.createGain();
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = "lowpass";
      noiseFilter.frequency.setValueAtTime(400, now);
      noiseGain.gain.setValueAtTime(0, now);
      noiseGain.gain.linearRampToValueAtTime(0.15, now + 0.04);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      noise.connect(noiseFilter).connect(noiseGain).connect(ctx.destination);
      noise.start(now);
      noise.stop(now + 0.5);
    } catch {
      // Audio not available, continue silently
    }

    // Phase transitions: L → full name → exit (FAST: ~1.4s total)
    const t1 = setTimeout(() => setPhase("reveal"), 400);
    const t2 = setTimeout(() => setPhase("exit"), 1000);
    const t3 = setTimeout(() => onComplete(), 1400);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      audioCtx.current?.close().catch(() => {});
    };
  }, [skip, onComplete]);

  if (skip) return null;

  return (
    <div className={`fixed inset-0 z-[200] bg-black flex items-center justify-center transition-opacity duration-700 ${phase === "exit" ? "opacity-0" : "opacity-100"}`}>
      {/* Ambient blue glow */}
      <div className="absolute w-[500px] h-[500px] rounded-full blur-[150px] pointer-events-none bg-primary/10" />
      
      <div className="relative flex items-center justify-center">
        {/* The "L" letter - always visible, scales down when full name reveals */}
        <span
          className={`font-display font-black select-none transition-all duration-700 ease-out lyneflix-intro-letter ${
            phase === "letter" 
              ? "text-[120px] sm:text-[180px] md:text-[220px] opacity-100 scale-100" 
              : "text-[48px] sm:text-[64px] md:text-[80px] opacity-100 scale-100"
          }`}
          style={{
            background: "linear-gradient(135deg, hsl(217 91% 65%), hsl(217 91% 50%), hsl(230 80% 60%))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            textShadow: "none",
            filter: phase === "letter" ? "drop-shadow(0 0 40px hsl(217 91% 60% / 0.4))" : "drop-shadow(0 0 20px hsl(217 91% 60% / 0.3))",
          }}
        >
          L
        </span>
        
        {/* Rest of the name - fades in */}
        <span
          className={`font-display font-black select-none transition-all duration-600 ease-out ${
            phase === "letter" 
              ? "opacity-0 max-w-0 overflow-hidden translate-x-[-20px]" 
              : "opacity-100 max-w-[600px] translate-x-0"
          } text-[48px] sm:text-[64px] md:text-[80px]`}
          style={{
            background: "linear-gradient(135deg, hsl(217 91% 65%), hsl(217 91% 50%), hsl(230 80% 60%))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            filter: "drop-shadow(0 0 20px hsl(217 91% 60% / 0.3))",
          }}
        >
          YNEFLIX
        </span>
      </div>
    </div>
  );
};

export default LyneflixIntro;
