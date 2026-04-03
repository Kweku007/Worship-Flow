#!/bin/bash
set -e

npm install

printf "1\n" | npm run db:push
