#!/bin/sh
# Proves a backup can be restored (spec §6.4: "restore tested").
#   restore-check.sh /backups/rpos-YYYYmmdd-HHMMSS.dump[.gpg]
# Loads the backup into a scratch database next to the live one, compares row counts of the
# key tables with the live database (a backup may hold fewer rows, never more), then drops
# the scratch database. Prints RESTORE OK and exits 0 only when every step worked.
set -eu

: "${PGHOST:=postgres}"
: "${PGUSER:?PGUSER is required}"
: "${PGDATABASE:?PGDATABASE is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"
export PGHOST PGUSER PGPASSWORD

file="${1:?usage: restore-check.sh <backup file>}"
[ -s "$file" ] || { echo "backup file is missing or empty: $file" >&2; exit 1; }

live="$PGDATABASE"
scratch="restore_check_$(date +%Y%m%d%H%M%S)"
work="$(mktemp -d)"
created=""

cleanup() {
  if [ -n "$created" ]; then
    dropdb --if-exists "$scratch" || echo "could not drop $scratch; drop it by hand" >&2
  fi
  rm -rf "$work"
}
trap cleanup EXIT INT TERM

dump="$file"
case "$file" in
  *.gpg)
    : "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is needed to decrypt $file}"
    dump="$work/backup.dump"
    # Passphrase goes through a pipe, not argv, so it never shows up in `ps`.
    printf '%s' "$BACKUP_PASSPHRASE" | gpg --batch --yes --pinentry-mode loopback \
      --passphrase-fd 0 --decrypt --output "$dump" "$file"
    ;;
esac

createdb "$scratch"
created="yes"
pg_restore --no-owner --exit-on-error --dbname="$scratch" "$dump"

count() {
  psql --dbname="$1" --tuples-only --no-align --command="SELECT count(*) FROM $2"
}

failed=0
for table in outlets users orders bills payments business_days; do
  restored="$(count "$scratch" "$table")"
  current="$(count "$live" "$table")"
  printf '%-14s backup %8s   live %8s\n' "$table" "$restored" "$current"
  if [ "$restored" -gt "$current" ]; then
    echo "  the backup has more $table than the live database; is it from another server?" >&2
    failed=1
  fi
done
[ "$(count "$scratch" outlets)" -gt 0 ] || { echo "the backup has no outlet" >&2; failed=1; }

[ "$failed" -eq 0 ] || exit 1
echo "RESTORE OK: $file"
