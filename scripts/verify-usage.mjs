// Offline smoke test: fold real session logs through the pure helpers used by
// lib/index.js, without a running harness. Mirrors the production fold so the
// numbers can be cross-checked against the on-disk logs.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { zstdDecompressSync } from "node:zlib";

const SESSIONS_ROOT = join(process.env.USERPROFILE ?? process.env.HOME, ".dsh", "sessions");

const onCount = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;

function usageCounters(usage) {
	if (typeof usage !== "object" || usage === null) return undefined;
	const input = usage.inputTokens;
	const output = usage.outputTokens;
	if (!onCount(input) || !onCount(output)) return undefined;
	const cacheRead = onCount(usage.cacheReadTokens) ? usage.cacheReadTokens : 0;
	const cacheWrite = onCount(usage.cacheWriteTokens) ? usage.cacheWriteTokens : 0;
	const reasoning = onCount(usage.reasoningTokens) ? usage.reasoningTokens : 0;
	const total = onCount(usage.totalTokens)
		? Math.max(usage.totalTokens, input + cacheRead + cacheWrite + output)
		: input + cacheRead + cacheWrite + output;
	return { input, output, cacheRead, cacheWrite, reasoning, total, requests: 1 };
}

function routeOf(message) {
	const source = message?.source;
	if (typeof source !== "object" || source === null) return { provider: "unknown", model: "unknown" };
	const provider = typeof source.provider === "string" && source.provider !== "" ? source.provider : "unknown";
	let model = typeof source.model === "string" && source.model !== "" ? source.model : "unknown";
	const slash = model.indexOf("/");
	if (slash > 0) {
		const prefix = model.slice(0, slash);
		if (provider === "unknown" || provider === prefix || provider.startsWith(prefix) || prefix.startsWith(provider)) {
			model = model.slice(slash + 1) || model;
		}
	}
	return { provider, model };
}

function walk(dir, out = []) {
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		const stat = statSync(full);
		if (stat.isDirectory()) walk(full, out);
		else if (name.endsWith(".jsonl.zstd")) out.push({ path: full, size: stat.size });
	}
	return out;
}

const files = walk(SESSIONS_ROOT);
const routes = new Map();
let sessions = 0;
let events = 0;
let bad = 0;
const started = Date.now();

for (const file of files) {
	let text;
	try {
		text = zstdDecompressSync(readFileSync(file.path)).toString("utf8");
	} catch (error) {
		bad += 1;
		continue;
	}
	let header = null;
	let counted = 0;
	for (const line of text.split("\n")) {
		if (line === "") continue;
		let row;
		try {
			row = JSON.parse(line);
		} catch {
			continue;
		}
		if (header === null && row.type === "session") {
			header = row;
			continue;
		}
		if (row.type !== "assistant/message") continue;
		const counters = usageCounters(row.data?.usage);
		if (counters === undefined) continue;
		const route = routeOf(row.data?.message);
		const key = route.provider + " | " + route.model;
		let bucket = routes.get(key);
		if (bucket === undefined) {
			bucket = { provider: route.provider, model: route.model, requests: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, total: 0 };
			routes.set(key, bucket);
		}
		for (const field of ["input", "output", "cacheRead", "cacheWrite", "reasoning", "total", "requests"]) bucket[field] += counters[field];
		events += 1;
		counted += 1;
	}
	if (counted > 0) sessions += 1;
}

const rows = [...routes.values()].sort((a, b) => b.total - a.total);
const grand = rows.reduce((sum, row) => sum + row.total, 0);
console.log(`logs=${files.length} unreadable=${bad} sessionsWithUsage=${sessions} usageEvents=${events} models=${rows.length} elapsed=${Date.now() - started}ms`);
console.log(`grandTotalTokens=${grand.toLocaleString()} (input=${rows.reduce((s, r) => s + r.input, 0).toLocaleString()} cacheRead=${rows.reduce((s, r) => s + r.cacheRead, 0).toLocaleString()} output=${rows.reduce((s, r) => s + r.output, 0).toLocaleString()})`);
console.log("");
console.log("provider".padEnd(22) + "model".padEnd(30) + "req".padStart(6) + "input".padStart(14) + "cacheR".padStart(14) + "output".padStart(14) + "total".padStart(16) + "share".padStart(8));
for (const row of rows) {
	console.log(
		row.provider.padEnd(22) +
			row.model.padEnd(30) +
			String(row.requests).padStart(6) +
			row.input.toLocaleString().padStart(14) +
			row.cacheRead.toLocaleString().padStart(14) +
			row.output.toLocaleString().padStart(14) +
			row.total.toLocaleString().padStart(16) +
			(((row.total / grand) * 100).toFixed(2) + "%").padStart(8),
	);
}
