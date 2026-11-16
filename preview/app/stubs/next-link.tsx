import type { AnchorHTMLAttributes } from "react";

/** Ersatz für next/link. Die Vorschau fängt Klicks auf Programmadressen zentral ab. */
export default function Link({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a href={href} {...rest}>{children}</a>;
}
