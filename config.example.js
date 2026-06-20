(() => {
  const productionApi = "https://threadsme.akmalmarvis.com";
  const localApi = "http://127.0.0.1:8788";
  const params = new URLSearchParams(window.location.search);
  const queryOverride = params.get("api") || "";
  const storedOverride = window.localStorage.getItem("THREADSME_API_MODE") || "";
  const host = window.location.hostname;
  const isProductionHost = host === "threadsme.akmalmarvis.com";
  const isLocalHost = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
  const override = queryOverride || (isLocalHost ? "" : storedOverride);

  window.THREADSME_CONFIG = {
    apiUrl: override === "local"
      ? localApi
      : override === "production"
        ? productionApi
        : isProductionHost
          ? productionApi
          : localApi,
    apiMode: override || (isProductionHost ? "production" : "local"),
  };
})();
