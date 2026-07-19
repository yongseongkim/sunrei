'use client';

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
import { useSources } from '@/lib/hooks/use-sources';
import { SourceDTO } from '@/api/admin';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const TYPE_BADGE: Record<string, string> = {
  YOUTUBE: 'YouTube',
  TV: 'TV',
  ANIME: 'Anime',
  OTHER: 'Other',
};

interface SourceSelectFieldProps {
  value: string | undefined;
  onChange: (sourceId: string, source?: SourceDTO) => void;
}

export default function SourceSelectField({
  value,
  onChange,
}: SourceSelectFieldProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const { data: sources = [] } = useSources(q);

  const selected = sources.find((s) => s.id === value);

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
            <span className="truncate">
              {selected
                ? `${selected.name} (${TYPE_BADGE[selected.type] ?? selected.type})`
                : 'Select a source...'}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[420px] p-0">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search sources..."
              value={q}
              onValueChange={setQ}
            />
            <CommandList>
              <CommandEmpty>No sources found.</CommandEmpty>
              <CommandGroup>
                {sources.map((s) => (
                  <CommandItem
                    key={s.id}
                    value={s.id}
                    onSelect={() => {
                      onChange(s.id!, s);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value === s.id ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <div className="flex-1">
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {TYPE_BADGE[s.type] ?? s.type}
                        {s.sunreiCount != null && ` · ${s.sunreiCount} sunreis`}
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Plus className="h-3 w-3" />
        <Link href="/sources/new" className="hover:underline">
          Create a new source
        </Link>
      </div>
    </div>
  );
}
