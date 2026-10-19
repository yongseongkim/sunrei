import { Button } from '@/components/ui/button';
import { Loader2, Save } from 'lucide-react';

interface FormActionsProps {
  mode: 'create' | 'edit';
  isSubmitting: boolean;
  onCancel: () => void;
  /** 저장이 막힌 이유를 Save 옆에 보여 준다. */
  errorText?: string;
}

export default function FormActions({
  mode,
  isSubmitting,
  onCancel,
  errorText,
}: FormActionsProps) {
  return (
    <div className="flex items-center justify-end gap-2">
      {errorText && <span className="mr-1 text-sm font-medium text-destructive">{errorText}</span>}
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
