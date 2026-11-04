import type { StorybookConfig } from '@storybook/angular';

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|ts|tsx)'],
  addons: ['@storybook/addon-links', '@storybook/addon-docs'],
  framework: {
    name: '@storybook/angular',
    options: {}
  },
  docs: {},
  // Source maps come from the Angular build target (sourceMap in angular.json), and map back to the original .ts and
  // .scss files. Storybook also sets webpack's devtool option, which generates a second set of source maps with the same
  // filenames, and webpack fails the build on the conflict. Turning off devtool leaves only the Angular source maps.
  webpackFinal: config => ({ ...config, devtool: false }),
  staticDirs: [
    // Note that 'embedded' directories appear to need to be higher, not lower.
    { from: '../src/app/checking/checking/test-audio', to: '/assets/audio' },
    { from: '../src/assets', to: '/assets' }
  ]
};

export default config;
