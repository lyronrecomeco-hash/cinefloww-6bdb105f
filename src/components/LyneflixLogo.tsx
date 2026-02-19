interface LyneflixLogoProps {
  size?: "sm" | "md" | "lg";
  animate?: boolean;
  className?: string;
}

/**
 * Reusable LyneFlix logo component with blue gradient.
 * Used in site alert modals and other places.
 */
const LyneflixLogo = ({ size = "md", animate = true, className = "" }: LyneflixLogoProps) => {
  const sizeClass = {
    sm: "text-2xl sm:text-3xl",
    md: "text-3xl sm:text-4xl",
    lg: "text-4xl sm:text-5xl md:text-6xl",
  }[size];

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <span
        className={`font-display font-black select-none ${sizeClass} ${animate ? "lyneflix-logo-animated" : ""}`}
        style={{
          background: "linear-gradient(135deg, hsl(217 91% 70%), hsl(217 91% 50%), hsl(230 80% 45%))",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          filter: "drop-shadow(0 0 20px hsl(217 91% 60% / 0.3))",
        }}
      >
        LYNEFLIX
      </span>
    </div>
  );
};

export default LyneflixLogo;
