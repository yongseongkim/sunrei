import { PlaceCategory } from '@/api/admin';
export function PlaceCategorySelect({
  value,
  onChange,
  disabled = false,
}: {
  value?: PlaceCategory;
  onChange: (value: PlaceCategory) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block space-y-1.5 text-sm font-medium">
      Category
      <select
        aria-label="Place category"
        disabled={disabled}
        value={value ?? 'OTHER'}
        onChange={(event) => onChange(event.target.value as PlaceCategory)}
        className="flex h-10 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-50"
      >
        {Object.values(PlaceCategory).map((category) => (
          <option key={category} value={category}>
            {category.charAt(0) + category.slice(1).toLowerCase()}
          </option>
        ))}
      </select>
    </label>
  );
}
