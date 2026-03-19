'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  /** All existing tags across projects for autocomplete */
  allTags?: string[];
  placeholder?: string;
}

export default function TagInput({ value, onChange, allTags = [], placeholder = 'Add tag...' }: TagInputProps) {
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => {
    if (!input.trim()) return [];
    const q = input.toLowerCase();
    return allTags
      .filter((t) => t.toLowerCase().includes(q) && !value.includes(t))
      .slice(0, 8);
  }, [input, allTags, value]);

  const addTag = useCallback(
    (tag: string) => {
      const trimmed = tag.trim().toLowerCase();
      if (trimmed && !value.includes(trimmed)) {
        onChange([...value, trimmed]);
      }
      setInput('');
      setShowSuggestions(false);
    },
    [value, onChange],
  );

  const removeTag = useCallback(
    (tag: string) => {
      onChange(value.filter((t) => t !== tag));
    },
    [value, onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        if (input.trim()) addTag(input);
      } else if (e.key === 'Backspace' && !input && value.length > 0) {
        removeTag(value[value.length - 1]);
      }
    },
    [input, value, addTag, removeTag],
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5 bg-zinc-700 border border-zinc-600 rounded-lg px-2 py-1.5 min-h-[36px] relative">
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 bg-blue-600/30 text-blue-300 text-xs px-2 py-0.5 rounded-full border border-blue-500/30"
        >
          {tag}
          <button
            type="button"
            aria-label={`Remove tag ${tag}`}
            onClick={() => removeTag(tag)}
            className="hover:text-white transition-colors"
          >
            <X size={10} />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setShowSuggestions(true);
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
        placeholder={value.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[80px] bg-transparent text-white text-sm outline-none placeholder-zinc-400"
      />
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute left-0 top-full mt-1 w-full bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl z-10 py-1 max-h-40 overflow-y-auto">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                addTag(s);
              }}
              className="w-full text-left px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
