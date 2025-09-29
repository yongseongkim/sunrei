'use client';

import SunreiForm from '@/components/SunreiForm';
import { useRouter } from 'next/navigation';

export default function NewSunreiPage() {
  const router = useRouter();

  return (
    <SunreiForm
      mode="create"
      onSuccess={() => router.push('/sunreis')}
      onCancel={() => router.push('/sunreis')}
    />
  );
}