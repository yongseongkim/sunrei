'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/** YouTube 채널 썸네일처럼 외부 이미지는 핫링크가 막힐 수 있으므로 불러오지 못하면 이름 첫 글자를 보여 준다. */
export function Avatar({
  label,
  src,
  size = 22,
  fill,
}: {
  label: string;
  src?: string | null;
  size?: number;
  /** 로그인한 사용자처럼 primary 바탕에 흰 글자로 채운다. */
  fill?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  // 같은 Avatar가 다른 행에 다시 쓰이므로 src가 바뀌면 오류 상태를 지운다.
  useEffect(() => setBroken(false), [src]);
  const showImg = !!src && !broken;
  return (
    <span
      className={cn(
        'grid place-items-center shrink-0 overflow-hidden rounded-full border border-line2 font-extrabold',
        fill ? 'bg-primary text-primary-foreground' : 'bg-accent-soft text-accent-ink'
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src!}
          alt=""
          width={size}
          height={size}
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        (label || '?').charAt(0).toUpperCase()
      )}
    </span>
  );
}
