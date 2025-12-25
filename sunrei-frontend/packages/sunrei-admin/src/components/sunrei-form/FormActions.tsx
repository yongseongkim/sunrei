import { Button } from '@/components/ui/button';
import { Loader2, Save } from 'lucide-react';

interface FormActionsProps {
  mode: 'create' | 'edit';
  isSubmitting: boolean;
  onCancel: () => void;
}

export default function FormActions({
  mode,
  isSubmitting,
  onCancel,
}: FormActionsProps) {
  return (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="outline" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {mode === 'create' ? 'Creating...' : 'Saving...'}
          </>
        ) : (
          <>
            <Save className="mr-2 h-4 w-4" />
            {mode === 'create' ? 'Create Sunrei' : 'Save Changes'}
          </>
        )}
      </Button>
    </div>
  );
}
