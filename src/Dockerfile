FROM node:16.15.0

WORKDIR /usr/src/app

COPY RealtimeServer/package*.json ./RealtimeServer/
COPY SIL.XForge.Scripture/ClientApp/package*.json ./SIL.XForge.Scripture/ClientApp/
COPY SIL.XForge.Scripture/locales.json ./SIL.XForge.Scripture
COPY SIL.XForge.Scripture/version.json ./SIL.XForge.Scripture

WORKDIR /usr/src/app/RealtimeServer

RUN npm install --ignore-scripts

COPY RealtimeServer ./

RUN npm run build

WORKDIR /usr/src/app/SIL.XForge.Scripture/ClientApp

run npm install

COPY SIL.XForge.Scripture/ClientApp ./

EXPOSE 4200

WORKDIR /usr/src/app/SIL.XForge.Scripture/ClientApp

CMD ["npm", "run", "ng", "serve", "--", "--host", "0.0.0.0"]
