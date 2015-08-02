/*jshint browser:true, nonew:false*/
/*global WebInspector:true*/
(function() {
  WebInspector.inspectorView.panel('sources')
    .then(hideChromeSpecifics);

  function hideChromeSpecifics(sources) {
    var panes = sources.sidebarPanes;
    [
      panes.domBreakpoints,
      panes.eventListenerBreakpoints,
      panes.objectEventListeners,
      panes.xhrBreakpoints
    ].forEach(function(element) {
      element.setVisible(false);
    });
  }
})();
