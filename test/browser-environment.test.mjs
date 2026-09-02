import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

test("bypasses cloud sign-in only for exact loopback hosts", async () => {
  let source = "";
  try {
    source = await readFile(new URL("../browser-environment.js", import.meta.url), "utf8");
  } catch {}
  assert.ok(source, "browser environment policy is missing");

  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: "browser-environment.js" });
  const { requiresCloudSignIn } = sandbox.window.ChatNftEnvironment;

  assert.equal(requiresCloudSignIn("localhost", null), false);
  assert.equal(requiresCloudSignIn("LOCALHOST", null), false);
  assert.equal(requiresCloudSignIn("127.0.0.1", null), false);
  assert.equal(requiresCloudSignIn("localhost.evil.example", null), true);
  assert.equal(requiresCloudSignIn("127.0.0.2", null), true);
  assert.equal(requiresCloudSignIn("pixelbench.vercel.app", null), true);
  assert.equal(requiresCloudSignIn("pixelbench.vercel.app", { id: "user-1" }), false);
});

test("uses the environment policy to gate the hosted app", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /<script src="\.\/browser-environment\.js"><\/script>/);
  assert.match(html, /gateShow\(ChatNftEnvironment\.requiresCloudSignIn\(location\.hostname,u\)\)/);
});
