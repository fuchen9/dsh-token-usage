// Pure-function checks for the host half. Every row asserts instead of merely
// printing, so a regression fails the run instead of needing a human to compare
// numbers by eye.
import { routeOf, usageCounters, hostNameOf, isTrustedRequest, RANGES, SCOPES, rangeStart, startOfDay, dayKey, encodeLedgerCache, decodeLedgerCache, UsageLedger } from "../lib/index.js";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let checked = 0;
const show = (value) => (value === undefined ? "undefined" : JSON.stringify(value).split("\\u0000").join("|NUL|"));
const check = (label, actual, expected) => {
	checked += 1;
	const got = show(actual);
	const want = show(expected);
	if (got !== want) throw new Error(`${label}\n  got  ${got}\n  want ${want}`);
	console.log("OK   " + label.padEnd(28) + got);
};

// --- model routing -------------------------------------------------------
// A provider-prefixed model name is only unwrapped when it belongs to the same
// provider; a mismatched prefix is a genuinely different route and stays whole.
check(
	"route mismatched prefix stays",
	routeOf({ source: { provider: "magpie", model: "codearts/deepseek-v4.1-flash" } }),
	{ provider: "magpie", model: "codearts/deepseek-v4.1-flash", key: "magpie\u0000codearts/deepseek-v4.1-flash" },
);
check(
	"route plain model",
	routeOf({ source: { provider: "workbuddy-vision", model: "deepseek-v4.1-flash" } }),
	{ provider: "workbuddy-vision", model: "deepseek-v4.1-flash", key: "workbuddy-vision\u0000deepseek-v4.1-flash" },
);
check("route missing provider", routeOf({ source: { model: "deepseek-v4-pro" } }), {
	provider: "unknown",
	model: "deepseek-v4-pro",
	key: "unknown\u0000deepseek-v4-pro",
});
check("route empty source", routeOf({}), { provider: "unknown", model: "unknown", key: "unknown\u0000unknown" });
check("route model with slash", routeOf({ source: { provider: "mf", model: "kilo-auto/free" } }), {
	provider: "mf",
	model: "kilo-auto/free",
	key: "mf\u0000kilo-auto/free",
});

// --- usage counters ------------------------------------------------------
check("usage basic", usageCounters({ inputTokens: 8510, outputTokens: 693, totalTokens: 9203 }), {
	requests: 1,
	input: 8510,
	output: 693,
	cacheRead: 0,
	cacheWrite: 0,
	reasoning: 0,
	total: 9203,
});
// totalTokens is below the sum of the parts, so the parts win.
check("usage cache", usageCounters({ inputTokens: 10, outputTokens: 5, cacheReadTokens: 100, totalTokens: 1 }), {
	requests: 1,
	input: 10,
	output: 5,
	cacheRead: 100,
	cacheWrite: 0,
	reasoning: 0,
	total: 115,
});
check("usage cacheWrite", usageCounters({ inputTokens: 10, outputTokens: 5, cacheWriteTokens: 7 }), {
	requests: 1,
	input: 10,
	output: 5,
	cacheRead: 0,
	cacheWrite: 7,
	reasoning: 0,
	total: 22,
});
check("usage none", usageCounters(null), undefined);
check("usage negative input", usageCounters({ inputTokens: -1, outputTokens: 5 }), undefined);

// --- authority parsing ---------------------------------------------------
for (const [authority, expected] of [
	["localhost:63211", "localhost"],
	["127.0.0.1:63211", "127.0.0.1"],
	["[::1]:80", "::1"],
	["example.com:80", "example.com"],
	["", null],
]) {
	check(`host ${JSON.stringify(authority)}`, hostNameOf(authority), expected);
}

// --- request trust -------------------------------------------------------
const req = (host, origin, site) => ({ headers: { host, ...(origin ? { origin } : {}), ...(site ? { "sec-fetch-site": site } : {}) } });
check("trust same origin", isTrustedRequest(req("127.0.0.1:63211", "http://127.0.0.1:63211"), "127.0.0.1"), true);
check("trust localhost", isTrustedRequest(req("localhost:63211"), "127.0.0.1"), true);
check("trust bad origin", isTrustedRequest(req("127.0.0.1:63211", "http://evil.test"), "127.0.0.1"), false);
check("trust remote host", isTrustedRequest(req("evil.test:63211"), "127.0.0.1"), false);
check("trust cross-site", isTrustedRequest(req("localhost:63211", undefined, "cross-site"), "127.0.0.1"), false);
check("trust lan bind", isTrustedRequest(req("192.168.1.5:63211"), "192.168.1.5"), true);

// --- time windows --------------------------------------------------------
check("RANGES", RANGES, ["all", "30d", "7d", "today"]);

const NOW = Date.parse("2026-11-02T00:30:00+08:00");
const dayOf = (offset) => {
	const date = new Date(NOW);
	date.setDate(date.getDate() + offset);
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
check("rangeStart all", rangeStart("all", NOW), undefined);
check("rangeStart today", rangeStart("today", NOW), dayOf(0));
check("rangeStart 7d", rangeStart("7d", NOW), dayOf(-6));
check("rangeStart 30d", rangeStart("30d", NOW), dayOf(-29));
check("7d reaches the previous month", rangeStart("7d", NOW) < dayOf(0).slice(0, 7) + "-01", true);
check("unknown range falls back to all", rangeStart("nonsense", NOW), undefined);
check("dayKey", dayKey(NOW), dayOf(0));
const midnight = new Date(startOfDay(NOW));
check("startOfDay clock", [midnight.getHours(), midnight.getMinutes(), midnight.getSeconds(), midnight.getMilliseconds()], [0, 0, 0, 0]);

// A day key is a plain YYYY-MM-DD string, so the window test is a string compare.
check("day keys compare lexically", "2026-10-27" <= "2026-11-02" && "2026-10-26" < "2026-10-27", true);

// --- ledger cache codec --------------------------------------------------
// The on-disk cache must survive a save/load round trip unchanged and must
// drop doubtful data instead of trusting it — a half-written file may never
// inject wrong numbers into the panel.
const countersBag = { requests: 2, input: 10, output: 20, cacheRead: 0, cacheWrite: 0, reasoning: 0, total: 30, provider: "p", model: "m" };
const rawCacheFile = {
	version: 1,
	savedAt: "2026-11-02T00:00:00.000Z",
	entries: {
		"s-1": {
			revision: "42",
			cursor: 3,
			truncated: true,
			start: 1000,
			end: 2000,
			header: { cwd: "D:/x", id: "s-1", origin: "cli", agentPreset: "writer" },
			routes: [["p\u0000m", countersBag]],
			byDay: [["2026-11-01", { routes: [["p\u0000m", countersBag]], min: 1000, max: 2000, tokens: 30 }]],
		},
	},
};
const decoded = decodeLedgerCache(rawCacheFile);
check("codec decodes one entry", decoded.size, 1);
const decodedEntry = decoded.get("s-1");
check("codec keeps the fold", [decodedEntry.cursor, decodedEntry.truncated, decodedEntry.routes.size, decodedEntry.byDay.size], [3, true, 1, 1]);
check("codec keeps counters", decodedEntry.routes.get("p\u0000m").input, 10);
check("codec keeps the header", decodedEntry.header, { cwd: "D:/x", id: "s-1", origin: "cli", agentPreset: "writer" });
const encodedOnce = encodeLedgerCache(decoded);
check("codec round trip is stable", encodeLedgerCache(decodeLedgerCache({ version: 1, entries: encodedOnce })), encodedOnce);
check("codec drops null", decodeLedgerCache(null).size, 0);
check("codec drops missing entries", decodeLedgerCache({}).size, 0);
check(
	"codec drops doubtful entries",
	decodeLedgerCache({
		entries: {
			a: null,
			b: { revision: "1" },
			c: { revision: "1", cursor: "x", routes: [], byDay: [] },
			d: { revision: "1", cursor: 1, routes: [["k", { input: "x" }]], byDay: [] },
			e: { revision: "1", cursor: 1, routes: [], byDay: [["2026-11-01", { routes: [], min: 1, max: "x", tokens: 1 }]] },
		},
	}).size,
	0,
);

// --- live incremental fold ----------------------------------------------
// A live session folds onto the entry the previous process left behind
// instead of being re-folded from zero, so the head must not double count.
const liveLedger = new UsageLedger({ logger: { warn() {} } });
const liveEvent = (seq, input) => ({
	seq,
	type: "assistant/message",
	time: 1_700_000_000_000 + seq * 1_000,
	data: { message: { source: { provider: "p", model: "m" } }, usage: { inputTokens: input, outputTokens: input } },
});
const liveSession = (seq, events) => ({ header: { cwd: "D:/x" }, seq, snapshotEvents: () => events });

liveLedger.collectLive("live-1", liveSession(1, [liveEvent(0, 100)]));
const liveEntry = liveLedger.entries.get("live-1");
check("live first fold", [liveEntry.cursor, liveEntry.revision, liveEntry.routes.get("p\u0000m").requests], [1, "live:1", 1]);

// The same head plus a new tail must count the head exactly once.
liveLedger.collectLive("live-1", liveSession(2, [liveEvent(0, 100), liveEvent(1, 50)]));
check("live tail only", liveEntry.routes.get("p\u0000m").input, 150);
check("live cursor advanced", [liveEntry.cursor, liveEntry.revision], [2, "live:2"]);

// An unchanged session is a no-op even when the snapshot is handed over again.
liveLedger.collectLive("live-1", liveSession(2, [liveEvent(0, 100), liveEvent(1, 50)]));
check("live same revision no-op", liveEntry.routes.get("p\u0000m").output, 150);

// A broken history cannot silently extend a fold it does not match.
liveLedger.collectLive("live-1", liveSession(6, [liveEvent(5, 7)]));
const rebuilt = liveLedger.entries.get("live-1");
check("live discontinuity rebuilds", [rebuilt.cursor, rebuilt.routes.get("p\u0000m").input], [6, 7]);

// --- cache file round trip ----------------------------------------------
const cacheDir = mkdtempSync(join(tmpdir(), "dsh-token-usage-check-"));
process.env.DSH_TOKEN_USAGE_CACHE = join(cacheDir, "cache.json");
try {
	const saver = new UsageLedger({ logger: { warn() {} } });
	saver.entries.set("s-1", decodedEntry);
	saver.dirty = true;
	saver.saveCacheNow();
	const loader = new UsageLedger({ logger: { warn() {} } });
	loader.loadCache();
	check("cache file round trip", [loader.loadedFromDisk, loader.entries.get("s-1")?.cursor], [true, 3]);
	check("cache loader keeps counters", loader.entries.get("s-1").routes.get("p\u0000m").input, 10);

	writeFileSync(process.env.DSH_TOKEN_USAGE_CACHE, JSON.stringify({ version: 999, entries: {} }));
	const guarded = new UsageLedger({ logger: { warn() {} } });
	guarded.loadCache();
	check("cache version guard", guarded.loadedFromDisk, false);
} finally {
	rmSync(cacheDir, { recursive: true, force: true });
}

// --- stale serve ---------------------------------------------------------
// A warm ledger answers from its cache immediately (marked stale) while the
// rescan runs in the background; a cold ledger still waits for the scan.
const fakeCtx = () => ({
	sessionPersistence: { list: async () => [] },
	sessions: { list: () => [] },
	logger: { warn() {} },
});

const cold = new UsageLedger(fakeCtx());
const coldBody = await cold.scan({ range: "all" });
check("cold serve waits for the scan", [coldBody.ok, coldBody.stale], [true, false]);

const serving = new UsageLedger(fakeCtx());
serving.loadedFromDisk = true;
serving.entries.set("s-1", decodedEntry);
const staleBody = await serving.scan({ range: "all" });
check("warm serve is stale", staleBody.stale, true);
await serving.inflight;
const freshBody = await serving.scan({ range: "all" });
check("warm serve settles fresh", freshBody.stale, false);

// --- archive scope + same-name dedup --------------------------------------
// The workspace registry's archive set slices every projection, and sessions
// sharing a display label count once — the one with the most usage.
check("scopes", SCOPES, ["unarchived", "archived", "all"]);

const scopeBag = (total) => ({
	provider: "p", model: "m",
	requests: 1, input: total, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, total,
});
const scopeEntry = (id, cwd, total) => ({
	revision: "r",
	cursor: 1,
	truncated: false,
	header: { cwd, id },
	routes: [["p\\u0000m", scopeBag(total)]],
	byDay: [["2026-11-01", { routes: [["p\\u0000m", scopeBag(total)]], min: 1000, max: 2000, tokens: total }]],
});
const scoped = new UsageLedger({
	logger: { warn() {} },
	workspaceRegistry: { archivedSessionIds: ["arch-big", "arch-other"] },
});
scoped.entries = decodeLedgerCache({
	version: 1,
	entries: {
		"arch-big": scopeEntry("arch-big", "D:/小说", 100),
		"live-dup": scopeEntry("live-dup", "D:/小说", 50),
		"other": scopeEntry("other", "D:/插件开发", 30),
		"arch-other": scopeEntry("arch-other", "D:/小说2", 70),
	},
});
scoped.refreshArchived(); // direct snapshot calls bypass scan()'s registry refresh
scoped.lastScanAt = Date.now(); // warm serve: the background scan must not wipe the fake folds

const allScope = scoped.snapshot(undefined, "all");
check("all scope keeps the biggest of each name", [allScope.totals.sessions, allScope.totals.total], [3, 200]);
check("all scope reports what dedup dropped", allScope.deduped, { sessions: 1, tokens: 50 });
check("all scope keeps the archived flag", allScope.sessions.find((row) => row.id === "arch-big")?.archived, true);
check("all scope marks live rows unarchived", allScope.sessions.find((row) => row.id === "other")?.archived, false);

const unarchived = scoped.snapshot(undefined, "unarchived");
check("unarchived scope drops archived ids", [unarchived.totals.sessions, unarchived.totals.total], [2, 80]);
check("unarchived scope dedups within itself", unarchived.deduped, { sessions: 0, tokens: 0 });

const archived = scoped.snapshot(undefined, "archived");
check("archived scope keeps only archived ids", [archived.totals.sessions, archived.totals.total], [2, 170]);

const scopedView = scoped.view("all", "unarchived");
check("view memo carries the scope", [scopedView.scope, scopedView.totals.total], ["unarchived", 80]);

scoped.lastScanAt = Date.now(); // warm serve: the background scan must not wipe the fake folds
const scopedServe = await scoped.scan({ range: "all", scope: "archived" });
check("scan passes the scope through", [scopedServe.scope, scopedServe.totals.total], ["archived", 170]);

console.log(`\nALL ${checked} HELPER CHECKS PASSED`);