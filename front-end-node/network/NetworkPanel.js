/*jshint browser:true, nonew:false*/
/*global WebInspector:true, NetworkAgent:true*/
(function() {

WebInspector.NetworkLogView.prototype.orig_toggleRecordButton =
  WebInspector.NetworkLogView.prototype._toggleRecordButton;

WebInspector.NetworkLogView.prototype._toggleRecordButton = function(toggled) {
  this.orig_toggleRecordButton.apply(this, arguments);

  if (!window.NetworkAgent) return;
  NetworkAgent._setCapturingEnabled(this._recordButton.toggled());
};

WebInspector.inspectorView.panel('network')
  .then(function(network) {

    network._networkLogView.addEventListener(
      WebInspector.NetworkLogView.EventTypes.ViewCleared,
      function() {
        NetworkAgent._clearCapturedData();
      });

    network._preserveLogCheckbox.setVisible(false);
    network._disableCacheCheckbox.setVisible(false);
    network._networkLogView.registerRequiredCSS('node/network/NetworkPanel.css');
  });

})();