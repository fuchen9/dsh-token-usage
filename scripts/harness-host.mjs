// End-to-end harness for the host half: feeds the real session logs through
// the plugin's own ledger (via a fake fiber context that implements the two
// services it injects), then exercises the HTTP route through a real server.
import { createServer } from "node:http";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { zstdDecompressSync } from "node:zlib";
import { apply, inject, ROUTE_PATH, RANGES, rangeStart, dayKey, routeOf, usageCounters } from "../lib/index.js";

const SESSIONS_ROOT = join(process.env.USERPROFILE ?? process.env.HOME, ".dsh", "sessions");

/** Load real session logs into the shapes ctx.sessionPersistence returns. */
function loadSessions() {
	const sessions = new Map();
	const walk = (dir) => {
		for (const name of readdirSync(dir)) {
			const full = join(dir, name);
			const stat = statSync(full);
			if (stat.isDirectory()) {
				walk(full);
				continue;
			}
			if (!name.endsWith(".jsonl.zstd")) continue;
			let text;
			try {
				text = zstdDecompressSync(readFileSync(full)).toString("utf8");
			} catch {
				continue;
			}
			const rows = [];
			for (const line of text.split("\n")) {
				if (line === "") continue;
				try {
					rows.push(JSON.parse(line));
				} catch {
					/* skip a torn tail line */
				}
			}
			const header = rows[0];
			if (header === null || typeof header !== "object" || header.type !== "session") continue;
			const events = rows.slice(1);
			sessions.set(header.id, { header, events, revision: "rev:" + stat.size, size: stat.size });
		}
	};
	walk(SESSIONS_ROOT);
	return sessions;
}

const store = loadSessions();
let rawTotal = 0;
let rawCount = 0;
const rawSessions = new Set();
for (const entry of store.values()) {
	for (const event of entry.events) {
		if (event.type !== "assistant/message") continue;
		const usage = event.data?.usage;
		if (typeof usage?.totalTokens !== "number") continue;
		rawTotal += Math.max(usage.totalTokens, (usage.inputTokens ?? 0) + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0) + (usage.outputTokens ?? 0));
		rawCount += 1;
		rawSessions.add(entry.header.id);
	}
}
console.log("raw session files:", store.size, "raw usage events:", rawCount, "raw totalTokens:", rawTotal.toLocaleString());

// Independent per-range expectation: walk the same events and keep only those
// whose own `time` falls inside the window. This never touches the ledger's
// per-day buckets, so it tests the windowing instead of restating it.
const NOW = Date.now();
const rawRanges = new Map();
for (const range of RANGES) {
	rawRanges.set(range, { since: rangeStart(range, NOW), requests: 0, total: 0, sessions: new Set(), models: new Map(), days: new Map() });
}
for (const entry of store.values()) {
	for (const event of entry.events) {
		if (event.type !== "assistant/message") continue;
		const counters = usageCounters(event.data?.usage);
		if (counters === undefined) continue;
		const route = routeOf(event.data?.message);
		const day = dayKey(event.time);
		for (const [range, acc] of rawRanges) {
			if (acc.since !== undefined && day < acc.since) continue;
			acc.requests += 1;
			acc.total += counters.total;
			acc.sessions.add(entry.header.id);
			let row = acc.models.get(route.key);
			if (row === undefined) {
				row = { provider: route.provider, model: route.model, requests: 0, total: 0 };
				acc.models.set(route.key, row);
			}
			row.requests += 1;
			row.total += counters.total;
			acc.days.set(day, (acc.days.get(day) ?? 0) + counters.total);
		}
	}
}
const allRange = rawRanges.get("all");
if (allRange.total !== rawTotal || allRange.requests !== rawCount) {
	throw new Error(`the two raw folds disagree: ${allRange.total}/${allRange.requests} vs ${rawTotal}/${rawCount}`);
}
console.log(
	"raw windows:",
	RANGES.map((range) => `${range}=${rawRanges.get(range).total.toLocaleString()}/${rawRanges.get(range).sessions.size}s`).join("  "),
);

let opened = 0;

// Exercise the live-session path too: hold one real log back from persistence and
// present it only as this process's in-memory session, the way a Session that has
// not been flushed yet reaches the ledger (see `ctx.sessions` in lib/index.js).
const heldBack = store.entries().next().value;
if (heldBack !== undefined) store.delete(heldBack[0]);
const liveSessions = heldBack === undefined ? [] : [{
	id: heldBack[0],
	header: heldBack[1].header,
	seq: heldBack[1].events.length,
	snapshotEvents: () => heldBack[1].events,
}];
console.log("live sessions:", liveSessions.length, "persisted:", store.size);

const persistence = {
	async list() {
		return [...store.values()].map((entry) => ({ header: entry.header, revision: entry.revision, sizeBytes: entry.size }));
	},
	async stat(id) {
		const entry = store.get(id);
		return entry === undefined ? undefined : { header: entry.header, revision: entry.revision, sizeBytes: entry.size };
	},
	async open(id, mode) {
		opened += 1;
		const entry = store.get(id);
		if (entry === undefined) throw new Error("unknown session " + id);
		if (mode !== "read") throw new Error("read only");
		return {
			header: entry.header,
			inheritedEventCount: 0,
			async read(start = 0, count) {
				const from = Math.max(0, start);
				const slice = count === undefined ? entry.events.slice(from) : entry.events.slice(from, from + count);
				return { events: slice };
			},
			async close() {},
		};
	},
};

const disposers = [];
const registered = [];
const services = {
	logger: { warn: (m) => console.log("[warn]", m), error: (m) => console.log("[error]", m) },
	sessions: { list: () => liveSessions },
	sessionPersistence: persistence,
	webServer: {
		host: "127.0.0.1",
		register(route) {
			registered.push(route);
			return () => {};
		},
	},
};
// Cordis resolves a service through a proxy that throws when the property was
// not declared in the plugin's `inject` — even though the service exists in the
// store. A hand-written context object does not, which is exactly how an
// undeclared `ctx.sessions` slipped past this harness once and only failed in
// the real app. So the fake context enforces `inject` the same way: a declared
// service or a built-in context member resolves, anything else throws the
// Cordis message verbatim.
const CONTEXT_BUILTINS = new Set([
	"logger", "effect", "on", "once", "off", "emit", "waterfall", "bail", "parallel", "serial",
	"inject", "plugin", "registry", "get", "reflect", "service", "provide", "accessor", "mixin", "scope",
]);
const reachable = new Set([...CONTEXT_BUILTINS, ...inject]);
const ctx = new Proxy(services, {
	get(target, prop, receiver) {
		if (typeof prop !== "string") return Reflect.get(target, prop, receiver);
		if (!reachable.has(prop)) throw new Error(`cannot get property "${prop}" without inject`);
		return Reflect.get(target, prop, receiver);
	},
});
ctx.effect = (fn, label) => {
	const disposer = fn();
	disposers.push([label, disposer]);
};
for (const name of inject) {
	if (!Reflect.has(services, name)) throw new Error(`plugin injects "${name}" but the harness provides no such service`);
}

apply(ctx);

if (registered.length !== 1) throw new Error("expected exactly one registered route");
const route = registered[0];
console.log("registered route:", route.kind, route.path, "expected", ROUTE_PATH);

const server = createServer((req, res) => route.handler(req, res));
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

const get = async (path, headers = {}) => {
	const response = await fetch(base + path, { headers: { host: `127.0.0.1:${port}`, ...headers } });
	return { status: response.status, body: await response.json() };
};

const first = await get(ROUTE_PATH);
console.log("status:", first.status, "ok:", first.body.ok, "scanMs:", first.body.scanMs, "opens:", opened);
console.log("totals:", JSON.stringify(first.body.totals));
// The ledger must fold every usage event in the logs, whether the session came
// back from persistence or only from memory. Anything less is a silent drop.
if (first.body.ok !== true) throw new Error("first scan failed: " + JSON.stringify(first.body.error));
if (first.body.totals.requests !== rawCount) throw new Error(`request count ${first.body.totals.requests} != raw ${rawCount}`);
if (first.body.totals.total !== rawTotal) throw new Error(`total ${first.body.totals.total} != raw ${rawTotal}`);
if (first.body.totals.sessions !== rawSessions.size) throw new Error(`session count ${first.body.totals.sessions} != sessions with usage ${rawSessions.size}`);

// Every range must reproduce its own raw window exactly — cards, model table,
// session count and the daily series alike. A range filter that only relabels a
// lifetime total is precisely the bug this check exists to catch.
const opensBeforeRanges = opened;
const rangeBodies = new Map([["all", first.body]]);
for (const range of RANGES) {
	if (range === "all") continue;
	const response = await get(`${ROUTE_PATH}?range=${range}`);
	if (response.status !== 200) throw new Error(`range ${range} answered ${response.status}`);
	rangeBodies.set(range, response.body);
}
if (opened - opensBeforeRanges !== 0) throw new Error(`switching range re-read the logs (${opened - opensBeforeRanges} opens)`);
console.log();
for (const range of RANGES) {
	const acc = rawRanges.get(range);
	const body = rangeBodies.get(range);
	if (body.range !== range) throw new Error(`asked for ${range}, got ${body.range}`);
	if (body.totals.requests !== acc.requests) throw new Error(`[${range}] requests ${body.totals.requests} != raw ${acc.requests}`);
	if (body.totals.total !== acc.total) throw new Error(`[${range}] total ${body.totals.total} != raw ${acc.total}`);
	if (body.totals.sessions !== acc.sessions.size) throw new Error(`[${range}] sessions ${body.totals.sessions} != raw ${acc.sessions.size}`);
	if (body.models.length !== acc.models.size) throw new Error(`[${range}] ${body.models.length} model rows, raw has ${acc.models.size}`);
	for (const row of body.models) {
		const key = `${row.provider}\u0000${row.model}`;
		const expected = acc.models.get(key);
		if (expected === undefined) throw new Error(`[${range}] model ${key} is not in the raw window`);
		if (row.total !== expected.total) throw new Error(`[${range}] ${key} total ${row.total} != ${expected.total}`);
		if (row.requests !== expected.requests) throw new Error(`[${range}] ${key} requests ${row.requests} != ${expected.requests}`);
	}
	const gotDays = body.daily.map((row) => row.day);
	const expectedDays = [...acc.days.keys()].sort().reverse().slice(0, 30);
	if (gotDays.join(",") !== expectedDays.join(",")) {
		throw new Error(`[${range}] daily days differ: ${gotDays.join(",")} vs ${expectedDays.join(",")}`);
	}
	const parts = body.totals.input + body.totals.cacheRead + body.totals.cacheWrite + body.totals.output;
	if (body.totals.total < parts) throw new Error(`[${range}] total ${body.totals.total} is below its own parts ${parts}`);
	console.log(
		`range ${range.padEnd(5)} since=${String(acc.since).padEnd(11)} requests=${String(acc.requests).padStart(5)}` +
			` total=${acc.total.toLocaleString().padStart(16)} models=${String(acc.models.size).padStart(2)} days=${String(gotDays.length).padStart(2)}`,
	);
}
if (rangeBodies.get("today").totals.total >= rangeBodies.get("all").totals.total) throw new Error("today is not narrower than all time");
if (rangeBodies.get("7d").totals.total > rangeBodies.get("30d").totals.total) throw new Error("7d exceeds 30d");
if (rangeBodies.get("30d").totals.total > rangeBodies.get("all").totals.total) throw new Error("30d exceeds all time");
console.log("range switch re-opened logs:", opened - opensBeforeRanges);

console.log("agents:", JSON.stringify(first.body.agents.map((a) => [a.kind, a.total, a.sessions])));
console.log("presets:", JSON.stringify(first.body.presets.map((p) => [p.preset, p.total, p.sessions])));
console.log("models:", first.body.models.length, "providers:", first.body.providers.length, "daily:", first.body.daily.length, "sessions:", first.body.sessions.length);
console.log();
console.log("model".padEnd(34) + "provider".padEnd(24) + "req".padStart(6) + "total".padStart(16) + "share".padStart(8) + "sessions".padStart(9));
for (const row of first.body.models.slice(0, 20)) {
	console.log(
		row.model.padEnd(34) +
			row.provider.padEnd(24) +
			String(row.requests).padStart(6) +
			row.total.toLocaleString().padStart(16) +
			((row.share * 100).toFixed(2) + "%").padStart(8) +
			String(row.sessions).padStart(9),
	);
}
console.log();
console.log("top daily:", JSON.stringify(first.body.daily.slice(0, 5)));
console.log("sample session:", JSON.stringify(first.body.sessions[0]));

const before = opened;
const cached = await get(ROUTE_PATH);
console.log("\ncached second call: status", cached.status, "same totals:", cached.body.totals.total === first.body.totals.total, "opens delta:", opened - before);

const forbidden = await fetch(base + ROUTE_PATH, { headers: { host: `127.0.0.1:${port}`, origin: "http://evil.test" } });
console.log("cross-origin origin header =>", forbidden.status);

const post = await fetch(base + ROUTE_PATH, { method: "POST", headers: { host: `127.0.0.1:${port}` } });
console.log("POST =>", post.status);

const head = await fetch(base + ROUTE_PATH, { method: "HEAD", headers: { host: `127.0.0.1:${port}` } });
console.log("HEAD =>", head.status, "content-length:", head.headers.get("content-length"));

server.close();
for (const [label, disposer] of disposers) {
	if (typeof disposer === "function") disposer();
}
console.log("\ndisposers:", disposers.length);
