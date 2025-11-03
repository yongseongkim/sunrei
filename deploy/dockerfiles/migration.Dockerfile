# Flyway Migration Image
FROM flyway/flyway:11-alpine

# Copy migration SQL files
COPY sunrei-server/src/main/resources/db/migration /flyway/sql

# Set default Flyway configuration
ENV FLYWAY_LOCATIONS=filesystem:/flyway/sql
ENV FLYWAY_BASELINE_ON_MIGRATE=true
ENV FLYWAY_VALIDATE_MIGRATION_NAMING=true

# Default command runs migration
CMD ["migrate"]
