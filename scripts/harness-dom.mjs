// DOM render harness: mounts the panel in a real DOM (jsdom), lets the
// fetch-on-mount effect resolve, and asserts the rendered numbers.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const clientPath = join(here, "..", "lib", "client.js");

// Dev-only dependencies live under .verify so the bundle itself stays
// dependency-free. Set them up with:
//   npm install --prefix .verify --no-save jsdom react react-dom
const scratchRequire = createRequire(join(here, "..", ".verify", "scratch.cjs"));
const { JSDOM } = scratchRequire("jsdom");

const snapshot = {
	ok: true,
	generatedAt: Date.now(),
	scanMs: 42,
	totals: { requests: 8342, input: 34631612, output: 8344986, cacheRead: 1335041542, cacheWrite: 0, reasoning: 0, total: 1378018140, sessions: 202, models: 3, truncatedSessions: 0 },
	models: [
		{ provider: "magpie", model: "codearts/deepseek-v4.1-flash", requests: 4700, input: 24800000, output: 5540000, cacheRead: 809000000, cacheWrite: 0, reasoning: 0, total: 839675114, sessions: 131, first: 1, last: 1793542003127, share: 0.6093 },
		{ provider: "workbuddy-vision", model: "deepseek-v4.1-flash", requests: 1029, input: 1884455, output: 763691, cacheRead: 185187840, cacheWrite: 0, reasoning: 0, total: 187835986, sessions: 10, first: 1, last: 1793542003127, share: 0.1363 },
		{ provider: "google", model: "gemini-3.8-flash", requests: 16, input: 178446, output: 3471, cacheRead: 448902, cacheWrite: 0, reasoning: 0, total: 630819, sessions: 2, first: 1, last: 1793542003127, share: 0.0005 },
	],
	providers: [
		{ provider: "magpie", models: 3, sessions: 131, requests: 4700, input: 24800000, output: 5540000, cacheRead: 809000000, cacheWrite: 0, reasoning: 0, total: 839675114, share: 0.6093 },
		{ provider: "workbuddy-vision", models: 1, sessions: 10, requests: 1029, input: 1884455, output: 763691, cacheRead: 185187840, cacheWrite: 0, reasoning: 0, total: 187835986, share: 0.1363 },
	],
	agents: [
		{ kind: "user", models: 5, sessions: 29, requests: 29, input: 1, output: 1, cacheRead: 1, cacheWrite: 0, reasoning: 0, total: 997276076, share: 0.7237 },
		{ kind: "subagent", models: 12, sessions: 173, requests: 173, input: 1, output: 1, cacheRead: 1, cacheWrite: 0, reasoning: 0, total: 380742064, share: 0.2763 },
	],
	presets: [
		{ preset: "standard", sessions: 30, user: 12, subagent: 18, models: 4, total: 999395644, share: 0.7 },
		{ preset: "maoying-write", sessions: 51, user: 0, subagent: 51, models: 3, total: 205648426, share: 0.1441 },
	],
	daily: [
		{ day: "2026-11-01", tokens: 853574644 },
		{ day: "2026-10-31", tokens: 67707716 },
	],
	sessions: [
		{ id: "session-5883f1b2-20dc-490a-8131-ea2fcd7ccb11", label: "default-workspace", kind: "user", preset: "standard", requests: 136, tokens: 12568346, start: 1793541154094, end: 1793542003127 },
	],
};

// A second ledger for a narrower window. Its numbers are deliberately different
// from the lifetime ones, so a panel that ignores the requested range cannot
// pass the checks below.
const snapshot7d = {
	ok: true,
	generatedAt: Date.now(),
	range: "7d",
	scanMs: 42,
	totals: { requests: 7754, input: 33000000, output: 7900000, cacheRead: 1216000000, cacheWrite: 0, reasoning: 0, total: 1258822101, sessions: 198, models: 2, truncatedSessions: 0 },
	models: [
		{ provider: "magpie", model: "codearts/deepseek-v4.1-flash", requests: 4300, input: 22000000, output: 5100000, cacheRead: 760000000, cacheWrite: 0, reasoning: 0, total: 786000000, sessions: 120, first: 1, last: 1793542003127, share: 0.6244 },
		{ provider: "workbuddy-vision", model: "deepseek-v4.1-flash", requests: 900, input: 1700000, output: 700000, cacheRead: 160000000, cacheWrite: 0, reasoning: 0, total: 160000000, sessions: 9, first: 1, last: 1793542003127, share: 0.1271 },
	],
	providers: [
		{ provider: "magpie", models: 2, sessions: 120, requests: 4300, input: 22000000, output: 5100000, cacheRead: 760000000, cacheWrite: 0, reasoning: 0, total: 786000000, share: 0.6244 },
	],
	agents: [{ kind: "user", models: 2, sessions: 28, requests: 28, input: 1, output: 1, cacheRead: 1, cacheWrite: 0, reasoning: 0, total: 900000000, share: 0.715 }],
	presets: [{ preset: "standard", sessions: 29, user: 11, subagent: 18, models: 4, total: 880000000, share: 0.6991 }],
	daily: [
		{ day: "2026-11-01", tokens: 853574644 },
		{ day: "2026-10-31", tokens: 67707716 },
	],
	sessions: [
		{ id: "session-5883f1b2-20dc-490a-8131-ea2fcd7ccb11", label: "default-workspace", kind: "user", preset: "standard", requests: 100, tokens: 10568346, start: 1793541154094, end: 1793542003127 },
	],
};

const dom = new JSDOM("<!doctype html><html><head></head><body><div id=\"root\"></div></body></html>", { pretendToBeVisual: true });
const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let fetchCount = 0;
const emptySnapshot = { ok: true, generatedAt: 0, scanMs: 1, totals: { requests: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, total: 0, sessions: 0, models: 0, truncatedSessions: 0 }, models: [], providers: [], agents: [], presets: [], daily: [], sessions: [] };
let serveEmpty = false;
const byRange = new Map([["all", snapshot], ["30d", snapshot], ["7d", snapshot7d]]);
const fetchLog = [];
globalThis.fetch = async (url) => {
	fetchCount += 1;
	const text = String(url);
	fetchLog.push(text);
	if (serveEmpty) return { ok: true, status: 200, json: async () => emptySnapshot, url };
	const mark = text.indexOf("?");
	const params = new URLSearchParams(mark === -1 ? "" : text.slice(mark + 1));
	const range = params.get("range") ?? "all";
	return { ok: true, status: 200, json: async () => ({ ...(byRange.get(range) ?? snapshot), range }), url };
};

// Load the bundle exactly as the module table would.
let bundle;
window.__ModuleLoader__ = { load: (definition) => (bundle = definition) };
const nodeRequire = createRequire(clientPath);
const React = scratchRequire("react");
const ReactDOMClient = scratchRequire("react-dom/client");
const syncRequire = (specifier) => (specifier === "react" ? React : nodeRequire(specifier));
new Function("require", "window", "document", "fetch", "console", readFileSync(clientPath, "utf8"))(syncRequire, window, window.document, globalThis.fetch, console);

const dictionaries = [];
const registrations = [];
const moduleExports = bundle.factory(syncRequire);
moduleExports.apply({
	effect: (fn) => {
		fn();
	},
	locale: {
		register: (ns, rows) => void dictionaries.push(rows.zh),
		bind: () => (key) => dictionaries[0]?.[key] ?? key,
	},
	slots: {
		inject: (name, fn) => fn(),
		register: (options, component) => void registrations.push({ options, component }),
	},
});

const t = (key) => dictionaries[0][key] ?? key;
const page = registrations.find((row) => row.options.name === "main").component;
const icon = registrations.find((row) => row.options.name === "sidebar.panellist").component;

const root = ReactDOMClient.createRoot(window.document.getElementById("root"));
await React.act(async () => {
	root.render(React.createElement(page, { t }));
});
// Let the pending fetch promise settle inside act.
await React.act(async () => {
	await new Promise((resolve) => setTimeout(resolve, 50));
});

const html = window.document.body.innerHTML;
const text = window.document.body.textContent ?? "";
console.log("fetch calls:", fetchCount);
console.log("rendered bytes:", html.length, "text length:", text.length);

const expectations = [
	["总 token", "card label"],
	["1.38B", "compact grand total"],
	["1,378,018,140", "exact grand total"],
	["按模型", "models panel"],
	["codearts/deepseek-v4.1-flash", "model row"],
	["60.9%", "share"],
	["按提供商", "providers panel"],
	["magpie", "provider row"],
	["按会话类型", "agents panel"],
	["按预设", "presets panel"],
	["maoying-write", "preset row"],
	["206M · 51", "preset total/sessions"],

	["主会话", "user kind"],
	["子会话", "subagent kind"],
	// the agents panel once rendered "0 · 0" because the client indexed the
	// response array by kind instead of by row.kind; assert the real numbers.
	["997M · 29", "user kind total/sessions"],
	["381M · 173", "subagent kind total/sessions"],
	["最近几天", "daily panel"],
	["2026-11-01", "day row"],
	["最近会话", "sessions panel"],
	["session-588", "session id prefix"],
	["standard", "session preset"],
	["扫描耗时", "scan note"],
	["输入不包含缓存读取", "cache note"],
];
let missing = 0;
for (const [needle, label] of expectations) {
	const found = text.includes(needle);
	if (!found) missing += 1;
	console.log((found ? "OK   " : "MISS ") + label.padEnd(18) + JSON.stringify(needle));
}

// Interaction: switch to the 7-day window, then back.
const buttons = [...window.document.querySelectorAll("button")];
console.log("\nbuttons:", buttons.map((b) => b.textContent).join(" | "));
const sevenDay = buttons.find((b) => b.textContent === "近 7 天");
if (sevenDay === undefined) throw new Error("range button missing");
await React.act(async () => {
	sevenDay.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
});
await React.act(async () => {
	await new Promise((resolve) => setTimeout(resolve, 50));
});
const afterRange = window.document.body.textContent ?? "";
console.log("\nfetched urls:", fetchLog.join(" , "));
const rangeChecks = [
	[fetchLog.some((u) => u.includes("range=7d")), "the 7-day click refetches with range=7d"],
	[afterRange.includes("1,258,822,101"), "grand total narrowed to the 7-day window"],
	[afterRange.includes("786M"), "the model row shows the windowed value (786M)"],
	[!afterRange.includes("840M"), "the lifetime model value (840M) left the 7-day view"],
	[!afterRange.includes("1,378,018,140"), "the lifetime total left the 7-day view"],
	[afterRange.includes("codearts/deepseek-v4.1-flash"), "model table survives the range switch"],
];
for (const [ok, label] of rangeChecks) {
	if (!ok) missing += 1;
	console.log((ok ? "OK   " : "MISS ") + label);
}

// The sidebar icon renders standalone.
const iconWrap = window.document.createElement("div");
window.document.body.appendChild(iconWrap);
const iconRoot = ReactDOMClient.createRoot(iconWrap);
await React.act(async () => {
	iconRoot.render(React.createElement(icon, { size: 18, active: false }));
});
const svg = iconWrap.querySelector("svg");
console.log("icon svg:", svg === null ? "MISSING" : `width=${svg.getAttribute("width")} rects=${svg.querySelectorAll("rect").length} paths=${svg.querySelectorAll("path").length}`);

// Empty snapshot renders the empty state rather than crashing.
// Empty snapshot: flip the stub to serve an empty ledger.
serveEmpty = true;
const emptyWrap = window.document.createElement("div");
window.document.body.appendChild(emptyWrap);
const emptyRoot = ReactDOMClient.createRoot(emptyWrap);
await React.act(async () => {
	emptyRoot.render(React.createElement(page, { t }));
});
await React.act(async () => {
	await new Promise((resolve) => setTimeout(resolve, 50));
});
console.log("empty state text:", JSON.stringify((emptyWrap.textContent ?? "").slice(0, 80)));

console.log(missing === 0 ? "\nALL RENDER CHECKS PASSED" : `\n${missing} RENDER CHECKS MISSING`);
if (missing !== 0) process.exitCode = 1;
