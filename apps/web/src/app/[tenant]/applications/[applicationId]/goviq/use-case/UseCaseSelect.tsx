// ============================================
// 4. USE CASE SELECT COMPONENT (components/UseCaseSelect.tsx)
// ============================================
import React, { useState } from 'react';
import { Check, Plus, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface UseCaseSelectProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  allowCustom?: boolean;
  disabled?: boolean;
}

export const UseCaseSelect: React.FC<UseCaseSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = "Select use case",
  error,
  allowCustom = true,
  disabled = false
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const commit = (selectedValue: string) => {
    onChange(selectedValue);
    setOpen(false);
    setSearch('');
  };

  const typed = search.trim();
  const canAddCustom =
    allowCustom && typed && !options.some((o) => o.toLowerCase() === typed.toLowerCase());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between",
            error && "border-red-500",
            disabled && "opacity-50 cursor-not-allowed"
          )}
          disabled={disabled}
        >
          {value || placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command>
          <CommandInput
            placeholder={allowCustom ? "Search or type a custom use case..." : "Search use cases..."}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>No use case found.</CommandEmpty>
            <CommandGroup className="max-h-48 overflow-y-auto">
              {/* forceMount: cmdk's filter would otherwise hide this as soon as the user types */}
              {canAddCustom && (
                <CommandItem
                  forceMount
                  value={`__custom__ ${typed}`}
                  onSelect={() => commit(typed)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add custom use case &quot;{typed}&quot;
                </CommandItem>
              )}
              {options.map((option) => (
                <CommandItem key={option} value={option} onSelect={() => commit(option)}>
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {option}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
