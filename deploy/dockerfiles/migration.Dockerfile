FROM flyway/flyway:11-alpine

COPY sunrei-server/src/main/resources/db/migration /flyway/sql

ENV FLYWAY_LOCATIONS=filesystem:/flyway/sql
ENV FLYWAY_BASELINE_ON_MIGRATE=true
ENV FLYWAY_VALIDATE_MIGRATION_NAMING=true

CMD ["migrate"]
