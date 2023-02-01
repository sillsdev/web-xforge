#!/bin/bash

set -euxo pipefail

# Copy branding assets
mkdir -p static/img
cp ../src/SIL.XForge.Scripture/ClientApp/src/favicon.ico static/img/favicon.ico
cp ../src/SIL.XForge.Scripture/ClientApp/src/assets/icons/sf.svg static/img/sf.svg

# Download the help files from Notion
npm install
npx docu-notion -n $SF_HELP_NOTION_TOKEN -r $SF_HELP_NOTION_ROOT_PAGE_ID

# Needed for the current version of docu-notion; this can be removed once it publishes a new release
sed -i s/:::📝/:::note/g docs/*.md

mkdir -p s3
aws s3 sync s3://help.scriptureforge.org s3

npm run build

# Copy the help files to their respective locales in the build directory

# English
mkdir -p build/manual
cp -r s3/en/* build/manual

# Spanish
mkdir -p build/es/manual
cp -r s3/es/* build/es/manual

# French
mkdir -p build/fr/manual
cp -r s3/fr/* build/fr/manual

# Portuguese
mkdir -p build/pt-BR/manual
cp -r s3/pt_BR/* build/pt-BR/manual

# Locale redirects
# SF links to /en, but this new help site serves en with no en prefix
mkdir -p build/en
cp en_redirect.html build/en/index.html
# SF links to /pt_BR, but Docusaurus uses pt-BR
mkdir -p build/pt_BR
cp pt_br_redirect.html build/pt_BR/index.html
