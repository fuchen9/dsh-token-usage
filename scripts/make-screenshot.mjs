#!/usr/bin/env node
/**
 * Documentation screenshot generator.
 *
 * Renders the real panel markup (built by the real client module, from a real
 * snapshot served by a running Harness) inside the real AppFrame ancestor chain
 * and the shipping CSS, then captures it with headless Edge over CDP.
 *
 * This is NOT a live capture of the GUI window: the surrounding chrome
 * (sidebar, title bar) is deliberately excluded, so what lands in the README is
 * the panel itself at a comfortable width. The numbers are real - they come from
 * whatever `/api/dsh-token-usage` answers with right now.
 *
 * Usage: node scripts/make-screenshot.mjs [--url http://127.0.0.1:PORT] [--out docs/screenshot.png] [--width 1240] [--height 1120]
 *   EDGE_PATH=/path/to/msedge  override browser discovery
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const pkgRoot = resolve(here, "..");

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
	const index = argv.indexOf(`--${name}`);
	return index >= 0 && argv[index + 1] !== undefined ? argv[index + 1] : fallback;
};

const baseUrl = flag("url", "http://127.0.0.1:54446");
const snapshotFile = flag("snapshot", null);
const outPath = resolve(pkgRoot, flag("out", "docs/screenshot.png"));
const width = Number(flag("width", "1240"));
const height = Number(flag("height", "1120"));

const delay = (ms) => new Promise((done) => setTimeout(done, ms));

const browserCandidates = [
	process.env.EDGE_PATH,
	"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
	"C:/Program Files/Microsoft/Edge/Application/msedge.exe",
	"C:/Program Files/Google/Chrome/Application/chrome.exe",
	"/usr/bin/microsoft-edge",
	"/usr/bin/google-chrome",
];
const findBrowser = () => {
	for (const candidate of browserCandidates) if (candidate && existsSync(candidate)) return candidate;
	throw new Error("no Chromium browser found; set EDGE_PATH");
};

/** Pull the shipping stylesheet out of lib/client.js so the shot uses real CSS. */
const extractCss = () => {
	const source = readFileSync(join(pkgRoot, "lib", "client.js"), "utf8");
	const start = source.indexOf("const css = [");
	const end = source.indexOf("].join(", start);
	if (start < 0 || end < 0) throw new Error("could not find the css array in lib/client.js");
	const block = source.slice(source.indexOf("[", start), end + 1);
	const literals = block.match(/"(?:[^"\\]|\\.)*"/g) ?? [];
	const css = literals.map((literal) => JSON.parse(literal)).join("\n");
	if (!css.includes(".dstu_body")) throw new Error("extracted css does not look like the panel stylesheet");
	return css;
};

/** Ask the running Harness for a real snapshot. */
const fetchSnapshot = async (path) => {
	const response = await fetch(new URL(path, baseUrl));
	if (!response.ok) throw new Error(`${path} -> HTTP ${response.status}`);
	const body = await response.json();
	if (body.ok !== true) throw new Error(`${path} -> ok:false (${body.error ?? "no reason"})`);
	return body;
};

/**
 * Read a snapshot from a JSON file instead of the live route. Use this when the
 * running Harness was started before the current source was edited: the file can
 * be produced by `scripts/harness-host.mjs --snapshot <path>`, which folds the
 * same real session logs with the current code.
 */
const readSnapshotFile = (path) => {
	const body = JSON.parse(readFileSync(resolve(pkgRoot, path), "utf8"));
	if (body.ok !== true) throw new Error(`${path} -> ok:false (${body.error ?? "no reason"})`);
	return body;
};

/**
 * Mount the real client module in jsdom, let its fetch-on-mount resolve, and
 * return the resulting panel markup.
 */
const renderPanel = async (snapshot) => {
	const scratchRequire = createRequire(join(pkgRoot, ".verify", "scratch.cjs"));
	const { JSDOM } = scratchRequire("jsdom");
	const React = scratchRequire("react");
	const { createRoot } = scratchRequire("react-dom/client");
	const { act } = scratchRequire("react");

	const realFetch = globalThis.fetch;
	globalThis.fetch = async (input, init) => {
		const url = String(input);
		if (url.includes("/api/dsh-token-usage")) {
			return { ok: true, status: 200, json: async () => snapshot, text: async () => JSON.stringify(snapshot) };
		}
		return realFetch(input, init);
	};

	const dom = new JSDOM("<!doctype html><html><body><div id=\"host\"></div></body></html>", {
		url: baseUrl,
		pretendToBeVisual: true,
	});
	const saved = {
		window: globalThis.window,
		document: globalThis.document,
		navigator: globalThis.navigator,
		HTMLElement: globalThis.HTMLElement,
	};
	const assign = (key, value) => {
		try {
			globalThis[key] = value;
		} catch {
			Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
		}
	};
	assign("window", dom.window);
	assign("document", dom.window.document);
	assign("navigator", dom.window.navigator);
	assign("HTMLElement", dom.window.HTMLElement);

	const registrations = [];
	const localeDictionaries = [];
	const activeLocale = "zh";
	// Filled by `ctx.locale.register` before the panel mounts; the panel's `t`
	// resolves through it.
	const dictionary = {};
	const translate = (key) => (typeof dictionary[key] === "string" ? dictionary[key] : key);
	let moduleExports = null;
	dom.window.__ModuleLoader__ = {
		load({ id, factory }) {
			moduleExports = factory((name) => {
				if (name === "react") return React;
				throw new Error(`unexpected require(${name})`);
			});
			registrations.push(id);
		},
	};
	new Function("window", "document", readFileSync(join(pkgRoot, "lib", "client.js"), "utf8"))(dom.window, dom.window.document);
	if (moduleExports === null) throw new Error("client.js did not register with the module loader");

	const slots = [];
	const localeRegister = [];
	const ctx = {
		effect(fn) {
			const dispose = fn();
			return { dispose };
		},
		locale: {
			register: (ns, dict) => {
				localeRegister.push(ns);
				Object.assign(dictionary, dict[activeLocale] ?? dict.zh ?? dict.en ?? {});
				return { dispose() {} };
			},
			bind: () => (key) => translate(key),
		},
		slots: {
			register: (options, component) => {
				slots.push({ options, component });
				return { dispose() {} };
			},
			inject: (_name, fn) => fn(),
		},
	};
	moduleExports.apply(ctx);

	const page = slots.find((slot) => slot.options.name === "main");
	if (!page) throw new Error("no main slot was registered");
	const options = page.options;
	const Component = page.component;

	const host = dom.window.document.getElementById("host");
	const root = createRoot(host);
	await act(async () => {
		root.render(React.createElement(Component, { t: translate }));
	});
	await act(async () => {
		await delay(60);
	});

	const html = host.innerHTML;
	act(() => root.unmount());
	globalThis.fetch = realFetch;
	assign("window", saved.window);
	assign("document", saved.document);
	assign("navigator", saved.navigator);
	assign("HTMLElement", saved.HTMLElement);
	dom.window.close();
	return html;
};

/** Wrap the panel in the real AppFrame chain so heights resolve like in the app. */
const buildPage = (css, panelHtml) => `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><style>
:root {
  --dsw-alias-bg-layer-1: #ffffff;
  --dsw-alias-bg-layer-2: #f7f8fa;
  --dsw-alias-bg-layer-3: #eef1f5;
  --dsw-alias-bg-module-platform: #ffffff;
  --dsw-alias-bg-skeleton: #eceef2;
  --dsw-alias-border-l1: #e6e8ec;
  --dsw-alias-border-l2: #e2e5ea;
  --dsw-alias-border-l3: #d8dce3;
  --dsw-alias-border-l4: #c9ced7;
  --dsw-alias-brand-primary: #4c6ef5;
  --dsw-alias-button-primary-fill: #4c6ef5;
  --dsw-alias-button-primary-hover: #3f5fe0;
  --dsw-alias-interactive-bg-hover: rgba(76, 110, 245, 0.08);
  --dsw-alias-label-primary: #1b1f26;
  --dsw-alias-label-primary-foreground: #ffffff;
  --dsw-alias-label-secondary: #4a5261;
  --dsw-alias-label-tertiary: #7b8494;
  --dsw-alias-label-caption: #9aa3b2;
  --dsw-alias-scrollbar-bg-l2: rgba(0, 0, 0, 0.14);
  --dsw-alias-scrollbar-hover-l2: rgba(0, 0, 0, 0.3);
  --dsw-alias-state-business-primary: #4c6ef5;
  --dsw-alias-state-error-primary: #e5484d;
  --dsw-alias-state-success-primary: #2f9e44;
  --dsw-alias-state-success-secondary: #8ce99a;
  --dsw-alias-state-warn-label: #b7791f;
  --dsw-alias-state-warn-primary: #f59f00;
  --dsw-alias-state-warn-tertiary: #fff4e0;
}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: var(--dsw-alias-bg-layer-1); }
body { font-family: "Inter", "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
.frame { height: 100%; display: grid; grid-template-rows: minmax(0, 1fr) auto; overflow: hidden; }
.centerCol { display: flex; flex-direction: column; min-width: 0; overflow: hidden; }
${css}
</style></head><body>
<div class="frame"><div class="centerCol">${panelHtml}</div></div>
</body></html>`;

const startBrowser = async (browser) => {
	const profile = mkdtempSync(join(tmpdir(), "dsh-shot-"));
	const child = spawn(browser, [
		"--headless=new",
		"--disable-gpu",
		"--disable-sync",
		"--disable-extensions",
		"--hide-scrollbars=false",
		"--force-device-scale-factor=2",
		"--no-first-run",
		"--no-default-browser-check",
		"--allow-file-access-from-files",
		`--user-data-dir=${profile}`,
		"--remote-debugging-port=0",
		`--window-size=${width},${height}`,
		"about:blank",
	], { stdio: "ignore" });
	const portFile = join(profile, "DevToolsActivePort");
	let port = null;
	for (let i = 0; i < 200 && port === null; i += 1) {
		await delay(100);
		if (!existsSync(portFile)) continue;
		const text = readFileSync(portFile, "utf8").split("\n")[0].trim();
		if (text) port = text;
	}
	if (port === null) throw new Error("browser did not open a devtools port");
	return { child, profile, port };
};

const shoot = async (port, url) => {
	const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
	const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
	if (!page) throw new Error("no page target in the browser");
	const socket = new WebSocket(page.webSocketDebuggerUrl);
	const pending = new Map();
	let nextId = 0;
	socket.addEventListener("message", (event) => {
		const message = JSON.parse(event.data);
		const slot = pending.get(message.id);
		if (slot) {
			pending.delete(message.id);
			slot(message);
		}
	});
	await new Promise((done, fail) => {
		socket.addEventListener("open", done);
		socket.addEventListener("error", fail);
	});
	const send = (method, params) => new Promise((done, fail) => {
		const id = (nextId += 1);
		pending.set(id, (message) => (message.error ? fail(new Error(`${method}: ${JSON.stringify(message.error)}`)) : done(message.result)));
		socket.send(JSON.stringify({ id, method, params }));
	});
	const loaded = new Promise((done) => {
		const listener = (event) => {
			const message = JSON.parse(event.data);
			if (message.method === "Page.loadEventFired") {
				socket.removeEventListener("message", listener);
				done();
			}
		};
		socket.addEventListener("message", listener);
	});
	await send("Page.enable", {});
	await send("Page.navigate", { url });
	await loaded;
	await delay(350);
	const result = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
	socket.close();
	return Buffer.from(result.data, "base64");
};

const main = async () => {
	const css = extractCss();
	const snapshot = snapshotFile === null ? await fetchSnapshot("/api/dsh-token-usage") : readSnapshotFile(snapshotFile);
	console.log(`snapshot: total ${snapshot.totals.total.toLocaleString()} tokens, ${snapshot.models.length} models, scanned in ${snapshot.scanMs} ms`);

	const panelHtml = await renderPanel(snapshot);
	if (!panelHtml.includes("dstu_root")) throw new Error("rendered markup is missing the panel root");

	const pagePath = join(pkgRoot, ".verify", "screenshot.html");
	writeFileSync(pagePath, buildPage(css, panelHtml));

	const { child, profile, port } = await startBrowser(findBrowser());
	try {
		const png = await shoot(port, pathToFileURL(pagePath).href);
		mkdirSync(dirname(outPath), { recursive: true });
		writeFileSync(outPath, png);
		console.log(`wrote ${outPath} (${(png.length / 1024).toFixed(1)} KiB, ${width}x${height} @2x)`);
	} finally {
		child.kill();
		await delay(200);
		rmSync(profile, { recursive: true, force: true });
	}
};

main().catch((error) => {
	console.error(error.message);
	process.exit(1);
});
