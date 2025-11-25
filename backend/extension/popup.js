const STORAGE_KEY = "connect_events";

function fmt(ts) {
  try {
    const d = new Date(ts);

    const dateStr = d.toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    const timeStr = d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });

    return `Sent on ${dateStr} at ${timeStr}`;
  } catch {
    return "Sent (time unknown)";
  }
}

function activityLine(evt) {
  if (evt.kind === "dm") {
    return "DM sent";
  }
  return "Connect request sent";
}

function renderEventCard(evt) {
  const { name, url } = evt;
  const initial =
    name && typeof name === "string" && name.trim().length > 0
      ? name.trim()[0].toUpperCase()
      : "?";

  return `
    <div class="card">
      <div class="card-main">
        <div class="avatar">${initial}</div>

        <div class="card-text">
          <p class="name-line">${name || "Unknown"}</p>
          <p class="meta-line">${fmt(evt.ts)}</p>
          <p class="meta-line">${activityLine(evt)}</p>
        </div>
      </div>

      <div class="card-footer">
        <a
          class="open-btn"
          href="${url || "#"}"
          target="_blank"
          rel="noreferrer"
        >
          Open profile
        </a>
      </div>
    </div>
  `;
}

// Reads from storage and updates DOM
async function render() {
  const { [STORAGE_KEY]: stored } = await chrome.storage.local.get(STORAGE_KEY);

  let events = stored || [];
  if (!Array.isArray(events)) events = [];

  const list = document.getElementById("list");
  const connectBadge = document.getElementById("connect-count");
  const dmBadge = document.getElementById("dm-count");

  if (!events.length) {
    if (connectBadge) connectBadge.textContent = "0";
    if (dmBadge) dmBadge.textContent = "0";
    list.innerHTML = `
      <div class="empty-state">No outreach tracked yet.</div>
    `;
    return;
  }

  // Partition events by kind
  const connects = events.filter((e) => e.kind !== "dm"); // default to connect if no kind
  const dms = events.filter((e) => e.kind === "dm");

  if (connectBadge) connectBadge.textContent = String(connects.length);
  if (dmBadge) dmBadge.textContent = String(dms.length);

  // Limit each section to latest 10 (20 total)
  const recentConnects = connects.slice(0, 10);
  const recentDms = dms.slice(0, 10);

  let html = "";

  if (recentConnects.length) {
    html += `
      <div class="section">
        <div class="section-title">Connect requests</div>
        ${recentConnects.map(renderEventCard).join("")}
      </div>
    `;
  }

  if (recentDms.length) {
    html += `
      <div class="section">
        <div class="section-title">DMs sent</div>
        ${recentDms.map(renderEventCard).join("")}
      </div>
    `;
  }

  list.innerHTML = html || `
    <div class="empty-state">No outreach tracked yet.</div>
  `;
}

// Clears storage and then re-renders
async function clearLog() {
  await chrome.storage.local.set({ [STORAGE_KEY]: [] });
  await render();
}

// Append a new DM log entry (manual button in popup)
async function logDmClick() {
  const dmEvent = {
    ts: Date.now(),
    url: "https://www.linkedin.com/messaging/",
    name: "Manual DM logged",
    kind: "dm",
  };

  const { [STORAGE_KEY]: stored } = await chrome.storage.local.get(STORAGE_KEY);
  let events = stored || [];
  if (!Array.isArray(events)) events = [];
  events.unshift(dmEvent);

  await chrome.storage.local.set({
    [STORAGE_KEY]: events.slice(0, 500),
  });

  await render();
}

// Hook up events and initial load
async function init() {
  const clearBtn = document.getElementById("clear-btn");
  if (clearBtn) {
    clearBtn.addEventListener("click", async () => {
      await clearLog();
    });
  }

  const dashboardBtn = document.getElementById("dashboard-btn");
  if (dashboardBtn) {
    dashboardBtn.addEventListener("click", () => {
      chrome.tabs.create({ url: "http://localhost:4200" });
    });
  }

  const dmBtn = document.getElementById("dm-btn");
  if (dmBtn) {
    dmBtn.addEventListener("click", async () => {
      await logDmClick();
    });
  }

  await render();
}

init();
