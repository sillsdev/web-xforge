#!/bin/bash

CONFIGURATION=${CONFIGURATION:-Release}
DEPLOY_RUNTIME=${DEPLOY_RUNTIME:-linux-x64}
BUILD_OUTPUT=artifacts
DEPLOY_PATH=/var/www/$APP_NAME.org$APP_SUFFIX

pushd .. > /dev/null

rm -rf $BUILD_OUTPUT/app/*
dotnet publish src/$PROJECT/$PROJECT.csproj -c $CONFIGURATION -r $DEPLOY_RUNTIME -o ../../$BUILD_OUTPUT/app /p:VersionPrefix=$BUILD_NUMBER || exit 1

cat <<EOF > $BUILD_OUTPUT/app/secrets.json
{
  "Paratext": {
    "ClientId": "$PARATEXT_CLIENT_ID",
    "ClientSecret": "$PARATEXT_API_TOKEN"
  },
  "Auth": {
    "BackendClientSecret": "$AUTH_BACKEND_SECRET",
    "WebhookPassword": "$AUTH_WEBHOOK_PASSWORD"
  }
}
EOF

cat <<EOF > $BUILD_OUTPUT/app/version.json
{
  "version": "$BUILD_NUMBER"
}
EOF

sudo chown -R :www-data $BUILD_OUTPUT/app

rsync -progzlt --chmod=Dug=rwx,Fug=rwx,o-rwx --delete-during --stats --rsync-path="sudo rsync" --rsh="ssh -v -i $DEPLOY_CREDENTIALS" artifacts/app/ root@$DEPLOY_DESTINATION:$DEPLOY_PATH/app || exit 1

popd > /dev/null

ssh root@$DEPLOY_DESTINATION "systemctl restart $APP_NAME-web-app"
