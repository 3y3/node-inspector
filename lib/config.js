var rc = require('rc'),
    yargs = require('yargs'),
    util = require('util');

var definitions = {
  'help': {
    desc: 'Show this help',
    default: false
  },
  'version': {
    desc: 'Print Node Inspector\'s version',
    default: false
  },
  'web-port': {
    desc: 'Port to host the inspector',
    default: 8080
  },
  'web-host': {
    desc: 'Host to listen on',
    default: ''
  },
  'debug-port': {
    desc: 'Port to connect to the debugging app',
    default: 5858
  },
  'save-live-edit': {
    desc: 'Save live edit changes to disk (update the edited files)',
    default: false
  },
  'preload': {
    desc: 'Preload *.js files. You can disable this option to speed up the startup.\n' +
          '    (command-line parameter: \u001b[92m--no-preload\u001b[0m)',
    default: true
  },
  'inject': {
    desc: 'Enables injection of debugger extensions in app',
    default: true
  },
  'hidden': {
    desc: 'Array of files to hide from the UI (breakpoints in these files' +
          ' will be ignored)',
    default: []
  },
  'stack-trace-limit': {
    desc: 'Number of stack frames to show on a breakpoint',
    default: 50
  }
};

function Config(argv) {
  var defaults = collectDefaultsFromDefinitions();
  var parsedArgv = parseArgs(argv || process.argv);
  var rcConfig = rc('node-inspector', defaults, parsedArgv);
  var config = normalizeOptions(rcConfig);

  if (config.noPreload !== undefined) {
    // Deprecated in v0.7.3
    console.warn('The config option `no-preload` is deprecated, use `preload` instead');
    config.preload = config.preload || !config.noPreload;
  }
  
  util._extend(this, config);
}

module.exports = Config;

module.exports._collectDefaults = function() {
  var dashedKeyDefaults = collectDefaultsFromDefinitions();
  return normalizeOptions(dashedKeyDefaults);
};

module.exports._describeOptions = function() {
  return Object.keys(definitions)
    .map(function constructMessagePart(key) {
      var definition = definitions[key];

      var defaultValue = definition.defaultValue;
      var defaultString = JSON.stringify(definition.defaultValue);

      var typeString = Object.prototype.toString.call(defaultValue);
      var matchedType = /^\[object (.*)\]$/.exec(typeString)[1];

      var optionKey = '\u001b[92m--' + key;
      var optionTypeAndDefault =
        matchedType !== 'Undefined' && matchedType !== 'Boolean' ?
          '=\u001b[90m{' + matchedType + '}' +
            ' \u001b[96m(default: ' + defaultString + ')' :
          '';
      var optionDescription = '\u001b[0m' + definition.desc;

      return '    ' + optionKey + optionTypeAndDefault +
        '\n    ' + optionDescription;
    })
    .join('\n\n');
};

function normalizeOptions(options) {
  var normalizedOptions = {};
  
  Object.keys(options).forEach(function(key) {
    var camelKey = keyToCamelKey(key);
    normalizedOptions[camelKey] = options[key];
  });
  
  checkHiddenOption(normalizedOptions);
  
  return normalizedOptions;
}

function checkHiddenOption(options) {
  function toRegExp(string) {
    return new RegExp(string, 'i');
  }
  options.hidden = [].concat(options.hidden || []).map(toRegExp);
}

function keyToCamelKey(key) {
  return key.replace(/-./g, function(letter) {
    return letter.slice(1).toUpperCase();
  });
}

function collectDefaultsFromDefinitions() {
  var options = {};

  Object.keys(definitions).forEach(function(key) {
    options[key] = definitions[key].default;
  });

  return options;
}

function parseArgs(argv) {
  argv = argv.slice(2);
  
  var argvParser = yargs.options(definitions);
  
  var options = argvParser.parse(argv);
  
  //filter options
  Object.keys(options).forEach(function(key) {
    if (util.isArray(options[key])) {
      //Ignore array options
    } else if (/A-Z/.test(key)) {
      //filter camelKey options created by yargs
      delete options[key];
    } else if (definitions[key] && options[key] === definitions[key].default) {
      //filter options with default values
      delete options[key];
    }
  });
  
  return options;
}
