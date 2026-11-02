// Pull the CSS string literals out of a compiled client bundle and show the
// rules that govern panel height/scroll, so we can copy the established pattern.
import { readFileSync } from "node:fs";

for (const name of process.argv.slice(2)) {
	const source = readFileSync(`D:/dsh2/resources/app/dsh/node_modules/@deepseek-ai/${name}/lib/client.js`, "utf8");
	console.log(`===== ${name}`);
	// Every `"...{...}"` literal that looks like CSS.
	const literals = source.match(/"[^"\\]*(?:\\.[^"\\]*)*"/g) ?? [];
	let shown = 0;
	for (const raw of literals) {
		let text;
		try {
			text = JSON.parse(raw);
		} catch {
			continue;
		}
		if (!text.includes("{") || !text.includes(":")) continue;
		for (const rule of text.split("}")) {
			if (!/height:\s*100%|min-height:\s*0|max-height|100vh|overflow:\s*(auto|hidden|scroll)|flex:\s*1/.test(rule)) continue;
			const trimmed = rule.trim();
			if (trimmed.length === 0 || trimmed.length > 300) continue;
			console.log("  " + trimmed + "}");
			shown += 1;
			if (shown > 25) break;
		}
		if (shown > 25) break;
	}
}