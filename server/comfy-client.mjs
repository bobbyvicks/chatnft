const delay = (milliseconds, signal) => new Promise((resolve, reject) => {
  const finish = () => {
    signal.removeEventListener("abort", abort);
    resolve();
  };
  const timer = setTimeout(finish, milliseconds);
  const abort = () => {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
    reject(signal.reason || new Error("ComfyUI request aborted"));
  };
  if (signal.aborted) abort();
  else signal.addEventListener("abort", abort, { once: true });
});

const firstSaveImagePng = (history, promptId) => {
  const images = history[promptId]?.outputs?.["9"]?.images ?? [];
  return images.find((image) => String(image.filename).toLowerCase().endsWith(".png")) ?? null;
};

export function createComfyClient({
  baseUrl,
  pollMilliseconds = 500,
  timeoutMilliseconds = 300000,
  fetchImpl = fetch,
}) {
  const origin = baseUrl.replace(/\/$/, "");

  async function withinTimeout(label, operation) {
    const controller = new AbortController();
    const timeoutError = new Error(`ComfyUI ${label} timed out after ${timeoutMilliseconds} ms`);
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort(timeoutError);
        reject(timeoutError);
      }, timeoutMilliseconds);
      timer.unref?.();
    });
    try {
      return await Promise.race([operation(controller.signal), timeout]);
    } catch (error) {
      if (controller.signal.aborted) throw timeoutError;
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function health() {
    return withinTimeout("health check", async (signal) => {
      const response = await fetchImpl(`${origin}/system_stats`, { signal });
      if (!response.ok) throw new Error(`ComfyUI health failed (${response.status})`);
      return response.json();
    });
  }

  async function uploadImage(bytes, fileName) {
    const form = new FormData();
    form.append("image", new Blob([bytes], { type: "image/png" }), fileName);
    form.append("subfolder", "chatnft");
    form.append("type", "input");
    return withinTimeout("upload", async (signal) => {
      const response = await fetchImpl(`${origin}/upload/image`, { method: "POST", body: form, signal });
      if (!response.ok) throw new Error(`ComfyUI upload failed (${response.status})`);
      const uploaded = await response.json();
      return uploaded.subfolder ? `${uploaded.subfolder}/${uploaded.name}` : uploaded.name;
    });
  }

  async function queue(graph) {
    return withinTimeout("queue", async (signal) => {
      const response = await fetchImpl(`${origin}/prompt`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: graph }),
        signal,
      });
      if (!response.ok) throw new Error(`ComfyUI queue failed (${response.status})`);
      const queued = await response.json();
      return queued.prompt_id;
    });
  }

  async function waitForOutput(promptId) {
    return withinTimeout("generation", async (signal) => {
      while (true) {
        const response = await fetchImpl(`${origin}/history/${encodeURIComponent(promptId)}`, { signal });
        if (!response.ok) throw new Error(`ComfyUI history failed (${response.status})`);
        const image = firstSaveImagePng(await response.json(), promptId);
        if (image) return image;
        await delay(pollMilliseconds, signal);
      }
    });
  }

  async function fetchOutput(imageRecord) {
    const query = new URLSearchParams({
      filename: imageRecord.filename,
      subfolder: imageRecord.subfolder ?? "",
      type: imageRecord.type ?? "output",
    });
    return withinTimeout("output download", async (signal) => {
      const response = await fetchImpl(`${origin}/view?${query}`, { signal });
      if (!response.ok) throw new Error(`ComfyUI output fetch failed (${response.status})`);
      return response.arrayBuffer();
    });
  }

  return { health, uploadImage, queue, waitForOutput, fetchOutput };
}
