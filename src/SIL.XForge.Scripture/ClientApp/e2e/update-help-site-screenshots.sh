#!/bin/bash

set -xueo pipefail

echo "Deleting old screenshots"

rm -r test_output/localized_screenshots/

echo "Generating new screenshots"

./e2e.mts localization localized_screenshots

echo "Copying new screenshots to help site"

./copy-help-site-screenshots.mts test_output/localized_screenshots ~/src/scripture-forge-help
