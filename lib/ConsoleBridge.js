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

var Server = require('net').createServer,
    convert = require('./convert.js');

var CONSOLE_ID_MATCHER = /^console:(\d+):(\d+)$/;

function ConsoleBridge(config, frontendClient, debuggerClient) {
  this._frontendClient = frontendClient;
  this._debuggerClient = debuggerClient;

  this._messages = {};
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

  this._messages = {};
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
  try {
    message = JSON.parse(this._buffer);
  } catch (e) {}

  if (message) {
    var refs = {};
    message.refs.forEach(function(r) { refs[r.handle] = r; });

    this._buffer = '';
    this._messages[message.num] = refs;

    this._frontendClient.sendEvent(
      'Console.messageAdded',
      {
        message: {
          level: 'log',
          source: 'console-api',
          parameters: message.body.map(convert.v8ResultToInspectorResult)
        }
      }
    );
  }
};

ConsoleBridge.prototype._onCloseConnection = function() {
  this.injected = false;
};

ConsoleBridge.prototype.isConsoleId = function(objectId) {
  return CONSOLE_ID_MATCHER.test(objectId);
};

ConsoleBridge.prototype.getMessageScope = function(messageNum, callback) {
  var result = this._messages[messageNum];
  if (!result) {
    callback(new Error('no data'));
  }
  else {
    callback(null, result);
  }
};

/*!!! DON'T CALL THIS FUNCTION !!!*/
function injection(port) {
  var client = require('net').connect({port: port}),
      messageCounter = 0,
      handleCounter = 0;

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
      var args = [].slice.call(arguments),
          message = {};
      message.body = args.map(function(arg) {
        return new RemoteObject(arg);
      });
      message.refs = Reference.prototype.refs;
      message.num = messageCounter;

      client.write(JSON.stringify(message));

      Reference.prototype.refs.length = 0;
      Reference.prototype.handlesCache.length = 0;
      RemoteObject.prototype.objectsCache.length = 0;
      RemoteObject.prototype.remoteObjectsCache.length = 0;
      messageCounter++;
      handleCounter = 0;

      return func.apply(console, args);
    }
  }
  function RemoteObject(object) {
    var indexInCache = this.objectsCache.indexOf(object);
    if (~indexInCache) {
      return this.remoteObjectsCache[indexInCache];
    }

    this.handle = this.getHandle();
    this.type = this.getType(object);

    this.objectsCache.push(object);
    this.remoteObjectsCache.push(this);
    new Reference(object);

    if (['object', 'function'].indexOf(this.type) >= 0) {
      this.className = this.getClassName(object);
      if (this.className === 'RegExp') {
        this.type = 'regexp';
      }
      this.constructorFunction = new Reference(object.constructor);
      this.proto = new Reference(object.__proto__);
      this.prototypeObject = new Reference(object.prototype);
      this.properties = Object.getOwnPropertyNames(object).map(function(key) {
        var descriptor = Object.getOwnPropertyDescriptor(object, key);
        return new Reference(object[key], key, descriptor);
      });
    }
    if (['string', 'boolean', 'number'].indexOf(this.type) >= 0) {
      this.value = object;
    }
    if (this.type === 'function') {
      this.name = object.name;
      this.inferredName = '';
      this.source = object.toString();
      this.line = 0;
      this.column = 0;
      this.scriptId = 0;
      this.position = 0;
    }
    if (this.type === 'string') {
      this.length = object.length;
    }
    this.text = this.getText(object);
  }
  RemoteObject.prototype = {
    objectsCache: [],
    remoteObjectsCache: [],
    getHandle: function() {
      return 'console:' + messageCounter + ':' + handleCounter++;
    },
    getType: function(object) {
      var type = typeof object;
      if (type == 'object' && !object) {
        type = 'null';
      }
      return type;
    },
    getClassName: function(object) {
      var classText = Object.prototype.toString.call(object),
          className = classText.replace(/^\[object (.*?)\]$/, '$1');
      return className;
    },
    getText: function(object) {
      if (['null', 'undefined'].indexOf(this.type) >= 0) {
        return this.type;
      }
      else if (['string', 'boolean', 'number'].indexOf(this.type) >= 0) {
        return this.value;
      }
      else if (this.type === 'function') {
        return this.source;
      }
      else if (this.type === 'regexp') {
        return object.toString();
      }
      else {
        return '#<' + this.className + '>';
      }
    }
  };
  function Reference(object, name, descriptor) {
    var remoteObject = new RemoteObject(object);
    this.ref = remoteObject.handle;
    if (name) { this.name = name; }
    if (descriptor) {
      this.attributes = (descriptor.writable ? 1 : 0) |
                        (descriptor.enumerable ? 2 : 0);
    }
    var indexInCache = this.handlesCache.indexOf(this.ref);
    if (!~indexInCache) {
      this.refs.push(remoteObject);
      this.handlesCache.push(this.ref);
    }
  };
  Reference.prototype = {
    refs: [],
    handlesCache: []
  };
}
