#!/usr/bin/env -S bash -c '"$(dirname "$0")"/node_modules/.bin/ts-node "$(dirname "$0")/$(basename "$0")" "$@"'
// The above causes the local ts-node to be used even if run from another directory. Setup: npm ci
//
// Parse Version
//
// Parses a version string to determine what feature flags are enabled.
//
// This script needs ts-node and must be run from the containing directory. Setup: npm ci
// Usage info: ./parse-version.ts --help
// Examples:
//   Parse a version string: ./parse-version.ts v9.9.9-123

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { colored, colors, useColor } from './utils';

type ProgArgs = {
  color: boolean;
};

class ParseVersion {
  version: string | undefined;

  // This array is ordered based on the bit position of the feature flag
  featureFlags: string[] = [
    'Show developer tools',
    'Show non-published localizations',
    'Show NMT drafting',
    'Allow Forward Translation NMT drafting',
    'Scripture audio',
    'Prevent op submission (intentionally breaks things)',
    'Prevent op acknowledgement (intentionally breaks things)',
    'Stillness (non-distracting progress indicators)',
    'Use In-Process Machine for Suggestions',
    'Use Serval for Suggestions',
    'Use Echo for Pre-Translation Drafting',
    'Allow Fast Pre-Translation Training',
    'Upload Paratext Zip Files for Pre-Translation Drafting',
    'Allow mixing in an additional training source',
    'Updated Learning Rate For Serval',
    'Dark Mode',
    'Enable Lynx insights',
    'Preview new draft history interface',
    'USFM Format'
  ];

  constructor() {
    this.processArguments();
  }

  processArguments(): void {
    const args: ProgArgs = yargs(hideBin(process.argv))
      .command(
        '$0',
        'the version string',
        () => {},
        argv => {
          this.version = argv['_'][0]?.toString();
        }
      )
      .option('color', {
        type: 'boolean',
        default: true,
        description: 'Colourize output (turn off with --no-color)'
      })
      .version(false)
      .parseSync();

    const shouldUseColor: boolean = args.color;
    useColor(shouldUseColor);
  }

  main() {
    if (this.version == null || this.version === '') {
      throw new Error('Missing version');
    }

    // Trim initial v
    if (this.version.toLowerCase().startsWith('v')) {
      this.version = this.version.slice(1);
    }

    console.log(`Parsing version string: ${this.version}`);

    // See which environment this is from
    if (this.version.startsWith('9.9.9')) {
      console.log('Environment: ' + colored(colors.orange, 'Development'));
    } else if (this.version.indexOf('.') > -1) {
      console.log('Environment: ' + colored(colors.lightGreen, 'Production'));
    } else {
      console.log('Environment: ' + colored(colors.lightBlue, 'QA'));
    }

    // See if feature flags are enabled
    if (this.version.indexOf('-') > -1) {
      const versionParts: string[] = this.version.split('-');
      let featureFlagsVersion: number = parseInt(versionParts[versionParts.length - 1]);
      if (isNaN(featureFlagsVersion)) {
        console.log(colored(colors.red, 'Could not parse the feature flag version'));
      } else {
        // As we can't import the feature flags module due to angular dependencies, we will calculate feature flags here
        console.log('Feature Flags Enabled:');
        let bitPosition = 0;
        while (featureFlagsVersion > 0) {
          if (featureFlagsVersion & 1) {
            console.log(' - ' + colored(colors.lightBlue, this.featureFlags[bitPosition]));
          }

          featureFlagsVersion >>= 1; // Right-shift the value to check the next bit
          bitPosition++;
        }
      }
    } else {
      console.log(colored(colors.yellow, 'No Feature Flags Enabled'));
    }
  }
}

const program = new ParseVersion();
program.main();
