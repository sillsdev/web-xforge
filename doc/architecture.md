# Architecture

This document contains descriptive information about the software architecture.

## Architecture Overview

This repository contains three interconnected applications:

1. Frontend (Angular) that runs in a browser, at src/SIL.XForge.Scripture/ClientApp
2. Backend (dotnet) that runs on a server, at src/SIL.XForge and src/SIL.XForge.Scripture
3. RealtimeServer (Node) that runs on a server, at src/RealtimeServer

## Data exchange between the three interconnected applications

- An example Backend data model can be seen at src/SIL.XForge.Scripture/Models/SFProject.cs
- Frontend and RealtimeServer both use the same data model files. An example can be seen at src/RealtimeServer/scriptureforge/models/sf-project.ts
- Frontend uses src/SIL.XForge.Scripture/ClientApp/src/xforge-common/realtime.service.ts to read and write data. This Realtime document data is stored in IndexedDB and is also automatically kept up to date with the data in RealtimeServer when Frontend has an Internet connection. If Frontend is offline, it continues reading and writing realtime documents using realtime.service.ts, and later data is synced with RealtimeService when Frontend regains an Internet connection.
- RealtimeServer uses ShareDB to merge ops from multiple Frontend clients. Frontend clients synchronize with RealtimeServer and present a live view of the changes from other clients as they work.
- Frontend also uses JSON-RPC to communicate with Backend, such as seen on Backend at src/SIL.XForge.Scripture/Controllers/SFProjectsRpcController.cs.

## Frontend

- Feature flags (feature-flag.service.ts) can control functionality rollout.
- Frontend has a global exception handler, ExceptionHandlingService. It catches and handles exceptions, showing a message to the user. If an exception occurs repeatedly or otherwise makes the UI unusable, it is preferable to handle it manually to allow the UI to continue to be usable.

## Frontend localization

- TranslocoModule is used for translations.
