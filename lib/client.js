window.__ModuleLoader__.load({
	id: "@local/dsh-token-usage",
	factory: (require) => {
		const React = require("react");

		const h = React.createElement;
		const { useState, useEffect, useCallback, useRef } = React;

		const NS = "dsh-token-usage";
		const PANEL_ID = "token-usage";
		const ROUTE = "/api/dsh-token-usage";

		const zh = {
			panel: "Token 用量",
			title: "Token 用量",
			subtitle: "统计本机所有已存会话日志中的 token 消耗，并按模型分别记录。",
			refresh: "刷新",
			refreshing: "刷新中…",
			loading: "正在扫描会话日志…",
			error: "无法读取用量索引。",
			empty: "还没有记录到任何 token 用量。",
			rangeAll: "全部",
			range30d: "近 30 天",
			range7d: "近 7 天",
			rangeToday: "今天",
			metricTotal: "总 token",
			metricPrompt: "输入 token",
			metricCompletion: "输出 token",
			metricSessions: "会话数",
			cardInput: "输入",
			cardOutput: "输出",
			cardCacheRead: "缓存命中",
			cardCacheWrite: "缓存写入",
			cardTotal: "合计",
			cardRequests: "请求数",
			cardShare: "占比",
			cardLastUsed: "最近使用",
			tableModel: "模型",
			tableProvider: "提供商",
			tableRequests: "请求数",
			tableInput: "输入",
			tableCacheRead: "缓存命中",
			tableCacheWrite: "缓存写入",
			tableOutput: "输出",
			tableTotal: "合计",
			tableShare: "占比",
			tableSessions: "会话数",
			tableLastUsed: "最近使用",
			tableAgent: "类型",
			modelsTitle: "按模型",
			modelsCount: "{count} 个模型",
			providersTitle: "按提供商",
			agentsTitle: "按会话类型",
			agentsUser: "主会话",
			agentsSubagent: "子会话",
			dailyTitle: "最近几天",
			dailyDay: "日期",
			recentTitle: "最近会话",
			recentSession: "会话",
			recentUpdated: "更新时间",
			noteCache: "输入不包含缓存读取与缓存写入。",
			noteTruncated: "部分会话日志过大未能完整读取，未计入全部用量。",
			noteScan: "扫描耗时 {ms} ms，共 {count} 个会话。",
			noteScope: "以下数字只统计所选时间范围内的用量。",
			emptyRange: "该时间范围内没有用量。",
			expand: "展开",
			collapse: "收起",
			unknown: "未知",
		};

		const en = {
			panel: "Token Usage",
			title: "Token usage",
			subtitle: "Counted from every stored session log on this machine, per model.",
			refresh: "Refresh",
			refreshing: "Refreshing…",
			loading: "Scanning session logs…",
			error: "Could not read the usage index.",
			empty: "No token usage has been recorded yet.",
			rangeAll: "All time",
			range30d: "30 days",
			range7d: "7 days",
			rangeToday: "Today",
			metricTotal: "Total tokens",
			metricPrompt: "Prompt tokens",
			metricCompletion: "Output tokens",
			metricSessions: "Sessions",
			cardInput: "Input",
			cardOutput: "Output",
			cardCacheRead: "Cache hit",
			cardCacheWrite: "Cache write",
			cardTotal: "Total",
			cardRequests: "Requests",
			cardShare: "Share",
			cardLastUsed: "Last used",
			tableModel: "Model",
			tableProvider: "Provider",
			tableRequests: "Requests",
			tableInput: "Input",
			tableCacheRead: "Cache hit",
			tableCacheWrite: "Cache write",
			tableOutput: "Output",
			tableTotal: "Total",
			tableShare: "Share",
			tableSessions: "Sessions",
			tableLastUsed: "Last used",
			tableAgent: "Kind",
			modelsTitle: "By model",
			modelsCount: "{count} models",
			providersTitle: "By provider",
			agentsTitle: "By session kind",
			agentsUser: "Main sessions",
			agentsSubagent: "Subagent sessions",
			dailyTitle: "Recent days",
			dailyDay: "Day",
			recentTitle: "Recently active sessions",
			recentSession: "Session",
			recentUpdated: "Updated",
			noteCache: "Input excludes cache reads and cache writes.",
			noteTruncated: "Some session logs were too large to read completely and are not fully counted.",
			noteScan: "Scanned {count} sessions in {ms} ms.",
			noteScope: "Every number below counts only the selected time range.",
			emptyRange: "No usage in this range.",
			expand: "Expand",
			collapse: "Collapse",
			unknown: "unknown",
		};

		const css = [
			".dstu_root{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5}",
			".dstu_head{display:flex;align-items:flex-start;gap:12px;padding:16px 20px 12px;border-bottom:1px solid var(--dsw-alias-border-l2);flex:0 0 auto}",
			".dstu_headText{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1 1 auto}",
			".dstu_title{font-size:15px;font-weight:600;letter-spacing:.01em}",
			".dstu_subtitle{color:var(--dsw-alias-label-tertiary);font-size:12px}",
			".dstu_tools{display:flex;align-items:center;gap:8px;flex:0 0 auto}",
			".dstu_seg{display:inline-flex;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;overflow:hidden;background:var(--dsw-alias-bg-layer-2)}",
			".dstu_segBtn{border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;padding:4px 9px;cursor:pointer;white-space:nowrap}",
			".dstu_segBtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
			".dstu_segBtnOn{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-foreground)}",
			".dstu_segBtnOn:hover{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-foreground)}",
			".dstu_btn{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;padding:4px 10px;border-radius:8px;cursor:pointer}",
			".dstu_btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
			".dstu_btn:disabled{opacity:.55;cursor:default}",
			".dstu_body{flex:1 1 auto;min-height:0;overflow:auto;padding:16px 20px 28px;display:flex;flex-direction:column;gap:16px;scrollbar-color:var(--dsw-alias-scrollbar-bg-l2) transparent}",
			".dstu_body::-webkit-scrollbar{width:8px}",
			".dstu_body::-webkit-scrollbar-thumb{background:var(--dsw-alias-scrollbar-bg-l2);border-radius:4px}",
			".dstu_body::-webkit-scrollbar-thumb:hover{background:var(--dsw-alias-scrollbar-hover-l2)}",
			// Children of the scrolling column must never shrink: a flex item whose
			// overflow is not `visible` gets an automatic minimum size of 0, so the
			// panels (overflow:hidden) would otherwise collapse to a couple of pixels
			// and the table (overflow:auto) to nothing at all.
			".dstu_body>*{flex:0 0 auto}",
			".dstu_cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}",
			".dstu_card{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-2);padding:10px 12px;display:flex;flex-direction:column;gap:3px;min-width:0}",
			".dstu_cardLabel{font-size:11px;color:var(--dsw-alias-label-tertiary);text-transform:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
			".dstu_cardValue{font-size:19px;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:-.01em}",
			".dstu_cardHint{font-size:11px;color:var(--dsw-alias-label-caption);font-variant-numeric:tabular-nums}",
			".dstu_cardAccent .dstu_cardValue{color:var(--dsw-alias-brand-primary)}",
			".dstu_panel{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-2);overflow:hidden}",
			".dstu_panelHead{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-3)}",
			".dstu_panelTitle{font-size:12px;font-weight:600;letter-spacing:.02em;color:var(--dsw-alias-label-primary)}",
			".dstu_panelCount{font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}",
			".dstu_table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}",
			".dstu_table th{position:sticky;top:0;z-index:1;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-tertiary);font-size:11px;font-weight:500;text-align:right;padding:7px 10px;white-space:nowrap;border-bottom:1px solid var(--dsw-alias-border-l3)}",
			".dstu_table th:first-child{text-align:left}",
			".dstu_table td{padding:7px 10px;text-align:right;border-bottom:1px solid var(--dsw-alias-border-l4);white-space:nowrap}",
			".dstu_table td:first-child{text-align:left;white-space:normal;word-break:break-word}",
			".dstu_table tbody tr:hover{background:var(--dsw-alias-interactive-bg-hover)}",
			".dstu_table tbody tr:last-child td{border-bottom:0}",
			".dstu_model{display:flex;flex-direction:column;gap:1px;min-width:0}",
			".dstu_modelName{font-weight:600}",
			".dstu_modelMeta{font-size:11px;color:var(--dsw-alias-label-caption)}",
			".dstu_total{font-weight:600}",
			".dstu_bar{display:flex;align-items:center;gap:8px;justify-content:flex-end}",
			".dstu_barTrack{position:relative;width:64px;height:5px;border-radius:3px;background:var(--dsw-alias-bg-skeleton);overflow:hidden;flex:0 0 auto}",
			".dstu_barFill{position:absolute;inset:0 auto 0 0;border-radius:3px;background:var(--dsw-alias-brand-primary)}",
			".dstu_share{min-width:44px;text-align:right;color:var(--dsw-alias-label-secondary)}",
			".dstu_days{display:flex;flex-direction:column;gap:6px;padding:10px 14px}",
			".dstu_day{display:grid;grid-template-columns:96px 1fr 88px;align-items:center;gap:10px;font-variant-numeric:tabular-nums}",
			".dstu_dayLabel{font-size:11px;color:var(--dsw-alias-label-tertiary)}",
			".dstu_dayTrack{height:6px;border-radius:3px;background:var(--dsw-alias-bg-skeleton);overflow:hidden}",
			".dstu_dayFill{height:100%;border-radius:3px;background:var(--dsw-alias-state-business-primary)}",
			".dstu_dayValue{text-align:right;font-size:12px}",
			".dstu_states{display:flex;flex-direction:column;gap:10px;padding:12px 14px}",
			".dstu_state{display:grid;grid-template-columns:1fr 96px 110px;gap:10px;align-items:center}",
			".dstu_stateName{font-weight:500;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".dstu_stateTrack{height:6px;border-radius:3px;background:var(--dsw-alias-bg-skeleton);overflow:hidden}",
			".dstu_stateFill{height:100%;border-radius:3px;background:var(--dsw-alias-state-success-primary)}",
			".dstu_stateValue{text-align:right;font-variant-numeric:tabular-nums}",
			".dstu_notice{display:flex;align-items:flex-start;gap:8px;padding:10px 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:12px}",
			".dstu_noticeWarn{border-color:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-label)}",
			".dstu_noticeError{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}",
			".dstu_empty{padding:40px 16px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:12px}",
			".dstu_foot{display:flex;flex-wrap:wrap;gap:12px;font-size:11px;color:var(--dsw-alias-label-caption)}",
			".dstu_grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}",
			".dstu_icon{display:block}",
		].join("\n");

		const CSS_TAG_ID = "@local/dsh-token-usage/panel.css";
		if (typeof document !== "undefined" && document.querySelector('style[data-plugin-css="' + CSS_TAG_ID + '"]') === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@local/dsh-token-usage";
			tag.dataset.pluginCss = CSS_TAG_ID;
			tag.textContent = css;
			document.head.appendChild(tag);
		}

		/** Compact token counts: 12.3K / 4.56M / 1.20B. */
		const compact = (value) => {
			const n = typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
			if (n < 1000) return String(Math.round(n));
			if (n < 1e6) return trimZero(n / 1e3) + "K";
			if (n < 1e9) return trimZero(n / 1e6) + "M";
			return trimZero(n / 1e9) + "B";
		};

		const trimZero = (value) => {
			const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
			return String(Number(value.toFixed(digits)));
		};

		const exact = (value) => (typeof value === "number" && Number.isFinite(value) ? Math.round(value).toLocaleString() : "0");

		const percent = (value) => {
			const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
			if (n <= 0) return "0%";
			if (n < 0.001) return "<0.1%";
			return trimZero(n * 100) + "%";
		};

		const dateOf = (time) => {
			if (typeof time !== "number" || !Number.isFinite(time)) return "—";
			const date = new Date(time);
			const month = String(date.getMonth() + 1).padStart(2, "0");
			const day = String(date.getDate()).padStart(2, "0");
			const hour = String(date.getHours()).padStart(2, "0");
			const minute = String(date.getMinutes()).padStart(2, "0");
			return month + "-" + day + " " + hour + ":" + minute;
		};

		const modelLabel = (row) => (row.model === "unknown" ? "unknown" : row.model);

		/** Fetch one range of the ledger; returns the snapshot or an error notice. */
		const fetchUsage = async (force, range) => {
			const query = "?range=" + encodeURIComponent(range) + (force ? "&refresh=1" : "");
			const response = await fetch(ROUTE + query, {
				method: "GET",
				headers: { accept: "application/json" },
				credentials: "same-origin",
				cache: "no-store",
			});
			if (!response.ok) throw new Error("HTTP " + response.status);
			const body = await response.json();
			if (body === null || typeof body !== "object") throw new Error("bad payload");
			return body;
		};

		/** The icon rendered in the sidebar rail. */
		const PanelIcon = (props) => {
			const size = typeof props?.size === "number" ? props.size : 18;
			return h(
				"svg",
				{
					className: "dstu_icon",
					width: size,
					height: size,
					viewBox: "0 0 24 24",
					fill: "none",
					"aria-hidden": "true",
				},
				h("rect", { x: 3, y: 12, width: 3.4, height: 9, rx: 1.1, fill: "currentColor", opacity: 0.45 }),
				h("rect", { x: 8.3, y: 8, width: 3.4, height: 13, rx: 1.1, fill: "currentColor", opacity: 0.7 }),
				h("rect", { x: 13.6, y: 4, width: 3.4, height: 17, rx: 1.1, fill: "currentColor" }),
				h("path", {
					d: "M4 6.6 9.4 3.9l4.1 1.6L19.9 2",
					stroke: "currentColor",
					strokeWidth: 1.6,
					strokeLinecap: "round",
					strokeLinejoin: "round",
				}),
			);
		};

		/** One labelled figure. */
		const StatCard = (props) =>
			h(
				"div",
				{ className: "dstu_card" + (props.accent ? " dstu_cardAccent" : "") },
				h("div", { className: "dstu_cardLabel" }, props.label),
				h("div", { className: "dstu_cardValue" }, props.value),
				props.hint === undefined ? null : h("div", { className: "dstu_cardHint" }, props.hint),
			);

		/** The per-model breakdown table with an inline share bar. */
		const ModelTable = (props) => {
			const { t, models, grandTotal } = props;
			if (models.length === 0) return h("div", { className: "dstu_empty" }, t("emptyRange"));
			return h(
				"div",
				{ style: { overflow: "auto", maxHeight: "52vh" } },
				h(
					"table",
					{ className: "dstu_table" },
					h(
						"thead",
						null,
						h(
							"tr",
							null,
							h("th", null, t("tableModel")),
							h("th", null, t("tableRequests")),
							h("th", null, t("tableInput")),
							h("th", null, t("tableCacheRead")),
							h("th", null, t("tableOutput")),
							h("th", null, t("tableTotal")),
							h("th", null, t("tableShare")),
							h("th", null, t("tableLastUsed")),
						),
					),
					h(
						"tbody",
						null,
						models.map((row, index) => {
							const share = grandTotal === 0 ? 0 : row.total / grandTotal;
							return h(
								"tr",
								{ key: row.provider + "/" + row.model + "/" + index },
								h(
									"td",
									null,
									h(
										"div",
										{ className: "dstu_model" },
										h("span", { className: "dstu_modelName" }, modelLabel(row)),
										h(
											"span",
											{ className: "dstu_modelMeta" },
											row.provider +
												" · " +
												t("tableSessions") +
												" " +
												(row.sessions ?? 0),
										),
									),
								),
								h("td", null, exact(row.requests)),
								h("td", null, compact(row.input)),
								h("td", null, compact(row.cacheRead)),
								h("td", null, compact(row.output)),
								h("td", { className: "dstu_total" }, compact(row.total)),
								h(
									"td",
									null,
									h(
										"div",
										{ className: "dstu_bar" },
										h(
											"span",
											{ className: "dstu_barTrack" },
											h("span", {
												className: "dstu_barFill",
												style: { width: Math.max(2, Math.round(share * 100)) + "%" },
											}),
										),
										h("span", { className: "dstu_share" }, percent(share)),
									),
								),
								h("td", { style: { color: "var(--dsw-alias-label-tertiary)" } }, dateOf(row.end)),
							);
						}),
					),
				),
			);
		};

		/** The day histogram (all time only, because the route aggregates by day). */
		const DailyList = (props) => {
			const { t, daily } = props;
			if (daily.length === 0) return h("div", { className: "dstu_empty" }, t("emptyRange"));
			const peak = daily.reduce((max, row) => Math.max(max, row.tokens ?? 0), 0) || 1;
			return h(
				"div",
				{ className: "dstu_days" },
				daily.map((row) =>
					h(
						"div",
						{ className: "dstu_day", key: row.day },
						h("span", { className: "dstu_dayLabel" }, row.day),
						h(
							"span",
							{ className: "dstu_dayTrack" },
							h("span", {
								className: "dstu_dayFill",
								style: { width: Math.max(2, Math.round(((row.tokens ?? 0) / peak) * 100)) + "%" },
							}),
						),
						h("span", { className: "dstu_dayValue" }, compact(row.tokens)),
					),
				),
			);
		};

		/** The provider split. */
		const ProviderList = (props) => {
			const { t, providers } = props;
			if (providers.length === 0) return h("div", { className: "dstu_empty" }, t("emptyRange"));
			const peak = providers.reduce((max, row) => Math.max(max, row.total ?? 0), 0) || 1;
			return h(
				"div",
				{ className: "dstu_states" },
				providers.map((row) =>
					h(
						"div",
						{ className: "dstu_state", key: row.provider },
						h("span", { className: "dstu_stateName", title: row.provider }, row.provider),
						h(
							"span",
							{ className: "dstu_stateTrack" },
							h("span", {
								className: "dstu_stateFill",
								style: { width: Math.max(2, Math.round(((row.total ?? 0) / peak) * 100)) + "%" },
							}),
						),
						h("span", { className: "dstu_stateValue" }, compact(row.total)),
					),
				),
			);
		};

		/** The panel page. */
		const UsagePage = (props) => {
			const t = typeof props?.t === "function" ? props.t : (key) => zh[key] ?? en[key] ?? key;
			const [snapshot, setSnapshot] = useState(null);
			const [state, setState] = useState("loading");
			const [range, setRange] = useState("all");
			const [showAllSessions, setShowAllSessions] = useState(false);

			// Responses can land out of order when the range is switched quickly, so
			// only the newest request is allowed to publish.
			const wanted = useRef(0);

			const load = useCallback(async (force, target) => {
				const ticket = (wanted.current += 1);
				setState((previous) => (previous === "ready" || previous === "refreshing" ? "refreshing" : "loading"));
				try {
					const body = await fetchUsage(force, target);
					if (ticket !== wanted.current) return;
					setSnapshot(body);
					setState(body.ok === false ? "error" : "ready");
				} catch (error) {
					if (ticket !== wanted.current) return;
					setState("error");
					console.warn("[dsh-token-usage] " + String(error));
				}
			}, []);

			useEffect(() => {
				load(false, range);
			}, [load, range]);

			// The host already scoped every panel to this range; nothing is
			// filtered on the client, so the table and the cards agree.
			const models = Array.isArray(snapshot?.models) ? snapshot.models : [];
			const totals = snapshot?.totals ?? {};
			const grandTotal = totals.total ?? 0;

			const toolbar = h(
				"div",
				{ className: "dstu_tools" },
				h(
					"div",
					{ className: "dstu_seg", role: "tablist" },
					[
						["all", "rangeAll"],
						["30d", "range30d"],
						["7d", "range7d"],
						["today", "rangeToday"],
					].map(([value, key]) =>
						h(
							"button",
							{
								key: value,
								type: "button",
								className: "dstu_segBtn" + (range === value ? " dstu_segBtnOn" : ""),
								onClick: () => setRange(value),
							},
							t(key),
						),
					),
				),
				h(
					"button",
					{
						type: "button",
						className: "dstu_btn",
						disabled: state === "loading" || state === "refreshing",
						onClick: () => load(true, range),
					},
					state === "refreshing" ? t("refreshing") : t("refresh"),
				),
			);

			const head = h(
				"div",
				{ className: "dstu_head" },
				h("div", { className: "dstu_headText" }, h("div", { className: "dstu_title" }, t("title")), h("div", { className: "dstu_subtitle" }, t("subtitle"))),
				toolbar,
			);

			let body;
			if (state === "loading" && snapshot === null) {
				body = h("div", { className: "dstu_empty" }, t("loading"));
			} else if (snapshot !== null && snapshot.ok === false) {
				// Show the host's own words: a failed scan is otherwise invisible.
				body = h("div", { className: "dstu_notice dstu_noticeError" }, t("error") + " " + String(snapshot.error ?? ""));
			} else if (state === "error" && snapshot === null) {
				body = h("div", { className: "dstu_notice dstu_noticeError" }, t("error"));
			} else if (snapshot === null || grandTotal === 0) {
				body = h("div", { className: "dstu_empty" }, range === "all" ? t("empty") : t("emptyRange"));
			} else {
				const cards = h(
					"div",
					{ className: "dstu_cards" },
					h(StatCard, { label: t("metricTotal"), value: compact(grandTotal), hint: exact(grandTotal), accent: true }),
					h(StatCard, { label: t("cardInput"), value: compact(totals.input), hint: exact(totals.input) }),
					h(StatCard, { label: t("cardCacheRead"), value: compact(totals.cacheRead), hint: exact(totals.cacheRead) }),
					h(StatCard, { label: t("cardOutput"), value: compact(totals.output), hint: exact(totals.output) }),
					h(StatCard, {
						label: t("cardRequests"),
						value: exact(totals.requests),
						hint: t("metricSessions") + " " + exact(totals.sessions),
					}),
				);

				const table = h(
					"div",
					{ className: "dstu_panel" },
					h(
						"div",
						{ className: "dstu_panelHead" },
						h("span", { className: "dstu_panelTitle" }, t("modelsTitle")),
						h("span", { className: "dstu_panelCount" }, t("modelsCount").replace("{count}", String(models.length))),
					),
					h(ModelTable, { t, models, grandTotal }),
				);

				const agentsTotal = (totals.total ?? 0) || 1;
				// The host sends an array of rows; index it by `kind` (indexing the
				// array with "user"/"subagent" silently yields undefined → "0 · 0").
				const agents = Array.isArray(snapshot.agents) ? snapshot.agents : [];
				const agentByKind = new Map(agents.map((row) => [row.kind, row]));
				const agentPanel = h(
					"div",
					{ className: "dstu_panel" },
					h("div", { className: "dstu_panelHead" }, h("span", { className: "dstu_panelTitle" }, t("agentsTitle"))),
					h(
						"div",
						{ className: "dstu_states" },
						[
							["user", "agentsUser"],
							["subagent", "agentsSubagent"],
						].map(([kind, labelKey]) => {
							const row = agentByKind.get(kind) ?? {};
							const share = (row.total ?? 0) / agentsTotal;
							return h(
								"div",
								{ className: "dstu_state", key: kind },
								h("span", { className: "dstu_stateName" }, t(labelKey)),
								h(
									"span",
									{ className: "dstu_stateTrack" },
									h("span", {
										className: "dstu_stateFill",
										style: { width: Math.max(2, Math.round(share * 100)) + "%" },
									}),
								),
								h("span", { className: "dstu_stateValue" }, compact(row.total) + " · " + exact(row.sessions ?? 0)),
							);
						}),
					),
				);

				const providerPanel = h(
					"div",
					{ className: "dstu_panel" },
					h("div", { className: "dstu_panelHead" }, h("span", { className: "dstu_panelTitle" }, t("providersTitle"))),
					h(ProviderList, { t, providers: Array.isArray(snapshot.providers) ? snapshot.providers : [] }),
				);

				const dailyPanel = h(
					"div",
					{ className: "dstu_panel" },
					h("div", { className: "dstu_panelHead" }, h("span", { className: "dstu_panelTitle" }, t("dailyTitle"))),
					h(DailyList, { t, daily: Array.isArray(snapshot.daily) ? snapshot.daily : [] }),
				);

				const sessions = Array.isArray(snapshot.sessions) ? snapshot.sessions : [];
				const shown = showAllSessions ? sessions : sessions.slice(0, 8);
				const sessionPanel = h(
					"div",
					{ className: "dstu_panel" },
					h(
						"div",
						{ className: "dstu_panelHead" },
						h("span", { className: "dstu_panelTitle" }, t("recentTitle")),
						sessions.length > 8
							? h(
									"button",
									{
										type: "button",
										className: "dstu_segBtn",
										style: { borderRadius: "6px", padding: "2px 8px" },
										onClick: () => setShowAllSessions((value) => !value),
									},
									showAllSessions ? t("collapse") : t("expand"),
								)
							: null,
					),
					h(
						"table",
						{ className: "dstu_table" },
						h(
							"thead",
							null,
							h(
								"tr",
								null,
								h("th", null, t("recentSession")),
								h("th", null, t("tableAgent")),
								h("th", null, t("tableTotal")),
								h("th", null, t("recentUpdated")),
							),
						),
						h(
							"tbody",
							null,
							shown.map((row) =>
								h(
									"tr",
									{ key: row.id },
									h(
										"td",
										null,
										h(
											"div",
											{ className: "dstu_model" },
											h("span", { className: "dstu_modelName" }, row.title || row.id),
											h("span", { className: "dstu_modelMeta" }, (row.preset || "standard") + " · " + row.id.slice(0, 8)),
										),
									),
									h("td", null, row.kind === "subagent" ? t("agentsSubagent") : t("agentsUser")),
									h("td", { className: "dstu_total" }, compact(row.tokens)),
									h("td", { style: { color: "var(--dsw-alias-label-tertiary)" } }, dateOf(row.end)),
								),
							),
						),
					),
				);

				const notes = h(
					"div",
					{ className: "dstu_foot" },
					h("span", null, t("noteCache")),
					h(
						"span",
						null,
						t("noteScan")
							.replace("{count}", exact(totals.sessions))
							.replace("{ms}", exact(snapshot.scanMs ?? 0)),
					),
				);

				body = h(
					React.Fragment,
					null,
					cards,
					range === "all" ? null : h("div", { className: "dstu_notice" }, t("noteScope")),
					table,
					h("div", { className: "dstu_grid2" }, agentPanel, providerPanel),
					dailyPanel,
					sessionPanel,
					notes,
					(totals.truncatedSessions ?? 0) > 0
						? h("div", { className: "dstu_notice dstu_noticeWarn" }, t("noteTruncated"))
						: null,
					snapshot.ok === false && snapshot.error
						? h("div", { className: "dstu_notice dstu_noticeError" }, t("error") + " " + String(snapshot.error))
						: null,
				);
			}

			return h("div", { className: "dstu_root" }, head, h("div", { className: "dstu_body" }, body));
		};

		return {
			inject: ["slots", "locale"],
			apply(ctx) {
				ctx.effect(
					() =>
						ctx.locale.register(NS, {
							zh,
							en,
						}),
					"dsh-token-usage: locale",
				);

				const t = ctx.locale.bind(NS);

				ctx.effect(
					() =>
						ctx.slots.inject("main", () => {
							return ctx.slots.register(
								{
									name: "main",
									key: PANEL_ID,
									locale: NS,
								},
								UsagePage,
							);
						}),
					"dsh-token-usage: main panel",
				);

				ctx.effect(
					() =>
						ctx.slots.inject("sidebar.panellist", () =>
							ctx.slots.register(
								{
									name: "sidebar.panellist",
									id: PANEL_ID,
									order: 35,
									locale: NS,
									label: () => t("panel"),
								},
								PanelIcon,
							),
						),
					"dsh-token-usage: sidebar entry",
				);
			},
		};
	},
});
