
const _realCreateElement = document.createElement;
document.createElement = new Proxy(_realCreateElement, {
    apply(target, thisArg, argumentsList) {
        const el = Reflect.apply(target, thisArg, argumentsList);
        if (argumentsList[0] && String(argumentsList[0]).toLowerCase() === 'video') {
            el.crossOrigin = "anonymous";
        }
        return el;
    }
});

// TikTok Pro Tools - Script Injected into Web Context
const _realPlay = HTMLVideoElement.prototype.play;
const _realVisGetter = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState')?.get;

function getTrueVisibility() {
    return _realVisGetter ? _realVisGetter.call(document) : document.visibilityState;
}

HTMLVideoElement.prototype.play = new Proxy(_realPlay, {
    apply(target, thisArg, argumentsList) {
        return Reflect.apply(target, thisArg, argumentsList).catch(err => {
            if (err.name === 'NotAllowedError' && getTrueVisibility() === 'hidden') {
                thisArg.muted = true;
                thisArg.dataset.tptAutoMuted = 'true';
                return Reflect.apply(target, thisArg, argumentsList).catch(()=>{});
            }
            throw err;
        });
    }
});

/* Web Audio API Interceptor for EQ and 360 Audio */
const _realCreateMediaElementSource = AudioContext.prototype.createMediaElementSource || webkitAudioContext.prototype.createMediaElementSource;
const _tptAudioNodes = new WeakMap();

// Listen to custom events from content.js to update the EQ on the fly
window.addEventListener('tpt-eq-update', (e) => {
    const data = e.detail;
    // Apply changes to all our active injected audio contexts
    document.querySelectorAll('video').forEach(videoElement => {
         const nodes = _tptAudioNodes.get(videoElement);
         if (nodes) {
             if (nodes.ctx.state === 'suspended') {
                 nodes.ctx.resume().catch(()=>{});
             }
             // Map data setting to the nodes
             if (data.bass !== undefined && nodes.bassNode) nodes.bassNode.gain.value = +data.bass;
             if (data.mid !== undefined && nodes.midNode) nodes.midNode.gain.value = +data.mid;
             if (data.treble !== undefined && nodes.trebleNode) nodes.trebleNode.gain.value = +data.treble;
             
             if (data.eq !== undefined) {
                 // For presets like 'bbass', etc. If you want hardcoded values you'd map them here or in content.js
             }
         }
    });
});

AudioContext.prototype.createMediaElementSource = new Proxy(_realCreateMediaElementSource, {
    apply(target, thisArg, argumentsList) {
        const mediaElement = argumentsList[0];
        const sourceNode = Reflect.apply(target, thisArg, argumentsList);
    
    try {
        const bassNode = this.createBiquadFilter();
        bassNode.type = "lowshelf";
        bassNode.frequency.value = 250;
        bassNode.gain.value = 0;
        
        const midNode = this.createBiquadFilter();
        midNode.type = "peaking";
        midNode.frequency.value = 1000;
        midNode.Q.value = 1;
        midNode.gain.value = 0;

        const trebleNode = this.createBiquadFilter();
        trebleNode.type = "highshelf";
        trebleNode.frequency.value = 6000;
        trebleNode.gain.value = 0;
        
        const pannerNode = this.createStereoPanner ? this.createStereoPanner() : null;

        // Create a custom shim for connect
        const realConnect = sourceNode.connect;
        
        // We hijack the first connect call to inject our nodes in the middle
        sourceNode.connect = function(destination, output=0, input=0) {
            // Disconnect old chain
            realConnect.call(this, bassNode);
            bassNode.connect(midNode);
            midNode.connect(trebleNode);
            
            let lastNode = trebleNode;
            if (pannerNode) {
                lastNode.connect(pannerNode);
                lastNode = pannerNode;
            }
            
            // Finally connect our last node to the REAL destination
            lastNode.connect(destination, output, input);
            
            _tptAudioNodes.set(mediaElement, {
                ctx: this.context,
                sourceNode: this,
                bassNode,
                midNode,
                trebleNode,
                pannerNode,
                isHooked: true
            });
            
            // Revert connect so subsequent calls just behave normally (but we might break complex graphs)
            // For now, return the destination for chaining
            return destination;
        };

        mediaElement._tptAudioHooked = true;

    } catch(e) {
        console.error("TPT Audio Hook failed:", e);
    }
    
    return sourceNode;
    }
});
// Trigger custom event just in case content.js needs to know about this script
window.dispatchEvent(new CustomEvent('tpt-hook-ready'));
