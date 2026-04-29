import { Card } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string;
  description: string;
  icon: LucideIcon;
  variant?: "primary" | "accent" | "neutral";
}

export const StatCard = ({ title, value, description, icon: Icon, variant = "primary" }: StatCardProps) => {
  const variantClass =
    variant === "primary" ? "stat-card-primary" :
    variant === "accent" ? "stat-card-accent" :
    "stat-card-neutral";

  const isLight = variant === "neutral";

  return (
    <Card className={cn(
      "relative overflow-hidden border-0 p-6 transition-transform hover:scale-[1.02]",
      variantClass,
    )}>
      <div className={cn("flex items-center gap-2 text-sm font-medium opacity-90",
        isLight ? "text-foreground/80" : "text-white/90")}>
        <Icon className="h-4 w-4" />
        {title}
      </div>
      <div className={cn("mt-4 text-4xl font-bold tracking-tight",
        isLight ? "text-foreground" : "text-white")}>
        {value}
      </div>
      <p className={cn("mt-3 text-sm",
        isLight ? "text-foreground/60" : "text-white/70")}>
        {description}
      </p>
      <div className="pointer-events-none absolute -right-8 -bottom-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
    </Card>
  );
};
