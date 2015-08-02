/*jshint browser:true, nonew:false*/
/*global WebInspector:true*/
WebInspector.SettingsScreenOverrides = function() {
  this._overrideShowSettingsScreen();
};

WebInspector.SettingsScreenOverrides.prototype = {
  _overrideShowSettingsScreen: function() {
    //Show only shortcuts
    WebInspector.SettingsController.prototype.orig_showSettingsScreen =
      WebInspector.SettingsController.prototype.showSettingsScreen;
    WebInspector.SettingsController.prototype.showSettingsScreen = function() {
      this.orig_showSettingsScreen();

      if (!this._overridenCssRegistered) {
        this._overridenCssRegistered = true;
      }
      this._settingsScreen._tabbedPaneController._tabbedPane.selectTab('shortcuts');
      this._settingsScreen._tabbedPaneController._tabbedPane.registerRequiredCSS('node/settings/SettingsScreenOverrides.css');
    };
  }
};

new WebInspector.SettingsScreenOverrides();
