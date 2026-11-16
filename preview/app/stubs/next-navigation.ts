import { route } from "./db";

export function usePathname() {
  return "/angebote/demo";
}
export function useRouter() {
  return { push: route, replace: route, refresh() {}, back() {} };
}
export function notFound(): never {
  throw new Error("Nicht gefunden");
}
