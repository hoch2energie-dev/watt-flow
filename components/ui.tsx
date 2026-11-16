import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const buttonStyles = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-brand text-white hover:bg-brand-strong",
        secondary: "border border-line bg-white text-ink hover:bg-accent-soft",
        ghost: "text-ink hover:bg-black/5",
        danger: "border border-danger/30 bg-white text-danger hover:bg-red-50",
      },
      size: {
        sm: "h-8 px-3",
        md: "h-10 px-4",
        lg: "h-11 px-5",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonStyles>) {
  return <button className={cn(buttonStyles({ variant, size }), className)} {...props} />;
}

export function ButtonLink({
  href,
  className,
  variant,
  size,
  children,
}: { href: string; children: React.ReactNode; className?: string } & VariantProps<typeof buttonStyles>) {
  return (
    <Link href={href} className={cn(buttonStyles({ variant, size }), className)}>
      {children}
    </Link>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">{eyebrow}</p> : null}
        <h1 className="font-display text-3xl leading-tight text-ink">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "ok" | "warn" | "info" | "danger" }) {
  const tones = {
    neutral: "bg-black/5 text-ink",
    ok: "bg-emerald-100 text-ok",
    warn: "bg-amber-100 text-warn",
    info: "bg-sky-100 text-info",
    danger: "bg-red-100 text-danger",
  };
  return <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone])}>{children}</span>;
}

export function EmptyState({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-elevated px-6 py-12 text-center">
      <h2 className="font-display text-2xl">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{text}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export const th = "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted";
export const td = "border-t border-line px-4 py-3 align-middle";

export function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn("rounded-2xl border border-line bg-elevated p-4 shadow-sm sm:p-5", className)}>{children}</section>;
}

export function Notice({ children, tone = "warn" }: { children: React.ReactNode; tone?: "warn" | "ok" | "danger" }) {
  const tones = { warn: "bg-amber-50 text-warn", ok: "bg-emerald-50 text-ok", danger: "bg-red-50 text-danger" };
  return <div className={cn("rounded-xl px-4 py-3 text-sm", tones[tone])}>{children}</div>;
}
