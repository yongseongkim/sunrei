import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export type LinkKind = "youtube" | "instagram" | "web"

/** Which service a link points at (by host, subdomains included), for picking its label. */
export function linkKind(url: string): LinkKind {
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    return "web"
  }
  const on = (domain: string) => host === domain || host.endsWith(`.${domain}`)
  if (on("youtube.com") || on("youtu.be")) return "youtube"
  if (on("instagram.com")) return "instagram"
  return "web"
}
