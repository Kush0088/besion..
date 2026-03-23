#!/bin/bash

# Load local .env if it exists (for local testing)
if [ -f .env ]; then
  echo "Loading variables from .env"
  # Read .env file, ignoring comments and empty lines
  export $(grep -v '^#' .env | xargs)
fi

# Configuration file path
CONFIG_FILE="js/config.js"

echo "Injecting environment variables into $CONFIG_FILE..."

# Replace placeholders with environment variables
# Using | as delimiter to handle slashes in URLs
sed -i "s|BESION_SYNC_URL_PLACEHOLDER|${BESION_SYNC_URL}|g" "$CONFIG_FILE"
sed -i "s|BESION_API_KEY_PLACEHOLDER|${BESION_API_KEY}|g" "$CONFIG_FILE"
sed -i "s|BESION_ADMIN_PASSWORD_PLACEHOLDER|${BESION_ADMIN_PASSWORD}|g" "$CONFIG_FILE"
sed -i "s|BESION_SYNC_PASSWORD_PLACEHOLDER|${BESION_SYNC_PASSWORD}|g" "$CONFIG_FILE"

echo "Configuration updated successfully."
