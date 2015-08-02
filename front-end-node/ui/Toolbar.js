/*jshint browser:true, nonew:false*/
/*global WebInspector:true, NetworkAgent:true*/
WebInspector.orig_Toolbar = WebInspector.Toolbar;
WebInspector.Toolbar = function() {
  WebInspector.orig_Toolbar.apply(this, arguments);
  this._shadowRoot.appendChild(WebInspector.Widget.createStyleElement("node/ui/Toolbar.css"));
};

WebInspector.Toolbar.prototype = WebInspector.orig_Toolbar.prototype;