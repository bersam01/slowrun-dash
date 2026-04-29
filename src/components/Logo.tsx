import slowrunLogo from "@/assets/slowrun-logo.png";
import { cn } from "@/lib/utils";

interface LogoProps {
  size?: number;
  showText?: boolean;
  className?: string;
}

export const Logo = ({ size = 40, showText = true, className }: LogoProps) => {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <img
        src={slowrunLogo}
        alt="SlowRun"
        width={size}
        height={size}
        className="rounded-xl shadow-[var(--shadow-glow)]"
      />
      {showText && (
        <div className="flex flex-col leading-none">
          <span className="text-lg font-bold tracking-tight text-foreground">SlowRun</span>
          <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Dashboard</span>
        </div>
      )}
    </div>
  );
};
