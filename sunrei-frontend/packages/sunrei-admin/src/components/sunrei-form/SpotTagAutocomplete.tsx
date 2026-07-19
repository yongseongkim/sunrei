'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useCreateTag, useSearchTags } from '@/lib/hooks/use-tags';
import { TagDTO } from '@/api/admin';
import { Check, ChevronsUpDown, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

interface SpotTagAutocompleteProps {
  selectedTagIds: string[];
  selectedTags: TagDTO[];
  onChange: (tagIds: string[], tags: TagDTO[]) => void;
}

export default function SpotTagAutocomplete({
  selectedTagIds,
  selectedTags,
  onChange,
}: SpotTagAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const { data: searchResults = [] } = useSearchTags(debouncedQuery);
  const createTagMutation = useCreateTag();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Index selected tags by id for label lookup.
  const selectedById = useMemo(
    () => new Map(selectedTags.map((t) => [t.id, t])),
    [selectedTags]
  );

  const toggle = (tag: TagDTO) => {
    if (!tag.id) return;
    if (selectedTagIds.includes(tag.id)) {
      onChange(
        selectedTagIds.filter((id) => id !== tag.id),
        selectedTags.filter((t) => t.id !== tag.id)
      );
    } else {
      onChange([...selectedTagIds, tag.id], [...selectedTags, tag]);
    }
  };

  const remove = (tagId: string) => {
    onChange(
      selectedTagIds.filter((id) => id !== tagId),
      selectedTags.filter((t) => t.id !== tagId)
    );
  };

  const createTag = async () => {
    const typed = searchQuery.trim();
    if (!typed) return;
    try {
      const created = await createTagMutation.mutateAsync({
        labelEn: typed,
        labelKo: typed,
      });
      if (created.id) toggle(created);
      setSearchQuery('');
      setOpen(false);
    } catch (e) {
      console.error('Failed to create tag:', e);
    }
  };

  const lower = searchQuery.toLowerCase();
  const exactMatch = searchResults?.some(
    (t) =>
      t.labelKo?.toLowerCase() === lower ||
      t.labelEn?.toLowerCase() === lower
  );
  const showCreate = searchQuery.trim() && !exactMatch;
  const hasQuery = debouncedQuery.trim().length > 0;

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between h-8"
          >
            <span className="truncate">
              {selectedTags.length > 0
                ? `${selectedTags.length} tag(s)`
                : 'Spot tags...'}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[380px] p-0">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search tags (KO or EN)..."
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
            <CommandList>
              <CommandEmpty>
                {hasQuery ? 'No tags found.' : 'Type to search tags...'}
              </CommandEmpty>
              {hasQuery && searchResults && searchResults.length > 0 && (
                <CommandGroup>
                  {searchResults.map((tag) => (
                    <CommandItem
                      key={tag.id}
                      value={tag.id}
                      onSelect={() => toggle(tag)}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          tag.id && selectedTagIds.includes(tag.id)
                            ? 'opacity-100'
                            : 'opacity-0'
                        )}
                      />
                      <div className="flex-1">
                        <div className="font-medium">{tag.labelKo}</div>
                        {tag.labelEn && tag.labelEn !== tag.labelKo && (
                          <div className="text-xs text-muted-foreground">
                            {tag.labelEn}
                          </div>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {showCreate && (
                <CommandGroup>
                  <CommandItem
                    onSelect={createTag}
                    className="text-primary"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Create &quot;{searchQuery}&quot;
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedTags.map((tag) => (
            <Badge key={tag.id} variant="secondary" className="gap-1 text-xs">
              {selectedById.get(tag.id)?.labelKo ?? tag.labelKo}
              <button
                type="button"
                onClick={() => remove(tag.id!)}
                className="ml-1 rounded-full hover:bg-muted"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
