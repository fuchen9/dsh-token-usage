// Pure-function checks for the host half. Every row asserts instead of merely
// printing, so a regression fails the run instead of needing a human to compare
// numbers by eye.
import { routeOf, usageCounters, hostNameOf, isTrustedRequest, RANGES, rangeStart, startOfDay, dayKey } from "../lib/index.js";

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

console.log(`\nALL ${checked} HELPER CHECKS PASSED`);