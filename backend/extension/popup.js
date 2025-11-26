const STORAGE_KEY = "connect_events";
let currentTab = "connect"; // "connect" | "dm"

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

function updateTabsUI() {
  const tabConnect = document.getElementById("tab-connects");
  const tabDms = document.getElementById("tab-dms");
  if (!tabConnect || !tabDms) return;

  if (currentTab === "connect") {
    tabConnect.classList.add("tab-active");
    tabDms.classList.remove("tab-active");
  } else {
    tabDms.classList.add("tab-active");
    tabConnect.classList.remove("tab-active");
  }
}

// Reads from storage and updates DOM
async function render() {
  const { [STORAGE_KEY]: stored } = await chrome.storage.local.get(STORAGE_KEY);

  let events = stored || [];
  if (!Array.isArray(events)) events = [];

  const list = document.getElementById("list");
  const connectBadge = document.getElementById("connect-count");
  const dmBadge = document.getElementById("dm-count");

  // Partition by kind
  const connects = events.filter((e) => e.kind !== "dm");
  const dms = events.filter((e) => e.kind === "dm");

  if (connectBadge) connectBadge.textContent = String(connects.length);
  if (dmBadge) dmBadge.textContent = String(dms.length);

  const isConnectTab = currentTab === "connect";
  const activeList = isConnectTab ? connects : dms;

  if (!activeList.length) {
    const msg = isConnectTab
      ? "No connect requests tracked yet."
      : "No DMs tracked yet.";
    list.innerHTML = `
      <div class="empty-state">${msg}</div>
    `;
    return;
  }

  // Limit to latest 20 in the active tab
  const recent = activeList.slice(0, 20);
  list.innerHTML = recent.map(renderEventCard).join("");
}

// Clears storage and then re-renders
async function clearLog() {
  await chrome.storage.local.set({ [STORAGE_KEY]: [] });
  await render();
}

// Append a new DM log entry (manual DM button in popup)
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

  const tabConnect = document.getElementById("tab-connects");
  const tabDms = document.getElementById("tab-dms");

  if (tabConnect) {
    tabConnect.addEventListener("click", async () => {
      currentTab = "connect";
      updateTabsUI();
      await render();
    });
  }

  if (tabDms) {
    tabDms.addEventListener("click", async () => {
      currentTab = "dm";
      updateTabsUI();
      await render();
    });
  }

  updateTabsUI();
  await render();
}

init();
