module.exports = {
  stories: ['../src/**/*.stories.mdx', '../src/**/*.stories.@(js|jsx|ts|tsx)'],
  addons: ['@storybook/addon-links', '@storybook/addon-essentials', '@storybook/addon-interactions'],
  framework: {
    name: '@storybook/angular',
    options: {}
  },
  docs: {
    autodocs: 'tag'
  },
  staticDirs: [
    { from: '../src/assets', to: '/assets' },
    { from: '../src/app/checking/checking/checking-audio-player', to: '/assets/audio/' }
  ]
};
