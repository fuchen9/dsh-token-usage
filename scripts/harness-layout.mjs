#!/usr/bin/env node
/**
 * Layout harness - proves the panel really scrolls and that no block collapses.
 *
 * Why this exists: a flex item whose `overflow` is not `visible` gets an automatic
 * minimum size of 0, so a child of the panel's scroll column with `overflow:hidden`
 * silently shrinks to zero height and disappears, and the sibling with
 * `overflow:auto` collapses to nothing as well. The user-visible symptom is
 * "the lower half of the page is gone / the page cannot scroll".
 *
 * The harness renders the shipping CSS inside the real AppFrame ancestor chain
 * (`.frame` + `.centerCol`, copied from dsh-client-ui-layout), measures the scroll
 * column and every direct child with headless Edge over CDP, and then repeats the
 * measurement with the guard rule stripped out - the stripped run MUST reproduce
 * the collapse, otherwise the check is not actually testing anything.
 *
 * Usage: node scripts/harness-layout.mjs [--keep]
 *   EDGE_PATH=/path/to/msedge  override browser discovery
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, "..");
const keep = process.argv.includes("--keep");
const MIN_VISIBLE = 60; // a block must render at least this much before it counts as "kept"

const browserCandidates = [
	process.env.EDGE_PATH,
	"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
	"C:/Program Files/Microsoft/Edge/Application/msedge.exe",
	"C:/Program Files/Google/Chrome/Application/chrome.exe",
	"/usr/bin/microsoft-edge",
	"/usr/bin/google-chrome",
];

const findBrowser = () => {
	for (const candidate of browserCandidates) {
		if (candidate && existsSync(candidate)) return candidate;
	}
	throw new Error("no Chromium browser found - set EDGE_PATH");
};

/** Pull the real stylesheet out of lib/client.js (the css array of string literals). */
const extractCss = () => {
	const source = readFileSync(join(pkgRoot, "lib", "client.js"), "utf8");
	const start = source.indexOf("const css = [");
	const end = source.indexOf("].join(", start);
	if (start === -1 || end === -1) throw new Error("could not locate the css array in lib/client.js");
	const literals = source.slice(start, end).match(/"(?:[^"\\]|\\.)*"/g) ?? [];
	const css = literals.map((literal) => JSON.parse(literal)).join("\n");
	if (!css.includes(".dstu_body")) throw new Error("extracted css does not look like the panel stylesheet");
	return css;
};

const GUARD = ".dstu_body>*{flex:0 0 auto}";

const buildPage = (css, { keepGuard }) => {
	const sheet = keepGuard ? css : css.replace(GUARD, "/* guard stripped to prove the harness detects the bug */");
	if (keepGuard && !sheet.includes(GUARD)) throw new Error(`the shipping css is missing the guard rule ${GUARD}`);
	return `<!doctype html>
<html><head><meta charset="utf-8"><title>layout-probe</title><style>
	html, body { height: 100%; margin: 0; }
	/* ancestor chain copied from dsh-client-ui-layout (AppFrame.module.css) */
	.frame { height: 100%; display: grid; grid-template-rows: minmax(0, 1fr) auto; overflow: hidden; position: relative; }
	.centerCol { display: flex; flex-direction: column; min-width: 0; overflow: hidden; }
	/* --- shipping stylesheet, extracted from lib/client.js --- */
${sheet}
	/* --- probe scaffolding --- */
	.probeRow { height: 22px; background: #e8e8e8; border-radius: 3px; }
</style></head>
<body>
<div class="frame">
	<div class="centerCol">
		<div class="dstu_root" id="root">
			<div class="dstu_head" id="head"><div class="dstu_headText"><span class="dstu_title">Token usage</span><span class="dstu_subtitle">all models</span></div><div class="dstu_tools"><span class="dstu_seg"><button class="dstu_segBtn dstu_segBtnOn">all</button><button class="dstu_segBtn">today</button></span></div></div>
			<div class="dstu_body" id="body">
				<div class="dstu_cards" id="cards">
					<div class="dstu_card"><span class="dstu_cardLabel">total</span><span class="dstu_cardValue">1.43B</span><span class="dstu_cardHint">1,431,113,686</span></div>
					<div class="dstu_card"><span class="dstu_cardLabel">input</span><span class="dstu_cardValue">37.2M</span><span class="dstu_cardHint">37,231,505</span></div>
					<div class="dstu_card"><span class="dstu_cardLabel">output</span><span class="dstu_cardValue">8.7M</span><span class="dstu_cardHint">8,728,315</span></div>
					<div class="dstu_card"><span class="dstu_cardLabel">cache read</span><span class="dstu_cardValue">1.38B</span><span class="dstu_cardHint">1,383,406,617</span></div>
				</div>
				<div id="modelTable" style="overflow:auto;max-height:52vh">
					<table class="dstu_table"><thead><tr><th>model</th><th>requests</th><th>total</th><th>share</th></tr></thead><tbody id="modelRows"></tbody></table>
				</div>
				<div class="dstu_grid2" id="grid2">
					<div class="dstu_panel"><div class="dstu_panelHead"><span class="dstu_panelTitle">by agent</span></div><div class="dstu_states" id="agents"></div></div>
					<div class="dstu_panel"><div class="dstu_panelHead"><span class="dstu_panelTitle">by provider</span></div><div class="dstu_states" id="providers"></div></div>
				</div>
				<div class="dstu_panel" id="daily"><div class="dstu_panelHead"><span class="dstu_panelTitle">recent days</span></div><div class="dstu_days" id="dayRows"></div></div>
				<div class="dstu_panel" id="sessions"><div class="dstu_panelHead"><span class="dstu_panelTitle">recent sessions</span></div><div class="dstu_days" id="sessionRows"></div></div>
				<div class="dstu_foot" id="foot">input excludes cache read and cache write. scan took 68 ms, 207 sessions.</div>
			</div>
		</div>
	</div>
</div>
<script>
	const rows = (host, count, columns) => {
		for (let i = 0; i < count; i += 1) {
			const row = document.createElement("div");
			row.className = "probeRow";
			host.appendChild(row);
		}
	};
	for (let i = 0; i < 17; i += 1) {
		const tr = document.createElement("tr");
		tr.innerHTML = "<td><span class='dstu_model'><span class='dstu_modelName'>provider/model-" + i + "</span><span class='dstu_modelMeta'>" + i + "</span></span></td><td>1,234</td><td class='dstu_total'>90,123,456</td><td>" + (i + 1) + "%</td>";
		document.getElementById("modelRows").appendChild(tr);
	}
	rows(document.getElementById("agents"), 2);
	rows(document.getElementById("providers"), 8);
	rows(document.getElementById("dayRows"), 12);
	rows(document.getElementById("sessionRows"), 8);
</script>
</body></html>`;
};

const MEASURE = `(() => {
	const body = document.getElementById("body");
	const root = document.getElementById("root");
	const kids = [...body.children].map((child) => ({
		id: child.id || String(child.className || "").split(" ")[0] || child.tagName,
		rectH: Math.round(child.getBoundingClientRect().height),
		offsetH: child.offsetHeight,
		scrollH: child.scrollHeight,
		overflow: getComputedStyle(child).overflow,
		flex: getComputedStyle(child).flex,
	}));
	return JSON.stringify({
		viewport: { w: innerWidth, h: innerHeight },
		root: { offsetH: root.offsetHeight, clientH: root.clientHeight, scrollH: root.scrollHeight },
		body: { clientH: body.clientHeight, scrollH: body.scrollHeight, canScroll: body.scrollHeight > body.clientHeight + 1 },
		kids,
	});
})()`;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const startBrowser = async (browser) => {
	const profile = mkdtempSync(join(tmpdir(), "dsh-layout-"));
	const child = spawn(browser, [
		"--headless=new",
		"--disable-gpu",
		"--disable-sync",
		"--disable-extensions",
		"--no-first-run",
		"--no-default-browser-check",
		"--allow-file-access-from-files",
		`--user-data-dir=${profile}`,
		"--remote-debugging-port=0",
		"--window-size=1000,470",
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

const connect = async (port, url) => {
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
	await new Promise((resolve, reject) => {
		socket.addEventListener("open", resolve);
		socket.addEventListener("error", reject);
	});
	const send = (method, params) => new Promise((resolve, reject) => {
		const id = (nextId += 1);
		pending.set(id, (message) => (message.error ? reject(new Error(`${method}: ${JSON.stringify(message.error)}`)) : resolve(message.result)));
		socket.send(JSON.stringify({ id, method, params }));
	});
	const loaded = new Promise((resolve) => {
		const listener = (event) => {
			const message = JSON.parse(event.data);
			if (message.method === "Page.loadEventFired") {
				socket.removeEventListener("message", listener);
				resolve();
			}
		};
		socket.addEventListener("message", listener);
	});
	await send("Page.enable", {});
	await send("Page.navigate", { url });
	await loaded;
	await delay(120);
	const result = await send("Runtime.evaluate", { expression: MEASURE, returnByValue: true });
	if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? "evaluate failed");
	socket.close();
	return JSON.parse(result.result.value);
};

const inspect = (view) => {
	const collapsed = view.kids.filter((kid) => kid.rectH < MIN_VISIBLE && kid.scrollH > 100);
	return {
		view,
		collapsed,
		ok: collapsed.length === 0 && view.body.canScroll && Math.abs(view.root.offsetH - view.viewport.h) <= 2,
	};
};

const report = (label, view) => {
	console.log(`\n${label}  viewport ${view.viewport.w}x${view.viewport.h}`);
	console.log(`  root      offsetH ${view.root.offsetH} clientH ${view.root.clientH}`);
	console.log(`  body      clientH ${view.body.clientH} scrollH ${view.body.scrollH} canScroll ${view.body.canScroll}`);
	for (const kid of view.kids) {
		console.log(`  child     ${kid.id.padEnd(12)} rectH ${String(kid.rectH).padStart(5)} scrollH ${String(kid.scrollH).padStart(5)} flex ${kid.flex} overflow ${kid.overflow}`);
	}
};

const main = async () => {
	const browser = findBrowser();
	const css = extractCss();
	const files = [
		{ label: "shipping", keepGuard: true, path: join(pkgRoot, ".verify", "layout-probe.html") },
		{ label: "guard-stripped", keepGuard: false, path: join(pkgRoot, ".verify", "layout-probe-broken.html") },
	];
	for (const file of files) writeFileSync(file.path, buildPage(css, { keepGuard: file.keepGuard }));

	const { child, profile, port } = await startBrowser(browser);
	const failures = [];
	try {
		const shipping = inspect(await connect(port, pathToFileURL(files[0].path).href));
		report("shipping", shipping.view);
		if (!shipping.ok) {
			failures.push(`shipping layout is broken: ${shipping.collapsed.map((kid) => `${kid.id} rectH ${kid.rectH} vs content ${kid.scrollH}`).join(", ") || "the scroll column cannot scroll"}`);
		}

		const stripped = inspect(await connect(port, pathToFileURL(files[1].path).href));
		report("guard-stripped (expected to reproduce the bug)", stripped.view);
		if (stripped.collapsed.length === 0) {
			failures.push("stripping the guard did NOT reproduce any collapse - the harness is not testing what it claims");
		}
	} finally {
		child.kill();
		if (!keep) {
			for (const file of files) rmSync(file.path, { force: true });
			await delay(200);
			rmSync(profile, { recursive: true, force: true });
		}
	}

	if (failures.length > 0) {
		for (const failure of failures) console.error(`\n[fail] ${failure}`);
		console.error("\nLAYOUT CHECKS FAILED");
		process.exit(1);
	}
	console.log("\nALL LAYOUT CHECKS PASSED");
};

await main();