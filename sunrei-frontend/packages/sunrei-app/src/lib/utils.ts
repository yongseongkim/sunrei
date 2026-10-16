import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export type LinkKind = "youtube" | "instagram" | "web"

/** 링크 주소의 호스트(하위 도메인 포함)로 어느 서비스 링크인지 정해 라벨을 고른다. */
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
