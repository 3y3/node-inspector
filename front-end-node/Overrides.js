/*jshint browser:true */
/*global WebInspector:true, InspectorFrontendHost:true, InspectorBackend:true, importScript:true */
/*global Preferences:true */

// Wire up websocket to talk to backend
WebInspector.loaded = function() {

  var webSocketUrl = function() {
    var a = document.createElement('a');
    // browser will resolve this relative path to an absolute one
    a.href = 'ws';
    a.search = window.location.search;
    a.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return a.href;
  }();

  WebInspector.socket = new WebSocket(webSocketUrl);

  WebInspector.socket.onmessage = onWebSocketMessage;
  WebInspector.socket.onerror = onWebSocketError;
  WebInspector.socket.onopen = onWebSocketConnected;
};

var _inspectorInitialized = false;

function onWebSocketError(error) {
  console.error(error);
}

function onWebSocketConnected() {
  if (_inspectorInitialized) return;
  InspectorFrontendHost.sendMessageToBackend = WebInspector.socket.send.bind(WebInspector.socket);

  WebInspector.dockController = new WebInspector.DockController();
  WebInspector.doLoadedDone();

  _inspectorInitialized = true;
}

function onWebSocketMessage(response) {

  var message = response.data;

  if (!message) return;

  if (message === 'showConsole') {
    WebInspector.showConsole();
  } else {
    InspectorBackend.dispatch(message);
  }
}

// Disable HTML & CSS inspections
WebInspector.queryParamsObject['isSharedWorker'] = true;

// disable everything besides scripts and console
// that means 'profiles' and 'timeline' at the moment
WebInspector._orig_panelDescriptors = WebInspector._panelDescriptors;
WebInspector._panelDescriptors = function() {
  var panelDescriptors = this._orig_panelDescriptors();
  return panelDescriptors.filter(function(pd) {
    return ['scripts', 'console'].indexOf(pd.name()) != -1;
  });
};

// Patch the expression used as an initial value for a new watch.
// DevTools' value "\n" breaks the debugger protocol.
importScript('WatchExpressionsSidebarPane.js');
WebInspector.WatchExpressionsSection.NewWatchExpression = '\'\'';

Preferences.localizeUI = false;
Preferences.applicationTitle = 'Node Inspector';

WebInspector._platformFlavor = WebInspector.PlatformFlavor.MacLeopard;

// Front-end uses `eval location.href` to get url of inspected page
// This does not work in node.js from obvious reasons, and cause
// a 'null' message to be printed in front-end console.
// Since Preferences.applicationTitle does not include inspected url,
// we can return arbitrary string as inspected URL.
WebInspector.WorkerManager._calculateWorkerInspectorTitle = function() {
  InspectorFrontendHost.inspectedURLChanged('');
};

// Do not offer download of the edited file when saving changes to V8.
// DevTools' implementation changes window.location which closes
// web-socket connection to the server and thus breaks the inspector.
InspectorFrontendHost.close = function(url, content, forceSaveAs) {
  delete this._fileBuffers[url];
};

// Let DevTools know we can save the content of modified files,
// so that a warning icon is not displayed in the file tab header.
// See UISourceCode.hasUnsavedCommittedChanges to understand why.
WebInspector.extensionServer._onSubscribe(
  {
    type:WebInspector.extensionAPI.Events.ResourceContentCommitted
  },
  {
    postMessage: function(msg) {
      // no-op
    }
  }
);

// Front-end intercepts Cmd+R, Ctrl+R and F5 keys and reloads the debugged
// page instead of the front-end page.  We want to disable this behaviour.
WebInspector._orig_documentKeyDown = WebInspector.documentKeyDown;
WebInspector.documentKeyDown = function(event) {
  switch (event.keyIdentifier) {
    case 'U+0052': // R key
    case 'F5':
      return;
  }
  WebInspector._orig_documentKeyDown(event);
};

var orig_createResourceFromFramePayload =
  WebInspector.ResourceTreeModel.prototype._createResourceFromFramePayload;

WebInspector.ResourceTreeModel.prototype._createResourceFromFramePayload =
  function(frame, url, type, mimeType) {
    // Force Script type for all node frames.
    // Front-end assigns Document type (i.e. HTML) to our main script file.
    if (frame._isNodeInspectorScript) {
      type = WebInspector.resourceTypes.Script;
    }

    return orig_createResourceFromFramePayload(frame, url, type, mimeType);
  };

//
// Open the main application file on startup
//

WebInspector.notifications.addEventListener(
  WebInspector.Events.InspectorLoaded,
  function() {
    WebInspector.resourceTreeModel.addEventListener(
      WebInspector.ResourceTreeModel.EventTypes.CachedResourcesLoaded,
      showMainAppFile,
      null
    );
  },
  null
);


function showMainAppFile() {
  var fileTabs = WebInspector.showPanel('scripts')._editorContainer._files;
  if (Object.keys(fileTabs).length > 0){
    // Some files are already opened - do not change user's workspace
    return;
  }

  var uiSourceCodes = getAllUiSourceCodes();
  var uriToShow = WebInspector.inspectedPageURL;

  for (var i in uiSourceCodes) {
    if (uiSourceCodes[i].uri() !== uriToShow) continue;
    WebInspector.showPanel('scripts').showUISourceCode(uiSourceCodes[i]);
    return true;
  }

  console.error('Cannot show the main application file ', uriToShow);
}

function getAllUiSourceCodes() {
  // Based on FilteredItemSectionDialog.js > SelectUISourceCodeDialog()
  var projects = WebInspector.workspace.projects();
  var uiSourceCodes = [];
  var projectFiles;

  for (var i = 0; i < projects.length; ++i) {
    projectFiles = projects[i]
      .uiSourceCodes()
      .filter(nameIsNotEmpty);
    uiSourceCodes = uiSourceCodes.concat(projectFiles);
  }

  return uiSourceCodes;

  function nameIsNotEmpty(p) {
    return p.name();
  }
}

var oldDetached = WebInspector.detached;
WebInspector.detached = function () {
  oldDetached.apply(this, arguments);
  setTimeout(function () {
    location.reload();
  }, 400);
};

//Remove unusable tabs in help window
WebInspector.SettingsController.prototype.orig_showSettingsScreen = 
  WebInspector.SettingsController.prototype.showSettingsScreen;
WebInspector.SettingsController.prototype.showSettingsScreen = function() {
  this.orig_showSettingsScreen(WebInspector.SettingsScreen.Tabs.Shortcuts);
};

//Override some specific strings in UI
var oldUIString = WebInspector.UIString;
var stringOverrides = {
  '(no domain)': '(core modules)'
};
WebInspector.UIString = function(string, vararg) {
  var args = Array.prototype.slice.call(arguments);
  args[0] = stringOverrides[string] || string;
  return oldUIString.apply(this, args);
};

// Hide chrome-specific elements
var chromeSpecificsWasHidden = false;
WebInspector.settings.lastActivePanel.addChangeListener(
  function(event) {
    var panelName = event.data;
    if (panelName == 'scripts' && !chromeSpecificsWasHidden) {
      var panes = WebInspector.panels.scripts.sidebarPanes;
      [
        panes.domBreakpoints.element,
        panes.domBreakpoints.titleElement.parentNode,
        panes.eventListenerBreakpoints.element,
        panes.eventListenerBreakpoints.titleElement.parentNode,
        panes.xhrBreakpoints.element,
        panes.xhrBreakpoints.titleElement.parentNode
      ].forEach(function(element) {
        element.classList.add('hidden');
      });
      chromeSpecificsWasHidden = true;
    }
  },
  null
);



//Node Inspector settings screen

InspectorBackend.registerCommand(
  "NodeInspector.getLocalConfigurationEnabled", 
  [], ["localConfigurationEnabled"], false);
InspectorBackend.registerCommand(
  "NodeInspector.setLocalConfigurationEnabled", 
  [{"name": "localConfigurationEnabled", "type": "boolean", "optional": false}], [], false);
InspectorBackend.registerCommand(
  "NodeInspector.getStackTraceLimit", 
  [], ["stackTraceLimit"], false);
InspectorBackend.registerCommand(
  "NodeInspector.setStackTraceLimit", 
  [{"name": "stackTraceLimit", "type": "number", "optional": false}], [], false);
InspectorBackend.registerNetworkDispatcher = 
  InspectorBackend.registerDomainDispatcher.bind(InspectorBackend, "NodeInspector");

WebInspector.notifications.addEventListener(
  WebInspector.Events.InspectorLoaded,
  function() {
    if (!WebInspector.settingsController._settingsScreen) {
      WebInspector.settingsController._settingsScreen = new WebInspector.SettingsScreen(
        WebInspector.settingsController._onHideSettingsScreen.bind(WebInspector.settingsController));
    }
    
    defineNodeInspectorSettings();
    
    var settings = WebInspector.settingsController._settingsScreen;
    settings._tabbedPane.appendTab(
      WebInspector.SettingsScreen.Tabs.NodeInspector, 
      WebInspector.UIString("Node Inspector"), 
      new WebInspector.NodeInspectorSettingsTab());
  },
  null
);

WebInspector.NodeInspectorSettingsTab = function()
{
    WebInspector.SettingsTab.call(
      this, 
      WebInspector.UIString("Node Inspector configuration"), 
      "inspector-tab-content");

    var p = this._appendSection();
    p.appendChild(
      WebInspector.SettingsTab.createSettingCheckbox(
        WebInspector.UIString("Enable local .node-inspectorrc configuration file"), 
        WebInspector.settings.localConfigurationEnabled));
        
    WebInspector.settings.localConfigurationEnabled.addChangeListener(
      this._localConfigurationEnabled, this);
    
    /*
    var disableJSElement = WebInspector.SettingsTab.createSettingCheckbox(WebInspector.UIString("Disable JavaScript"), WebInspector.settings.javaScriptDisabled);
    p.appendChild(disableJSElement);
    WebInspector.settings.javaScriptDisabled.addChangeListener(this._javaScriptDisabledChanged, this);
    this._disableJSCheckbox = disableJSElement.getElementsByTagName("input")[0];
    this._updateScriptDisabledCheckbox();

    p = this._appendSection(WebInspector.UIString("Appearance"));
    p.appendChild(WebInspector.SettingsTab.createSettingCheckbox(WebInspector.UIString("Split panels vertically when docked to right"), WebInspector.settings.splitVerticallyWhenDockedToRight));

    p = this._appendSection(WebInspector.UIString("Elements"));
    var colorFormatElement = this._createSelectSetting(WebInspector.UIString("Color format"), [
            [ WebInspector.UIString("As authored"), WebInspector.Color.Format.Original ],
            [ "HEX: #DAC0DE", WebInspector.Color.Format.HEX ],
            [ "RGB: rgb(128, 255, 255)", WebInspector.Color.Format.RGB ],
            [ "HSL: hsl(300, 80%, 90%)", WebInspector.Color.Format.HSL ]
        ], WebInspector.settings.colorFormat);
    p.appendChild(colorFormatElement);
    p.appendChild(WebInspector.SettingsTab.createSettingCheckbox(WebInspector.UIString("Show user agent styles"), WebInspector.settings.showUserAgentStyles));
    p.appendChild(WebInspector.SettingsTab.createSettingCheckbox(WebInspector.UIString("Word wrap"), WebInspector.settings.domWordWrap));
    p.appendChild(WebInspector.SettingsTab.createSettingCheckbox(WebInspector.UIString("Show Shadow DOM"), WebInspector.settings.showShadowDOM));
    p.appendChild(WebInspector.SettingsTab.createSettingCheckbox(WebInspector.UIString("Show rulers"), WebInspector.settings.showMetricsRulers));

    p = this._appendSection(WebInspector.UIString("Rendering"));
    p.appendChild(WebInspector.SettingsTab.createSettingCheckbox(WebInspector.UIString("Show paint rectangles"), WebInspector.settings.showPaintRects));
    this._forceCompositingModeCheckbox = document.createElement("input");

    var checkbox = WebInspector.SettingsTab.createSettingCheckbox(WebInspector.UIString("Force accelerated compositing"), WebInspector.settings.forceCompositingMode, false, this._forceCompositingModeCheckbox);
    p.appendChild(checkbox);
    WebInspector.settings.forceCompositingMode.addChangeListener(this._forceCompositingModeChanged, this);
    var fieldset = WebInspector.SettingsTab.createSettingFieldset(WebInspector.settings.forceCompositingMode);
    this._showCompositedLayersBordersCheckbox = document.createElement("input");
    fieldset.appendChild(WebInspector.SettingsTab.createSettingCheckbox(WebInspector.UIString("Show composited layer borders"), WebInspector.settings.showDebugBorders, false, this._showCompositedLayersBordersCheckbox));
    this._showFPSCheckbox = document.createElement("input");
    fieldset.appendChild(WebInspector.SettingsTab.createSettingCheckbox(WebInspector.UIString("Show FPS meter"), WebInspector.settings.showFPSCounter, false, this._showFPSCheckbox));
    this._continousPaintingCheckbox = document.createElement("input");
    fieldset.appendChild(WebInspector.SettingsTab.createSettingCheckbox(WebInspector.UIString("Enable continuous page repainting"), WebInspector.settings.continuousPainting, false, this._continousPaintingCheckbox));
    this._showScrollBottleneckRectsCheckbox = document.createElement("input");
    var tooltip = WebInspector.UIString("Shows areas of the page that slow down scrolling:\nTouch and mousewheel event listeners can delay scrolling.\nSome areas need to repaint their content when scrolled.");
    fieldset.appendChild(WebInspector.SettingsTab.createSettingCheckbox(WebInspector.UIString("Show potential scroll bottlenecks"), WebInspector.settings.showScrollBottleneckRects, false, this._showScrollBottleneckRectsCheckbox, tooltip));
    checkbox.appendChild(fieldset);
    this._forceCompositingModeChanged();

    p = this._appendSection(WebInspector.UIString("Sources"));
    p.appendChild(WebInspector.SettingsTab.createSettingCheckbox(WebInspector.UIString("Search in content scripts"), WebInspector.settings.searchInContentScripts));
    p.appendChild(WebInspector.SettingsTab.createSettingCheckbox(WebInspector.UIString("Enable JS source maps"), WebInspector.settings.jsSourceMapsEnabled));

    checkbox = WebInspector.SettingsTab.createSettingCheckbox(WebInspector.UIString("Enable CSS source maps"), WebInspector.settings.cssSourceMapsEnabled);
    p.appendChild(checkbox);
    fieldset = WebInspector.SettingsTab.createSettingFieldset(WebInspector.settings.cssSourceMapsEnabled);
    var autoReloadCSSCheckbox = fieldset.createChild("input");
    fieldset.appendChild(WebInspector.SettingsTab.createSettingCheckbox(WebInspector.UIString("Auto-reload generated CSS"), WebInspector.settings.cssReloadEnabled, false, autoReloadCSSCheckbox));
    checkbox.appendChild(fieldset);

    var indentationElement = this._createSelectSetting(WebInspector.UIString("Default indentation"), [
            [ WebInspector.UIString("2 spaces"), WebInspector.TextUtils.Indent.TwoSpaces ],
            [ WebInspector.UIString("4 spaces"), WebInspector.TextUtils.Indent.FourSpaces ],
            [ WebInspector.UIString("8 spaces"), WebInspector.TextUtils.Indent.EightSpaces ],
            [ WebInspector.UIString("Tab character"), WebInspector.TextUtils.Indent.TabCharacter ]
        ], WebInspector.settings.textEditorIndent);
    p.appendChild(indentationElement);
    p.appendChild(WebInspector.SettingsTab.createSettingCheckbox(WebInspector.UIString("Detect indentation"), WebInspector.settings.textEditorAutoDetectIndent));
    p.appendChild(WebInspector.SettingsTab.createSettingCheckbox(WebInspector.UIString("Show whitespace characters"), WebInspector.settings.showWhitespacesInEditor));
    if (WebInspector.experimentsSettings.frameworksDebuggingSupport.isEnabled()) {
        checkbox = WebInspector.SettingsTab.createSettingCheckbox(WebInspector.UIString("Skip stepping through sources with particular names"), WebInspector.settings.skipStackFramesSwitch);
        fieldset = WebInspector.SettingsTab.createSettingFieldset(WebInspector.settings.skipStackFramesSwitch);
        fieldset.appendChild(this._createInputSetting(WebInspector.UIString("Pattern"), WebInspector.settings.skipStackFramesPattern, false, 1000, "100px", WebInspector.SettingsScreen.regexValidator));
        checkbox.appendChild(fieldset);
        p.appendChild(checkbox);
    }
    WebInspector.settings.skipStackFramesSwitch.addChangeListener(this._skipStackFramesSwitchOrPatternChanged, this);
    WebInspector.settings.skipStackFramesPattern.addChangeListener(this._skipStackFramesSwitchOrPatternChanged, this);

    p = this._appendSection(WebInspector.UIString("Profiler"));
    p.appendChild(WebInspector.SettingsTab.createSettingCheckbox(WebInspector.UIString("Show advanced heap snapshot properties"), WebInspector.settings.showAdvancedHeapSnapshotProperties));

    p = this._appendSection(WebInspector.UIString("Timeline"));
    checkbox = WebInspector.SettingsTab.createSettingCheckbox(WebInspector.UIString("Limit number of captured JS stack frames"), WebInspector.settings.timelineLimitStackFramesFlag);
    p.appendChild(checkbox);

    fieldset = WebInspector.SettingsTab.createSettingFieldset(WebInspector.settings.timelineLimitStackFramesFlag);
    var frameCountValidator = WebInspector.SettingsScreen.integerValidator.bind(this, 0, 99);
    fieldset.appendChild(this._createInputSetting(WebInspector.UIString("Frames to capture"), WebInspector.settings.timelineStackFramesToCapture, true, 2, "2em", frameCountValidator));
    checkbox.appendChild(fieldset);

    p.appendChild(WebInspector.SettingsTab.createSettingCheckbox(WebInspector.UIString("Show CPU activity on the ruler"), WebInspector.settings.showCpuOnTimelineRuler));

    p = this._appendSection(WebInspector.UIString("Console"));
    p.appendChild(WebInspector.SettingsTab.createSettingCheckbox(WebInspector.UIString("Log XMLHttpRequests"), WebInspector.settings.monitoringXHREnabled));
    p.appendChild(WebInspector.SettingsTab.createSettingCheckbox(WebInspector.UIString("Preserve log upon navigation"), WebInspector.settings.preserveConsoleLog));

    if (WebInspector.extensionServer.hasExtensions()) {
        var handlerSelector = new WebInspector.HandlerSelector(WebInspector.openAnchorLocationRegistry);
        p = this._appendSection(WebInspector.UIString("Extensions"));
        p.appendChild(this._createCustomSetting(WebInspector.UIString("Open links in"), handlerSelector.element));
    }

    p = this._appendSection();
    var panelShortcutTitle = WebInspector.UIString("Enable %s + 1-9 shortcut to switch panels", WebInspector.isMac() ? "Cmd" : "Ctrl");
    p.appendChild(WebInspector.SettingsTab.createSettingCheckbox(panelShortcutTitle, WebInspector.settings.shortcutPanelSwitch));
    */
}

function defineNodeInspectorSettings() {
  WebInspector.settings.localConfigurationEnabled =
    WebInspector.settings.createSetting('localConfigurationEnabled', false);
}

WebInspector.NodeInspectorSettingsTab.prototype = {
  _localConfigurationEnabled: function(event) {
    var enabled = event.data;
    NodeInspectorAgent.setLocalConfigurationEnabled(enabled);
  },

    /**
     * @param {WebInspector.Event=} event
     
    _forceCompositingModeChanged: function(event)
    {
        var compositing = event ? !!event.data : WebInspector.settings.forceCompositingMode.get();
        if (!compositing) {
            this._showFPSCheckbox.checked = false;
            this._continousPaintingCheckbox.checked = false;
            this._showCompositedLayersBordersCheckbox.checked = false;
            this._showScrollBottleneckRectsCheckbox.checked = false;
            WebInspector.settings.showFPSCounter.set(false);
            WebInspector.settings.continuousPainting.set(false);
            WebInspector.settings.showDebugBorders.set(false);
            WebInspector.settings.showScrollBottleneckRects.set(false);
        }
        this._forceCompositingModeCheckbox.checked = compositing;
    },

    _updateScriptDisabledCheckbox: function()
    {
        function executionStatusCallback(error, status)
        {
            if (error || !status)
                return;

            switch (status) {
            case "forbidden":
                this._disableJSCheckbox.checked = true;
                this._disableJSCheckbox.disabled = true;
                break;
            case "disabled":
                this._disableJSCheckbox.checked = true;
                break;
            default:
                this._disableJSCheckbox.checked = false;
                break;
            }
        }

        PageAgent.getScriptExecutionStatus(executionStatusCallback.bind(this));
    },

    _javaScriptDisabledChanged: function()
    {
        // We need to manually update the checkbox state, since enabling JavaScript in the page can actually uncover the "forbidden" state.
        PageAgent.setScriptExecutionDisabled(WebInspector.settings.javaScriptDisabled.get(), this._updateScriptDisabledCheckbox.bind(this));
    },

    _skipStackFramesSwitchOrPatternChanged: function()
    {
        WebInspector.DebuggerModel.applySkipStackFrameSettings();
    },
    */
    __proto__: WebInspector.SettingsTab.prototype
}
