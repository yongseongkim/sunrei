'use client';

import { useParams, useRouter } from 'next/navigation';
import SunreiForm from '@/components/SunreiForm';

export default function EditSunreiPage() {
  const params = useParams();
  const router = useRouter();
  const sunreiId = params.id as string;

  return (
    <SunreiForm
      mode="edit"
      sunreiId={sunreiId}
      onSuccess={() => router.push('/sunreis')}
      onCancel={() => router.push('/sunreis')}
    />
  );
}