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
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface TagAutocompleteProps {
  selectedTagIds: string[];
  selectedTags: TagDTO[];
  onTagsChange: (tagIds: string[], tags: TagDTO[]) => void;
}

export default function TagAutocomplete({
  selectedTagIds,
  selectedTags,
  onTagsChange,
}: TagAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const { data: searchResults = [] } = useSearchTags(debouncedQuery);
  const createTagMutation = useCreateTag();

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectTag = (tag: TagDTO) => {
    if (selectedTagIds.includes(tag.id!)) {
      // Remove tag
      const newTagIds = selectedTagIds.filter((id) => id !== tag.id);
      const newTags = selectedTags.filter((t) => t.id !== tag.id);
      onTagsChange(newTagIds, newTags);
    } else {
      // Add tag
      onTagsChange([...selectedTagIds, tag.id!], [...selectedTags, tag]);
    }
  };

  const handleRemoveTag = (tagId: string) => {
    const newTagIds = selectedTagIds.filter((id) => id !== tagId);
    const newTags = selectedTags.filter((t) => t.id !== tagId);
    onTagsChange(newTagIds, newTags);
  };

  const handleCreateTag = async () => {
    if (!searchQuery.trim()) return;

    try {
      const newTag = await createTagMutation.mutateAsync({
        name: searchQuery.trim(),
      });

      // Add the newly created tag to selection
      onTagsChange([...selectedTagIds, newTag.id!], [...selectedTags, newTag]);
      setSearchQuery('');
      setOpen(false);
    } catch (error) {
      console.error('Failed to create tag:', error);
    }
  };

  const exactMatch = searchResults?.find(
    (tag) => tag.name.toLowerCase() === searchQuery.toLowerCase()
  );
  const showCreateButton = searchQuery.trim() && !exactMatch;
  const hasSearchQuery = debouncedQuery.trim().length > 0;

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
          >
            {selectedTags.length > 0
              ? `${selectedTags.length} tag(s) selected`
              : 'Select tags...'}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search tags..."
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
            <CommandList>
              <CommandEmpty>
                {hasSearchQuery ? 'No tags found.' : 'Type to search tags...'}
              </CommandEmpty>
              {hasSearchQuery && searchResults && searchResults.length > 0 && (
                <CommandGroup>
                  {searchResults.map((tag) => (
                    <CommandItem
                      key={tag.id}
                      value={tag.id}
                      onSelect={() => handleSelectTag(tag)}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          selectedTagIds.includes(tag.id!)
                            ? 'opacity-100'
                            : 'opacity-0'
                        )}
                      />
                      <div className="flex-1">
                        <div className="font-medium">{tag.name}</div>
                        {tag.description && (
                          <div className="text-xs text-muted-foreground">
                            {tag.description}
                          </div>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {showCreateButton && (
                <CommandGroup>
                  <CommandItem
                    onSelect={handleCreateTag}
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
        <div className="flex flex-wrap gap-2">
          {selectedTags.map((tag) => (
            <Badge key={tag.id} variant="secondary" className="gap-1">
              {tag.name}
              <button
                type="button"
                onClick={() => handleRemoveTag(tag.id!)}
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
