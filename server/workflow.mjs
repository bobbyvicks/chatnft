export function composePrompt(instructions, userInstruction) {
  const request = String(userInstruction || "Faithful cleanup only.").trim().slice(0, 2000);
  return `${instructions.trim()}\n\nUser request:\n${request}`;
}

export function materializeWorkflow(template, request) {
  const graph = structuredClone(template);
  graph["1"].inputs.image = request.inputName;
  graph["27"].inputs.text = request.prompt;
  graph["3"].inputs.seed = request.seed;
  graph["3"].inputs.steps = request.config.comfy.steps;
  graph["3"].inputs.cfg = request.config.comfy.cfg;
  graph["3"].inputs.denoise = request.config.comfy.denoise;
  graph["3"].inputs.sampler_name = request.config.comfy.sampler;
  graph["3"].inputs.scheduler = request.config.comfy.scheduler;
  graph["9"].inputs.filename_prefix = `ChatNFT/${request.requestId}`;
  return graph;
}
