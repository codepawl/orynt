"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { X } from "react-bootstrap-icons";

interface TagStat {
  name: string;
  count: number;
}

interface Props {
  value: string[];
  onChange: (tags: string[]) => void;
}

const TAG_RE = /^[a-z0-9][a-z0-9-]{0,24}$/;
const MAX_TAGS = 3;

export function TagInput({ value, onChange }: Props) {
  const [inputVal, setInputVal] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [stats, setStats] = useState<TagStat[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:8000";
    fetch(`${url}/api/community/tags/stats`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: TagStat[]) => setStats(data))
      .catch(() => {});
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const suggestions = useCallback((): TagStat[] => {
    const trimmed = inputVal.trim().toLowerCase();
    const already = new Set(value);
    if (!trimmed) {
      return stats.filter((s) => !already.has(s.name)).slice(0, 5);
    }
    return stats
      .filter((s) => s.name.includes(trimmed) && !already.has(s.name))
      .slice(0, 5);
  }, [inputVal, stats, value]);

  const addTag = useCallback(
    (tag: string) => {
      const t = tag.trim().toLowerCase();
      if (!t || value.includes(t) || value.length >= MAX_TAGS) return;
      if (!TAG_RE.test(t)) return;
      onChange([...value, t]);
      setInputVal("");
      setOpen(false);
      setActiveIdx(-1);
      inputRef.current?.focus();
    },
    [value, onChange]
  );

  const removeTag = (tag: string) => onChange(value.filter((t) => t !== tag));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const sugs = suggestions();
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (activeIdx >= 0 && activeIdx < sugs.length) {
        addTag(sugs[activeIdx].name);
      } else if (inputVal.trim()) {
        addTag(inputVal.trim());
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, sugs.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Backspace" && !inputVal && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  };

  const sugs = suggestions();
  const atMax = value.length >= MAX_TAGS;

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
          Tags <span className="font-normal text-neutral-400">(optional)</span>
        </label>
        <span className="text-xs text-neutral-400">{value.length}/{MAX_TAGS}</span>
      </div>

      {/* Selected tag pills */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 border-none bg-transparent p-0 cursor-pointer leading-none"
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Text input */}
      <input
        ref={inputRef}
        type="text"
        value={inputVal}
        onChange={(e) => {
          setInputVal(e.target.value.replace(",", ""));
          setOpen(true);
          setActiveIdx(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        disabled={atMax}
        placeholder={atMax ? "Max 3 tags" : "Type to search or create…"}
        className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-100 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
      />

      {/* Dropdown */}
      {open && !atMax && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg overflow-hidden">
          {sugs.length === 0 && inputVal.trim() ? (
            TAG_RE.test(inputVal.trim().toLowerCase()) ? (
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); addTag(inputVal.trim()); }}
                className="w-full text-left px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 border-none bg-transparent cursor-pointer"
              >
                Create tag <span className="font-medium">&quot;{inputVal.trim().toLowerCase()}&quot;</span>
              </button>
            ) : (
              <p className="px-3 py-2 text-xs text-neutral-400">
                Use lowercase letters, numbers, hyphens only
              </p>
            )
          ) : (
            <>
              {!inputVal.trim() && (
                <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                  Popular
                </p>
              )}
              {sugs.map((s, i) => (
                <button
                  key={s.name}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); addTag(s.name); }}
                  className={`w-full text-left px-3 py-1.5 text-sm border-none bg-transparent cursor-pointer flex items-center justify-between ${
                    i === activeIdx
                      ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
                      : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                  }`}
                >
                  {s.name}
                  <span className="text-[11px] text-neutral-400">{s.count}</span>
                </button>
              ))}
              {inputVal.trim() && TAG_RE.test(inputVal.trim().toLowerCase()) && !stats.some(s => s.name === inputVal.trim().toLowerCase()) && (
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); addTag(inputVal.trim()); }}
                  className="w-full text-left px-3 py-1.5 text-sm text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 border-none bg-transparent cursor-pointer border-t border-neutral-100 dark:border-neutral-800"
                >
                  Create &quot;<span className="font-medium text-neutral-700 dark:text-neutral-300">{inputVal.trim().toLowerCase()}</span>&quot;
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
