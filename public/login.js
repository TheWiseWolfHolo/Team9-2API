const form = document.querySelector("#login-form");
const errorBox = document.querySelector("#login-error");

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorBox.hidden = true;

  const key = document.querySelector("#admin-key")?.value?.trim();
  const response = await fetch("/api/admin/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ key }),
  });

  if (!response.ok) {
    errorBox.hidden = false;
    errorBox.textContent = "Invalid admin key.";
    return;
  }

  window.location.href = "/admin";
});
