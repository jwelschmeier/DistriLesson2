#!/bin/bash

# Get GitHub token from the connection
TOKEN=$(tsx scripts/git-auth-helper.ts)

if [ -z "$TOKEN" ]; then
  echo "Error: Could not get GitHub token"
  exit 1
fi

# Configure git credential helper to store the token
git config --global credential.helper store

# Update the remote URL to include the token
REPO_URL="https://jwelschmeier:${TOKEN}@github.com/jwelschmeier/DistriLesson2"

# Set the origin URL with the token
git remote set-url origin "$REPO_URL"

echo "✓ Git authentication configured successfully!"
echo "You can now use: git push, git pull, etc."
