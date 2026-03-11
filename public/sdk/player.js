/**
 * LynePlay SDK v1.0
 * Universal Player as a Service — JavaScript SDK
 * 
 * Usage:
 *   <div id="player"></div>
 *   <script src="https://lyneflix.online/sdk/player.js"></script>
 *   <script>
 *     LynePlay.create({
 *       element: "#player",
 *       src: "https://cdn.example.com/video.m3u8",
 *       type: "m3u8",
 *       poster: "https://cdn.example.com/poster.jpg",
 *       title: "My Video",
 *       controls: true,
 *       autoplay: true,
 *       tracks: [
 *         { src: "https://cdn.example.com/sub.vtt", srclang: "pt-BR", label: "Português", default: true }
 *       ]
 *     });
 *   </script>
 */

(function (root) {
  "use strict";

  var BASE_URL = "https://lyneflix.online";

  /**
   * Build the embed URL from config object
   */
  function buildEmbedUrl(config) {
    var payload = {
      src: config.src,
      type: config.type || "mp4",
      poster: config.poster || null,
      title: config.title || null,
      subtitle: config.subtitle || null,
      autoplay: config.autoplay !== false,
      muted: config.muted || false,
      controls: config.controls !== false,
      preload: config.preload || "auto",
      startAt: config.startAt || 0,
      tracks: config.tracks || [],
      qualities: config.qualities || [],
      primaryColor: config.primaryColor || null,
      logo: config.logo || null,
      watermark: config.watermark || null,
      next: config.next || null
    };

    var encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    return (config.baseUrl || BASE_URL) + "/embed/v2?p=" + encoded;
  }

  /**
   * Create a player instance
   */
  function create(config) {
    if (!config || !config.src) {
      console.error("[LynePlay] Missing required parameter: src");
      return null;
    }

    var container;
    if (typeof config.element === "string") {
      container = document.querySelector(config.element);
    } else if (config.element instanceof HTMLElement) {
      container = config.element;
    }

    if (!container) {
      console.error("[LynePlay] Element not found:", config.element);
      return null;
    }

    var iframe = document.createElement("iframe");
    iframe.src = buildEmbedUrl(config);
    iframe.width = config.width || "100%";
    iframe.height = config.height || "100%";
    iframe.frameBorder = "0";
    iframe.allow = "autoplay; fullscreen; picture-in-picture; encrypted-media";
    iframe.allowFullscreen = true;
    iframe.style.border = "none";
    iframe.style.borderRadius = config.borderRadius || "12px";
    iframe.style.aspectRatio = config.aspectRatio || "16/9";
    iframe.style.background = "#000";

    if (config.responsive !== false) {
      iframe.style.width = "100%";
      iframe.style.height = "auto";
    }

    container.innerHTML = "";
    container.appendChild(iframe);

    // Return player instance with control methods
    var instance = {
      iframe: iframe,
      element: container,

      destroy: function () {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      },

      updateSource: function (newConfig) {
        var merged = Object.assign({}, config, newConfig);
        iframe.src = buildEmbedUrl(merged);
      },

      getEmbedUrl: function () {
        return iframe.src;
      }
    };

    return instance;
  }

  /**
   * Generate embed HTML string
   */
  function getEmbedCode(config) {
    var url = buildEmbedUrl(config);
    return '<iframe\n'
      + '  src="' + url + '"\n'
      + '  width="' + (config.width || "100%") + '"\n'
      + '  height="' + (config.height || "100%") + '"\n'
      + '  frameborder="0"\n'
      + '  allowfullscreen\n'
      + '  allow="autoplay; fullscreen; picture-in-picture"\n'
      + '  style="aspect-ratio:16/9; border-radius:12px; border:none;"\n'
      + '></iframe>';
  }

  /**
   * Create session via API (optional secure mode)
   */
  function createSession(config, callback) {
    var url = (config.baseUrl || BASE_URL) + "/api/player/session";

    var xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.setRequestHeader("Content-Type", "application/json");

    xhr.onload = function () {
      try {
        var response = JSON.parse(xhr.responseText);
        if (callback) callback(null, response);
      } catch (e) {
        if (callback) callback(e, null);
      }
    };

    xhr.onerror = function () {
      if (callback) callback(new Error("Network error"), null);
    };

    xhr.send(JSON.stringify({
      action: "create",
      src: config.src,
      type: config.type || "mp4",
      poster: config.poster,
      title: config.title,
      subtitle: config.subtitle,
      autoplay: config.autoplay,
      muted: config.muted,
      controls: config.controls,
      tracks: config.tracks,
      qualities: config.qualities,
      primaryColor: config.primaryColor,
      logo: config.logo,
      watermark: config.watermark,
      ttl: config.ttl,
      allowedDomain: config.allowedDomain
    }));
  }

  // Public API
  var LynePlay = {
    version: "1.0.0",
    create: create,
    getEmbedCode: getEmbedCode,
    createSession: createSession,
    buildEmbedUrl: buildEmbedUrl
  };

  // Export
  if (typeof module !== "undefined" && module.exports) {
    module.exports = LynePlay;
  } else {
    root.LynePlay = LynePlay;
  }

})(typeof window !== "undefined" ? window : this);
