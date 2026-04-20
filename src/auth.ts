import Asana from "asana";

export function loadAuth(slug: string): Asana.ApiClient {
  const envVar = `ASANA_PAT_${slug.toUpperCase()}`;
  const token = process.env[envVar];

  if (!token) {
    throw new Error(
      `Environment variable ${envVar} not set.\nSet it in ~/.config/openbrain/.env or export it before running.`
    );
  }

  const client = new Asana.ApiClient();
  client.authentications["token"].accessToken = token;
  return client;
}
