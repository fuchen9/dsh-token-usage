/**
 * dsh-token-usage — host half.
 *
 * Builds a token ledger from the durable session logs and serves it to the
 * browser half at `GET /api/dsh-token-usage`.
 *
 * Source of truth is the session event log, never plugin memory: every
 * `assistant/message` event carries the provider-reported `usage` record
 * (`inputTokens`, `outputTokens`, `cacheReadTokens?`, `cacheWriteTokens?`,
 * `reasoningTokens?`). The fold here mirrors the shipped `tokenUsage`
 * projection, so a number shown by this panel means the same thing as the
 * number shown in a session's own usage pill.
 *
 * Incremental reads: a session whose durable revision did not change since the
 * previous scan is not replayed — its cached per-model totals are reused.
 * A changed session contributes only its new tail, tracked by the last event
 * `seq` it contributed.
 *
 * Live sessions are read from `ctx.sessions` (this process's in-memory log);
 * every stored session is read through `ctx.sessionPersistence`.
 *
 * Ranges: each session keeps a per-day fold beside its lifetime fold, so the
 * panel's window (`all` / `today` / `7d` / `30d`) is projected from the same
 * cache without reading a single log again. `?range=` on the route picks it.
 *
 * @module @local/dsh-token-usage
 */

/** Plugin name used in logs. */
export const name = "dsh-token-usage";

/** Services this plugin needs; without any one of them the fiber stays pending. */
export const inject = ["webServer", "sessionPersistence", "sessions"];

/** Route served to the browser half. */
export const ROUTE_PATH = "/api/dsh-token-usage";

/** Sessions are re-listed at most this often unless the caller forces it. */
const MIN_SCAN_INTERVAL_MS = 1500;

/** The time windows the panel can ask for. */
export const RANGES = ["all", "30d", "7d", "today"];

const COUNTERS = ["requests", "input", "output", "cacheRead", "cacheWrite", "reasoning", "total"];

const ZERO = Object.freeze({
	requests: 0,
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	reasoning: 0,
	total: 0,
});

const isCount = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;

/**
 * Fold one provider-reported usage record into integer counters.
 * @param {unknown} usage
 * @returns {object | undefined} countable counters, or undefined when unusable.
 */
export function usageCounters(usage) {
	if (typeof usage !== "object" || usage === null) return undefined;
	const input = usage.inputTokens;
	const output = usage.outputTokens;
	if (!isCount(input) || !isCount(output)) return undefined;
	const cacheRead = isCount(usage.cacheReadTokens) ? usage.cacheReadTokens : 0;
	const cacheWrite = isCount(usage.cacheWriteTokens) ? usage.cacheWriteTokens : 0;
	const reasoning = isCount(usage.reasoningTokens) ? usage.reasoningTokens : 0;
	const sum = input + cacheRead + cacheWrite + output;
	const total = isCount(usage.totalTokens) ? Math.max(usage.totalTokens, sum) : sum;
	return { requests: 1, input, output, cacheRead, cacheWrite, reasoning, total };
}

/**
 * Resolve the billing identity of one assistant message.
 *
 * `message.source.provider` / `.model` are authoritative, but some adapters
 * record `provider/model` inside `model` as well. The provider prefix is
 * stripped when it agrees with `source.provider`, so one model never splits
 * into two rows.
 *
 * @param {unknown} message
 * @returns {{provider: string, model: string, key: string}}
 */
export function routeOf(message) {
	const source = typeof message === "object" && message !== null ? message.source : undefined;
	const provider = typeof source?.provider === "string" && source.provider !== "" ? source.provider : "unknown";
	let model = typeof source?.model === "string" && source.model !== "" ? source.model : "unknown";
	const slash = model.indexOf("/");
	if (slash > 0) {
		const prefix = model.slice(0, slash);
		const agrees = provider === "unknown" || provider === prefix || provider.startsWith(prefix + "-") || prefix.startsWith(provider) || provider.startsWith(prefix);
		if (agrees) model = model.slice(slash + 1) || model;
	}
	return { provider, model, key: provider + "\u0000" + model };
}

/** Add a counters record into another counters record. */
const accumulate = (target, source) => {
	for (const field of COUNTERS) target[field] += source[field] ?? 0;
	return target;
};

/** Sum a per-model fold into one counters record. */
const sumRoutes = (routes) => {
	const sum = { ...ZERO };
	for (const counters of routes.values()) accumulate(sum, counters);
	return sum;
};

/** An empty per-model fold. */
const emptyRoutes = () => new Map();

/** Deep-clone a fold so a cached entry is never mutated after publication. */
const cloneRoutes = (routes) => {
	const copy = new Map();
	for (const [key, counters] of routes) copy.set(key, { ...counters });
	return copy;
};

/** Deep-clone the per-day fold of one session. */
const cloneDays = (byDay) => {
	const copy = new Map();
	for (const [day, slot] of byDay) {
		copy.set(day, { routes: cloneRoutes(slot.routes), min: slot.min, max: slot.max, tokens: slot.tokens });
	}
	return copy;
};

/** `YYYY-MM-DD` in this process's time zone. */
export function dayKey(time) {
	const date = new Date(time);
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return date.getFullYear() + "-" + month + "-" + day;
}

/** Midnight local time of the day containing `time`. */
export function startOfDay(time) {
	const date = new Date(time);
	date.setHours(0, 0, 0, 0);
	return date.getTime();
}

/** Midnight local time `days` calendar days before the day containing `time`. */
const daysBefore = (time, days) => {
	const date = new Date(startOfDay(time));
	date.setDate(date.getDate() - days);
	return date.getTime();
};

/**
 * The first day a range includes, as a `YYYY-MM-DD` key, or undefined for
 * `all`. Day keys compare correctly as strings, so a window is `day >= start`.
 * @param {string} range
 * @param {number} [now]
 * @returns {string | undefined}
 */
export function rangeStart(range, now = Date.now()) {
	if (range === "today") return dayKey(startOfDay(now));
	if (range === "7d") return dayKey(daysBefore(now, 6));
	if (range === "30d") return dayKey(daysBefore(now, 29));
	return undefined;
}

/** A readable label for a session: its parent session dir name, else its id. */
const sessionLabel = (header) => {
	const cwd = typeof header?.cwd === "string" ? header.cwd : "";
	const parts = cwd.split(/[\\/]+/).filter((part) => part !== "");
	const tail = parts.at(-1) ?? "";
	return tail !== "" ? tail : typeof header?.id === "string" ? header.id : "session";
};

/**
 * One session's incremental accounting state.
 * @param {object} header - durable or live session header.
 */
class SessionEntry {
	constructor(header) {
		this.revision = "";
		this.cursor = 0;
		this.routes = emptyRoutes();
		this.byDay = new Map();
		this.start = null;
		this.end = null;
		this.truncated = false;
		this.header = header ?? {};
	}

	/** Fold one event into this entry. */
	absorb(event) {
		if (typeof event !== "object" || event === null) return;
		if (typeof event.seq === "number" && event.seq + 1 > this.cursor) this.cursor = event.seq + 1;
		// `assistant/message` is the settlement authority for a step: streaming
		// samples (assistant/attempt) of the same step are not counted here.
		if (event.type !== "assistant/message") return;
		const counters = usageCounters(event.data?.usage);
		if (counters === undefined) return;
		const route = routeOf(event.data?.message);
		let bucket = this.routes.get(route.key);
		if (bucket === undefined) {
			bucket = { ...ZERO, provider: route.provider, model: route.model };
			this.routes.set(route.key, bucket);
		}
		accumulate(bucket, counters);
		const time = typeof event.time === "number" ? event.time : null;
		if (time === null) return;
		if (this.start === null || time < this.start) this.start = time;
		if (this.end === null || time > this.end) this.end = time;
		// The per-day fold is what makes every panel windowable later without
		// reading the log again; the lifetime fold above stays the `all` path.
		const day = dayKey(time);
		let slot = this.byDay.get(day);
		if (slot === undefined) {
			slot = { routes: emptyRoutes(), min: time, max: time, tokens: 0 };
			this.byDay.set(day, slot);
		}
		if (time < slot.min) slot.min = time;
		if (time > slot.max) slot.max = time;
		slot.tokens += counters.total;
		let dayBucket = slot.routes.get(route.key);
		if (dayBucket === undefined) {
			dayBucket = { ...ZERO, provider: route.provider, model: route.model };
			slot.routes.set(route.key, dayBucket);
		}
		accumulate(dayBucket, counters);
	}

	/** Take over the counters of a previous entry (incremental tail read). */
	adopt(previous) {
		this.routes = cloneRoutes(previous.routes);
		this.byDay = cloneDays(previous.byDay);
		this.start = previous.start;
		this.end = previous.end;
		this.cursor = previous.cursor;
	}

	/**
	 * What this session contributed inside a day window.
	 * @param {string | undefined} since - first `YYYY-MM-DD` day included, or
	 * undefined for the lifetime fold.
	 * @returns {{routes: Map, start: number | null, end: number | null}}
	 */
	window(since) {
		if (since === undefined) return { routes: this.routes, start: this.start, end: this.end };
		const routes = emptyRoutes();
		let start = null;
		let end = null;
		for (const [day, slot] of this.byDay) {
			if (day < since) continue;
			for (const [key, counters] of slot.routes) {
				let bucket = routes.get(key);
				if (bucket === undefined) {
					bucket = { ...ZERO, provider: counters.provider, model: counters.model };
					routes.set(key, bucket);
				}
				accumulate(bucket, counters);
			}
			if (start === null || slot.min < start) start = slot.min;
			if (end === null || slot.max > end) end = slot.max;
		}
		return { routes, start, end };
	}

	/** `[day, tokens]` pairs inside a window, for the daily series. */
	dailyRows(since) {
		const rows = [];
		for (const [day, slot] of this.byDay) {
			if (since !== undefined && day < since) continue;
			rows.push([day, slot.tokens]);
		}
		return rows;
	}
}

/**
 * The ledger: an incrementally refreshed cache of per-session folds plus the
 * projection the browser half renders.
 */
class UsageLedger {
	constructor(ctx) {
		this.ctx = ctx;
		this.entries = new Map();
		this.views = new Map();
		this.inflight = undefined;
		this.lastScanAt = 0;
		this.lastDurationMs = 0;
		this.lastError = undefined;
	}

	/**
	 * Bring the cache up to date, at most once per `MIN_SCAN_INTERVAL_MS`
	 * unless `force` is set. Concurrent callers share one scan.
	 * @param {{force?: boolean}} [options]
	 * @returns {Promise<void>}
	 */
	ensure(options = {}) {
		if (this.inflight !== undefined) return this.inflight;
		const now = Date.now();
		if (!options.force && this.lastScanAt !== 0 && now - this.lastScanAt < MIN_SCAN_INTERVAL_MS) {
			return Promise.resolve();
		}
		this.inflight = this.runScan().finally(() => {
			this.inflight = undefined;
		});
		return this.inflight;
	}

	/**
	 * Scan if needed, then project one range.
	 * @param {{force?: boolean, range?: string}} [options]
	 * @returns {Promise<object>}
	 */
	async scan(options = {}) {
		await this.ensure(options);
		return this.view(typeof options.range === "string" ? options.range : "all");
	}

	/**
	 * The wire snapshot for one range. Projections are memoized until the next
	 * scan, so switching range costs a map walk, never a re-read of the logs.
	 * @param {string} range
	 * @returns {object}
	 */
	view(range) {
		const key = RANGES.includes(range) ? range : "all";
		let body = this.views.get(key);
		if (body === undefined) {
			body = this.snapshot(rangeStart(key));
			body.range = key;
			this.views.set(key, body);
		}
		return body;
	}

	/** Run one scan pass. */
	async runScan() {
		const started = Date.now();
		try {
			const snapshots = await this.ctx.sessionPersistence.list();
			const live = new Map();
			for (const session of this.ctx.sessions?.list?.() ?? []) live.set(session.id, session);
			const seen = new Set();
			for (const snapshot of snapshots) {
				const id = snapshot?.header?.id;
				if (typeof id !== "string") continue;
				seen.add(id);
				const revision = typeof snapshot.revision === "string" ? snapshot.revision : "size:" + String(snapshot.sizeBytes ?? 0);
				await this.collectStored(id, snapshot.header ?? {}, revision);
			}
			for (const [id, session] of live) {
				if (seen.has(id)) continue;
				seen.add(id);
				this.collectLive(id, session);
			}
			for (const id of [...this.entries.keys()]) if (!seen.has(id)) this.entries.delete(id);
			this.lastError = undefined;
		} catch (error) {
			this.lastError = String(error instanceof Error ? error.message : error);
			this.ctx.logger?.warn?.("dsh-token-usage: scan failed: " + this.lastError);
		}
		this.lastScanAt = Date.now();
		this.lastDurationMs = this.lastScanAt - started;
		this.views.clear();
	}

	/**
	 * Refresh one stored session, replaying only events it has not contributed.
	 * @param {string} id
	 * @param {object} header
	 * @param {string} revision
	 */
	async collectStored(id, header, revision) {
		const previous = this.entries.get(id);
		if (previous !== undefined && previous.revision === revision) return;
		const entry = new SessionEntry(header);
		entry.revision = revision;
		const from = previous?.cursor ?? 0;
		let events = [];
		let readable = true;
		try {
			const handle = await this.ctx.sessionPersistence.open(id, "read");
			try {
				const result = await handle.read(from);
				events = Array.isArray(result?.events) ? result.events : [];
			} finally {
				await handle.close();
			}
		} catch (error) {
			readable = false;
			entry.truncated = true;
			this.ctx.logger?.warn?.("dsh-token-usage: cannot read session " + id + ": " + String(error));
		}
		// A tail read only extends the previous fold when the log really is the
		// same one continuing; any doubt replays from the start instead.
		if (from > 0 && readable && events.length > 0 && events[0]?.seq === from) {
			entry.adopt(previous);
		} else if (from > 0 && readable && events.length === 0 && !entry.truncated) {
			entry.adopt(previous);
			entry.revision = revision;
			this.entries.set(id, entry);
			return;
		}
		for (const event of events) entry.absorb(event);
		this.entries.set(id, entry);
	}

	/**
	 * Fold a live (in-process) session from memory.
	 * @param {string} id
	 * @param {object} session
	 */
	collectLive(id, session) {
		const entry = new SessionEntry(session.header ?? {});
		entry.revision = "live:" + String(session.seq ?? 0);
		const events = session.snapshotEvents?.() ?? [];
		for (const event of events) entry.absorb(event);
		this.entries.set(id, entry);
	}

	/**
	 * Project the cache into the wire snapshot, optionally limited to the days
	 * at or after `since`.
	 * @param {string | undefined} [since] - first `YYYY-MM-DD` day included.
	 * @returns {object}
	 */
	snapshot(since) {
		const models = new Map();
		const providers = new Map();
		const days = new Map();
		const agents = new Map([
			["user", { kind: "user", ...ZERO, sessions: 0, models: new Set() }],
			["subagent", { kind: "subagent", ...ZERO, sessions: 0, models: new Set() }],
		]);
		const presets = new Map();
		const sessions = [];
		const totals = { ...ZERO, sessions: 0, models: 0, truncatedSessions: 0 };

		for (const [id, entry] of this.entries) {
			if (entry.truncated) totals.truncatedSessions += 1;
			const view = entry.window(since);
			if (view.routes.size === 0) continue;
			const sum = sumRoutes(view.routes);
			totals.sessions += 1;
			accumulate(totals, sum);
			for (const [key, counters] of view.routes) {
				let model = models.get(key);
				if (model === undefined) {
					model = {
						key,
						provider: counters.provider,
						model: counters.model,
						...ZERO,
						sessions: 0,
						first: null,
						last: null,
					};
					models.set(key, model);
				}
				accumulate(model, counters);
				model.sessions += 1;
				if (view.start !== null && (model.first === null || view.start < model.first)) model.first = view.start;
				if (view.end !== null && (model.last === null || view.end > model.last)) model.last = view.end;

				let provider = providers.get(counters.provider);
				if (provider === undefined) {
					provider = { provider: counters.provider, ...ZERO, models: new Set(), sessions: 0 };
					providers.set(counters.provider, provider);
				}
				accumulate(provider, counters);
				provider.models.add(counters.model);
				provider.sessions += 1;
			}
			for (const [day, tokens] of entry.dailyRows(since)) days.set(day, (days.get(day) ?? 0) + tokens);
			const kind = entry.header?.origin === "subagent" ? "subagent" : "user";
			const agent = agents.get(kind);
			accumulate(agent, sum);
			agent.sessions += 1;
			for (const counters of view.routes.values()) agent.models.add(counters.model);
			const preset = typeof entry.header?.agentPreset === "string" && entry.header.agentPreset !== "" ? entry.header.agentPreset : "standard";
			let row = presets.get(preset);
			if (row === undefined) {
				row = { preset, ...ZERO, sessions: 0, models: new Set(), user: 0, subagent: 0 };
				presets.set(preset, row);
			}
			accumulate(row, sum);
			row.sessions += 1;
			row[kind] = (row[kind] ?? 0) + 1;
			for (const counters of view.routes.values()) row.models.add(counters.model);
			sessions.push({
				id,
				label: sessionLabel(entry.header),
				kind,
				preset,
				requests: sum.requests,
				tokens: sum.total,
				start: view.start,
				end: view.end,
			});
		}

		const modelRows = [...models.values()].map((model) => ({
			provider: model.provider,
			model: model.model,
			requests: model.requests,
			input: model.input,
			output: model.output,
			cacheRead: model.cacheRead,
			cacheWrite: model.cacheWrite,
			reasoning: model.reasoning,
			total: model.total,
			sessions: model.sessions,
			first: model.first,
			last: model.last,
			share: totals.total === 0 ? 0 : model.total / totals.total,
		}));
		modelRows.sort((left, right) => right.total - left.total);

		const providerRows = [...providers.values()]
			.map((provider) => ({
				provider: provider.provider,
				models: provider.models.size,
				sessions: provider.sessions,
				requests: provider.requests,
				input: provider.input,
				output: provider.output,
				cacheRead: provider.cacheRead,
				cacheWrite: provider.cacheWrite,
				reasoning: provider.reasoning,
				total: provider.total,
				share: totals.total === 0 ? 0 : provider.total / totals.total,
			}))
			.sort((left, right) => right.total - left.total);

		const agentRows = [...agents.values()].map((agent) => ({
			kind: agent.kind,
			models: agent.models.size,
			sessions: agent.sessions,
			requests: agent.requests,
			input: agent.input,
			output: agent.output,
			cacheRead: agent.cacheRead,
			cacheWrite: agent.cacheWrite,
			reasoning: agent.reasoning,
			total: agent.total,
			share: totals.total === 0 ? 0 : agent.total / totals.total,
		}));

		const daily = [...days]
			.map(([day, tokens]) => ({ day, tokens }))
			.sort((left, right) => (left.day < right.day ? 1 : -1))
			.slice(0, 30);

		sessions.sort((left, right) => (right.end ?? 0) - (left.end ?? 0));

		const presetRows = [...presets.values()]
			.map((preset) => {
				const models = preset.models instanceof Set ? preset.models : new Set(preset.models ?? []);
				return {
					preset: preset.preset,
					requests: preset.requests,
					input: preset.input,
					output: preset.output,
					cacheRead: preset.cacheRead,
					cacheWrite: preset.cacheWrite,
					reasoning: preset.reasoning,
					total: preset.total,
					sessions: preset.sessions,
					user: preset.user ?? 0,
					subagent: preset.subagent ?? 0,
					models: models.size,
					share: totals.total === 0 ? 0 : preset.total / totals.total,
				};
			})
			.sort((left, right) => right.total - left.total);

		totals.models = modelRows.length;
		return {
			ok: this.lastError === undefined,
			error: this.lastError,
			generatedAt: Date.now(),
			scanMs: this.lastDurationMs,
			totals,
			models: modelRows.slice(0, 200),
			providers: providerRows.slice(0, 50),
			agents: agentRows,
			presets: presetRows.slice(0, 30),
			daily,
			sessions: sessions.slice(0, 60),
		};
	}
}

/**
 * Write a JSON response.
 * @param {import("node:http").ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 */
function sendJson(res, status, body) {
	const payload = Buffer.from(JSON.stringify(body), "utf8");
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"content-length": String(payload.byteLength),
		"cache-control": "no-store",
	});
	res.end(payload);
}

/**
 * The lowercase hostname of an HTTP authority, with the port and IPv6
 * brackets stripped.
 * @param {unknown} authority
 * @returns {string | null}
 */
export function hostNameOf(authority) {
	let host = String(authority ?? "")
		.trim()
		.toLowerCase();
	if (host === "") return null;
	if (host.startsWith("[")) {
		const end = host.indexOf("]");
		if (end === -1) return null;
		return host.slice(1, end);
	}
	const colon = host.indexOf(":");
	if (colon !== -1) host = host.slice(0, colon);
	return host === "" ? null : host;
}

/**
 * Whether a request comes from this machine and this origin: a loopback Host
 * header (or the bound address), no cross-site fetch, and an Origin matching
 * that Host when present.
 * @param {import("node:http").IncomingMessage} req
 * @param {string} bindHost
 */
export function isTrustedRequest(req, bindHost) {
	const raw = req.headers?.host;
	if (typeof raw !== "string" || raw === "") return false;
	const host = hostNameOf(raw);
	if (host === null) return false;
	const loopback = host === "localhost" || host === "::1" || host === "::ffff:127.0.0.1" || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
	if (!loopback && hostNameOf(bindHost) !== host) return false;
	if (req.headers["sec-fetch-site"] === "cross-site") return false;
	const origin = req.headers.origin;
	if (typeof origin === "string" && origin !== "") {
		let originHost;
		try {
			originHost = new URL(origin).host.toLowerCase();
		} catch {
			return false;
		}
		if (originHost !== String(raw).toLowerCase()) return false;
	}
	return true;
}

/**
 * Mount the ledger and its HTTP route.
 * @param {object} ctx - the plugin fiber context.
 */
export function apply(ctx) {
	const ledger = new UsageLedger(ctx);

	ctx.effect(
		() => () => {
			ledger.entries.clear();
		},
		"dsh-token-usage: ledger",
	);

	ctx.effect(
		() =>
			ctx.webServer.register({
				kind: "exact",
				path: ROUTE_PATH,
				handler: async (req, res) => {
					if (req.method !== "GET" && req.method !== "HEAD") {
						sendJson(res, 405, { ok: false, error: "method not allowed" });
						return;
					}
					const bindHost = typeof ctx.webServer?.host === "string" ? ctx.webServer.host : "";
					if (!isTrustedRequest(req, bindHost)) {
						sendJson(res, 403, { ok: false, error: "forbidden" });
						return;
					}
					const url = String(req.url ?? "");
					const mark = url.indexOf("?");
					const params = new URLSearchParams(mark === -1 ? "" : url.slice(mark + 1));
					const requested = params.get("range");
					const range = RANGES.includes(requested) ? requested : "all";
					const force = params.get("refresh") === "1";
					try {
						const body = await ledger.scan({ force, range });
						if (req.method === "HEAD") {
							res.writeHead(200, { "cache-control": "no-store" });
							res.end();
							return;
						}
						sendJson(res, 200, body);
					} catch (error) {
						sendJson(res, 500, { ok: false, error: String(error instanceof Error ? error.message : error) });
					}
				},
			}),
		"dsh-token-usage: usage route",
	);
}
