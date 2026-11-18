// views/settings.js — API key, backup and restore.

import { exportState, importState, saveState } from "../storage.js";
import { esc } from "../ui.js";

export function renderSettings(root, ctx) {
  const { state } = ctx;
  root.innerHTML = `
    <section class="panel">
      <h2>Finnhub API key</h2>
      <p class="hint">Get a free key at <a href="https://finnhub.io/register" target="_blank" rel="noopener">finnhub.io/register</a>.
        It's stored only in this browser and isn't part of the public code. Each device needs it entered once.</p>
      <form id="st-key" class="row-form">
        <input name="key" type="password" autocomplete="off" placeholder="Paste API key" value="${esc(state.apiKey)}">
        <button>Save key</button>
      </form>
    </section>

    <section class="panel">
      <h2>Backup &amp; move devices</h2>
      <p class="hint">Your holdings live in this browser. Download a backup, then import it on your phone or laptop.
        The backup never includes your API key.</p>
      <div class="row-form">
        <button id="st-export">Download backup</button>
        <label class="file-btn">Import backup<input id="st-import" type="file" accept="application/json,.json" hidden></label>
      </div>
    </section>

    <section class="panel">
      <h2>Reset</h2>
      <button id="st-reset" class="danger">Erase all data in this browser</button>
    </section>`;

  root.querySelector("#st-key").addEventListener("submit", (e) => {
    e.preventDefault();
    state.apiKey = String(new FormData(e.target).get("key") || "").trim();
    ctx.save();
    e.target.querySelector("button").textContent = "Saved ✓";
  });

  root.querySelector("#st-export").addEventListener("click", () => {
    const blob = new Blob([exportState(state)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `portfolio-lab-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  root.querySelector("#st-import").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      ctx.replaceState(importState(await file.text(), state));
      ctx.go("portfolio");
    } catch (err) {
      root.insertAdjacentHTML("afterbegin", `<div class="notice warn">${esc(err.message)}</div>`);
    }
  });

  root.querySelector("#st-reset").addEventListener("click", (e) => {
    if (e.target.dataset.armed) {
      const key = state.apiKey;
      localStorage.clear();
      ctx.replaceState({ ...ctx.freshState(), apiKey: key });
      saveState(ctx.state);
      ctx.go("portfolio");
    } else {
      e.target.dataset.armed = "1";
      e.target.textContent = "Tap again to confirm";
    }
  });
}
