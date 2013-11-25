/******************************************************************************
 * HOW IT'S WORK:                                                             *
 * Console Bridge is client-server net connection, where app is client.       *
 * We can't simple require 'net' module, because 'require' is local           *
 * for modules.                                                               *
 * Injection:                                                                 *
 *  We need to break in any place and go up by the trace stack,               *
 *  where we can find 'require' function.                                     *
 *  Nice place to break is 'console' functions.                               *
 *  1) We need to wrap 'console' with function with 'debugger' keyword.       *
 *    (We can't set breakpoint in native code, but can wrap him)              *
 *  2) When we break on console`s function, we go up to last frame of stack.  *
 *    (This is native code layer where in scope we can find 'require')        *
 *  3) Now we evaluate main injection, that:                                  *
 *      Require 'net'                                                         *
 *      Create client connection                                              *
 *      Wrap 'console' function                                               *
 *  4) All console messages converts to V8 debugger lookup response           *
 *     and sends to server.                                                   *
 ******************************************************************************/

module.exports = ConsoleBridge;

var Server = require('net').createServer;

var CONSOLE_ID_MATCHER = /^console:(\d+):(\d+)$/;

function ConsoleBridge(config, frontendClient, debuggerClient) {
  this._frontendClient = frontendClient;
  this._debuggerClient = debuggerClient;

  this._buffer = '';
  this._server = null;
  this._conn = null;
  this._port = null;

  this.injected = false;

  this._debuggerClient
    .on('close', this._closeServer.bind(this))
    .on('connect', this._initServer.bind(this));
}

ConsoleBridge.prototype._closeServer = function() {
  this._conn && this._conn.end();
  this._server && this._server.close();

  this._buffer = '';
  this._server = null;
  this._conn = null;
  this._port = null;
};

ConsoleBridge.prototype._initServer = function() {
  this._server = Server();
  this._server
    .on('connection', this._initConnection.bind(this))
    .on('error', function() {})
    .on('close', function() {})
    .on('listening', (function() {
      this._port = this._server.address().port;
      this._wrapFunctions();
    }).bind(this));
  this._server.listen(0);
};

ConsoleBridge.prototype._wrapFunctions = function() {
  this._debuggerClient.request(
    'evaluate',
    {
      expression: this._breakWrapper(),
      global: true
    }
  );
};

ConsoleBridge.prototype._breakWrapper = function() {
  return 'Object.keys(console).forEach(function(level){' +
            'console[level] = (function(f){' +
              'console["_"+level] = f;' +
              'return function(){' +
                'debugger;' +
                'f.apply(console, arguments);' +
                'if(!console["_"+level]){' +
                  'console[level] = f;' +
          '}}})(console[level]);})';
};

ConsoleBridge.prototype.isBreakWrapper = function(sourceLine) {
  return this._breakWrapper() == sourceLine;
};

ConsoleBridge.prototype.injectClient = function() {
  this._debuggerClient.request(
    'backtrace',
    {
      fromFrame: 1,
      toFrame: 2
    },
    this._evaluateInjection.bind(this)
  );
};

ConsoleBridge.prototype._evaluateInjection = function(err, response) {
  var injection = this._createInjection(),
      frame = response.totalFrames - 1;

  this._debuggerClient.request(
    'evaluate',
    {
      expression: injection,
      frame: frame
    },
    this._endInjecting.bind(this)
  );
};

ConsoleBridge.prototype._createInjection = function() {
  return '(' + injection.toString() + ')(' + this._port + ')';
};

ConsoleBridge.prototype._endInjecting = function(err, response) {
  this.injected = true;
  this._consoleWrappers = [];
  this._debuggerClient.request('continue');
};

ConsoleBridge.prototype._initConnection = function(connection) {
  this._conn = connection;
  connection
    .on('data', this._onMessage.bind(this))
    .on('close', this._onCloseConnection.bind(this))
    .on('error', function() {});
};

ConsoleBridge.prototype._onMessage = function(data) {
  var message;

  this._buffer += data;
  console.log(this._buffer)
  try {
    message = JSON.parse(this._buffer);
  } catch (e) {}

  if (message) {
    this._buffer = '';
    this._frontendClient.sendEvent(
      'Console.messageAdded',
      {
        message: {
          level: 'log',
          source: 'console-api',
          text: message
        }
      }
    );
  }
};

ConsoleBridge.prototype._onCloseConnection = function() {
  this.injected = false;
};

/*!!! DON'T CALL THIS FUNCTION !!!*/
function injection(port) {
  var client = require('net').connect({port: port});

  client
    .on('connect', wrapConsole)
    .on('close', unwrapConsole)
    .on('error', function() {});

  function wrapConsole() {
    Object.keys(console).forEach(function(level) {
      if (!/^_/.test(level)) {
        console[level] = wrapFunction(level, console['_' + level]);
      }
    });
  }
  function unwrapConsole() {
    Object.keys(console).forEach(function(level) {
      if (!/^_/.test(level)) {
        console[level] = console['_' + level];
        console['_' + level] = null;
        delete console['_' + level];
      }
    });
  }
  function wrapFunction(level, func) {
    return function() {
      var args = [].slice.call(arguments);
      
      client.write(JSON.stringify(args[0]));

      return func.apply(console, args);
    }
  }
}
