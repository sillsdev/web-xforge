// Karma configuration file, see link for more information
// https://karma-runner.github.io/1.0/config/configuration-file.html

module.exports = function (config) {
  const isRunningInTeamCity =
    config.browsers && config.browsers.length === 1 && config.browsers[0] === 'xForgeChromiumHeadless' && !config.watch;

  let karmaReporters = ['progress', 'kjhtml'];
  if (isRunningInTeamCity) karmaReporters = ['teamcity', 'coverage-istanbul', 'junit'];
  // Override reporters with a comma-delimited list of reporters in environment variable KARMA_REPORTERS.
  // For example, KARMA_REPORTERS="mocha,coverage-istanbul" ng test --code-coverage
  if (process.env.KARMA_REPORTERS != null) karmaReporters = process.env.KARMA_REPORTERS.split(',');

  const frameworks = [];
  const plugins = [];
  if (process.env.KARMA_PARALLEL === 'true') {
    frameworks.push('parallel');
    plugins.push(require('karma-parallel'));
  }

  frameworks.push('jasmine');
  plugins.push(
    require('karma-jasmine'),
    require('karma-chrome-launcher'),
    require('karma-firefox-launcher'),
    require('karma-safari-launcher'),
    require('karma-jasmine-html-reporter'),
    require('karma-coverage-istanbul-reporter'),
    require('karma-teamcity-reporter'),
    require('karma-mocha-reporter'),
    require('karma-junit-reporter')
  );

  config.set({
    basePath: '',
    frameworks,
    plugins,
    client: {
      clearContext: false, // leave Jasmine Spec Runner output visible in browser
      jasmine: {
        random: true,
        seed: isRunningInTeamCity ? '12345' : null
      }
    },
    coverageIstanbulReporter: {
      dir: require('path').join(__dirname, '../coverage'),
      reports: ['html', 'lcovonly'],
      fixWebpackSourcePaths: true
    },
    files: [],
    proxies: {
      '/assets/icons/TagIcons/defaultIcon.png': '',
      '/assets/icons/TagIcons/flag01.png': '',
      '/assets/icons/TagIcons/flag04.png': '',
      '/assets/icons/TagIcons/flag05.png': ''
    },
    reporters: karmaReporters,

    port: 9876,
    colors: true,
    mochaReporter: {
      // https://github.com/litixsoft/karma-mocha-reporter
      output: 'autowatch'
    },
    junitReporter: {
      outputDir: __dirname,
      outputFile: 'junit.xml',
      suite: 'karma tests',
      useBrowserName: false
    },
    logLevel: config.LOG_INFO,
    autoWatch: true,
    captureTimeout: 120000, // compile needs to finished otherwise first capture fails
    browsers: ['xForgeChrome'],
    browserDisconnectTimeout: 10000,
    browserNoActivityTimeout: 60000,
    customLaunchers: {
      xForgeChromiumHeadless: {
        base: 'ChromiumHeadless',
        flags: [
          '--no-sandbox',
          '--disable-extensions',
          '--use-fake-device-for-media-stream',
          '--use-fake-ui-for-media-stream',
          '--autoplay-policy=no-user-gesture-required',
          '--remote-debugging-port=9988'
        ]
      },
      xForgeChromeHeadless: {
        base: 'ChromeHeadless',
        flags: [
          '--no-sandbox',
          '--disable-extensions',
          '--use-fake-device-for-media-stream',
          '--use-fake-ui-for-media-stream',
          '--autoplay-policy=no-user-gesture-required',
          '--remote-debugging-port=9988'
        ]
      },
      xForgeChrome: {
        base: 'Chrome',
        flags: [
          '--use-fake-ui-for-media-stream',
          '--use-fake-device-for-media-stream',
          '--autoplay-policy=no-user-gesture-required',
          '--remote-debugging-port=9988'
        ]
      },
      xForgeFirefox: {
        base: 'Firefox',
        prefs: {
          'media.autoplay.default': 0,
          'permissions.default.microphone': 1
        },
        profile: require('path').join(__dirname, '../tmp')
      },
      xForgeFirefoxHeadless: {
        base: 'Firefox',
        flags: ['-headless'],
        prefs: {
          'media.autoplay.default': 0,
          'permissions.default.microphone': 1
        },
        profile: require('path').join(__dirname, '../tmp')
      }
    },
    singleRun: false
  });
};
