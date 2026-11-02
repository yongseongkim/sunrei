'use client';

import { useParams } from 'next/navigation';
import { useReturnToList } from '@/lib/hooks/use-list-navigation';
import SunreiForm from '@/components/SunreiForm';

export default function EditSunreiPage() {
  const params = useParams();
  const returnToList = useReturnToList('/sunreis');
  const sunreiId = params.id as string;

  return (
    <SunreiForm
      mode="edit"
      sunreiId={sunreiId}
      onSuccess={returnToList}
      onCancel={returnToList}
    />
  );
}
