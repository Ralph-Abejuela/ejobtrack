"use client";

import { addDays, format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import * as React from "react";
import type { DateRange } from "react-day-picker";
import type { DropdownProps } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
	Combobox,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxList,
	ComboboxPopup,
} from "@/components/ui/combobox";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";

interface DropdownItem {
	disabled?: boolean;
	label: string;
	value: string;
}

function CalendarDropdown(props: DropdownProps) {
	const { options, value, onChange, "aria-label": ariaLabel } = props;

	const items: DropdownItem[] =
		options?.map((option) => ({
			disabled: option.disabled,
			label: option.label,
			value: option.value.toString(),
		})) ?? [];

	const selectedItem = items.find((item) => item.value === value?.toString());

	const handleValueChange = (newValue: DropdownItem | null) => {
		if (onChange && newValue) {
			const syntheticEvent = {
				target: { value: newValue.value },
			} as React.ChangeEvent<HTMLSelectElement>;
			onChange(syntheticEvent);
		}
	};

	return (
		<div className="w-24">
			<Combobox
				aria-label={ariaLabel}
				autoHighlight
				items={items}
				onValueChange={handleValueChange}
				value={selectedItem}
			>
				<ComboboxInput
					className="**:[input]:w-0 **:[input]:flex-1"
					onFocus={(e) => e.currentTarget.select()}
				/>
				<ComboboxPopup aria-label={ariaLabel}>
					<ComboboxEmpty>No items found.</ComboboxEmpty>
					<ComboboxList>
						{(item: DropdownItem) => (
							<ComboboxItem
								disabled={item.disabled}
								key={item.value}
								value={item}
							>
								{item.label}
							</ComboboxItem>
						)}
					</ComboboxList>
				</ComboboxPopup>
			</Combobox>
		</div>
	);
}

interface DateRangeFilterProps {
	dateFrom: string;
	dateTo: string;
	onDateFromChange: (date: string) => void;
	onDateToChange: (date: string) => void;
	datePreset: string;
	onDatePresetChange: (preset: string) => void;
}

const PRESETS = [
	{
		label: "Today",
		getValue: () => ({ from: new Date(), to: new Date() }),
		preset: "today",
	},
	{
		label: "Last 7 days",
		getValue: () => ({ from: addDays(new Date(), -7), to: new Date() }),
		preset: "7d",
	},
	{
		label: "Last 30 days",
		getValue: () => ({ from: addDays(new Date(), -30), to: new Date() }),
		preset: "30d",
	},
	{
		label: "Last 90 days",
		getValue: () => ({ from: addDays(new Date(), -90), to: new Date() }),
		preset: "90d",
	},
];

export default function DateRangeFilter({
	dateFrom,
	dateTo,
	onDateFromChange,
	onDateToChange,
	datePreset,
	onDatePresetChange,
}: DateRangeFilterProps) {
	const today = new Date();
	const [month, setMonth] = React.useState(today);

	const range: DateRange | undefined =
		dateFrom && dateTo
			? { from: new Date(dateFrom), to: new Date(dateTo) }
			: dateFrom
				? { from: new Date(dateFrom), to: undefined }
				: undefined;

	const handleRangeSelect = (selectedRange: DateRange | undefined) => {
		if (selectedRange?.from) {
			onDateFromChange(format(selectedRange.from, "yyyy-MM-dd"));
		} else {
			onDateFromChange("");
		}
		if (selectedRange?.to) {
			onDateToChange(format(selectedRange.to, "yyyy-MM-dd"));
		} else {
			onDateToChange("");
		}
	};

	const handlePreset = (preset: {
		label: string;
		getValue: () => { from: Date; to: Date };
		preset: string;
	}) => {
		const val = preset.getValue();
		onDateFromChange(format(val.from, "yyyy-MM-dd"));
		onDateToChange(format(val.to, "yyyy-MM-dd"));
		onDatePresetChange(preset.preset);
		setMonth(val.from);
	};

	const handleClear = () => {
		onDateFromChange("");
		onDateToChange("");
		onDatePresetChange("all");
	};

	const triggerLabel =
		dateFrom || dateTo
			? `${dateFrom ? format(new Date(dateFrom), "LLL dd, y") : "?"} - ${dateTo ? format(new Date(dateTo), "LLL dd, y") : "?"}`
			: "Date range";

	return (
		<Popover>
			<PopoverTrigger
				render={
					<Button variant="outline" size="sm" className="gap-1.5">
						<CalendarIcon />
						{triggerLabel}
					</Button>
				}
			/>
			<PopoverContent align="start" className="w-auto p-0">
				<div className="flex max-sm:flex-col">
					{/* Presets sidebar */}
					<div className="flex flex-col gap-0.5 p-2 max-sm:order-1 max-sm:border-t sm:border-e">
						{PRESETS.map((p) => (
							<Button
								key={p.preset}
								className="w-fit justify-start"
								onClick={() => handlePreset(p)}
								size="sm"
								variant={datePreset === p.preset ? "default" : "ghost"}
							>
								{p.label}
							</Button>
						))}
						{datePreset !== "all" && (
							<Button
								className="w-full justify-start text-muted-foreground"
								onClick={handleClear}
								size="sm"
								variant="ghost"
							>
								Clear
							</Button>
						)}
					</div>

					{/* Calendar + inputs */}
					<div className="flex flex-col gap-3 p-3">
						<Calendar
							captionLayout="dropdown"
							components={{ Dropdown: CalendarDropdown }}
							defaultMonth={range?.from ?? today}
							endMonth={new Date(2099, 11)}
							mode="range"
							month={month}
							onMonthChange={setMonth}
							onSelect={handleRangeSelect}
							selected={range}
							startMonth={new Date(2020, 0)}
						/>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}
