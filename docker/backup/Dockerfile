FROM postgres:16-alpine
RUN apk add --no-cache gnupg tzdata
COPY docker/backup/backup.sh /usr/local/bin/backup.sh
COPY docker/backup/restore-check.sh /usr/local/bin/restore-check.sh
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/restore-check.sh
ENTRYPOINT ["/usr/local/bin/backup.sh"]
