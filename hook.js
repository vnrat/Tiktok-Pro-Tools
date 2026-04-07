
const _realCreateElement = document.createElement;
document.createElement = function(tagName, options) {
    const el = _realCreateElement.call(this, tagName, options);
    if (tagName.toLowerCase() === 'video') {
        el.crossOrigin = "anonymous";
    }
    return el;
};

// TikTok Pro Tools - Script Injected into Web Context
const _realPlay = HTMLVideoElement.prototype.play;
const _realVisGetter = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState')?.get;

function getTrueVisibility() {
    return _realVisGetter ? _realVisGetter.call(document) : document.visibilityState;
}

HTMLVideoElement.prototype.play = function() {
    return _realPlay.call(this).catch(err => {
        // Only swallow and force-mute if we are in a background tab
        if (err.name === 'NotAllowedError' && getTrueVisibility() === 'hidden') {
            this.muted = true;
            this.dataset.tptAutoMuted = 'true';
            return _realPlay.call(this).catch(()=>{});
        }
        throw err; // Let TikTok's own UI handle foreground play-blocking
    });
};


// TPT: Singleton AudioContext Hook to prevent TikTok from crashing when we also apply EQ
const _realCreateMediaElementSource = window.AudioContext.prototype.createMediaElementSource || window.webkitAudioContext.prototype.createMediaElementSource;
const _nodeCache = new WeakMap();

window.AudioContext.prototype.createMediaElementSource = function(mediaElement) {
    if (_nodeCache.has(mediaElement)) {
        const cached = _nodeCache.get(mediaElement);
        // Return a proxy that acts like a MediaElementAudioSourceNode but routes to the existing one,
        // or just return the existing one directly if it's from the same context (or even if it's not, to avoid native crash).
        // Since TikTok's SDK just needs an object with `connect` and `disconnect` methods:
        return {
            context: this,
            mediaElement: mediaElement,
            connect: function(dest) { return cached.connect(dest); },
            disconnect: function() { }
        };
    }
    
    try {
        const node = _realCreateMediaElementSource.call(this, mediaElement);
        _nodeCache.set(mediaElement, node);
        return node;
    } catch (err) {
        console.error("TPT Audio Hook fallback error:", err);
        return {
            context: this,
            mediaElement: mediaElement,
            connect: function(d) { return d; },
            disconnect: function() {}
        };
    }
};

window.dispatchEvent(new CustomEvent('tpt-hook-ready'));
