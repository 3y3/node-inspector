var rc = require('rc'),
    path = require('path'),
    yargs = require('yargs'),
    util = require('util');

var NODE_DEBUG = /node\-debug\.js$/.test(module.parent.filename);

module.exports = Config;

var definitions = {
  'help': {
    alias: 'h',
    type: 'string',
    description: 'Display information about avaible options.',
    usage: {
      '--help': '           display short list of avaible options',
      '--help <option>': '  display quick help on <option>',
      '--help -l': '        display full usage info'
    },
    _isNodeDebugOption: true,
    _isNodeInspectorOption: true
  },
  'version': {
    alias: 'v',
    type: 'boolean',
    description: 'Display Node Inspector\'s version.',
    usage: '--version',
    _isNodeDebugOption: true,
    _isNodeInspectorOption: true,
    default: false
  },
  'web-port': {
    alias: ['p', 'port'],
    type: 'number',
    description: 'Port to listen on for Node Inspector\'s web interface.',
    usage: {
      '--web-port 8081': '',
      '-p 8081': ''
    },
    _isNodeInspectorOption: true,
    default: 8080
  },
  'web-host': {
    type: 'string',
    description: 'Host to listen on for Node Inspector\'s web interface.',
    usage: {
      '--web-host 127.0.0.1': '',
      '--web-host www.example.com': ''
    },
    _isNodeInspectorOption: true,
    default: NODE_DEBUG ? '127.0.0.1' : ''
  },
  'debug-port': {
    alias: 'd',
    type: 'number',
    description: 'Node/V8 debugger port (`node --debug={port}`).',
    _isNodeDebugOption: true,
    _isNodeInspectorOption: true,
    default: 5858
  },
  'save-live-edit': {
    type: 'boolean',
    description: 'Save live edit changes to disk (update the edited files).',
    usage: {
      '--save-live-edit': '',
      '--no-save-live-edit': '    disable saving live edit changes to disk'
    },
    _isNodeInspectorOption: true,
    default: false
  },
  'preload': {
    type: 'boolean',
    description: 'Preload *.js files. You can disable this option to speed up the startup.',
    usage: {
      '--preload': '',
      '--no-preload': '    disable preloading *.js files'
    },
    _isNodeInspectorOption: true,
    default: true
  },
  'inject': {
    type: 'boolean',
    description: 'Enables injection of debugger extensions in application.',
    usage: {
      '--inject': '',
      '--no-inject': '    disable injecting of debugger extensions'
    },
    _isNodeInspectorOption: true,
    default: true
  },
  'stack-trace-limit': {
    type: 'number',
    description: 'Number of stack frames to show on a breakpoint.',
    _isNodeInspectorOption: true,
    default: 50
  },
  'hidden': {
    alias: ['exclude', 'e'],
    type: 'string',
    description: 'Array of files to hide from the UI (breakpoints in these files will be ignored).',
    _isNodeInspectorOption: true
  },
  'nodejs': {
    type: 'string',
    description: 'Pass NodeJS options to debugged process (`node --option={value}`).',
    usage: '--nodejs --harmony --nodejs --random_seed=2 app',
    _isNodeDebugOption: true
  },
  'script': {
    type: 'string',
    description: 'Pass options to debugged process (`node app --option={value}`).\n' +
                  '  This option is useful only for external rc configurations.',
    usage: {
      '--script --option=2 app': '           overcomplicated way',
      'app --flag --option=2': '             simple way',
      '{ "script": ["flag", "option=2"] }': 'in rc config'
    },
    _isNodeDebugOption: true
  },
  'config': {
    type: 'string',
    description: 'Path to external config file.\n' +
                  '  For more information see \'rc\' module documentation.',
    _isNodeDebugOption: true,
    _isNodeInspectorOption: true
  },
  'debug-brk': {
    alias: 'b',
    type: 'boolean',
    description: 'Break on the first line (`node --debug-brk`).',
    _isNodeDebugOption: true,
    default: NODE_DEBUG ? true : false
  },
  'cli': {
    alias: 'c',
    type: 'boolean',
    description: 'CLI mode, do not open browser.',
    usage: '--cli',
    _isNodeDebugOption: true,
    default: false
  }
};

function Config(argv) {
  var defaults = collectDefaultsFromDefinitions();
  var parsedArgv = parseArgs(argv || process.argv.slice(2));
  var rcConfig = rc('node-inspector', defaults, parsedArgv);
  var normalizedOptions = normalizeOptions(rcConfig);

  util._extend(this, normalizedOptions);
}

Config._collectDefaults = function() {
  var dashedKeyDefaults = collectDefaultsFromDefinitions();
  return normalizeOptions(dashedKeyDefaults);
};

Config.serializeOptions = function(options, filter) {
  filter = filter || {};
  var result = [];
  Object.keys(options).forEach(function(key) {
    if (filter[key]) return;

    var serializedOption = serializeOption(keyToDashedKey(key), options[key]);
    if (serializedOption !== '')
      result.push(serializedOption);
  });
  return result;
};

function serializeOption(key, value) {
  var prefix = key.length > 1 ? '--' : '-';
  if (value === undefined) return '';
  if (value === true) {
    return prefix + key;
  } else if (value === false) {
    return prefix + key + '=false';
  } else if (util.isArray(value)) {
    if (!value.length) return '';
    return value.map(function(_value) {
      return prefix + key + ' ' + JSON.stringify(_value);
    }).join(' ');
  } else {
    return prefix + key + '=' + JSON.stringify(value);
  }
}

Config.filterNodeDebugOptions = function(options) {
  var filteredOptions = {};

  Object.keys(options).forEach(function(key) {
    var dashedKey = keyToDashedKey(key);
    var definition = definitions[dashedKey];

    if (definition && !definition._isNodeInspectorOption) return;

    filteredOptions[key] = options[key];
  });

  return filteredOptions;
};

Config.filterDefaultValues = function(options) {
  var filteredOptions = {};

  Object.keys(options).forEach(function(key) {
    var dashedKey = keyToDashedKey(key);
    var definition = definitions[dashedKey];

    if (!definition || definition && definition.default !== options[key])
      filteredOptions[key] = options[key];

  });

  return filteredOptions;
};

Config.printHelpAndExit = function(helpOptionValue, fullHelpInfo) {
  var cmd = getCmd();

  var inspectorOptions = [];
  var nodeDebugOptions = [];
  Object.keys(definitions).forEach(function(key) {
    if (definitions[key]._isNodeDebugOption && NODE_DEBUG) {
      nodeDebugOptions.push(key);
    } else if (definitions[key]._isNodeInspectorOption) {
      inspectorOptions.push(key);
    }
  });

  if (typeof helpOptionValue == 'string') {
    //Display help for target option
    showOptionHelp(helpOptionValue);
  } else if (fullHelpInfo) {
    //Display full help info
    inspectorOptions.forEach(showOptionHelp);
    if (NODE_DEBUG) {
      nodeDebugOptions.forEach(showOptionHelp);
    }
  } else {
    //Display options format, options list and some help information
    var inspectorPart = color('green', '[node-inspector-options]');
    var optionsPart = color('yellow', '[options]');
    var scriptPart = color('magenta', '[script [script-arguments]]');
    var configurationParts = [inspectorPart];
    if (NODE_DEBUG) {
      configurationParts.unshift(optionsPart);
      configurationParts.push(scriptPart);
    }

    console.log(
        'Usage:\n    %s %s\n', cmd, configurationParts.join(' '));

    if (NODE_DEBUG) {
      console.log(
        'The %s is one or more of:\n' +
        '    %s\n', optionsPart, optionsToFixedLengthString(nodeDebugOptions, 40));
    }
    console.log(
        'The %s is one or more of:\n' +
        '    %s\n', inspectorPart, optionsToFixedLengthString(inspectorOptions, 40));
    console.log('Use:' + formatUsage(definitions.help.usage) + '\n');

    if (NODE_DEBUG) {
      console.log(
        'The %s argument is resolved relative to the current working\n' +
        'directory. If no such file exists, then env.PATH is searched.\n',
        color('magenta', '[script]'));
      console.log(
        'The default mode is to break on the first line of the script, to run\n' +
        'immediately on start use `--no-debug-brk` or press the Resume button.\n');
      console.log(
        'When there is no script specified, the module in the current working\n' +
        'directory is loaded in the REPL session as `m`. This allows you to call\n' +
        'and debug arbitrary functions exported by the current module.\n');
    }

    console.log(
        'Configuration can be stored as \'.node-inspectorrc\' file in project folder.\n' +
        'Valid \'.node-inspectorrc\' example:\n' +
        color('grey', '  {\n' +
        '    "web-port": 8081,\n' +
        '    "debug-port": 5859,\n' +
        '    "preload": false,\n' +
        '    "save-live-edit": true,\n' +
        '    "debug-brk": false,\n' +
        '    "hidden": ["^abc\\.js$", "[^A-Z]"],\n' +
        '    "nodejs": ["--harmony"],\n' +
        '    "script": ["--flag", "--option=2"]\n' +
        '  }'));
  }
  process.exit();
};

function showOptionHelp(option) {
  var info = definitions[option];

  if (info) {
    var optionLine = '--' + option;
    if (info.alias) {
      var aliases = [].concat(info.alias);
      optionLine += ', ' + aliases.map(function(alias) {
        var prefix = alias.length == 1 ? '-' : '--';
        return prefix + alias;
      }).join(', ');
    }
    console.log(color('green', optionLine));
    console.log('  ' + info.description);
    if (info.default !== undefined) {
      console.log('  Default: ' + color('yellow', JSON.stringify(info.default)));
    }
    if (info.usage) {
      var formattedUsage = formatUsage(info.usage);
      console.log('  Usage:' + formattedUsage);
    }
    console.log();
  } else {
    console.error('Description for %s not found', option);
  }
}

function formatUsage(usage) {
  var formattedUsage = '';
  var cmd = getCmd();
  if (typeof usage == 'object') {
    Object.keys(usage).forEach(function(key) {
      formattedUsage += '\n    ' + cmd + ' ' + key + ' ' + color('grey', usage[key]);
    });
  } else if (typeof usage == 'string') {
    formattedUsage += '\n    ' + cmd + ' ' + usage;
  }
  return formattedUsage;
}

function optionsToFixedLengthString(optionsArray, length) {
  var fixedLengthMatcher = new RegExp('(.{' + length + '}\\S*)\\s', 'g');
  return optionsArray.join(', ').replace(fixedLengthMatcher, '$1\n    ');
}

Config.printVersionAndExit = function() {
    console.log('v' + require('../package.json').version);
    process.exit();
};

function normalizeOptions(options) {
  var normalizedOptions = {};

  checkHiddenOption(options);
  checkNodejsOption(options);
  checkScriptOption(options);
  checkPreloadOption(options);

  Object.keys(options).forEach(function(key) {
    var camelKey = keyToCamelKey(key);
    normalizedOptions[camelKey] = options[key];
  });

  return normalizedOptions;
}

function checkHiddenOption(options) {
  options.hidden = [].concat(options.hidden || []);

  options.hidden = options.hidden.map(function(string) {
    return new RegExp(string, 'i');
  });
}

function checkNodejsOption(options) {
  options.nodejs = [].concat(options.nodejs || []);
}

function checkScriptOption(options) {
  options.script = [].concat(options.script || []);
}

function checkPreloadOption(options) {
  if (options.noPreload !== undefined) {
    // Deprecated in v0.7.3
    console.warn('The config option `no-preload` is deprecated, use `preload` instead');
    options.preload = options.preload || !options.noPreload;
  }
}

function getCmd() {
  return process.env.CMD || path.basename(process.argv[1]);
}

function color(_color, string) {
  var colors = util.inspect.colors;
  return '\u001b[' + colors[_color][0] + 'm' + string +
         '\u001b[' + colors[_color][1] + 'm';
}

function keyToCamelKey(key) {
  return key.replace(/-./g, function(letter) {
    return letter.slice(1).toUpperCase();
  });
}

function keyToDashedKey(key) {
  return key.replace(/[A-Z]/g, function(letter) {
    return '-' + letter.toLowerCase();
  });
}

function collectDefaultsFromDefinitions() {
  var options = {};

  Object.keys(definitions).forEach(function(key) {
    if (util.isArray(definitions[key].default)) {
      options[key] = definitions[key].default.slice();
      return;
    }
    options[key] = definitions[key].default;
  });

  return options;
}

function collectAliasesFromDefinitions() {
  var aliases = [];

  Object.keys(definitions).forEach(function(key) {
    if (definitions[key].alias)
      aliases = aliases.concat(definitions[key].alias);
  });

  return aliases;
}

function parseArgs(argv) {
  var argvParser = yargs.options(definitions);

  //Preparse --nodejs options
  var nodejsArgs = [];
  var nodejsIndex = argv.indexOf('--nodejs');
  while (nodejsIndex !== -1) {
    var nodejsArg = argv.splice(nodejsIndex, 2)[1];
    if (nodejsArg !== undefined) {
      nodejsArgs.push(nodejsArg);
    }
    nodejsIndex = argv.indexOf('--nodejs');
  }

  //Preparse --script options
  var scriptArgs = [];
  var scriptIndex = argv.indexOf('--script');
  while (scriptIndex !== -1) {
    var scriptArg = argv.splice(scriptIndex, 2)[1];
    if (scriptArg !== undefined) {
      scriptArgs.push(scriptArg);
    }
    scriptIndex = argv.indexOf('--script');
  }

  var options = argvParser.parse(argv);
  var script = options._[0];

  if (script) {
    // We want to pass along subarguments, but re-parse our arguments.
    options = argvParser.parse(argv.splice(0, argv.indexOf(script) + 1));
    scriptArgs = scriptArgs.concat(argv);
  }
  var aliases = collectAliasesFromDefinitions();

  Object.keys(options).forEach(function(key) {
    if (aliases.indexOf(key) > -1) {
      //Filter aliases
      delete options[key];
    } else if (util.isArray(options[key])) {
      //Ignore array options
    } else if (/[A-Z]/.test(key)) {
      //Filter camelKey options created by yargs
      delete options[key];
    } else if (definitions[key] && options[key] === definitions[key].default) {
      //Filter options with default values
      delete options[key];
    }
  });

  options['nodejs'] = nodejsArgs;
  options['script'] = scriptArgs;

  return options;
}
