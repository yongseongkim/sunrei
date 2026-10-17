import type { MultiSizeImageDTO, SourceDTO } from '@/dto';

/**
 * 작은 화면 요소에 큰 원본을 내려받지 않도록 고해상도 화면을 고려해 표시 크기의 두 배에 맞는 이미지를 고른다.
 * 업로드한 이미지(Instagram 프로필 사진·게시물 이미지 등)는 큰 것부터 여러 크기가 있어서 목표 크기를 덮는 가장 작은 것을 쓰고,
 * YouTube 채널 썸네일 URL은 `=s800-c-k-` 같은 크기 토큰을 바꿔 요청한다.
 */
export function fittedImageUrl(image: MultiSizeImageDTO | null | undefined, px: number): string | undefined {
  const images = image?.images ?? [];
  if (!images.length) return undefined;
  const target = Math.min(800, Math.max(44, Math.round(px * 2)));
  const covering = images.filter((candidate) => (candidate.width ?? 0) >= target);
  const url = (covering[covering.length - 1] ?? images[0]).url;
  return url.replace(/=s\d+-/, `=s${target}-`);
}

/** Source 포스터를 아바타 크기에 맞춰 고르며, 포스터가 없으면 undefined다(Avatar가 첫 글자를 보여 준다). */
export function sourceAvatarUrl(
  source: Pick<SourceDTO, 'posterImage'> | null | undefined,
  px = 44
): string | undefined {
  return fittedImageUrl(source?.posterImage, px);
}
