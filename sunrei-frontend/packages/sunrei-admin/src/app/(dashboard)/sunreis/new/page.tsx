'use client';

import SunreiForm from '@/components/SunreiForm';
import { useReturnToList } from '@/lib/hooks/use-list-navigation';

export default function NewSunreiPage() {
  const returnToList = useReturnToList('/sunreis');

  return (
    <SunreiForm
      mode="create"
      onSuccess={returnToList}
      onCancel={returnToList}
    />
  );
}
