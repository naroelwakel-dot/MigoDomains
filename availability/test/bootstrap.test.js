import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBootstrap, serverForTld, buildRdapUrl, tldOf } from "../lib/bootstrap.js";

const doc = {
  services: [
    [["com", "net"], ["https://rdap.verisign.com/com/v1/"]],
    [["eg"], ["https://rdap.registry.eg/rdap/"]],
    [["bad"], []],
  ],
};

test("parseBootstrap يبني خريطة tld → base URL", () => {
  const map = parseBootstrap(doc);
  assert.equal(map.get("com"), "https://rdap.verisign.com/com/v1/");
  assert.equal(map.get("net"), "https://rdap.verisign.com/com/v1/");
  assert.equal(map.get("eg"), "https://rdap.registry.eg/rdap/");
  assert.equal(map.has("bad"), false, "خدمة بدون URLs تتجاهل");
});

test("parseBootstrap يرمي على مستند غير صالح", () => {
  assert.throws(() => parseBootstrap({}), /services/);
  assert.throws(() => parseBootstrap({ services: [] }), /امتدادات/);
});

test("parseBootstrap يضيف الشرطة المائلة لو ناقصة", () => {
  const map = parseBootstrap({ services: [[["xyz"], ["https://rdap.example/v1"]]] });
  assert.equal(map.get("xyz"), "https://rdap.example/v1/");
});

test("serverForTld غير حساس لحالة الأحرف", () => {
  const map = parseBootstrap(doc);
  assert.equal(serverForTld(map, "COM"), "https://rdap.verisign.com/com/v1/");
  assert.equal(serverForTld(map, "unknown"), null);
});

test("buildRdapUrl يبني الرابط ويشفّر الاسم", () => {
  assert.equal(buildRdapUrl("https://rdap.example/v1/", "My-Shop.COM"), "https://rdap.example/v1/domain/my-shop.com");
});

test("tldOf يستخرج الامتداد ويعالج الامتدادات المركبة", () => {
  assert.equal(tldOf("shop.eg"), "eg");
  assert.equal(tldOf("shop.com.eg"), "com.eg");
  assert.equal(tldOf("nope"), null);
});
