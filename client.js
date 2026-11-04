window.__ModuleLoader__.load({
	id: '@local/dsh-web-browser',
	factory(require) {
		const React = require('react');
		const { useState, useEffect, useCallback, useRef } = React;
		const h = React.createElement;

		/* ------------------------------------------------------------------ *
		 * Locale
		 * ------------------------------------------------------------------ */

		const NS = 'webBrowser';
		const zh = {
			view: '浏览器',
			back: '后退',
			forward: '前进',
			reload: '刷新',
			home: '主页',
			'set-home': '将当前页面设为主页',
			'open-external': '在系统浏览器中打开',
			close: '关闭浏览器视图',
			'address.placeholder': '输入网址或搜索…',
			go: '前往',
			'error.load': '页面加载失败',
			'hint.embed': '部分站点禁止内嵌显示，可点击 ↗ 在系统浏览器中打开',
			'engine.starting': '正在启动内置浏览器引擎…',
			'engine.failed': '内置浏览器引擎未响应，已切换为网页嵌入',
			'auto-login': '自动登录设置',
			'auto-login.enabled': '自动填写并登录',
			'auto-login.account': '手机号或邮箱',
			'auto-login.password': '密码',
			'auto-login.save': '保存',
			'auto-login.hint': '凭据仅保存在本机',
			'tab.new': '新建标签页',
			'tab.close': '关闭标签页',
		};
		const en = {
			view: 'Browser',
			back: 'Back',
			forward: 'Forward',
			reload: 'Reload',
			home: 'Home',
			'set-home': 'Set current page as home',
			'open-external': 'Open in system browser',
			close: 'Close browser view',
			'address.placeholder': 'Type a URL or search…',
			go: 'Go',
			'error.load': 'The page failed to load',
			'hint.embed': 'Some sites refuse to be embedded — use ↗ to open them in your system browser',
			'engine.starting': 'Starting the built-in browser engine…',
			'engine.failed': 'The built-in browser engine did not respond; switched to web embedding',
			'auto-login': 'Auto-login settings',
			'auto-login.enabled': 'Fill and sign in automatically',
			'auto-login.account': 'Phone or email',
			'auto-login.password': 'Password',
			'auto-login.save': 'Save',
			'auto-login.hint': 'Stored on this device only',
			'tab.new': 'New tab',
			'tab.close': 'Close tab',
		};

		/* ------------------------------------------------------------------ *
		 * Preferences (localStorage), per-session page memory, diagnostics
		 * ------------------------------------------------------------------ */

		const STORAGE_KEY = 'dsh-web-browser:home';
		const DIAG_KEY = 'dsh-web-browser:diag';
		const DEFAULT_HOME = 'https://chat.deepseek.com/';
		/** Homepage default shipped by earlier versions; treated as "unset". */
		const LEGACY_DEFAULT_HOME = 'https://www.bing.com';
		const SEARCH_TEMPLATE = 'https://www.bing.com/search?q={query}';

		const readHome = () => {
			try {
				const value = window.localStorage.getItem(STORAGE_KEY);
				if (typeof value === 'string' && /^https?:\/\//i.test(value) && value !== LEGACY_DEFAULT_HOME) return value;
			} catch { /* storage unavailable */ }
			return DEFAULT_HOME;
		};

		const writeHome = (url) => {
			try { window.localStorage.setItem(STORAGE_KEY, url); } catch { /* ignore */ }
		};

		/* ------------------------------------------------------------------ *
		 * Auto-login credentials (editable from the toolbar key button)
		 * ------------------------------------------------------------------ */

		const LOGIN_KEY = 'dsh-web-browser:login';
		/** First-run defaults. Real credentials belong to LocalStorage (saved from
		 *  the toolbar panel) and are intentionally never committed to the repo. */
		const SEED_LOGIN = { enabled: true, account: '', password: '' };

		const readLogin = () => {
			try {
				const raw = window.localStorage.getItem(LOGIN_KEY);
				if (typeof raw === 'string' && raw.length > 0) {
					const parsed = JSON.parse(raw);
					if (parsed && typeof parsed.account === 'string') {
						return {
							enabled: parsed.enabled !== false,
							account: parsed.account,
							password: typeof parsed.password === 'string' ? parsed.password : '',
						};
					}
				}
			} catch { /* fall through to the seed */ }
			return { enabled: SEED_LOGIN.enabled, account: SEED_LOGIN.account, password: SEED_LOGIN.password };
		};

		const writeLogin = (value) => {
			try {
				window.localStorage.setItem(LOGIN_KEY, JSON.stringify({
					enabled: value.enabled !== false,
					account: String(value.account || ''),
					password: String(value.password || ''),
				}));
			} catch { /* ignore */ }
		};

		/** Chrome-like UA for guests: the default Electron UA trips DeepSeek's
		 *  "使用环境异常" risk banner, a normal Chrome UA keeps the page clean. */
		const chromeUserAgent = () => {
			const mac = /Macintosh|Mac OS X/i.test(navigator.userAgent || '');
			return 'Mozilla/5.0 (' + (mac ? 'Macintosh; Intel Mac OS X 10_15_7' : 'Windows NT 10.0; Win64; x64') + ') ' +
				'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
		};

		/** Guest-side guard for the environment banner: dismisses the
		 *  "使用环境异常" modal whenever it appears. Installed once per document. */
		const buildDismissScript = () => '(() => {' +
			'const FLAG="__dshWebBrowserDismisser";' +
			'if(window[FLAG])return "already";' +
			'window[FLAG]=true;' +
			'const TITLES=["使用环境异常","异常环境","环境异常"];' +
			'const closeModal=()=>{' +
			'const nodes=Array.from(document.querySelectorAll("div,span,h1,h2,h3,p"));' +
			'for(const n of nodes){' +
			'const text=((n.textContent||"")+"").trim();' +
			'if(TITLES.indexOf(text)<0)continue;' +
			'let modal=n;' +
			'const SEL="[role=button][class*=close],[class*=close],[aria-label*=close i]";' +
			'while(modal&&!(modal.querySelector&&modal.querySelector(SEL)))modal=modal.parentElement;' +
			'if(!modal)continue;' +
			'const btn=modal.querySelector(SEL);' +
			'if(btn){btn.click();return true;}' +
			'}' +
			'return false;' +
			'};' +
			'const start=()=>{try{const obs=new MutationObserver(()=>{closeModal();});obs.observe(document.body,{childList:true,subtree:true});closeModal();}catch(e){}};' +
			'if(document.body)start();else setTimeout(start,500);' +
			'return "installed:"+String(navigator.userAgent||"").slice(0,120);' +
			'})()';

		/** Login automation executed INSIDE the guest page: switches to the
		 *  password form, fills the fields (native setter + input/change events,
		 *  required by React-controlled inputs), accepts the agreement box when
		 *  present, and submits. Returns a JSON report for diagnostics.
		 *  Calibrated against chat.deepseek.com/sign_in: the page defaults to SMS
		 *  code login; the password switch is a [role=button] social link, the
		 *  submit is a [role=button] whose text is 登录. */
		const buildLoginScript = (account, password) => '(async () => {' +
			'const CRED=' + JSON.stringify({ account, password }) + ';' +
			'const sleep=(ms)=>new Promise((r)=>setTimeout(r,ms));' +
			'const visible=(el)=>!!el&&(el.offsetWidth>0||el.offsetHeight>0||el.getClientRects().length>0);' +
			'const textOf=(el)=>((el&&(el.innerText||el.textContent))||"").trim();' +
			'const click=(el)=>{if(!el)return false;try{el.scrollIntoView({block:"center"});}catch(e){}try{el.click();}catch(e){return false;}return true;};' +
			'const setValue=(el,value)=>{const proto=el.tagName==="TEXTAREA"?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;' +
			'const setter=Object.getOwnPropertyDescriptor(proto,"value").set;' +
			'setter.call(el,value);' +
			'el.dispatchEvent(new Event("input",{bubbles:true}));' +
			'el.dispatchEvent(new Event("change",{bubbles:true}));' +
			'return el.value===value;};' +
			'const pick=(re)=>Array.from(document.querySelectorAll("[role=button],button,a,[role=tab]")).find((el)=>visible(el)&&re.test(textOf(el)));' +
			'const report=(phase,extra)=>JSON.stringify(Object.assign({phase:phase,steps:steps,url:location.href},extra||{}));' +
			'const steps=[];' +
			'if(!document.querySelector("input[type=password]")){' +
			'const tab=pick(/密码登录/);' +
			'if(tab){click(tab);steps.push("tab");await sleep(500);}' +
			'}' +
			'const box=document.querySelector("input[type=checkbox]");' +
			'if(box&&!box.checked){click(box);steps.push("agree");}' +
			'await sleep(150);' +
			'const inputs=Array.from(document.querySelectorAll("input")).filter((el)=>visible(el)&&!el.disabled&&el.type!=="checkbox");' +
			'const pwd=inputs.find((el)=>el.type==="password");' +
			'if(!pwd)return report("no-fields",{inputs:inputs.map((el)=>(el.type||"text")+"|"+(el.placeholder||""))});' +
			'const user=inputs.find((el)=>el!==pwd&&(el.type==="tel"||el.type==="text"||el.type==="email"||el.type==="number"));' +
			'if(!user)return report("no-account",{inputs:inputs.map((el)=>(el.type||"text")+"|"+(el.placeholder||""))});' +
			'setValue(user,CRED.account);steps.push("account");' +
			'await sleep(200);' +
			'setValue(pwd,CRED.password);steps.push("password");' +
			'await sleep(300);' +
			'const submitted=click(pick(/^(登录|立即登录)$/));steps.push(submitted?"submit":"no-submit");' +
			'await sleep(900);' +
			'if(visible(document.querySelector("input[type=password]"))){click(pick(/^(登录|立即登录)$/));steps.push("submit2");}' +
			'return report("submitted");' +
			'})()';

		/** Append one bounded diagnostic entry so a failing carrier can be audited
		 *  from the outside (LocalStorage is readable on disk). */
		const diag = (event, data) => {
			try {
				let list = [];
				try { list = JSON.parse(window.localStorage.getItem(DIAG_KEY) || '[]'); } catch { list = []; }
				if (!Array.isArray(list)) list = [];
				list.push({ t: Date.now(), event, ...data });
				window.localStorage.setItem(DIAG_KEY, JSON.stringify(list.slice(-50)));
			} catch { /* diagnostics are best-effort */ }
		};

		/** Last visited page per session id (module-lifetime memory, not persisted). */
		const sessionPages = new Map();

		/** Tab list per session id: survives switching to another view and back. */
		const sessionTabs = new Map();

		/** Turn address-bar input into a navigable URL; only http(s) targets are
		 *  loaded — bare domains gain https, anything else becomes a search.
		 *  The harness application origin itself is never embedded. */
		const resolveInput = (raw) => {
			const text = String(raw ?? '').trim();
			if (!text) return null;
			if (/^localhost(:\d+)?([/?#].*)?$/i.test(text)) return `http://${text}`; // local dev server
			if (/^[\w.-]+\.[a-zA-Z]{2,}([/?#].*)?$/.test(text)) return `https://${text}`; // bare domain
			if (/^https?:\/\//i.test(text)) {
				try {
					if (new URL(text).origin === window.location.origin) return null; // refuse self-embed
				} catch { /* fall through to search */ }
				return text; // explicit web URL
			}
			return SEARCH_TEMPLATE.replace('{query}', encodeURIComponent(text)); // search
		};

		/** Desktop Electron bridge for real webview guests (same carrier as the
		 *  shipped sidebar browser); undefined on plain web deployments. */
		const desktopBridge = () => {
			const carrier = globalThis.dshDesktop;
			return carrier && carrier.protocolVersion === 1 ? carrier.browser : undefined;
		};

		/** Whether this document can create Electron <webview> guests at all. */
		const webviewAvailable = () => {
			try {
				const probe = document.createElement('webview');
				return typeof probe.loadURL === 'function';
			} catch { return false; }
		};

		/** Storage-account key for the desktop browser partition: prefer the
		 *  Workspace's canonical CWD so every Session in that Workspace shares one
		 *  partition (cookies, therefore logins, survive tab switches and Session
		 *  switches while the app runs); ungrouped Sessions stay isolated.
		 *  Mirrors the shipped sidebar browser's account resolution. */
		const workspaceKeyFor = (ctx, sessionId) => {
			try {
				const source = ctx.get('workspaces');
				const list = source && source.list;
				const snapshot = list && typeof list.getSnapshot === 'function' ? list.getSnapshot() : undefined;
				if (snapshot && snapshot.phase === 'ready' && Array.isArray(snapshot.items)) {
					const item = snapshot.items.find((entry) => entry && Array.isArray(entry.sessionIds) && entry.sessionIds.includes(sessionId));
					if (item && typeof item.path === 'string' && item.path.length > 0) return 'cwd:' + item.path;
				}
			} catch { /* fall back to a per-session account */ }
			return 'session:' + (sessionId === undefined ? 'default' : sessionId);
		};

		const isAborted = (error) => typeof error === 'object' && error !== null && error.code === 'ERR_ABORTED';
		const errorText = (error) => (error instanceof Error ? error.message : typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : String(error ?? ''));

		/* ------------------------------------------------------------------ *
		 * Styles — theme tokens only, plugin-prefixed class names.
		 * ------------------------------------------------------------------ */

		const CSS = `
.wb-root{box-sizing:border-box;height:100%;min-height:0;padding-bottom:var(--dsh-composer-height,0px);position:relative;overflow:hidden;display:flex;flex-direction:column;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base)}
/* While the browser view is active it owns the whole view area: hide the chat
   composer (the shell's own overlay mechanism keeps it as an absolute overlay,
   otherwise). Only active with our root rendered, so chat is unaffected. */
[data-slot="conversation.session"]:has(.wb-root) ~ :has([data-slot="conversation.composer"]){display:none !important}
.wb-toolbar{flex:none;box-sizing:border-box;display:flex;align-items:center;gap:4px;height:38px;padding:5px 8px;border-bottom:.5px solid var(--dsw-alias-border-l3)}
.wb-tabs{flex:none;display:flex;align-items:flex-end;gap:4px;padding:6px 8px 0;overflow-x:auto;scrollbar-width:none}
.wb-tabs::-webkit-scrollbar{display:none}
.wb-tab{display:inline-flex;align-items:center;gap:4px;max-width:200px;min-width:0;height:26px;padding:0 4px 0 10px;border-radius:var(--dsw-radius-sm) var(--dsw-radius-sm) 0 0;background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l2);border-bottom:0;cursor:pointer;color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xxs-12);flex:none}
.wb-tabActive{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}
.wb-tabTitle{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px}
.wb-tabClose{flex:none;width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;padding:0;border:0;border-radius:3px;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer}
.wb-tabClose:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.wb-tabNew{width:24px;height:24px;flex:none;align-self:center}
.wb-tool{flex:none;width:28px;height:28px;display:inline-flex;justify-content:center;align-items:center;padding:0;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.wb-tool:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.wb-tool:disabled{color:var(--dsw-alias-label-quaternary);cursor:default}
.wb-addressbox{flex:auto;min-width:0;position:relative;display:flex;align-items:center}
.wb-address{box-sizing:border-box;width:100%;height:28px;color:var(--dsw-alias-label-primary);font:var(--dsw-font-xxs-12);background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);padding:0 34px 0 9px}
.wb-address:focus{outline:none;border-color:var(--dsw-alias-interactive-border-active)}
.wb-address::placeholder{color:var(--dsw-alias-label-tertiary)}
.wb-go{visibility:hidden;opacity:0;position:absolute;right:3px;transition:visibility .12s,opacity .12s}
.wb-addressbox:focus-within .wb-go{visibility:visible;opacity:1}
.wb-status{flex:none;box-sizing:border-box;padding:3px 10px;color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxs-12);border-bottom:.5px solid var(--dsw-alias-border-l3);text-align:center}
.wb-content{flex:auto;min-height:0;display:flex;flex-direction:column;position:relative}
.wb-viewport{flex:auto;min-width:0;min-height:0;display:flex;position:relative}
.wb-frame{position:absolute;inset:0;width:100%;height:100%;border:0;background:var(--dsw-alias-bg-layer-2)}
.wb-webview{-webkit-app-region:no-drag;border:0;flex:auto;width:100%;min-width:0;height:100%;min-height:0;display:flex}
.wb-error{position:absolute;inset:0;z-index:2;display:flex;flex-direction:column;gap:10px;align-items:center;justify-content:center;background:var(--dsw-alias-bg-base);padding:16px;text-align:center}
.wb-errorText{color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xxs-12);word-break:break-all;max-width:560px}
.wb-errorRow{display:flex;gap:4px}
.wb-hint{flex:none;box-sizing:border-box;padding:4px 10px;color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxs-12);border-top:.5px solid var(--dsw-alias-border-l3);text-align:center}
.wb-login{position:absolute;top:8px;right:8px;z-index:4;width:262px;box-sizing:border-box;display:flex;flex-direction:column;gap:6px;padding:10px;border-radius:10px;background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l2);box-shadow:0 8px 24px rgba(0,0,0,.28);color:var(--dsw-alias-label-primary);font:var(--dsw-font-xxs-12)}
.wb-loginRow{display:flex;align-items:center;gap:6px}
.wb-loginInput{box-sizing:border-box;width:100%;height:26px;padding:0 8px;border-radius:6px;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:var(--dsw-font-xxs-12)}
.wb-loginSave{height:26px;padding:0 12px;border:0;border-radius:6px;background:var(--dsw-alias-state-business-primary);color:#fff;cursor:pointer;font:var(--dsw-font-xxs-12)}
.wb-loginHint{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxs-12)}
.wb-busy{position:absolute;top:0;left:0;right:0;height:2px;overflow:hidden;pointer-events:none;z-index:3}
.wb-busy::after{content:'';position:absolute;top:0;height:100%;width:30%;border-radius:2px;background:var(--dsw-alias-interactive-border-active);animation:wb-slide 1.1s ease-in-out infinite}
@keyframes wb-slide{0%{left:-30%}100%{left:100%}}
`;

		/* ------------------------------------------------------------------ *
		 * Toolbar icons (current-color strokes)
		 * ------------------------------------------------------------------ */

		const svg = (width, height, children) => h('svg', {
			width, height, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true',
		}, children);

		const IconBack = () => svg(14, 14, h('path', { d: 'M9.5 3.5 5 8l4.5 4.5', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }));
		const IconForward = () => svg(14, 14, h('path', { d: 'm6.5 3.5 4.5 4.5-4.5 4.5', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }));
		const IconReload = () => svg(14, 14, h('path', { d: 'M13 8a5 5 0 1 1-1.5-3.6M13 1.8v2.9h-2.9', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }));
		const IconHome = () => svg(15, 15, h('path', { d: 'M2.5 7 8 2.5 13.5 7M4 6.4v6.1h8V6.4', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }));
		const IconExternal = () => svg(14, 14, h('path', { d: 'M6.5 3.5h-4v10h10v-4M9 2.5h4.5V7M13 3 7.5 8.5', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }));
		const IconStar = () => svg(15, 15, h('path', { d: 'M8 2 9.9 5.9l4.1.6-3 2.9.7 4.1L8 11.6l-3.7 1.9.7-4.1-3-2.9 4.1-.6z', stroke: 'currentColor', strokeWidth: 1.3, strokeLinejoin: 'round' }));
		const IconClose = () => svg(14, 14, h('path', { d: 'M4 4l8 8M12 4l-8 8', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }));
		const IconKey = () => svg(14, 14, [
			h('rect', { key: 'b', x: 3, y: 7, width: 10, height: 6, rx: 1.5, stroke: 'currentColor', strokeWidth: 1.4 }),
			h('path', { key: 'p', d: 'M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }),
		]);
		const IconPlus = () => svg(14, 14, h('path', { d: 'M8 3v10M3 8h10', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }));

		/* ------------------------------------------------------------------ *
		 * Browser conversation view — one "浏览器" tab beside 对话/轨迹.
		 * Desktop loads pages in a real Electron <webview> guest (the same
		 * dshDesktop bridge the shipped sidebar browser uses); plain web
		 * deployments fall back to a sandboxed iframe.
		 * ------------------------------------------------------------------ */

		const WEB_FRAME_SANDBOX = 'allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox';
		const ENGINE_TIMEOUT_MS = 4000;

		function BrowserView({ t: tProp, browserT, openView, viewRequest, completeViewRequest, browserSession, browserWorkspace }) {
			const sessionId = browserSession;
			// Storage account for the desktop partition (cwd:<workspace> when grouped).
			const partitionKey = typeof browserWorkspace === 'string' && browserWorkspace.length > 0
				? browserWorkspace
				: `session:${sessionId === undefined ? 'default' : sessionId}`;
			// Locale: prefer the t injected by this plugin's registration, fall back
			// to the framework's locale injection, finally to key passthrough.
			const t = typeof browserT === 'function' ? browserT : typeof tProp === 'function' ? tProp : (k) => k;
			// The desktop bridge is stable for the page lifetime; never re-resolve mid-mount.
			const bridgeRef = useRef(null);
			if (bridgeRef.current === null) bridgeRef.current = desktopBridge();
			const bridge = bridgeRef.current;

			// Carrier: real Electron guests when the desktop bridge exists,
			// otherwise a sandboxed iframe. A dead guest times out into the iframe.
			const [carrier, setCarrier] = useState(() => (bridge ? 'webview' : 'iframe'));
			const [status, setStatus] = useState(() => (bridge ? 'engine-starting' : 'ready'));

			// Auto-login preferences, editable from the toolbar lock button.
			// Open the panel on first run so the unconfigured state is obvious.
			const [loginOpen, setLoginOpen] = useState(() => readLogin().account === '');
			const [loginDraft, setLoginDraft] = useState(() => readLogin());

			const initialUrl = sessionPages.has(sessionId) ? sessionPages.get(sessionId) : readHome();

			// Committed page state (address bar reads page.url).
			const [page, setPage] = useState({ url: initialUrl, title: '', loading: true, canBack: false, canForward: false, error: undefined });
			// Address bar draft, plus iframe-carrier history and reload nonce.
			const [draft, setDraft] = useState(initialUrl);
			const [hist, setHist] = useState({ entries: [initialUrl], index: 0 });
			const [nonce, setNonce] = useState(0);

			// Tabs share the single webview; each tab remembers its own address.
			const restoredTabs = (() => {
				const saved = sessionId !== undefined ? sessionTabs.get(sessionId) : undefined;
				if (saved && Array.isArray(saved.tabs) && saved.tabs.length > 0) return saved;
				return { tabs: [{ id: 1, url: initialUrl, title: '' }], activeId: 1 };
			})();
			const [tabs, setTabs] = useState(restoredTabs.tabs);
			const [activeId, setActiveId] = useState(restoredTabs.activeId);
			const nextTabId = useRef(Math.max.apply(null, restoredTabs.tabs.map((tab) => tab.id)) + 1);

			const hostRef = useRef(null);
			const web = useRef({ element: null, ready: false, pending: initialUrl, firstDocument: true });

			// Address bar follows the committed URL.
			useEffect(() => { setDraft(page.url); }, [page.url]);

			// The active tab mirrors the live page; the tab list survives view switches.
			useEffect(() => {
				setTabs((list) => {
					let changed = false;
					const next = list.map((tab) => {
						if (tab.id !== activeId) return tab;
						if (tab.url === page.url && (tab.title === page.title || !page.title)) return tab;
						changed = true;
						return { ...tab, url: page.url, title: page.title || tab.title };
					});
					return changed ? next : list;
				});
			}, [page.url, page.title, activeId]);
			useEffect(() => {
				if (sessionId !== undefined) sessionTabs.set(sessionId, { tabs, activeId });
			}, [tabs, activeId, sessionId]);

			// Nothing sends focus requests to this view; clear any that lands here.
			// The dispatch passes `null` when no request is pending.
			useEffect(() => {
				if (viewRequest !== null && viewRequest !== undefined && viewRequest.view === 'web-browser' && typeof completeViewRequest === 'function') completeViewRequest();
			}, [viewRequest, completeViewRequest]);

			const load = useCallback((target) => {
				if (target === null || target === undefined) return;
				sessionPages.set(sessionId, target);
				setPage((p) => ({ ...p, url: target, loading: true, error: undefined }));
				if (carrier !== 'webview') {
					setHist((s) => {
						if (s.entries[s.index] === target) return s;
						return { entries: [...s.entries.slice(0, s.index + 1), target], index: s.index + 1 };
					});
					return;
				}
				const w = web.current;
				if (w.ready && w.element) {
					try {
						w.element.loadURL(target).catch((error) => {
							if (!isAborted(error)) setPage((p) => ({ ...p, loading: false, error: errorText(error) }));
						});
					} catch (error) {
						setPage((p) => ({ ...p, loading: false, error: errorText(error) }));
					}
				} else w.pending = target;
			}, [carrier, sessionId]);

			// Desktop guest lifecycle: acquire a partition lease, attach the
			// <webview>, mirror its navigation state into React, release on unmount.
			useEffect(() => {
				if (carrier !== 'webview' || !bridge) return undefined;
				let disposed = false;
				let lease;
				let unsubscribeOpen = () => {};
				let readyTimer;
				// Auto-login bookkeeping: at most two attempts per visited URL.
				const autoLoginState = { lastUrl: '', attempts: 0, timers: [] };
				const clearAutoTimers = () => {
					for (const id of autoLoginState.timers) window.clearTimeout(id);
					autoLoginState.timers.length = 0;
				};
				const failEngine = (reason) => {
					if (disposed) return;
					diag('engine-timeout', { reason, sessionId });
					setStatus('engine-failed');
					setCarrier('iframe');
				};
				readyTimer = window.setTimeout(() => { if (!web.current.ready) failEngine('no dom-ready'); }, ENGINE_TIMEOUT_MS);
				const sync = (wv) => {
					if (disposed || web.current.element !== wv) return;
					let url = ''; let title = ''; let loading = false; let canBack = false; let canForward = false;
					try {
						url = wv.getURL();
						title = wv.getTitle();
						loading = wv.isLoading();
						canBack = wv.canGoBack();
						canForward = wv.canGoForward();
					} catch { return; }
					const known = /^https?:/i.test(url);
					if (known && web.current.firstDocument) {
						web.current.firstDocument = false;
						try { wv.clearHistory(); } catch { /* benign */ }
					}
					setPage((p) => ({ ...p, loading, canBack, canForward, title: title || p.title, ...(known ? { url } : {}) }));
					if (known) sessionPages.set(sessionId, url);
				};
				diag('guest-mount', {
					sessionId: String(sessionId),
					bridge: true,
					webviewTag: webviewAvailable(),
					host: hostRef.current === null ? 'missing' : `${hostRef.current.clientWidth}x${hostRef.current.clientHeight}`,
				});
				// Storage-account key follows the shipped browser's format
				// (`cwd:<path>` / `session:<id>`); unknown prefixes may be refused.
				bridge.acquire(partitionKey).then((reservation) => {
					diag('acquire-ok', { lease: reservation && reservation.lease ? 'yes' : 'no', partition: reservation && reservation.partition ? 'yes' : 'no' });
					if (disposed) { bridge.release(reservation.lease).catch(() => {}); return; }
					lease = reservation.lease;
					const wv = document.createElement('webview');
					if (typeof wv.loadURL !== 'function') {
						diag('webview-element-unsupported');
						failEngine('webview element unsupported');
						return;
					}
					wv.className = 'wb-webview';
					wv.setAttribute('name', reservation.lease);
					wv.setAttribute('partition', reservation.partition);
					wv.setAttribute('allowpopups', '');
					// A plain Chrome UA keeps DeepSeek's environment banner away.
					wv.setAttribute('useragent', chromeUserAgent());
					wv.setAttribute('src', `about:blank#${reservation.lease}`);
					// Auto-login: fill and submit the password form inside the guest.
					// Credentials never leave this process (they travel as a script
					// string executed in the guest's own page context).
					const tryAutoLogin = () => {
						if (disposed || web.current.element !== wv) return;
						const login = readLogin();
						if (!login.enabled || !login.account) return;
						if (typeof wv.executeJavaScript !== 'function') { diag('auto-login-unsupported'); return; }
						let url = '';
						try { url = wv.getURL(); } catch { return; }
						let host = '';
						try { host = new URL(url).hostname; } catch { return; }
						if (host !== 'chat.deepseek.com') return;
						if (autoLoginState.lastUrl !== url) { autoLoginState.lastUrl = url; autoLoginState.attempts = 0; }
						if (autoLoginState.attempts >= 2) return;
						autoLoginState.attempts += 1;
						wv.executeJavaScript(buildLoginScript(login.account, login.password)).then((result) => {
							diag('auto-login', { result: String(result).slice(0, 300) });
						}).catch((error) => {
							diag('auto-login-failed', { error: errorText(error).slice(0, 200) });
						});
					};
					const scheduleAutoLogin = () => {
						clearAutoTimers();
						if (disposed) return;
						autoLoginState.timers.push(window.setTimeout(tryAutoLogin, 800));
						autoLoginState.timers.push(window.setTimeout(tryAutoLogin, 2600));
					};
					wv.addEventListener('dom-ready', () => {
						if (disposed || web.current.element !== wv) return;
						window.clearTimeout(readyTimer);
						web.current.ready = true;
						setStatus('ready');
						diag('dom-ready', { size: `${wv.clientWidth}x${wv.clientHeight}` });
						const pending = web.current.pending;
						web.current.pending = undefined;
						if (pending !== undefined) {
							diag('load', { url: String(pending).slice(0, 120) });
							// Defer one tick: the main process validates the lease against
							// the guest's still-`about:blank#<lease>` URL on dom-ready; a
							// same-tick navigation could race that check.
							window.setTimeout(() => {
								if (disposed || web.current.element !== wv) return;
								wv.loadURL(pending).catch((error) => {
									if (!isAborted(error)) {
										diag('load-rejected', { error: errorText(error).slice(0, 200) });
										setPage((p) => ({ ...p, loading: false, error: errorText(error) }));
									}
								});
							}, 16);
						} else sync(wv);
					});
					for (const name of ['did-navigate', 'did-start-loading', 'did-stop-loading', 'page-title-updated']) {
						wv.addEventListener(name, () => sync(wv));
					}
					wv.addEventListener('did-navigate-in-page', (event) => { if (event.isMainFrame) sync(wv); });
					const injectDismisser = () => {
						if (disposed || web.current.element !== wv) return;
						if (typeof wv.executeJavaScript !== 'function') return;
						let url = '';
						try { url = wv.getURL(); } catch { return; }
						if (!/^https:\/\/chat\.deepseek\.com\//i.test(url)) return;
						wv.executeJavaScript(buildDismissScript()).then((result) => {
							diag('dismisser', { result: String(result).slice(0, 160) });
						}).catch(() => {});
					};
					wv.addEventListener('did-navigate', () => { injectDismisser(); scheduleAutoLogin(); });
					wv.addEventListener('did-stop-loading', () => { injectDismisser(); scheduleAutoLogin(); });
					wv.addEventListener('did-navigate-in-page', (event) => { if (event.isMainFrame) { injectDismisser(); scheduleAutoLogin(); } });
					wv.addEventListener('did-start-navigation', (event) => {
						if (!event.isMainFrame || disposed) return;
						setPage((p) => (p.loading ? p : { ...p, loading: true, error: undefined }));
					});
					wv.addEventListener('did-fail-load', (event) => {
						if (!event.isMainFrame || event.errorCode === -3) return;
						diag('did-fail-load', { code: event.errorCode, description: String(event.errorDescription || '').slice(0, 120) });
						setPage((p) => ({ ...p, loading: false, error: `${event.errorDescription || ''} (${event.errorCode})`.trim() }));
						sync(wv);
					});
					wv.addEventListener('destroyed', () => {
						diag('guest-destroyed');
						if (web.current.element === wv) {
							web.current.element = null;
							web.current.ready = false;
							web.current.pending = sessionPages.get(sessionId) || readHome();
						}
						wv.remove();
						setPage((p) => ({ ...p, loading: false, canBack: false, canForward: false, error: 'webview guest destroyed' }));
					});
					unsubscribeOpen = bridge.onOpenRequested(reservation.lease, (url) => {
						if (disposed || web.current.element !== wv) return;
						const target = resolveInput(url);
						if (target !== null) load(target); // open popups in place
					});
					// Attach as soon as the viewport ref is committed (it normally is
					// before this asynchronous callback, but retry briefly if not).
					let attachAttempts = 0;
					const attach = () => {
						if (disposed) return;
						const host = hostRef.current;
						if (host !== null) {
							host.append(wv);
							web.current.element = wv;
							web.current.firstDocument = true;
							return;
						}
						if (attachAttempts < 20) {
							attachAttempts += 1;
							window.setTimeout(attach, 50);
						}
					};
					attach();
				}).catch((error) => {
					diag('acquire-rejected', { error: errorText(error).slice(0, 200) });
					setPage((p) => ({ ...p, loading: false, error: errorText(error) }));
				});
				return () => {
					disposed = true;
					window.clearTimeout(readyTimer);
					clearAutoTimers();
					unsubscribeOpen();
					if (web.current.element !== null) web.current.element.remove();
					web.current.element = null;
					web.current.ready = false;
					web.current.firstDocument = true;
					web.current.pending = sessionPages.has(sessionId) ? sessionPages.get(sessionId) : readHome();
					if (lease !== undefined) bridge.release(lease).catch(() => {});
				};
			}, [carrier, bridge, sessionId, load]);

			// Iframe carrier: the frame element remounts when the target or nonce changes.
			useEffect(() => {
				if (carrier === 'webview' && bridge) return;
				const url = hist.entries[hist.index];
				setPage((p) => (p.url === url ? p : { ...p, url, loading: true, error: undefined }));
				sessionPages.set(sessionId, url);
			}, [hist, carrier, bridge, sessionId]);

			// Headless views (tab switched away) unmount; nothing to persist beyond
			// the module-level session page map already maintained on navigation.

			const isWebview = carrier === 'webview' && bridge !== undefined;
			const canBack = isWebview ? page.canBack : hist.index > 0;
			const canForward = isWebview ? page.canForward : hist.index < hist.entries.length - 1;

			const goBack = useCallback(() => {
				if (!isWebview) { setHist((s) => (s.index > 0 ? { ...s, index: s.index - 1 } : s)); return; }
				const w = web.current;
				if (w.ready && w.element && w.element.canGoBack()) {
					try { w.element.goBack(); } catch { /* guest gone */ }
				}
			}, [isWebview]);

			const goForward = useCallback(() => {
				if (!isWebview) { setHist((s) => (s.index < s.entries.length - 1 ? { ...s, index: s.index + 1 } : s)); return; }
				const w = web.current;
				if (w.ready && w.element && w.element.canGoForward()) {
					try { w.element.goForward(); } catch { /* guest gone */ }
				}
			}, [isWebview]);

			const reload = useCallback(() => {
				if (!isWebview) { setNonce((n) => n + 1); return; }
				const w = web.current;
				if (w.ready && w.element) {
					try { const r = w.element.reload(); if (r && typeof r.catch === 'function') r.catch(() => {}); return; } catch { /* guest gone */ }
				}
				load(page.url);
			}, [isWebview, load, page.url]);

			const submit = useCallback((event) => {
				event.preventDefault();
				const target = resolveInput(draft);
				if (target !== null) load(target);
			}, [draft, load]);

			const openExternal = useCallback(() => {
				if (/^https?:\/\//i.test(page.url)) window.open(page.url, '_blank', 'noopener,noreferrer');
			}, [page.url]);

			const closeView = useCallback(() => {
				if (typeof openView === 'function') openView('chat');
			}, [openView]);

			// ---- tabs ---------------------------------------------------------
			const shortUrl = (url) => {
				try { const parsed = new URL(url); return parsed.hostname.replace(/^www\./, '') || String(url || ''); } catch { return String(url || ''); }
			};
			const tabLabel = (tab) => tab.title || shortUrl(tab.url);
			const activateTab = (id) => {
				if (id === activeId) return;
				const tab = tabs.find((item) => item.id === id);
				if (!tab) return;
				setActiveId(id);
				if (tab.url !== page.url) load(tab.url);
			};
			const addTab = () => {
				const id = nextTabId.current++;
				const url = readHome();
				setTabs((list) => [...list, { id, url, title: '' }]);
				setActiveId(id);
				load(url);
			};
			const closeTab = (id) => {
				const index = tabs.findIndex((item) => item.id === id);
				if (index < 0) return;
				const rest = tabs.filter((item) => item.id !== id);
				if (rest.length === 0) {
					const replacementId = nextTabId.current++;
					const url = readHome();
					setTabs([{ id: replacementId, url, title: '' }]);
					setActiveId(replacementId);
					load(url);
					return;
				}
				setTabs(rest);
				if (activeId === id) {
					const next = rest[Math.max(0, index - 1)] || rest[0];
					setActiveId(next.id);
					load(next.url);
				}
			};

			const statusText = status === 'engine-starting' ? t('engine.starting') : status === 'engine-failed' ? t('engine.failed') : undefined;

			// `data-conversation-composer-overlay` is what makes the conversation
			// shell bound the view area (`flex:1 1 0; min-height:0; overflow:hidden`)
			// instead of letting content size it — without it, height:100% below
			// collapses and the browser body stays blank.
			return h('div', { className: 'wb-root', 'data-conversation-composer-overlay': '' },
				h('div', { className: 'wb-tabs', role: 'tablist' },
					tabs.map((tab) => h('div', {
						key: tab.id,
						className: 'wb-tab' + (tab.id === activeId ? ' wb-tabActive' : ''),
						title: tab.title || tab.url,
						role: 'tab',
						'aria-selected': tab.id === activeId ? 'true' : 'false',
						tabIndex: 0,
						onClick: () => activateTab(tab.id),
					},
						h('span', { className: 'wb-tabTitle' }, tabLabel(tab)),
						h('button', {
							type: 'button', className: 'wb-tabClose',
							'aria-label': t('tab.close'), title: t('tab.close'),
							onClick: (event) => { event.stopPropagation(); closeTab(tab.id); },
						}, h(IconClose)),
					)),
					h('button', {
						type: 'button', className: 'wb-tool wb-tabNew',
						'aria-label': t('tab.new'), title: t('tab.new'),
						onClick: addTab,
					}, h(IconPlus)),
				),
				h('form', { className: 'wb-toolbar', onSubmit: submit },
					h('button', { type: 'button', className: 'wb-tool', 'aria-label': t('back'), title: t('back'), disabled: !canBack, onClick: goBack }, h(IconBack)),
					h('button', { type: 'button', className: 'wb-tool', 'aria-label': t('forward'), title: t('forward'), disabled: !canForward, onClick: goForward }, h(IconForward)),
					h('button', { type: 'button', className: 'wb-tool', 'aria-label': t('reload'), title: t('reload'), onClick: reload }, h(IconReload)),
					h('button', { type: 'button', className: 'wb-tool', 'aria-label': t('home'), title: t('home'), onClick: () => load(readHome()) }, h(IconHome)),
					h('div', { className: 'wb-addressbox' },
						h('input', {
							className: 'wb-address', value: draft,
							'aria-label': t('address.placeholder'), placeholder: t('address.placeholder'),
							spellCheck: false, autoComplete: 'off',
							onChange: (e) => setDraft(e.currentTarget.value),
						}),
						h('button', { type: 'submit', className: 'wb-tool wb-go', 'aria-label': t('go'), title: t('go') }, h(IconForward)),
					),
					h('button', {
						type: 'button', className: 'wb-tool',
						'aria-label': t('set-home'), title: t('set-home'),
						onClick: () => { writeHome(page.url); },
					}, h(IconStar)),
					h('button', {
						type: 'button', className: 'wb-tool',
						'aria-label': t('open-external'), title: t('open-external'),
						onClick: openExternal,
					}, h(IconExternal)),
					h('button', {
						type: 'button', className: 'wb-tool',
						'aria-label': t('auto-login'), title: t('auto-login'),
						onClick: () => setLoginOpen((open) => !open),
					}, h(IconKey)),
					h('button', {
						type: 'button', className: 'wb-tool',
						'aria-label': t('close'), title: t('close'),
						onClick: closeView,
					}, h(IconClose)),
				),
				statusText !== undefined && h('div', { className: 'wb-status' }, statusText),
				h('div', { className: 'wb-content' },
					loginOpen && h('div', { className: 'wb-login' },
						h('label', { className: 'wb-loginRow' },
							h('input', {
								type: 'checkbox', checked: loginDraft.enabled,
								onChange: (e) => { const enabled = e.currentTarget.checked; setLoginDraft((d) => ({ ...d, enabled })); },
							}),
							h('span', {}, t('auto-login.enabled')),
						),
						h('input', {
							className: 'wb-loginInput', value: loginDraft.account,
							placeholder: t('auto-login.account'), spellCheck: false, autoComplete: 'off',
							onChange: (e) => { const account = e.currentTarget.value; setLoginDraft((d) => ({ ...d, account })); },
						}),
						h('input', {
							className: 'wb-loginInput', type: 'password', value: loginDraft.password,
							placeholder: t('auto-login.password'), autoComplete: 'off',
							onChange: (e) => { const password = e.currentTarget.value; setLoginDraft((d) => ({ ...d, password })); },
						}),
						h('div', { className: 'wb-loginRow' },
							h('button', {
								type: 'button', className: 'wb-loginSave',
								onClick: () => { writeLogin(loginDraft); setLoginOpen(false); diag('login-saved'); },
							}, t('auto-login.save')),
							h('span', { className: 'wb-loginHint' }, t('auto-login.hint')),
						),
					),
					h('div', { className: 'wb-viewport', ref: hostRef },
						page.loading && h('div', { className: 'wb-busy' }),
						!isWebview && h('iframe', {
							key: `${page.url}#${nonce}`,
							className: 'wb-frame',
							src: page.url,
							title: t('view'),
							sandbox: WEB_FRAME_SANDBOX,
							referrerPolicy: 'no-referrer',
							onLoad: () => setPage((p) => (p.loading ? { ...p, loading: false } : p)),
						}),
					),
					page.error !== undefined && h('div', { className: 'wb-error' },
						h('span', { className: 'wb-errorText' }, t('error.load') + (page.error ? ` · ${page.error}` : '')),
						h('div', { className: 'wb-errorRow' },
							h('button', { type: 'button', className: 'wb-tool', 'aria-label': t('reload'), title: t('reload'), onClick: reload }, h(IconReload)),
							h('button', { type: 'button', className: 'wb-tool', 'aria-label': t('open-external'), title: t('open-external'), onClick: openExternal }, h(IconExternal)),
						),
					),
					!isWebview && h('div', { className: 'wb-hint' }, t('hint.embed')),
				),
			);
		}

		/* ------------------------------------------------------------------ *
		 * Plugin registration
		 * ------------------------------------------------------------------ */

		return {
			inject: ['slots', 'locale'],
			apply(ctx) {
				ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'web-browser: dictionaries');
				const t = ctx.locale.bind(NS);

				// Package-owned stylesheet, removed on unload.
				ctx.effect(() => {
					const tag = document.createElement('style');
					tag.dataset.plugin = '@local/dsh-web-browser';
					tag.textContent = CSS;
					document.head.append(tag);
					return () => { tag.remove(); };
				}, 'web-browser: styles');

				// The browser lives as a Conversation View: one "浏览器" tab beside
				// 对话/轨迹, rendered in the view area below the tab row. The shell
				// owns switching, so the close button returns to the Chat view.
				ctx.slots.inject('conversation.view', () => ctx.slots.register({
					name: 'conversation.view',
					id: 'web-browser',
					order: 20,
					locale: NS,
					label: () => t('view'),
					inject: (sessionId) => ({
						browserSession: sessionId,
						browserT: t,
						browserWorkspace: workspaceKeyFor(ctx, sessionId),
					}),
				}, BrowserView));
			},
		};
	},
});
