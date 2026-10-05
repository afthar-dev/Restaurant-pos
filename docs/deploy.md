# Deploying the Restaurant POS

This runbook puts the system on one Linux VPS with Docker. It takes about an hour the first time.

## 1. What you need

- A VPS with 2 vCPU, 4 GB RAM, 40 GB disk, Ubuntu 24.04 (any Docker-capable Linux works).
- A domain or subdomain for the restaurant, e.g. `pos.spicegarden.in`, with an **A record** pointing at the VPS IP.
- Ports 80 and 443 open in the VPS firewall.
- At the restaurant: a 4G backup router, so billing keeps working when the main internet drops.

## 2. Install Docker and get the code

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # log out and back in afterwards
git clone <your-repo-url> restaurant-pos
cd restaurant-pos
```

## 3. Configure

```bash
cp .env.prod.example .env.prod
nano .env.prod
```

Set at least:

| Variable | Value |
|---|---|
| `POSTGRES_PASSWORD` | Long random string, **letters and digits only** (`openssl rand -hex 24`) |
| `JWT_SECRET` | `openssl rand -hex 32` |
| `CORS_ORIGINS` | `https://pos.spicegarden.in` (your domain) |
| `HTTP_PORT` | `80` |
| `DOMAIN` | `pos.spicegarden.in` |
| `OWNER_NAME`, `OWNER_PHONE`, `OWNER_PASSWORD` | The restaurant owner's first login |
| `BACKUP_PASSPHRASE` | Long random string. **Write it down somewhere off the server**: without it, backups cannot be opened. |

## 4. Get the HTTPS certificate (first time only)

Stop anything on port 80, then ask Let's Encrypt for a certificate:

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.tls.yml --env-file .env.prod \
  run --rm -p 80:80 --entrypoint certbot certbot certonly --standalone \
  -d pos.spicegarden.in --email you@example.com --agree-tos --no-eff-email
```

Renewals happen automatically afterwards (the `certbot` service checks twice a day).

## 5. Start everything

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.tls.yml --env-file .env.prod up -d --build
docker compose -f docker-compose.prod.yml -f docker-compose.tls.yml --env-file .env.prod exec api pnpm db:seed
```

The seed creates the outlet and the owner from `OWNER_*`. After it runs you can clear `OWNER_PASSWORD` from `.env.prod`.

Check: open `https://pos.spicegarden.in/api/health`. It should show `{"status":"ok","db":"up"}`.

Sign-in cookies are marked Secure, so **staff must use the https:// address**. Plain http on a real domain cannot keep people signed in.

## 6. First-day setup in the app

1. The owner signs in at `https://pos.spicegarden.in/login`.
2. **Admin → Settings**: restaurant name, GSTIN and GST scheme (from the GST certificate), FSSAI number, bill header/footer, cashier discount limit.
3. **Admin → Staff**: add managers (password + optional approval PIN), cashiers and waiters (PIN).
4. On each counter PC, waiter phone and kitchen screen: a manager signs in, goes to **Admin → Devices**, registers that device, and signs out. Staff then use **Staff PIN sign in** there.

## 7. Backups

- The `backup` service writes one backup a day at `BACKUP_HOUR` (Indian time by default) into `BACKUP_DIR` (default `./backups` next to the compose file), encrypted when `BACKUP_PASSPHRASE` is set, and deletes files older than `BACKUP_RETENTION_DAYS`.
- Take a backup right now:

  ```bash
  docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm --entrypoint /usr/local/bin/backup.sh backup --once
  ```

- **Copy backups off the server.** A server failure takes local backups with it. With [rclone](https://rclone.org) configured for Google Drive or S3, add a host cron entry (`crontab -e`):

  ```cron
  30 3 * * * rclone copy /home/ubuntu/restaurant-pos/backups remote:rpos-backups --max-age 48h
  ```

### Restore drill (do this once a month)

```bash
# 1. Decrypt (skip if BACKUP_PASSPHRASE is empty)
gpg --decrypt backups/rpos-YYYYmmdd-HHMMSS.dump.gpg > /tmp/restore.dump

# 2. Load into a scratch database and check it
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres \
  sh -c 'createdb -U "$POSTGRES_USER" restore_check && pg_restore -U "$POSTGRES_USER" -d restore_check' < /tmp/restore.dump
docker compose -f docker-compose.prod.yml --env-file .env.prod exec postgres \
  psql -U rpos -d restore_check -c 'select count(*) from users;'

# 3. Clean up
docker compose -f docker-compose.prod.yml --env-file .env.prod exec postgres dropdb -U rpos restore_check
```

To restore for real, stop `api`, drop and recreate the `rpos` database the same way, `pg_restore` into it, then start `api`.

## 8. Weekly certificate reload

nginx loads renewed certificates when it reloads. Add a host cron entry:

```cron
0 4 * * 1 cd /home/ubuntu/restaurant-pos && docker compose -f docker-compose.prod.yml -f docker-compose.tls.yml --env-file .env.prod exec web nginx -s reload
```

## 9. Updating to a new version

```bash
git pull
docker compose -f docker-compose.prod.yml -f docker-compose.tls.yml --env-file .env.prod up -d --build
```

Database migrations run automatically when the `api` container starts. Take a backup first (`--once` above).

## 10. If something is wrong

| Symptom | Check |
|---|---|
| Screens show "Server offline" | Restaurant internet / 4G router; then `docker compose ... ps` on the VPS |
| "Database unavailable" | `docker compose ... logs postgres` |
| Everyone signed out after an update | `JWT_SECRET` changed. Keep it stable. |
| Staff PIN screen says device not registered | Register it again in Admin → Devices (browser data was cleared) |
| Locked out after 5 wrong tries | Wait 15 minutes, or the owner resets that person's PIN/password in Admin → Staff |
