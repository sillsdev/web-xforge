@ECHO OFF
REM Extract Scripture Forge Project Data
REM
REM Usage:
REM    extract-project {server_name}:{server_port} {project_id}
REM
REM Example:
REM    extract-project localhost:27017 66bb989d961308bb2652ac15
REM
REM Notes:
REM  - User associations to projects will not be extracted. This must be done manually.
REM  - Flat files need to be restored manually.
REM  - To restore the project to a MongoDB server, run the following command:
REM    mongorestore -h {server_name}:{server_port} {project_id}

SETLOCAL
IF %1.==. GOTO NO_SERVER
IF %2.==. GOTO NO_PROJECTID
SET SERVER=%1
SET PROJECTID=%2
SET OUTPUT_PATH=%PROJECTID%

ECHO Extracting %PROJECTID% from %SERVER%...
mongodump -h %SERVER% -d xforge -c sf_projects -o %OUTPUT_PATH% -q "{\"_id\":\"%PROJECTID%\"}"
mongodump -h %SERVER% -d xforge -c o_sf_projects -o %OUTPUT_PATH% -q "{\"d\":\"%PROJECTID%\"}"
mongodump -h %SERVER% -d xforge -c sf_project_secrets -o %OUTPUT_PATH% -q "{\"_id\":\"%PROJECTID%\"}"
mongodump -h %SERVER% -d xforge -c sf_project_user_configs -o %OUTPUT_PATH% -q "{\"_id\":{\"$regex\":\"^%PROJECTID%:\"}}"
mongodump -h %SERVER% -d xforge -c o_sf_project_user_configs -o %OUTPUT_PATH% -q "{\"d\":{\"$regex\":\"^%PROJECTID%:\"}}"
mongodump -h %SERVER% -d xforge -c texts -o %OUTPUT_PATH% -q "{\"_id\":{\"$regex\":\"^%PROJECTID%:\"}}"
mongodump -h %SERVER% -d xforge -c o_texts -o %OUTPUT_PATH% -q "{\"d\":{\"$regex\":\"^%PROJECTID%:\"}}"
mongodump -h %SERVER% -d xforge -c m_texts -o %OUTPUT_PATH% -q "{\"d\":{\"$regex\":\"^%PROJECTID%:\"}}"
mongodump -h %SERVER% -d xforge -c questions -o %OUTPUT_PATH% -q "{\"_id\":{\"$regex\":\"^%PROJECTID%:\"}}"
mongodump -h %SERVER% -d xforge -c o_questions -o %OUTPUT_PATH% -q "{\"d\":{\"$regex\":\"^%PROJECTID%:\"}}"
mongodump -h %SERVER% -d xforge -c note_threads -o %OUTPUT_PATH% -q "{\"_id\":{\"$regex\":\"^%PROJECTID%:\"}}"
mongodump -h %SERVER% -d xforge -c o_note_threads -o %OUTPUT_PATH% -q "{\"d\":{\"$regex\":\"^%PROJECTID%:\"}}"
mongodump -h %SERVER% -d xforge -c text_audio -o %OUTPUT_PATH% -q "{\"_id\":{\"$regex\":\"^%PROJECTID%:\"}}"
mongodump -h %SERVER% -d xforge -c o_text_audio -o %OUTPUT_PATH% -q "{\"d\":{\"$regex\":\"^%PROJECTID%:\"}}"
mongodump -h %SERVER% -d xforge -c text_documents -o %OUTPUT_PATH% -q "{\"_id\":{\"$regex\":\"^%PROJECTID%:\"}}"
mongodump -h %SERVER% -d xforge -c o_text_documents -o %OUTPUT_PATH% -q "{\"d\":{\"$regex\":\"^%PROJECTID%:\"}}"
mongodump -h %SERVER% -d xforge -c m_text_documents -o %OUTPUT_PATH% -q "{\"d\":{\"$regex\":\"^%PROJECTID%:\"}}"
mongodump -h %SERVER% -d xforge -c biblical_terms -o %OUTPUT_PATH% -q "{\"_id\":{\"$regex\":\"^%PROJECTID%:\"}}"
mongodump -h %SERVER% -d xforge -c o_biblical_terms -o %OUTPUT_PATH% -q "{\"d\":{\"$regex\":\"^%PROJECTID%:\"}}"
mongodump -h %SERVER% -d xforge -c training_data -o %OUTPUT_PATH% -q "{\"_id\":{\"$regex\":\"^%PROJECTID%:\"}}"
mongodump -h %SERVER% -d xforge -c o_training_data -o %OUTPUT_PATH% -q "{\"d\":{\"$regex\":\"^%PROJECTID%:\"}}"
GOTO END

:NO_SERVER
ECHO Please specify the server and port as the first argument
GOTO END

:NO_PROJECTID
ECHO Please specify a project id as the second argument
GOTO END
:END
