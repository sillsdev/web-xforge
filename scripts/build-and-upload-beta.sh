#!/bin/bash

CONFIGURATION=${CONFIGURATION:-Release}
DEPLOY_RUNTIME=${DEPLOY_RUNTIME:-linux-x64}
ANGULAR_CONFIG=${ANGULAR_CONFIG:-production}
BUILD_OUTPUT=artifacts
DEPLOY_PATH=/var/www/$APP_NAME.org$APP_SUFFIX
SERVICE_UNIT_SUFFIX=""
if grep "beta" <<< ${APP_SUFFIX}; then
  SERVICE_UNIT_SUFFIX="_beta"
fi

pushd .. > /dev/null

# must be before `ng build` because the constant value is inluded during optimization
cat <<EOF > src/SIL.XForge.Scripture/version.json
{
  "version": "$BUILD_NUMBER"
}
EOF

rm -rf $BUILD_OUTPUT/app/*
dotnet publish src/$PROJECT/$PROJECT.csproj -c $CONFIGURATION -r $DEPLOY_RUNTIME -o $BUILD_OUTPUT/app /p:Version=$BUILD_NUMBER /p:AngularConfig=$ANGULAR_CONFIG || exit 1

cat <<EOF > $BUILD_OUTPUT/app/secrets.json
{
  "Paratext": {
    "ClientId": "$PARATEXT_CLIENT_ID",
    "ClientSecret": "$PARATEXT_API_TOKEN",
    "ResourcePasswordHash": "$PARATEXT_RESOURCE_PASSWORD_HASH",
    "ResourcePasswordBase64": "$PARATEXT_RESOURCE_PASSWORD_BASE64"
  },
  "Auth": {
    "BackendClientSecret": "$AUTH_BACKEND_SECRET",
    "WebhookPassword": "$AUTH_WEBHOOK_PASSWORD"
  }
}
EOF

sudo chown -R :www-data $BUILD_OUTPUT/app

rsync -progzlt --chmod=Dug=rwx,Fug=rwx,o-rwx --delete-during --stats --rsync-path="sudo rsync" --rsh="ssh -v -i $DEPLOY_CREDENTIALS" artifacts/app/ root@$DEPLOY_DESTINATION:$DEPLOY_PATH/app || exit 1

popd > /dev/null

ssh root@${DEPLOY_DESTINATION} "systemctl restart ${APP_NAME}-web-app${SERVICE_UNIT_SUFFIX}"
