import {
	History,
	Trash2,
	Undo2,
	ArchiveRestore,
	Loader2,
	Clock,
} from "lucide-react";
import type { ResolutionEntry } from "@/lib/jobs-db";
import type { JobApplication } from "@/lib/jobs/types";
import { STCFG } from "./config";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatTimeAgo } from "@/lib/utils";

interface HiddenJobsPanelProps {
	resolutionHistory: ResolutionEntry[];
	deletedJobs: JobApplication[];
	restoringId: string | null;
	onRestore: (jobId: string) => void;
	onUndoMerge: (timestamp: number) => void;
	undoing: boolean;
}

export default function HiddenJobsPanel({
	resolutionHistory,
	deletedJobs,
	restoringId,
	onRestore,
	onUndoMerge,
	undoing,
}: HiddenJobsPanelProps) {
	const hasHistory = resolutionHistory.length > 0;
	const hasDeleted = deletedJobs.length > 0;

	if (!hasHistory && !hasDeleted) {
		return (
			<div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
				<ArchiveRestore className="size-10 opacity-40" />
				<p className="text-xs">No hidden jobs or history yet.</p>
				<p className="text-[11px] text-center max-w-[20ch]">
					Soft-deleted jobs and dedup history appear here.
				</p>
			</div>
		);
	}

	return (
		<Tabs defaultValue={hasDeleted ? "hidden" : "dedup"}>
			<div className="px-4 pt-1">
				<TabsList className="w-full">
					<TabsTrigger value="hidden" className="flex-1">
						<Trash2 className="size-3.5" />
						Hidden{hasDeleted ? ` (${deletedJobs.length})` : ""}
					</TabsTrigger>
					<TabsTrigger value="dedup" className="flex-1">
						<History className="size-3.5" />
						Dedup{hasHistory ? ` (${resolutionHistory.length})` : ""}
					</TabsTrigger>
				</TabsList>
			</div>

			<TabsContent value="hidden" keepMounted>
				{hasDeleted ? (
					<div className="space-y-0.5 px-4 pt-3 pb-4">
						{deletedJobs.map((job) => (
							<div
								key={job.id}
								className="group flex items-start gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted/50"
							>
								<div className="min-w-0 flex-1">
									<p className="truncate font-medium text-foreground">
										{job.jobTitle}
									</p>
									<p className="truncate text-muted-foreground">
										{job.company}
									</p>
									<div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
										{STCFG[job.status] && (
											<Badge
												variant="outline"
												className="text-[10px] h-4 px-1.5"
											>
												{STCFG[job.status].label}
											</Badge>
										)}
										<span className="flex items-center gap-1">
											<Clock className="size-2.5" />
											Deleted {formatTimeAgo(job.updatedAt)}
										</span>
									</div>
								</div>
								<Button
									variant="ghost"
									size="xs"
									className="shrink-0 opacity-50 group-hover:opacity-100 transition-opacity"
									onClick={() => onRestore(job.id)}
									disabled={restoringId === job.id}
								>
									{restoringId === job.id ? (
										<Loader2 className="size-3 animate-spin" />
									) : (
										<Undo2 className="size-3" />
									)}
									<span className="sr-only sm:not-sr-only">Restore</span>
								</Button>
							</div>
						))}
					</div>
				) : (
					<div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
						<Trash2 className="size-8 opacity-40" />
						<p className="text-xs">No hidden jobs.</p>
					</div>
				)}
			</TabsContent>

			<TabsContent value="dedup" keepMounted>
				{hasHistory ? (
					<div className="space-y-0.5 px-4 pt-3 pb-4">
						{resolutionHistory.map((r) => (
							<div
								key={r.timestamp}
								className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted/40"
							>
								<span
									className={`shrink-0 text-[10px] font-medium ${
										r.action === "ignore"
											? "text-amber-500"
											: r.action === "merge-undo"
												? "text-orange-500"
												: "text-emerald-500"
									}`}
								>
									{r.action === "ignore" || r.action === "ignore-undo"
										? "Ignored"
										: r.action === "merge-undo"
											? "Undone"
											: "Merged"}
								</span>
								<span className="truncate text-muted-foreground">
									{r.groupKey.split(":")[1] ?? r.groupKey}
								</span>
								<span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
									{formatTimeAgo(r.timestamp)}
								</span>
								{r.action === "merge" && (
									<Button
										variant="ghost"
										size="xs"
										className="shrink-0 opacity-50 group-hover:opacity-100 transition-opacity"
										onClick={() => onUndoMerge(r.timestamp)}
										disabled={undoing}
									>
										{undoing ? (
											<Loader2 className="size-2.5 animate-spin" />
										) : (
											"Undo"
										)}
									</Button>
								)}
								{(r.action === "ignore" || r.action === "merge-undo") && (
									<span className="shrink-0 text-[10px] text-muted-foreground italic">
										done
									</span>
								)}
							</div>
						))}
					</div>
				) : (
					<div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
						<History className="size-8 opacity-40" />
						<p className="text-xs">No dedup history yet.</p>
					</div>
				)}
			</TabsContent>
		</Tabs>
	);
}
