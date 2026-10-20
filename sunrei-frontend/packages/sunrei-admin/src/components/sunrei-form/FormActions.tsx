import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2 } from 'lucide-react';

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
      {errorText && (
        <span className="mr-0.5 flex items-center gap-1.5 text-[11px] font-medium text-destructive">
          <AlertCircle className="h-[11px] w-[11px]" />
          {errorText}
        </span>
      )}
      <Button type="button" variant="outline" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {mode === 'create' ? 'Creating...' : 'Saving...'}
          </>
        ) : mode === 'create' ? (
          'Create Sunrei'
        ) : (
          'Save'
        )}
      </Button>
    </div>
  );
}
