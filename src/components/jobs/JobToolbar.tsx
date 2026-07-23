"use client";

import { X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { STCFG, STATUS_ORDER } from "./config";
import DateRangeFilter from "./DateRangeFilter";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

export type SearchField = "all" | "jobTitle" | "company" | "subject" | "from";
export type GroupMode = "status" | "none";

interface JobToolbarProps {
  searchQuery: string;
  searchField: SearchField;
  onSearchChange: (query: string, field: SearchField) => void;
  selectedStatuses: Set<string>;
  onStatusToggle: (status: string) => void;
  onClearStatuses: () => void;
  datePreset: string;
  dateFrom: string;
  dateTo: string;
  onDatePresetChange: (preset: string) => void;
  onDateFromChange: (date: string) => void;
  onDateToChange: (date: string) => void;
  groupMode: GroupMode;
  onGroupModeChange: (mode: GroupMode) => void;
}

const SEARCH_FIELDS: { value: SearchField; label: string; hint: string }[] = [
  {
    value: "all",
    label: "All Fields",
    hint: "Search every field",
  },
  { value: "jobTitle", label: "Job Title", hint: "Search by job title only" },
  { value: "company", label: "Company", hint: "Search by company name only" },
  {
    value: "subject",
    label: "Subject",
    hint: "Search by email subject only",
  },
  { value: "from", label: "Sender", hint: "Search by sender email only" },
];

export default function JobToolbar({
  searchQuery,
  searchField,
  onSearchChange,
  selectedStatuses,
  onStatusToggle,
  onClearStatuses,
  datePreset,
  dateFrom,
  dateTo,
  onDatePresetChange,
  onDateFromChange,
  onDateToChange,
  groupMode,
  onGroupModeChange,
}: JobToolbarProps) {
  const isBodySearch = searchField === "all" && searchQuery.startsWith("body:");
  const hasActiveFilters =
    searchQuery.length > 0 ||
    selectedStatuses.size < STATUS_ORDER.length ||
    datePreset !== "all";

  const handleInputChange = (value: string) => {
    onSearchChange(value, searchField);
  };

  const currentFieldHint = isBodySearch
    ? "Search email body\u2026"
    : `${SEARCH_FIELDS.find((f) => f.value === searchField)?.hint ?? ""}\u2026`;

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-3">
      {/* Search row */}
      <div className="flex items-center gap-2">
        <div className="relative flex flex-1 items-center">
          <Select
            value={searchField}
            onValueChange={(val) =>
              onSearchChange(searchQuery, val as SearchField)
            }
          >
            <SelectTrigger className="rounded-r-none border-r-0 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start" className="min-w-44">
              <SelectGroup>
                {SEARCH_FIELDS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    <div className="flex flex-col gap-0.5">
                      <span>{f.label}</span>
                      <span className="text-[10px] text-muted-foreground font-normal">
                        {f.hint}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectGroup>
              <div className="border-t border-border px-2 py-1.5 text-[10px] text-muted-foreground italic">
                Tip: type <code className="text-xs font-mono">body:</code> in
                All Fields to search email body
              </div>
            </SelectContent>
          </Select>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder={currentFieldHint}
            className="flex h-7 flex-1 rounded-r-md border border-input bg-background px-2.5 text-xs outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("", searchField)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Status filter dropdown */}
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">
            Status:
          </span>
          <Popover>
            <PopoverTrigger
              render={<Button variant="outline" size="sm" className="gap-1" />}
            >
              {selectedStatuses.size < STATUS_ORDER.length
                ? `${selectedStatuses.size} selected`
                : "All"}
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-1.5">
              <div className="flex flex-col gap-0.5">
                {STATUS_ORDER.map((s) => {
                  const cfg = STCFG[s];
                  const selected = selectedStatuses.has(s);
                  const Icon = cfg.icon;
                  return (
                    <label
                      key={s}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted transition-colors"
                    >
                      <Checkbox
                        checked={selected}
                        onCheckedChange={() => onStatusToggle(s)}
                      />
                      <Icon className={`size-3.5 ${cfg.color}`} />
                      <span>{cfg.label}</span>
                    </label>
                  );
                })}
                {selectedStatuses.size < STATUS_ORDER.length && (
                  <button
                    type="button"
                    onClick={onClearStatuses}
                    className="mt-1 text-[10px] text-muted-foreground hover:text-foreground underline w-full text-center"
                  >
                    Select all
                  </button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <Separator orientation="vertical" className="h-5" />

        <div className="flex items-center gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">
            Date:
          </span>
          <DateRangeFilter
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={onDateFromChange}
            onDateToChange={onDateToChange}
            datePreset={datePreset}
            onDatePresetChange={onDatePresetChange}
          />
        </div>

        <Separator orientation="vertical" className="h-5" />

        {/* Group toggle */}
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">
            Group:
          </span>
          <Button
            variant={groupMode === "status" ? "default" : "outline"}
            size="sm"
            onClick={() => onGroupModeChange("status")}
          >
            By Status
          </Button>
          <Button
            variant={groupMode === "none" ? "default" : "outline"}
            size="sm"
            onClick={() => onGroupModeChange("none")}
          >
            None
          </Button>
        </div>

        {/* Clear all */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => {
              onSearchChange("", "all");
              onClearStatuses();
              onDatePresetChange("all");
              onDateFromChange("");
              onDateToChange("");
            }}
            className="ml-auto text-[10px] text-muted-foreground hover:text-foreground underline"
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}
