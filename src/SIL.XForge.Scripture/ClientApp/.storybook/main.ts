module.exports = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|ts|tsx)'],
  addons: ['@storybook/addon-links', '@storybook/addon-essentials', '@storybook/addon-interactions'],
  framework: {
    name: '@storybook/angular',
    options: {}
  },
  docs: {},
  staticDirs: [
    // Note that 'embedded' directories appear to need to be higher, not lower.
    { from: '../src/app/checking/checking/test-audio', to: '/assets/audio' },
    { from: '../src/assets', to: '/assets' }
  ]
};
