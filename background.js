// TikTok Pro Tools - Background v12

// ─── TikWM Download API (proxy to avoid CORS) ────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'TIKWM_FETCH') {
    fetchTikwm(msg.url)
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true; // async
  }
  if (msg.type === 'DOWNLOAD_FILE') {
    chrome.downloads.download({
      url: msg.url,
      filename: msg.filename || 'tiktok-download',
      saveAs: false
    });
    sendResponse({ ok: true });
    return true;
  }
});

async function fetchTikwm(tiktokUrl) {
  const body = new URLSearchParams({ url: tiktokUrl, hd: '1' });
  const res = await fetch('https://tikwm.com/api/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const json = await res.json();
  if (json.code !== 0) throw new Error(json.msg || 'API error');
  return json.data;
}


// Keep SW alive and emit autoScroll pings
chrome.alarms.create('keepAlive', { periodInMinutes: 0.4 });





// Auto pause TikTok when other tabs are audible
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.audible !== undefined) {
        checkAudibleTabs();
    }
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    checkAudibleTabs();
});

async function checkAudibleTabs() {
    const tabs = await chrome.tabs.query({ audible: true });
    // Có tab nào đag phát nhạc mà KHÔNG PHẢI TIKTOK hay không?
    const otherAudible = tabs.some(t => !(t.url || '').includes('.tiktok.com'));
    
    const { _lastAudibleState } = await chrome.storage.session.get({_lastAudibleState: false});
    
    if (otherAudible && !_lastAudibleState) {
        await chrome.storage.session.set({_lastAudibleState: true});
        notifyTikTokTabs('other_audio_start');
    } else if (!otherAudible && _lastAudibleState) {
        await chrome.storage.session.set({_lastAudibleState: false});
        notifyTikTokTabs('other_audio_stop');
    }
}

function notifyTikTokTabs(action) {
    chrome.tabs.query({ url: '*://*.tiktok.com/*' }, (tabs) => {
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { action }).catch(() => {});
        });
    });
}
