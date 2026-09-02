const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const firstSaveImagePng = (history, promptId) => {
  const outputs = history[promptId]?.outputs ?? {};
  for (const output of Object.values(outputs)) {
    for (const image of output.images ?? []) {
      if (String(image.filename).toLowerCase().endsWith(".png")) return image;
    }
  }
  return null;
};

export function createComfyClient({
  baseUrl,
  pollMilliseconds = 500,
  timeoutMilliseconds = 300000,
  fetchImpl = fetch,
}) {
  const origin = baseUrl.replace(/\/$/, "");

  async function health() {
    const response = await fetchImpl(`${origin}/system_stats`);
    if (!response.ok) throw new Error(`ComfyUI health failed (${response.status})`);
    return response.json();
  }

  async function uploadImage(bytes, fileName) {
    const form = new FormData();
    form.append("image", new Blob([bytes], { type: "image/png" }), fileName);
    form.append("subfolder", "chatnft");
    form.append("type", "input");
    const response = await fetchImpl(`${origin}/upload/image`, { method: "POST", body: form });
    if (!response.ok) throw new Error(`ComfyUI upload failed (${response.status})`);
    const uploaded = await response.json();
    return uploaded.subfolder ? `${uploaded.subfolder}/${uploaded.name}` : uploaded.name;
  }

  async function queue(graph) {
    const response = await fetchImpl(`${origin}/prompt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: graph }),
    });
    if (!response.ok) throw new Error(`ComfyUI queue failed (${response.status})`);
    const queued = await response.json();
    return queued.prompt_id;
  }

  async function waitForOutput(promptId) {
    const deadline = Date.now() + timeoutMilliseconds;
    while (Date.now() <= deadline) {
      const response = await fetchImpl(`${origin}/history/${encodeURIComponent(promptId)}`);
      if (!response.ok) throw new Error(`ComfyUI history failed (${response.status})`);
      const image = firstSaveImagePng(await response.json(), promptId);
      if (image) return image;

      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await delay(Math.min(pollMilliseconds, remaining));
    }
    throw new Error(`ComfyUI generation timed out after ${timeoutMilliseconds} ms`);
  }

  async function fetchOutput(imageRecord) {
    const query = new URLSearchParams({
      filename: imageRecord.filename,
      subfolder: imageRecord.subfolder ?? "",
      type: imageRecord.type ?? "output",
    });
    const response = await fetchImpl(`${origin}/view?${query}`);
    if (!response.ok) throw new Error(`ComfyUI output fetch failed (${response.status})`);
    return response.arrayBuffer();
  }

  return { health, uploadImage, queue, waitForOutput, fetchOutput };
}
