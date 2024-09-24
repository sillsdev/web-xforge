#!/bin/sh
# Store the start time
startTime=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "[$startTime] Starting migrator"

# Run the migrator
node lib/cjs/scriptureforge/migrator.js $MIGRATOR_ENVIRONMENT $MIGRATOR_VERSION

# Get the exit code of the process
exitCode=$?
exitTime=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "[$exitTime] Migrator exited with code $exitCode"

# Calculate the time difference
startSeconds=$(date -d "$startTime" +%s)
exitSeconds=$(date -d "$exitTime" +%s)
timeDifference=$(($exitSeconds - $startSeconds))

echo "Total time running migrator was $timeDifference seconds"

# Start Realtime Server
exec node --inspect=0.0.0.0:9230 Javascript.NodeJS/src/NodeJS/Javascript/bin/Debug/Http11Server.js --parentPid 1 --port 5002
