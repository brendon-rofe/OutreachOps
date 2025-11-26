console.log("[ConnectChecker] content script loaded on", window.location.href);

// Grab lowercase trimmed text from an element
function getText(el) {
  return (el?.textContent || "").trim().toLowerCase();
}

// Heuristic 1: LinkedIn-style aria-label "Invite dave payne to connect"
function parseInviteeFromAria(btn) {
  if (!btn) return null;
  const aria = btn.getAttribute("aria-label") || "";
  console.log("[ConnectChecker] aria-label:", aria);

  const lower = aria.toLowerCase();

  // Pattern A: "invite X to connect"
  let m = lower.match(/^invite (.+?) to connect$/);
  if (m && m[1]) {
    const name = m[1]
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    console.log("[ConnectChecker] Parsed name (pattern A):", name);
    return name;
  }

  // Pattern B: "connect with X"
  m = lower.match(/^connect with (.+)$/);
  if (m && m[1]) {
    const name = m[1]
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    console.log("[ConnectChecker] Parsed name (pattern B):", name);
    return name;
  }

  return null;
}

// Detect if a button is actually a Connect button
function isConnectButton(btn) {
  if (!btn) return false;

  const aria = (btn.getAttribute("aria-label") || "").toLowerCase();
  const t = getText(btn);
  const innerSpan = btn.querySelector("span,div");
  const innerText = getText(innerSpan);

  const looksLikeConnect =
    (aria.includes("invite") && aria.includes("to connect")) ||
    aria.startsWith("connect with") ||
    t.includes("connect") ||
    innerText.includes("connect");

  if (looksLikeConnect) {
    console.log("[ConnectChecker] Button looks like CONNECT:", {
      aria,
      t,
      innerText,
      btn,
    });
  }

  return looksLikeConnect;
}

// Try to get the profile name from page if not in aria-label
function getProfileNameFallback() {
  const mainH1 = document.querySelector("main h1");
  if (mainH1?.textContent?.trim()) return mainH1.textContent.trim();

  const dialogHeader = document.querySelector(
    '[role="dialog"] h1, [role="dialog"] h2'
  );
  if (dialogHeader?.textContent?.trim()) return dialogHeader.textContent.trim();

  const anyHeader = document.querySelector("h1,h2,h3");
  if (anyHeader?.textContent?.trim()) return anyHeader.textContent.trim();

  return "";
}

// Watch for button state change
function confirmStateChange(targetBtn, done) {
  let finished = false;

  function confirmAndCleanup(status) {
    if (finished) return;
    finished = true;
    done(status);
    cleanup();
  }

  function looksConfirmedNow() {
    // 1. Check aria-label for pending/withdraw language
    const aria = (targetBtn.getAttribute("aria-label") || "").toLowerCase();
    // examples:
    // "pending, click to withdraw invitation sent to alex ripoll piera"
    // we treat any aria-label starting with "pending" as confirmed
    if (aria.startsWith("pending")) {
      console.log("[ConnectChecker] aria-label indicates confirmed:", aria);
      return true;
    }

    // 2. Check visible text
    const currentTxt = getText(targetBtn);
    console.log("[ConnectChecker] Button state now:", currentTxt);

    if (
      currentTxt.includes("pending") ||
      currentTxt.includes("withdraw") ||
      currentTxt.includes("message") ||
      currentTxt.includes("requested") ||
      currentTxt.includes("sent")
    ) {
      return true;
    }

    return false;
  }

  // Called whenever something changes in the button subtree
  function recheckButton() {
    if (looksConfirmedNow()) {
      confirmAndCleanup("confirmed");
    }
  }

  // 3. Watch for card removal
  // If the button is no longer connected to the DOM, LinkedIn likely removed the suggestion after sending the invite.
  const rootObserver = new MutationObserver(() => {
    if (!targetBtn.isConnected) {
      console.log(
        "[ConnectChecker] Button/card removed from DOM -> treating as confirmed"
      );
      confirmAndCleanup("confirmed");
    }
  });

  rootObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // 4. Watch the button's own subtree for changes to text/aria/etc.
  const btnObserver = new MutationObserver(() => {
    recheckButton();
  });

  btnObserver.observe(targetBtn, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["aria-label"],
  });

  // run initial check in case it's already pending
  recheckButton();

  // Cleanup logic
  let timeoutId;
  function cleanup() {
    btnObserver.disconnect();
    rootObserver.disconnect();
    clearTimeout(timeoutId);
  }

  // Final fallback: after 5s, if never confirmed, call clicked-only
  timeoutId = setTimeout(() => {
    if (!finished) {
      console.log("[ConnectChecker] Timeout reached without confirm");
      confirmAndCleanup("clicked-only");
    }
  }, 5000);
}

// Handle a detected Connect click
function handleConnectClick(btn) {
  console.log("[ConnectChecker] handleConnectClick fired");

  const inviteeFromAria = parseInviteeFromAria(btn);
  const fallbackName = getProfileNameFallback();

  // --- robust profile URL extraction ---
  function findProfileUrlFromAncestors(startEl) {
    if (!startEl) return null;

    // Try walking up several ancestors.
    // At each ancestor, look for ANY <a href*="/in/">
    let node = startEl;
    for (let depth = 0; depth < 8 && node; depth++) {
      // Direct anchor on this node
      if (node.matches && node.matches('a[href*="/in/"]') && node.href) {
        return node.href;
      }

      // Anchor somewhere inside this node
      const innerLink = node.querySelector?.('a[href*="/in/"]');
      if (innerLink && innerLink.href) {
        return innerLink.href;
      }

      node = node.parentElement;
    }

    return null;
  }

  let profileUrl = findProfileUrlFromAncestors(btn);

  // Fallback to page URL (e.g. if you're already on /in/someone/)
  if (!profileUrl) {
    profileUrl = location.href;
  }

  // Normalize relative URLs like "/in/johnsmith/"
  if (profileUrl.startsWith("/")) {
    profileUrl = "https://www.linkedin.com" + profileUrl;
  }

  const recipientName = inviteeFromAria || fallbackName || "";
  const eventData = {
    ts: Date.now(),
    url: profileUrl,
    name: recipientName,
  };

  console.log("[ConnectChecker] eventData before confirm:", eventData);

  // send to backend endpoint
  try {
    fetch("https://cruciate-chaya-modernly.ngrok-free.dev/api/connect-requests/1", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipientName: recipientName,
      }),
    })
      .then((res) => res.text())
      .then((text) => {
        console.log("[ConnectChecker] Sent to API ->", text);
      })
      .catch((err) =>
        console.error("[ConnectChecker] Error sending to API:", err)
      );
  } catch (err) {
    console.error("[ConnectChecker] Fetch failed:", err);
  }

  // Log locally + background
  confirmStateChange(btn, async (status) => {
    const finalPayload = { ...eventData, status };
    console.log(
      "[ConnectChecker] sending message to background:",
      finalPayload
    );

    try {
      chrome.runtime.sendMessage({
        type: "connect-event",
        payload: finalPayload,
      });
    } catch (err) {
      console.warn(
        "[ConnectChecker] sendMessage failed, storing locally:",
        err
      );
      await storeLocally(finalPayload);
    }
  });
}

// helper used in the fallback above
async function storeLocally(finalPayload) {
  try {
    const STORAGE_KEY = "connect_events";
    const got = await chrome.storage.local.get(STORAGE_KEY);
    let events = got[STORAGE_KEY] || [];
    if (!Array.isArray(events)) events = [];
    events.unshift(finalPayload);
    await chrome.storage.local.set({
      [STORAGE_KEY]: events.slice(0, 500),
    });
  } catch (err2) {
    console.error("[ConnectChecker] FAILED local write:", err2);
  }
}

// Global click listener
window.addEventListener(
  "click",
  (e) => {
    const btn = e.target.closest('button,[role="button"],a[role="button"]');
    if (!btn) return;

    if (isConnectButton(btn)) {
      console.log("[ConnectChecker] CLICK on connect-y button");
      handleConnectClick(btn);
    }
  },
  true
);

// Keep script alive in SPA
new MutationObserver(() => {}).observe(document.documentElement, {
  childList: true,
  subtree: true,
});

window.addEventListener(
  "click",
  async (e) => {
    // LinkedIn's send button in DMs
    const btn = e.target.closest(
      'button.msg-form__send-button, button[aria-label="Send"], button[aria-label="Send now"]'
    );
    if (!btn) return;

    console.log("[DMTracker] Detected DM Send button click");

    // Try to extract the recipient name from the chat header
    // Try to extract the recipient name from the chat header
    let recipientName = "";
    try {
      // Primary: the element you showed
      const header =
        document.querySelector("h2.msg-entity-lockup__entity-title") ||
        document.querySelector(".msg-thread__link") ||
        document.querySelector('[data-control-name="conversation_title"]');

      if (header && header.textContent) {
        recipientName = header.textContent.trim();
      }
    } catch (err) {
      console.warn("[DMTracker] Failed to read recipient name:", err);
    }

    if (!recipientName) recipientName = "Unknown DM";

    const dmEvent = {
      ts: Date.now(),
      url: "https://www.linkedin.com/messaging/thread",
      name: recipientName,
      kind: "dm",
    };

    console.log("[DMTracker] Logging DM event:", dmEvent);

    // Save locally
    try {
      const STORAGE_KEY = "connect_events";
      const got = await chrome.storage.local.get(STORAGE_KEY);
      let events = got[STORAGE_KEY] || [];
      if (!Array.isArray(events)) events = [];
      events.unshift(dmEvent);
      await chrome.storage.local.set({
        [STORAGE_KEY]: events.slice(0, 500),
      });
    } catch (err) {
      console.error("[DMTracker] Error storing DM event:", err);
    }

    // OPTIONAL: send to backend
    try {
      fetch("https://cruciate-chaya-modernly.ngrok-free.dev/api/direct-messages/1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientName }),
      });
    } catch (err) {
      console.error("[DMTracker] Failed sending DM event to backend:", err);
    }
  },
  true // <-- IMPORTANT: use capture phase like the connect listener
);


