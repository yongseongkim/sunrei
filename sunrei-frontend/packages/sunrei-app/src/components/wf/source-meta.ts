import type { SourceDTO } from '@/dto';

/**
 * YouTube 채널 썸네일 URL에는 `=s800-c-k-` 같은 크기 토큰이 들어 있다.
 * 작은 원에 800px 원본을 내려받지 않도록 고해상도 화면을 고려해 표시 크기의 두 배로 바꿔 요청한다.
 */
export function sourceAvatarUrl(
  source: Pick<SourceDTO, 'posterImage'> | null | undefined,
  px = 44
): string | undefined {
  const url = source?.posterImage?.images?.[0]?.url;
  if (!url) return undefined;
  const target = Math.min(800, Math.max(44, Math.round(px * 2)));
  return url.replace(/=s\d+-/, `=s${target}-`);
}
