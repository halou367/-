// Document-start protection for ALL origins/frames, including Google and reCAPTCHA.
// Do not spoof an ICE address: disable the capability that can create a STUN/TURN connection.
(() => {
  'use strict';
  for (const key of new Set(['RTCPeerConnection','webkitRTCPeerConnection','mozRTCPeerConnection','RTCIceGatherer',...Object.getOwnPropertyNames(globalThis).filter(k=>/^(?:webkit|moz)?RTC/.test(k))])) {
    const d=Object.getOwnPropertyDescriptor(globalThis,key);
    if(d&&!d.configurable){if(globalThis[key]!==undefined)throw Error('WebRTC isolation unavailable');continue;}
    Object.defineProperty(globalThis,key,{value:undefined,writable:false,configurable:false});
  }
  // Precise physical geolocation must not reveal the device's location behind the proxy.
  if(globalThis.navigator){
    const proto=Object.getPrototypeOf(navigator),d=Object.getOwnPropertyDescriptor(proto,'geolocation');
    if(!d||d.configurable)Object.defineProperty(proto,'geolocation',{get:()=>undefined,configurable:false});
  }

  try {
    if (typeof Navigator !== 'undefined' && Navigator.prototype) {
      Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false, configurable: true, enumerable: true });
    }
    if (!window.chrome) window.chrome = { runtime: {}, app: { isInstalled: false }, csi: () => ({}), loadTimes: () => ({}) };
  } catch (_) {}
})();
