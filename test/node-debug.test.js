var expect = require('chai').expect;

describe('node-debug', function() {
  describe('argument parser', function() {
    var cli;

    before(function() {
      var CONFIGJS_PATH = require.resolve('../lib/config');
      delete require.cache[CONFIGJS_PATH];

      cli = require('../bin/node-debug');
    });

    it('handles `app.js`', function() {
      var config = cli.createConfig(argv('app.js'));
      delete config.options;
      expect(config).to.eql({
        printScript: true,
        subproc: {
          script: 'app.js',
          args: [],
          execArgs: ['--debug-brk=5858'],
          debugPort: 5858
        },
        inspector: {
          host: '127.0.0.1',
          port: 8080,
          args: []

        }
      });
    });

    it('handles empty arguments', function() {
      var config = cli.createConfig(argv());
      expect(config.printScript, 'printScript').to.equal(false);
      expect(config.subproc.script, 'subproc.script')
        .to.eql(require.resolve('../bin/run-repl'));
    });

    it('handles options', function() {
      var config = cli.createConfig(argv('--no-debug-brk -p 10 -d 20 -c app.js'));
      expect(config.subproc).to.eql({
        script: 'app.js',
        args: [],
        execArgs: ['--debug=20'],
        debugPort: 20
      });
      expect(config.inspector).to.eql({
        host: '127.0.0.1',
        port: 10,
        args: ['--debug-port=20', '--web-port=10']
      });
    });

    it('handles long options with =val and no script file', function() {
      var config = cli.createConfig(argv('--debug-port=10'));
      expect(config.subproc.debugPort).to.equal(10);
    });

    it('handles nodejs options', function() {
      var config = cli.createConfig(argv('--nodejs --harmony --nodejs --random_seed=2'));
      expect(config.subproc.execArgs).to.include.members(['--harmony', '--random_seed=2']);
    });

    it('ignores options of the debugged application', function() {
      var config = cli.createConfig(argv('app.js -b -p 10 -d 20 -c carg rest'));
      expect(config.subproc).to.eql({
        script: 'app.js',
        args: '-b -p 10 -d 20 -c carg rest'.split(' '),
        execArgs: ['--debug-brk=5858'],
        debugPort: 5858
      });
      expect(config.inspector.port, 'inspector.port').to.eql(8080);
    });

    it('supports slc-debug argument names', function() {
      var config = cli.createConfig(argv('--suspend --port=10 --debug-port=20'));
      expect(config.subproc.execArgs).to.contain('--debug-brk=20');
      expect(config.subproc.debugPort, 'subproc.debugPort').to.equal(20);
      expect(config.inspector.port, 'inspector.port').to.equal(10);
    });

    it('supports node-inspector argument names', function() {
      var config = cli.createConfig(argv('--web-port=10 --debug-port=20 app.js'));
      expect(config.subproc.debugPort, 'subproc.debugPort').to.equal(20);
      expect(config.inspector.port, 'inspector.port').to.equal(10);
    });

    it('forwards unknown options to node-inspector', function() {
      var config = cli.createConfig(argv('--some-bool --no-some-other-bool --some-string val app.js'));
      expect(config.inspector.args, 'inspector args')
        .to.include.members(['--some-bool', '--some-other-bool=false', '--some-string="val"']);
      expect(config.subproc.execArgs, 'subprocess args')
        .to.not.include.members(['--some-bool', '--no-some-other-bool', '--some-string', 'val']);
    });

    function argv(cmdString) {
      cmdString = cmdString || '';
      return ['node', 'node-debug'].concat(cmdString.split(' '));
    }
  });
});
