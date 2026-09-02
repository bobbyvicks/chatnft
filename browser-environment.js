(function (root) {
  "use strict";

  function isLoopbackHost(hostname) {
    const host = String(hostname || "").toLowerCase();
    return host === "localhost" || host === "127.0.0.1";
  }

  function requiresCloudSignIn(hostname, user) {
    return !isLoopbackHost(hostname) && !(user && user.id);
  }

  root.ChatNftEnvironment = Object.freeze({ isLoopbackHost, requiresCloudSignIn });
})(typeof window === "object" ? window : globalThis);
