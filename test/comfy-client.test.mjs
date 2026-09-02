import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createComfyClient } from "../server/comfy-client.mjs";

const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

test("uses ComfyUI HTTP routes to upload, queue, poll its prompt, and fetch the first PNG", async (t) => {
  const requests = [];
  let historyCalls = 0;
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    requests.push({ method: request.method, url: request.url, body, headers: request.headers });

    if (request.method === "GET" && request.url === "/system_stats") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ system: { comfyui_version: "0.34.2" } }));
      return;
    }
    if (request.method === "POST" && request.url === "/upload/image") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ name: "request-1.png", subfolder: "chatnft", type: "input" }));
      return;
    }
    if (request.method === "POST" && request.url === "/prompt") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ prompt_id: "prompt-1" }));
      return;
    }
    if (request.method === "GET" && request.url === "/history/prompt-1") {
      historyCalls += 1;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(historyCalls === 1 ? {} : {
        "prompt-1": {
          outputs: {
            "3": {
              images: [
                { filename: "preview.png", subfolder: "chatnft", type: "output" },
              ],
            },
            "9": {
              images: [
                { filename: "result.png", subfolder: "chatnft", type: "output" },
                { filename: "second.png", subfolder: "chatnft", type: "output" },
              ],
            },
          },
        },
      }));
      return;
    }
    if (request.method === "GET" && request.url === "/view?filename=result.png&subfolder=chatnft&type=output") {
      response.setHeader("content-type", "image/png");
      response.end(fakePng);
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  const { port } = server.address();
  const client = createComfyClient({
    baseUrl: `http://127.0.0.1:${port}`,
    pollMilliseconds: 1,
    timeoutMilliseconds: 1000,
  });

  assert.deepEqual(await client.health(), { system: { comfyui_version: "0.34.2" } });
  assert.equal(await client.uploadImage(fakePng, "request-1.png"), "chatnft/request-1.png");
  assert.equal(await client.queue({ "9": { class_type: "SaveImage", inputs: {} } }), "prompt-1");
  assert.deepEqual(
    await client.waitForOutput("prompt-1"),
    { filename: "result.png", subfolder: "chatnft", type: "output" },
  );
  assert.deepEqual(Buffer.from(await client.fetchOutput({ filename: "result.png", subfolder: "chatnft", type: "output" })), fakePng);

  assert.equal(historyCalls, 2);
  const upload = requests.find((entry) => entry.url === "/upload/image");
  assert.match(upload.headers["content-type"], /^multipart\/form-data; boundary=/);
  assert.match(upload.body.toString("utf8"), /name="image"; filename="request-1.png"/);
  assert.match(upload.body.toString("utf8"), /name="subfolder"\r\n\r\nchatnft/);
  assert.match(upload.body.toString("utf8"), /name="type"\r\n\r\ninput/);
  assert.deepEqual(
    requests.map((entry) => `${entry.method} ${entry.url}`),
    [
      "GET /system_stats",
      "POST /upload/image",
      "POST /prompt",
      "GET /history/prompt-1",
      "GET /history/prompt-1",
      "GET /view?filename=result.png&subfolder=chatnft&type=output",
    ],
  );
});

test("aborts a hanging ComfyUI history fetch at the configured timeout", async () => {
  let observedSignal;
  const client = createComfyClient({
    baseUrl: "http://127.0.0.1:8188",
    pollMilliseconds: 1,
    timeoutMilliseconds: 30,
    fetchImpl: async (_url, options = {}) => {
      observedSignal = options.signal;
      return new Promise((resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
      });
    },
  });

  const started = Date.now();
  await assert.rejects(client.waitForOutput("hung-prompt"), /timed out after 30 ms/);
  assert.ok(Date.now() - started < 500, "timeout did not bound the hanging fetch");
  assert.equal(observedSignal?.aborted, true);
});

test("aborts a hanging ComfyUI response body read at the configured timeout", async () => {
  let observedSignal;
  const client = createComfyClient({
    baseUrl: "http://127.0.0.1:8188",
    timeoutMilliseconds: 30,
    fetchImpl: async (_url, options = {}) => {
      observedSignal = options.signal;
      return {
        ok: true,
        json: () => new Promise((resolve, reject) => {
          options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
        }),
      };
    },
  });

  await assert.rejects(client.waitForOutput("hung-body"), /timed out after 30 ms/);
  assert.equal(observedSignal?.aborted, true);
});
