import { useState, useEffect } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import {
	getModelStatus,
	onModelStatusChange,
	type ModelStatus,
} from "@/lib/classify-email";

export function ModelLoadingBanner() {
	const [status, setStatus] = useState<ModelStatus>(getModelStatus);

	useEffect(() => {
		const unsub = onModelStatusChange(setStatus);
		return unsub;
	}, []);

	if (status === "loading") {
		return (
			<div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300">
				<Loader2 className="size-4 animate-spin shrink-0" />
				<span>
					Loading email classifier model (~30MB, one-time download)...
				</span>
			</div>
		);
	}

	if (status === "error") {
		return (
			<div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
				<AlertTriangle className="size-4 shrink-0" />
				<span>
					Email classifier model failed to load — falling back to keyword
					matching. Job detection may be less accurate.
				</span>
			</div>
		);
	}

	// "ready" or "unloaded" → render nothing
	return null;
}
