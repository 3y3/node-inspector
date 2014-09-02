var util = require('util'),
    Config = require('../lib/config'),
    expect = require('chai').expect;

describe('Config', function() {
  describe('from argv', function(){

    it('handles --help', function() {
      var config = givenConfigFromArgs('--help');
      expect(config.help).to.equal(true);
    });

    it('handles --version', function() {
      var config = givenConfigFromArgs('--version');
      expect(config.version).to.equal(true);
    });

    it('handles --web-port', function() {
      var config = givenConfigFromArgs('--web-port=8081');
      expect(config.webPort).to.equal(8081);
    });

    it('handles --web-host', function() {
      var config = givenConfigFromArgs('--web-host=127.0.0.2');
      expect(config.webHost).to.equal('127.0.0.2');
    });

    it('handles --debug-port', function() {
      var config = givenConfigFromArgs('--debug-port=5859');
      expect(config.debugPort).to.equal(5859);
    });

    it('handles --save-live-edit', function() {
      var config = givenConfigFromArgs('--save-live-edit');
      expect(config.saveLiveEdit).to.equal(true);
    });

    it('handles --preload', function() {
      var config = givenConfigFromArgs('--no-preload');
      expect(config.preload).to.equal(false);
    });

    it('handles --inject', function() {
      var config = givenConfigFromArgs('--no-inject');
      expect(config.inject).to.equal(false);
    });

    it('handles --hidden', function() {
      var config = givenConfigFromArgs('--hidden=["abc"]');
      expect(config.hidden).to.satisfy(util.isArray);
      expect(config.hidden.length).to.equal(1);
      expect(config.hidden[0]).to.satisfy(util.isRegExp);
    });

    it('handles --nodejs', function() {
      var config = givenConfigFromArgs(['--nodejs', '--harmony']);
      expect(config.nodejs).to.satisfy(util.isArray);
      expect(config.nodejs.length).to.equal(1);
    });

    it('handles --script', function() {
      var config = givenConfigFromArgs(['--script', '--abc']);
      expect(config.script).to.satisfy(util.isArray);
      expect(config.script.length).to.equal(1);
    });

    it('handles --stack-trace-limit', function() {
      var config = givenConfigFromArgs('--stack-trace-limit=60');
      expect(config.stackTraceLimit).to.equal(60);
    });

    it('handles --debug-brk', function() {
      var config = givenConfigFromArgs('--debug-brk');
      expect(config.debugBrk).to.equal(true);
    });

    it('handles --cli', function() {
      var config = givenConfigFromArgs('--cli');
      expect(config.cli).to.equal(true);
    });



    function givenConfigFromArgs(argv) {
      return new Config([].concat(argv));
    }
  });

  describe('defaults', function(){
    it('have expected values', function(){
      var config = Config._collectDefaults();

      expect(config.help, 'default help value').to.equal(undefined);
      expect(config.version, 'default version value').to.equal(false);
      expect(config.webPort, 'default web-port value').to.equal(8080);
      expect(config.webHost, 'default web-host value').to.equal('');
      expect(config.debugPort, 'default debug-port value').to.equal(5858);
      expect(config.saveLiveEdit, 'default save-live-edit value').to.equal(false);
      expect(config.preload, 'default preload value').to.equal(true);
      expect(config.inject, 'default inject value').to.equal(true);
      expect(config.hidden, 'default hidden value is array').to.satisfy(util.isArray);
      expect(config.hidden.length, 'default hidden array is empty').to.equal(0);
      expect(config.nodejs, 'default nodejs value is array').to.satisfy(util.isArray);
      expect(config.nodejs.length, 'default nodejs array is empty').to.equal(0);
      expect(config.script, 'default script value is array').to.satisfy(util.isArray);
      expect(config.script.length, 'default script array is empty').to.equal(0);
      expect(config.stackTraceLimit, 'default stack-trace-limit value').to.equal(50);
      expect(config.debugBrk, 'default debug-brk value').to.equal(false);
      expect(config.config, 'default config value').to.equal(undefined);
      expect(config.cli, 'default cli value').to.equal(false);
    });

    it('have expected values in node-debug mode', function() {
      NODE_DEBUG_MODE(function(Config) {
        var config = Config._collectDefaults();
        expect(config.webHost, 'node-debug default web-host value').to.equal('127.0.0.1');
        expect(config.debugBrk, 'node-debug default debug-brk value').to.equal(true);
      });
    });

    function NODE_DEBUG_MODE(fn) {
      var CONFIGJS_PATH = require.resolve('../lib/config');
      var oldName = module.filename;
      var oldConfig = require.cache[CONFIGJS_PATH];

      module.filename = 'node-debug.js';
      delete require.cache[CONFIGJS_PATH];

      fn(require(CONFIGJS_PATH));

      delete require.cache[CONFIGJS_PATH];
      require.cache[CONFIGJS_PATH] = oldConfig;
      module.filename = oldName;
    }
  });

  describe('serializeOptions', function() {
    var options = {
      'a': 10,
      'b': '20',
      'c': true,
      'd': false,
      'e': undefined,
      'f': null,
      'g': ['h', 1],
      'j': [],
      'k': '',
      'camelKeyOption': 'a',
    };

    it('without filtering', function() {
      var serialisedOptions = Config.serializeOptions(options);

      expect(serialisedOptions, 'true serialised number format').to.contain('-a=10');
      expect(serialisedOptions, 'true serialised string format').to.contain('-b="20"');
      expect(serialisedOptions, 'true serialised boolean format [true]').to.contain('-c');
      expect(serialisedOptions, 'true serialised boolean format [false]').to.contain('-d=false');
      expect(serialisedOptions, 'filtered `undefined` value').to.not.contain('-e=undefined');
      expect(serialisedOptions, 'not filtered `null` value').to.contain('-f=null');
      expect(serialisedOptions, 'true serialised array format').to.contain('-g "h" -g 1');
      expect(serialisedOptions, 'filtered empty array').to.contain('-g "h" -g 1');
      expect(serialisedOptions, 'true serialised empty string value').to.contain('-k=""');
      expect(serialisedOptions, 'true serialised camelKey option').to.contain('--camel-key-option="a"');
    });

    it('with filtering', function() {
      var serialisedOptions = Config.serializeOptions(options, {a: true});

      expect(serialisedOptions, 'true serialised number format').to.not.contain('-a=10');
    });
  });

  describe('filterNodeDebugOptions', function() {
    var option = {
      'cli': true,
      'webPort': 8081,
      'debugPort': 5859,
      'external': 1
    };

    it('works correctly', function() {
      var filteredOptions = Config.filterNodeDebugOptions(option);

      expect(filteredOptions, 'node-debug option filtered').to.not.have.property('cli');
      expect(filteredOptions, 'inspector option not filtered').to.have.property('webPort');
      expect(filteredOptions, 'general option not filtered').to.have.property('debugPort');
      expect(filteredOptions, 'external option not filtered').to.have.property('external');
    });
  });

  describe('filterDefaultValues', function() {
    var option = {
      'cli': true,
      'webPort': 8081,
      'external': 1
    };

    it('works correctly', function() {
      var filteredOptions = Config.filterNodeDebugOptions(option);

      expect(filteredOptions, 'option with default value filtered').to.not.have.property('cli');
      expect(filteredOptions, 'option with custom value not filtered').to.have.property('webPort');
      expect(filteredOptions, 'external option not filtered').to.have.property('external');
    });
  });
});
