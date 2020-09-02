// Karma configuration file, see link for more information
// https://karma-runner.github.io/1.0/config/configuration-file.html

module.exports = function (config) {
  const isTC =
    config.browsers && config.browsers.length === 1 && config.browsers[0] === 'xForgeChromiumHeadless' && !config.watch;

  config.set({
    basePath: '',
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-jasmine-html-reporter'),
      require('karma-coverage-istanbul-reporter'),
      require('karma-teamcity-reporter'),
      require('@angular-devkit/build-angular/plugins/karma')
    ],
    client: {
      clearContext: false, // leave Jasmine Spec Runner output visible in browser
      jasmine: {
        random: true,
        seed: isTC ? '12345' : null
      }
    },
    coverageIstanbulReporter: {
      dir: require('path').join(__dirname, '../coverage'),
      reports: ['html', 'lcovonly'],
      fixWebpackSourcePaths: true
    },
    files: [
      {
        pattern: 'app/checking/checking/checking-audio-player/test-audio-player.webm',
        watched: false,
        included: false
      },
      {
        pattern: 'app/checking/checking/checking-audio-player/test-audio-player-b.webm',
        watched: false,
        included: false
      }
    ],
    proxies: {
      '/assets/audio/': '/base/app/checking/checking/checking-audio-player/'
    },
    reporters: isTC ? ['teamcity', 'coverage-istanbul'] : ['progress', 'kjhtml'],
    port: 9876,
    colors: true,
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
          '--autoplay-policy=no-user-gesture-required'
        ]
      },
      xForgeChromeHeadless: {
        base: 'ChromeHeadless',
        flags: [
          '--no-sandbox',
          '--disable-extensions',
          '--use-fake-device-for-media-stream',
          '--use-fake-ui-for-media-stream',
          '--autoplay-policy=no-user-gesture-required'
        ]
      },
      xForgeChrome: {
        base: 'Chrome',
        flags: [
          '--use-fake-ui-for-media-stream',
          '--use-fake-device-for-media-stream',
          '--autoplay-policy=no-user-gesture-required'
        ]
      }
    },
    singleRun: false
  });
};
