import { route } from "./db";

export function navigate(url: string) {
  route(url);
}
