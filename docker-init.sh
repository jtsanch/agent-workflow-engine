#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.yml"

compose() {
  docker compose -f "${COMPOSE_FILE}" "$@"
}

up() {
  echo "Starting local Docker dependencies..."
  compose up -d
  echo "Dependencies are running."
  echo "Postgres: postgres://postgres:postgres@localhost:5433/personal_agent_os"
  echo "Adminer: http://localhost:8080"
}

down() {
  echo "Stopping local Docker dependencies..."
  compose down
  echo "Dependencies stopped."
}

reset() {
  echo "Resetting local Docker dependencies..."
  compose down -v --remove-orphans
  up
}

logs() {
  compose logs -f
}

status() {
  compose ps
}

case "${1:-}" in
  up)
    up
    ;;
  down)
    down
    ;;
  reset)
    reset
    ;;
  logs)
    logs
    ;;
  status)
    status
    ;;
  *)
    echo "Usage: $0 {up|down|reset|logs|status}"
    exit 1
    ;;
esac
