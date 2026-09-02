import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadContract } from "../server/contract.mjs";
import { composePrompt, materializeWorkflow } from "../server/workflow.mjs";

test("materializes the saved workflow without changing its template", async () => {
  const contract = await loadContract();
  const template = JSON.parse(await readFile(contract.workflowPath, "utf8"));
  const before = JSON.stringify(template);
  const prompt = composePrompt(contract.instructions, "Remove the small white dot outside the hat.");
  const graph = materializeWorkflow(template, {
    inputName: "chatnft/request-1.png",
    prompt,
    requestId: "request-1",
    seed: 12345,
    config: contract.config,
  });

  assert.equal(JSON.stringify(template), before);
  assert.equal(graph["1"].inputs.image, "chatnft/request-1.png");
  assert.equal(graph["27"].inputs.text, prompt);
  assert.equal(graph["3"].inputs.seed, 12345);
  assert.equal(graph["3"].inputs.denoise, 0.25);
  assert.equal(graph["9"].inputs.filename_prefix, "ChatNFT/request-1");
  assert.match(prompt, /User request:\nRemove the small white dot outside the hat\./);
});
