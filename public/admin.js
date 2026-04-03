const healthNode = document.querySelector("#status-health");
const sessionNode = document.querySelector("#status-session");
const discoveredNode = document.querySelector("#status-discovered");
const modelListNode = document.querySelector("#model-list");
const probeModelNode = document.querySelector("#probe-model");
const probeOutputNode = document.querySelector("#probe-output");

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error?.message || `Request failed: ${response.status}`);
  }
  return await response.json();
}

function renderModels(models) {
  modelListNode.innerHTML = "";
  probeModelNode.innerHTML = "";

  models.forEach((model) => {
    const card = document.createElement("article");
    card.className = "model-chip";
    card.innerHTML = `
      <h3>${model.id}</h3>
      <p>${model.displayName}</p>
      <small>${model.channelId}</small>
    `;
    modelListNode.appendChild(card);

    const option = document.createElement("option");
    option.value = model.id;
    option.textContent = model.id;
    probeModelNode.appendChild(option);
  });
}

async function loadDashboard() {
  const [health, me, models] = await Promise.all([
    fetchJson("/healthz"),
    fetchJson("/api/admin/me"),
    fetchJson("/api/admin/models"),
  ]);

  healthNode.textContent = health.ok ? "Healthy" : "Degraded";
  sessionNode.textContent = me.authenticated ? "Authenticated" : "Not authenticated";
  discoveredNode.textContent = models.discoveredAt || "Never";
  renderModels(models.models);
}

document.querySelector("#refresh-models")?.addEventListener("click", async () => {
  const payload = await fetchJson("/api/admin/models/refresh", {
    method: "POST",
  });
  discoveredNode.textContent = payload.discoveredAt || "Just now";
  renderModels(payload.models);
});

document.querySelector("#logout-button")?.addEventListener("click", async () => {
  await fetchJson("/api/admin/logout", { method: "POST" });
  window.location.href = "/login";
});

document.querySelector("#probe-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  probeOutputNode.textContent = "Sending...";

  try {
    const payload = await fetchJson("/api/admin/probe/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: probeModelNode.value,
        prompt: document.querySelector("#probe-prompt")?.value?.trim(),
      }),
    });
    probeOutputNode.textContent = JSON.stringify(payload, null, 2);
  } catch (error) {
    probeOutputNode.textContent = error.message;
  }
});

loadDashboard().catch((error) => {
  probeOutputNode.textContent = error.message;
});
