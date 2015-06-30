/**
* @param {Array} injections
* @param {Array} options
*/
function injectorServer(options) {
  var debug = require(options['v8-debug']);

  global.process._require = require;
  global.process._debugObject = debug;

  debug.convert = require(options['convert']);
  debug.enableWebkitProtocol();
}

module.exports = injectorServer;
