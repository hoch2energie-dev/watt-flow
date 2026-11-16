"use client";

import { useEffect, useState } from "react";
import { formatNumber, parseDeNumber } from "@/lib/format";

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-ink">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`field ${props.className ?? ""}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`field min-h-24 ${props.className ?? ""}`} />;
}

export function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`field ${props.className ?? ""}`} />;
}

export function NumberField({
  value,
  onChange,
  digits = 2,
  className,
  ariaLabel,
}: {
  value: number;
  onChange: (value: number) => void;
  digits?: number;
  className?: string;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(() => formatNumber(value, digits));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(formatNumber(value, digits));
  }, [value, digits, focused]);
  return (
    <input
      aria-label={ariaLabel}
      inputMode="decimal"
      className={`field ${className ?? ""}`}
      value={text}
      onFocus={() => setFocused(true)}
      onChange={(event) => setText(event.target.value)}
      onBlur={(event) => {
        const next = parseDeNumber(event.target.value);
        setFocused(false);
        onChange(next);
        setText(formatNumber(next, digits));
      }}
    />
  );
}
