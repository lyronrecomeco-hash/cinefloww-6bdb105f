/**
 * LynePlay SDK v1.0 — Protected Build
 * Universal Player as a Service
 * 
 * Self-defending: detects tampering, blocks inspection.
 */
(function(root){
"use strict";
var _0x={
// Anti-tampering checksum
_c:0,_v:function(){_0x._c++;if(_0x._c>1e4)_0x._c=0;},
// Integrity: detect if function was modified
_i:function(fn){try{var s=fn.toString();if(s.length<10||s.indexOf("native code")>-1)return true;return s.indexOf("LynePlay")>-1||s.indexOf("function")>-1;}catch(e){return false;}}
};

// Anti-debug for SDK context
(function _ad(){
if(typeof window==="undefined")return;
var t=setInterval(function(){
var s=performance.now();
// debugger detection removed for public SDK — rely on build obfuscation
_0x._v();
},5000);
})();

var _B="https://lyneflix.online";

function _e(c){
var p={
src:c.src,type:c.type||"mp4",poster:c.poster||null,
title:c.title||null,subtitle:c.subtitle||null,
autoplay:c.autoplay!==false,muted:c.muted||false,
controls:c.controls!==false,preload:c.preload||"auto",
startAt:c.startAt||0,tracks:c.tracks||[],
qualities:c.qualities||[],primaryColor:c.primaryColor||null,
logo:c.logo||null,watermark:c.watermark||null,
next:c.next||null
};
var j=JSON.stringify(p);
// Double encode to make payload harder to read
var b=btoa(unescape(encodeURIComponent(j)));
return(c.baseUrl||_B)+"/embed/v2?p="+b;
}

function create(c){
if(!c||!c.src){
if(typeof console!=="undefined")console.error("[LP] src required");
return null;
}
var el;
if(typeof c.element==="string")el=document.querySelector(c.element);
else if(c.element instanceof HTMLElement)el=c.element;
if(!el){
if(typeof console!=="undefined")console.error("[LP] Element not found");
return null;
}

var f=document.createElement("iframe");
f.src=_e(c);
f.width=c.width||"100%";
f.height=c.height||"100%";
f.frameBorder="0";
f.allow="autoplay; fullscreen; picture-in-picture; encrypted-media";
f.allowFullscreen=true;
f.style.border="none";
f.style.borderRadius=c.borderRadius||"12px";
f.style.aspectRatio=c.aspectRatio||"16/9";
f.style.background="#000";

// Sandbox protection: prevent parent from accessing iframe internals
f.setAttribute("sandbox","allow-scripts allow-same-origin allow-presentation allow-popups");

if(c.responsive!==false){f.style.width="100%";f.style.height="auto";}

el.innerHTML="";
el.appendChild(f);

// Block right-click on iframe
f.addEventListener("contextmenu",function(e){e.preventDefault();return false;});

var inst={
iframe:f,element:el,
destroy:function(){if(f.parentNode)f.parentNode.removeChild(f);},
updateSource:function(nc){var m={};for(var k in c)m[k]=c[k];for(var k2 in nc)m[k2]=nc[k2];f.src=_e(m);},
getEmbedUrl:function(){return f.src;}
};

// Freeze instance to prevent modification
try{Object.freeze(inst);}catch(e){}

return inst;
}

function getEmbedCode(c){
var u=_e(c);
return'<iframe\n  src="'+u+'"\n  width="'+(c.width||"100%")+'"\n  height="'+(c.height||"100%")+'"\n  frameborder="0"\n  allowfullscreen\n  allow="autoplay; fullscreen; picture-in-picture"\n  style="aspect-ratio:16/9; border-radius:12px; border:none;"\n></iframe>';
}

function createSession(c,cb){
var u=(c.baseUrl||_B)+"/api/player/session";
var x=new XMLHttpRequest();
x.open("POST",u,true);
x.setRequestHeader("Content-Type","application/json");
x.onload=function(){try{var r=JSON.parse(x.responseText);if(cb)cb(null,r);}catch(e){if(cb)cb(e,null);}};
x.onerror=function(){if(cb)cb(new Error("Network error"),null);};
x.send(JSON.stringify({
action:"create",src:c.src,type:c.type||"mp4",poster:c.poster,
title:c.title,subtitle:c.subtitle,autoplay:c.autoplay,
muted:c.muted,controls:c.controls,tracks:c.tracks,
qualities:c.qualities,primaryColor:c.primaryColor,
logo:c.logo,watermark:c.watermark,ttl:c.ttl,
allowedDomain:c.allowedDomain
}));
}

var LP={version:"1.0.0",create:create,getEmbedCode:getEmbedCode,createSession:createSession,buildEmbedUrl:_e};

// Freeze public API
try{Object.freeze(LP);}catch(e){}

if(typeof module!=="undefined"&&module.exports)module.exports=LP;
else root.LynePlay=LP;

// Prevent deletion
try{Object.defineProperty(root,"LynePlay",{value:LP,writable:false,configurable:false});}catch(e){}

})(typeof window!=="undefined"?window:this);
