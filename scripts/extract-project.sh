#!/bin/bash
# Extract Scripture Forge Project Data
#
# Usage:
#    extract-project.sh {server_name}:{server_port} {project_id}
#
# Example:
#    ./extract-project.sh localhost:27017 66bb989d961308bb2652ac15
#
# Notes:
#  - User associations to projects will not be extracted. This must be done manually.
#  - Flat files need to be restored manually.
#  - To restore the project to a MongoDB server, run the following command:
#    mongorestore -h {server_name}:{server_port} {project_id}

if [ -z "$1" ]; then
  echo "Please specify the server and port as the first argument"
  exit 1
fi

if [ -z "$2" ]; then
  echo "Please specify a project id as the second argument"
  exit 1
fi

SERVER=$1
PROJECTID=$2
OUTPUT_PATH=$PROJECTID

echo "Extracting $PROJECTID from $SERVER..."
mongodump -h "$SERVER" -d xforge -c sf_projects -o "$OUTPUT_PATH" -q "{\"_id\":\"$PROJECTID\"}"
mongodump -h "$SERVER" -d xforge -c o_sf_projects -o "$OUTPUT_PATH" -q "{\"d\":\"$PROJECTID\"}"
mongodump -h "$SERVER" -d xforge -c sf_project_secrets -o "$OUTPUT_PATH" -q "{\"_id\":\"$PROJECTID\"}"
mongodump -h "$SERVER" -d xforge -c sf_project_user_configs -o "$OUTPUT_PATH" -q "{\"_id\":{\"\$regex\":\"^$PROJECTID:\"}}"
mongodump -h "$SERVER" -d xforge -c o_sf_project_user_configs -o "$OUTPUT_PATH" -q "{\"d\":{\"\$regex\":\"^$PROJECTID:\"}}"
mongodump -h "$SERVER" -d xforge -c texts -o "$OUTPUT_PATH" -q "{\"_id\":{\"\$regex\":\"^$PROJECTID:\"}}"
mongodump -h "$SERVER" -d xforge -c o_texts -o "$OUTPUT_PATH" -q "{\"d\":{\"\$regex\":\"^$PROJECTID:\"}}"
mongodump -h "$SERVER" -d xforge -c m_texts -o "$OUTPUT_PATH" -q "{\"d\":{\"\$regex\":\"^$PROJECTID:\"}}"
mongodump -h "$SERVER" -d xforge -c questions -o "$OUTPUT_PATH" -q "{\"_id\":{\"\$regex\":\"^$PROJECTID:\"}}"
mongodump -h "$SERVER" -d xforge -c o_questions -o "$OUTPUT_PATH" -q "{\"d\":{\"\$regex\":\"^$PROJECTID:\"}}"
mongodump -h "$SERVER" -d xforge -c note_threads -o "$OUTPUT_PATH" -q "{\"_id\":{\"\$regex\":\"^$PROJECTID:\"}}"
mongodump -h "$SERVER" -d xforge -c o_note_threads -o "$OUTPUT_PATH" -q "{\"d\":{\"\$regex\":\"^$PROJECTID:\"}}"
mongodump -h "$SERVER" -d xforge -c text_audio -o "$OUTPUT_PATH" -q "{\"_id\":{\"\$regex\":\"^$PROJECTID:\"}}"
mongodump -h "$SERVER" -d xforge -c o_text_audio -o "$OUTPUT_PATH" -q "{\"d\":{\"\$regex\":\"^$PROJECTID:\"}}"
mongodump -h "$SERVER" -d xforge -c text_documents -o "$OUTPUT_PATH" -q "{\"_id\":{\"\$regex\":\"^$PROJECTID:\"}}"
mongodump -h "$SERVER" -d xforge -c o_text_documents -o "$OUTPUT_PATH" -q "{\"d\":{\"\$regex\":\"^$PROJECTID:\"}}"
mongodump -h "$SERVER" -d xforge -c m_text_documents -o "$OUTPUT_PATH" -q "{\"d\":{\"\$regex\":\"^$PROJECTID:\"}}"
mongodump -h "$SERVER" -d xforge -c biblical_terms -o "$OUTPUT_PATH" -q "{\"_id\":{\"\$regex\":\"^$PROJECTID:\"}}"
mongodump -h "$SERVER" -d xforge -c o_biblical_terms -o "$OUTPUT_PATH" -q "{\"d\":{\"\$regex\":\"^$PROJECTID:\"}}"
mongodump -h "$SERVER" -d xforge -c training_data -o "$OUTPUT_PATH" -q "{\"_id\":{\"\$regex\":\"^$PROJECTID:\"}}"
mongodump -h "$SERVER" -d xforge -c o_training_data -o "$OUTPUT_PATH" -q "{\"d\":{\"\$regex\":\"^$PROJECTID:\"}}"
