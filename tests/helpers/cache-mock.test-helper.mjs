export function createCacheMock(nowFn = () => Date.now()) {
  const store = new Map();

  function getMaxAgeSeconds(response) {
    const cacheControl = response.headers?.get("Cache-Control") || "";
    const match = cacheControl.match(/max-age=(\d+)/i);
    return match ? Number(match[1]) : 0;
  }

  return {
    async match(request) {
      const key = typeof request === "string" ? request : request.url;
      const item = store.get(key);
      if (!item) return undefined;
      if (item.expiresAt <= nowFn()) {
        store.delete(key);
        return undefined;
      }
      return item.response.clone();
    },
    async put(request, response) {
      const key = typeof request === "string" ? request : request.url;
      const maxAge = getMaxAgeSeconds(response);
      const expiresAt = nowFn() + maxAge * 1000;
      store.set(key, { response: response.clone(), expiresAt });
    },
    clear() {
      store.clear();
    },
  };
}
