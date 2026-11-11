# Deployment

The long-running server is what you want in production. `nixpacks.toml` installs the server, builds the client, and runs `node server/index.js`. Set the environment variables from [ENVIRONMENT.md](ENVIRONMENT.md) on the host. `FRONTEND_URL` must be the exact site origin guests use.

Build the client yourself with `npm run build:client` if the host does not. The API serves `client/dist`.

`api/index.js` is a serverless Express app for hosts that cannot hold a socket. Order and payment routes work there. Live dashboard updates do not, because Socket.IO has nothing to stay connected to. Point Paystack and Monnify webhooks at the long-running API host, not at a static frontend.

After deploy, `GET /api/health` should return `"ok": true`. Then sign up a venue, add a menu item, open the order link, and pay with test keys.

Webhook URLs:

- `https://<api-host>/api/payment/webhook`
- `https://<api-host>/api/payment/monnify-webhook`

Do not commit `server/.env`, `client/.env.local`, or a service role key.
