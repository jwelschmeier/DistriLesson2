#!/bin/bash

# Get GitHub token
TOKEN=$(tsx scripts/git-auth-helper.ts 2>/dev/null)

if [ -z "$TOKEN" ]; then
  echo "❌ Error: Could not get GitHub token from connection"
  exit 1
fi

# Create URL with token
REPO_URL="https://jwelschmeier:${TOKEN}@github.com/jwelschmeier/DistriLesson2"

# Pull from GitHub
echo "⬇️  Pulling from GitHub..."
git pull "$REPO_URL" "$@"
