/* ==========================================================================
   أدوات اختبار مشتركة: بيئة DOM صغيرة جوه نود (vm)
   --------------------------------------------------------------------------
   الغرض إننا نختبر ملفات الواجهة من غير متصفح. مش بديل عن متصفح حقيقي،
   بس بيثبت إن الصفحة بتاخد بياناتها من الخدمة ومش بتخترع أرقام.
   ========================================================================== */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
export const JS_DIR = path.join(dir, "..", "assets", "js");
export const PAGE_DIR = path.join(dir, "..");

export const src = (f) => fs.readFileSync(path.join(JS_DIR, f), "utf8");
export const page = (f) => fs.readFileSync(path.join(PAGE_DIR, f), "utf8");

/* بنشيل التعليقات عشان التحذيرات المكتوبة بصيغة الممنوع ما تفشّلش الفحوصات. */
export function codeOnly(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .toLowerCase();
}

export function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear()
  };
}

export function fakeNode(sel) {
  return {
    sel,
    textContent: "",
    innerHTML: "",
    disabled: false,
    _attrs: {},
    listeners: [],
    setAttribute(k, v) { this._attrs[k] = v; },
    getAttribute(k) { return this._attrs[k] === undefined ? null : this._attrs[k]; },
    closest(sel) {
      const m = /^\[([a-z-]+)\]$/i.exec(sel);
      return m && this._attrs[m[1]] !== undefined ? this : null;
    },
    addEventListener(type, fn) { this.listeners.push({ type, fn }); },
    click() { this.listeners.forEach((l) => { if (l.type === "click") l.fn({ target: this }); }); }
  };
}

/* بيبني بيئة فيها document و location و fetch مزيّفين.
   opts: { search, api:{baseUrl}, fetch, session } */
export function makeDom(opts = {}) {
  const nodes = {};
  const calls = [];
  const byId = {};

  function node(sel) { if (!nodes[sel]) nodes[sel] = fakeNode(sel); return nodes[sel]; }

  const root = fakeNode("#domain-app");
  root.querySelector = (sel) => node(sel);
  root.querySelectorAll = (sel) => {
    if (!nodes[sel + "#all"]) {
      nodes[sel + "#all"] = [fakeNode(sel), fakeNode(sel)];
    }
    return nodes[sel + "#all"];
  };
  byId["domain-app"] = root;

  const document = {
    getElementById: (id) => byId[id] || null,
    querySelector: (sel) => node(sel),
    querySelectorAll: (sel) => [node(sel)]
  };

  const sandbox = {
    console,
    Promise, JSON, Error, Object, Array, String, Number, Boolean, RegExp, Date, Math,
    URLSearchParams,
    encodeURIComponent, decodeURIComponent,
    setTimeout, clearTimeout,
    location: { search: opts.search || "", href: "https://domains.example/domain.html" + (opts.search || "") },
    document,
    localStorage: opts.localStorage || makeStorage(),
    MIGO_API: opts.api || { baseUrl: "" },
    MigoAuth: { session: () => opts.session || null },
    fetch: (url, init) => {
      calls.push({ url, init });
      const fn = opts.fetch || (() => Promise.reject(new Error("no fetch")));
      return Promise.resolve(fn(url, init));
    }
  };
  sandbox.window = sandbox;

  const ctx = vm.createContext(sandbox);
  ctx.__nodes = nodes;
  ctx.__calls = calls;
  ctx.__root = root;
  /* ضغطة بزر: بتوصل للزر نفسه وللحاوية، زي ما بيحصل في المتصفح (bubbling). */
  ctx.__click = (target) => {
    const n = typeof target === "string" ? node(target) : target;
    n.listeners.filter((l) => l.type === "click").forEach((l) => l.fn({ target: n }));
    root.listeners.filter((l) => l.type === "click").forEach((l) => l.fn({ target: n }));
  };
  return ctx;
}

export function load(ctx, file) {
  vm.runInContext(src(file), ctx, { filename: file });
  return ctx;
}

export function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body))
  };
}

/* جولة على microtasks عشان وعود الصفحة تخلص */
export const settle = (times = 6) => {
  let p = Promise.resolve();
  for (let i = 0; i < times; i++) p = p.then(() => new Promise((r) => setTimeout(r, 0)));
  return p;
};
