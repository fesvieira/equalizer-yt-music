(() => {
  if (window.__eqInjected) return;
  window.__eqInjected = true;

  const BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  const DEFAULT_GAINS = [8, 8, 6, 3, 0, -1, 0, 1, 2, 2];

  let audioCtx = null;
  let sourceNode = null;
  let filters = [];
  let preampNode = null;
  let connectedMedia = null;
  let gains = [...DEFAULT_GAINS];
  let preamp = 0;
  let eqEnabled = true;

  function buildChain(ctx) {
    preampNode = ctx.createGain();
    preampNode.gain.value = dbToGain(preamp);

    filters = BANDS.map((freq, i) => {
      const filter = ctx.createBiquadFilter();
      filter.type = i === 0 ? "lowshelf" : i === BANDS.length - 1 ? "highshelf" : "peaking";
      filter.frequency.value = freq;
      filter.gain.value = eqEnabled ? gains[i] : 0;
      filter.Q.value = 1.4;
      return filter;
    });

    preampNode.connect(filters[0]);
    for (let i = 0; i < filters.length - 1; i++) {
      filters[i].connect(filters[i + 1]);
    }

    return { input: preampNode, output: filters[filters.length - 1] };
  }

  function dbToGain(db) {
    return Math.pow(10, db / 20);
  }

  function hookAudio(mediaEl) {
    if (connectedMedia === mediaEl) return;
    connectedMedia = mediaEl;

    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    if (sourceNode) {
      try { sourceNode.disconnect(); } catch(e) {}
    }

    sourceNode = audioCtx.createMediaElementSource(mediaEl);
    const chain = buildChain(audioCtx);
    sourceNode.connect(chain.input);
    chain.output.connect(audioCtx.destination);
    applyGains();
  }

  function findAndHookMedia() {
    const videos = document.querySelectorAll("video");
    for (const v of videos) {
      if (v.src || v.currentSrc) {
        hookAudio(v);
        return;
      }
    }
  }

  function applyGains() {
    filters.forEach((f, i) => {
      f.gain.value = eqEnabled ? gains[i] : 0;
    });
    if (preampNode) {
      preampNode.gain.value = eqEnabled ? dbToGain(preamp) : 1;
    }
  }

  chrome.storage.local.get(["gains", "preamp", "enabled"], (result) => {
    if (result.gains) gains = result.gains;
    if (result.preamp !== undefined) preamp = result.preamp;
    if (result.enabled !== undefined) eqEnabled = result.enabled;
    findAndHookMedia();
  });

  const observer = new MutationObserver(() => {
    findAndHookMedia();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener("play", (e) => {
    if (e.target.tagName === "VIDEO") {
      hookAudio(e.target);
    }
  }, true);

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "SET_GAINS") {
      gains = msg.gains;
      preamp = msg.preamp ?? 0;
      eqEnabled = msg.enabled ?? true;
      applyGains();
      chrome.storage.local.set({ gains, preamp, enabled: eqEnabled });
      sendResponse({ ok: true });
    } else if (msg.type === "GET_STATE") {
      sendResponse({ gains, preamp, enabled: eqEnabled });
    } else if (msg.type === "RESET") {
      gains = [...DEFAULT_GAINS];
      preamp = 0;
      eqEnabled = true;
      applyGains();
      sendResponse({ gains, preamp, enabled: eqEnabled });
    }
  });
})();
