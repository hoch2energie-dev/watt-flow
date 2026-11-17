import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/* Knöpfe sind ganz rund. Grün ist die Handlung, Weiß die ruhige zweite Wahl. */
const buttonStyles = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-brand text-white hover:bg-brand-strong",
        secondary: "bg-surface text-ink shadow-raise hover:bg-brand-soft",
        ghost: "text-ink hover:bg-black/5",
        danger: "bg-surface text-danger shadow-raise hover:bg-red-50",
      },
      size: {
        sm: "h-9 px-4",
        md: "h-11 px-5",
        lg: "h-12 px-6",
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

/**
 * Kopf einer Seite: eine ruhige Zeile, darunter die große Überschrift.
 * Auf breiten Schirmen steht er neben der Suche (Klasse `page-head`, siehe app/globals.css).
 */
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
    <div className="mb-6">
      <div className="page-head">
        {eyebrow ? <p className="text-sm text-muted">{eyebrow}</p> : null}
        <h1 className="title-xl text-ink">{title}</h1>
      </div>
      {description ? <p className="mt-3 max-w-2xl text-sm text-muted">{description}</p> : null}
      {actions ? <div className="mt-4 flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

/** Zustand als kleine Marke mit Punkt. Die Farbe trägt die Bedeutung, der Text nennt sie. */
export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "ok" | "warn" | "info" | "danger" }) {
  const tones = {
    neutral: "bg-black/5 text-ink",
    ok: "bg-emerald-100 text-ok",
    warn: "bg-amber-100 text-warn",
    info: "bg-sky-100 text-info",
    danger: "bg-red-100 text-danger",
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold", tones[tone])}>
      <i className="size-1.5 rounded-full bg-current" aria-hidden />
      {children}
    </span>
  );
}

export function EmptyState({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed border-line bg-elevated px-6 py-12 text-center">
      <h2 className="title-lg">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{text}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export const th = "px-4 py-3 text-left text-xs font-medium text-muted";
export const td = "border-t border-line px-4 py-3 align-middle";

/** Große Fläche, auf der Karten und Felder liegen. */
export function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn("rounded-3xl bg-elevated p-4 shadow-panel sm:p-6", className)}>{children}</section>;
}

export function Notice({ children, tone = "warn" }: { children: React.ReactNode; tone?: "warn" | "ok" | "danger" }) {
  const tones = { warn: "bg-amber-50 text-warn", ok: "bg-emerald-50 text-ok", danger: "bg-red-50 text-danger" };
  return <div className={cn("rounded-2xl px-4 py-3 text-sm", tones[tone])}>{children}</div>;
}
