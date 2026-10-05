#!/bin/sh
# Postgres backups for the restaurant POS.
#   backup.sh --once   take one backup now and exit
#   backup.sh          run forever, one backup per day at BACKUP_HOUR (container's TZ)
# Each backup is a custom-format pg_dump, encrypted with gpg (AES256) when BACKUP_PASSPHRASE
# is set. Files older than BACKUP_RETENTION_DAYS are deleted.
set -eu

: "${PGHOST:=postgres}"
: "${PGUSER:?PGUSER is required}"
: "${PGDATABASE:?PGDATABASE is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"
export PGHOST PGUSER PGDATABASE PGPASSWORD

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
BACKUP_HOUR="${BACKUP_HOUR:-02}"

# Every step returns on failure explicitly: `set -e` is ignored inside a function called from
# an `if`, which is how the scheduler calls this.
run_backup() {
  mkdir -p "$BACKUP_DIR" || return 1
  stamp="$(date +%Y%m%d-%H%M%S)"
  base="$BACKUP_DIR/rpos-$stamp.dump"
  partial="$base.partial"

  if ! pg_dump --format=custom --file="$partial"; then
    rm -f "$partial"
    return 1
  fi
  # A dump that pg_restore cannot read is not a backup.
  if [ ! -s "$partial" ] || ! pg_restore --list "$partial" > /dev/null; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') dump is empty or unreadable" >&2
    rm -f "$partial"
    return 1
  fi

  if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
    # Passphrase goes through a pipe, not argv, so it never shows up in `ps`.
    if ! printf '%s' "$BACKUP_PASSPHRASE" | gpg --batch --yes --pinentry-mode loopback \
      --passphrase-fd 0 --symmetric --cipher-algo AES256 --output "$base.gpg" "$partial"; then
      rm -f "$partial" "$base.gpg"
      return 1
    fi
    rm -f "$partial"
    final="$base.gpg"
  else
    mv "$partial" "$base" || return 1
    final="$base"
  fi
  [ -s "$final" ] || return 1

  # Prune only after a verified new backup exists.
  find "$BACKUP_DIR" -type f -name 'rpos-*.dump*' -mtime +"$RETENTION_DAYS" -delete
  echo "$(date '+%Y-%m-%d %H:%M:%S') backup written: $final ($(wc -c < "$final" | tr -d " ") bytes)"
}

if [ "${1:-}" = "--once" ]; then
  if run_backup; then exit 0; fi
  echo "$(date '+%Y-%m-%d %H:%M:%S') backup FAILED" >&2
  exit 1
fi

echo "Backup scheduler started: daily at ${BACKUP_HOUR}:00 (${TZ:-UTC}), keeping ${RETENTION_DAYS} days."
last_day=""
while true; do
  today="$(date +%Y%m%d)"
  if [ "$(date +%H)" = "$BACKUP_HOUR" ] && [ "$last_day" != "$today" ]; then
    if run_backup; then
      last_day="$today"
    else
      echo "$(date '+%Y-%m-%d %H:%M:%S') backup FAILED, retrying in 5 minutes" >&2
    fi
  fi
  sleep 300
done
