# ping-flow — Railway app

Standalone version of the existing ping-flow interface. Media buyers sign in directly with email and password; ChatGPT accounts are not required.

## Included

- The same green interface, leader dashboard, buyer views, daily target of at least 3 new Lebanon products, launch history, CSV export, and in-app target warnings.
- All 370 catalogue products, source images and Arabic titles, selling prices, commissions, and stock snapshots. Launching a product does not deduct inventory.
- All eleven supplied buyer profiles. The leader creates their login emails and temporary passwords in **Users & access**.
- Landing-page URL, creative videos, Meta/TikTok/both, required screenshot for each selected platform, duplicate-product protection per buyer.
- Password changes on first buyer login, leader password resets, paused accounts, session revocation, salted scrypt password hashes, HTTP-only sessions, request-origin validation, and login throttling.
- SQLite database and uploaded files in a persistent data directory. One application replica, with one Railway volume.

## Deploy to Railway

1. Create a new Railway project/service for ping-flow. Upload this source to your own Git repository and connect it, or use the authenticated Railway CLI from this folder with `railway up`.
2. Railway uses the included Dockerfile. Attach a **persistent volume mounted at `/data`** to this service. Keep one replica. The app refuses to start on Railway without a volume.
3. Set `DATA_DIR=/data` and `SETUP_TOKEN` to a new random secret with at least 32 characters. Generate it locally with:

   ```sh
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

4. Generate a Railway HTTPS domain. Set `APP_URL` to its exact origin, e.g. `https://your-app.up.railway.app` (no path). Redeploy after changing variables.
5. Open `/setup`. Enter the setup token and choose **your own leader email and password**. Setup cannot create another leader once one exists. Remove `SETUP_TOKEN` from service variables after setup.
6. Open **Users & access**. Select each existing buyer and set their email plus a temporary password of at least 12 characters. Share credentials privately. Buyers must change their temporary password on first login.

Health check: `/api/health`. The app listens on Railway's `PORT`. The Docker image starts the standalone Node server, not the Cloudflare Worker.

Railway volume documentation: https://docs.railway.com/volumes

## Local use

Node.js 24 is required.

```sh
npm ci
export DATA_DIR=./data
export SETUP_TOKEN=your-own-random-secret-of-at-least-32-characters
export APP_URL=http://localhost:3000
npm run dev
```

Then open http://localhost:3000/setup. Never commit `.env` files or the `data` folder.

## Validation

```sh
npm run typecheck
npm test
npm run build
npm run test:integration
```

The integration test runs an isolated production server with temporary accounts and a temporary database; it does not use production credentials. It checks setup, login, required password change, role isolation, CSRF, user creation, launch uploads, proof validation, video byte ranges, duplicate launches, restart persistence, resets, paused access, and logout.

## Persistence, backups and migration

The database is `/data/ping-flow.sqlite`; uploaded media is under `/data/uploads`. Keep the database and media together in backups. Enable Railway volume backups. For a consistent application copy, run `npm run backup -- /path/outside-data`; the script uses SQLite's backup API and copies upload files. Avoid running a backup during upload activity. Backups contain confidential team data and password hashes; protect them.

This package contains the **catalogue and buyer roster**, not the live database or uploaded files from the earlier ChatGPT-hosted Site. Existing launch submissions, buyer email assignments and files must be exported from that Site and migrated before a production cutover. Passwords must be created in this standalone app. Keep the earlier Site available until migration is complete.

## Account recovery

Buyers ask the leader for a reset through **Users & access**. If the leader forgets their password, use the Railway service shell:

```sh
npm run reset-leader
```

Enter the new password at the hidden prompt. The command changes the existing leader's password and revokes old sessions. Do not pass passwords as command-line arguments.

## Storage limits

Each file is limited to 50 MB, each launch request to 90 MB, with at most 12 evidence files. Use the Railway volume size appropriate for your team's videos. Stock is a PDF snapshot, not live inventory. Warnings are in-app; no email, WhatsApp, or push delivery is configured.
