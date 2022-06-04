export function showJwt(jwt: string) {
  const payloadSection = jwt.split('.')[1];
  const payload = JSON.parse(Buffer.from(payloadSection, 'base64').toString());
  const expiration = new Date(payload.exp * 1000);
  const currentTimeInSeconds = new Date().getTime() / 1000;
  const relativeTime = (payload.exp - currentTimeInSeconds) / 60;
  const formattedTime = Math.round(relativeTime * 100) / 100;
  console.log(`Token for ${payload.username} expires at ${expiration.toISOString()} (in ${formattedTime} minutes)`);
  console.log();
  console.log(payload);
  console.log();
  console.log(jwt);
}
