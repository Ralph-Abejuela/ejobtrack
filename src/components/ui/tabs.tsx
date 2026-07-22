import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cn } from "@/lib/utils";

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
	return (
		<TabsPrimitive.Root
			data-slot="tabs"
			className={cn("flex flex-col gap-2", className)}
			{...props}
		/>
	);
}

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
	return (
		<TabsPrimitive.List
			data-slot="tabs-list"
			className={cn(
				"inline-flex h-8 items-center gap-0.5 rounded-lg bg-muted p-0.5 text-muted-foreground",
				className,
			)}
			{...props}
		/>
	);
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
	return (
		<TabsPrimitive.Tab
			data-slot="tabs-trigger"
			className={cn(
				"inline-flex h-full items-center justify-center rounded-md px-2.5 text-xs font-medium whitespace-nowrap outline-none transition-all",
				"data-active:bg-background data-active:text-foreground data-active:shadow-xs",
				"disabled:pointer-events-none disabled:opacity-50",
				"hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30",
				className,
			)}
			{...props}
		/>
	);
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
	return (
		<TabsPrimitive.Panel
			data-slot="tabs-content"
			className={cn(
				"mt-0 outline-none",
				"data-hidden:opacity-0 data-hidden:transition-none",
				className,
			)}
			{...props}
		/>
	);
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
