#!/usr/bin/env bash

set -euo pipefail

# Deploys the AI-DocParsing-Shipping project to GCP.
# Run this script from the repository root (same folder as this file), e.g.:
#   bash ./deploy_to_GCP.sh both
# Usage:
#   ./deploy_to_GCP.sh frontend   # Deploy only the frontend (Firebase Hosting)
#   ./deploy_to_GCP.sh backend    # Deploy only the backend (Cloud Run)
#   ./deploy_to_GCP.sh both       # Deploy both frontend and backend
#   ./deploy_to_GCP.sh -h|--help  # Show help
#
# Optional environment variables (override defaults without editing the script):
#   CLOUD_RUN_PROJECT      GCP project ID for Cloud Run. If omitted, gcloud default will be used.
#   CLOUD_RUN_REGION       Cloud Run region. Default: asia-south1
#   CLOUD_RUN_SERVICE      Cloud Run service name. Default: ai-shipping-documents-backend
#   CLOUD_RUN_ENTRYPOINT   Entrypoint command for Google buildpacks. Default: "uvicorn main:app --host=0.0.0.0 --port=8080"
#   EXTRA_ENV_VARS         Additional env vars for Cloud Run as KEY=VALUE,KEY2=VALUE2
#
# Notes:
# - Expects the following directories relative to this script:
#     frontend/ (Firebase Hosting site)
#     backend/app/ (FastAPI app for Cloud Run)

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
ROOT_DIR="$SCRIPT_DIR"

FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_APP_DIR="$ROOT_DIR/backend/app"
FIREBASE_JSON="$FRONTEND_DIR/firebase.json"

DEFAULT_REGION="asia-south1"
DEFAULT_SERVICE="ai-indian-portfolio-tracker-backend"
DEFAULT_ENTRYPOINT="uvicorn main:app --host=0.0.0.0 --port=8080"

CLOUD_RUN_REGION="${CLOUD_RUN_REGION:-$DEFAULT_REGION}"
CLOUD_RUN_SERVICE="${CLOUD_RUN_SERVICE:-$DEFAULT_SERVICE}"
CLOUD_RUN_ENTRYPOINT="${CLOUD_RUN_ENTRYPOINT:-$DEFAULT_ENTRYPOINT}"
EXTRA_ENV_VARS="${EXTRA_ENV_VARS:-}"

log() {
	echo -e "[deploy] $*"
}

err() {
	echo -e "[deploy][error] $*" >&2
}

check_cmd() {
	if ! command -v "$1" >/dev/null 2>&1; then
		err "Required command '$1' not found. Please install it and try again."
		return 1
	fi
}

usage() {
	cat <<USAGE
Usage: $(basename "$0") <frontend|backend|both>

Flags:
	frontend   Deploy only the frontend (Firebase Hosting)
	backend    Deploy only the backend (Cloud Run)
	both       Deploy both frontend and backend
	-h, --help Show this help

Environment variables:
	CLOUD_RUN_PROJECT      GCP project ID for Cloud Run. If omitted, gcloud default will be used.
	CLOUD_RUN_REGION       Cloud Run region. Default: $DEFAULT_REGION
	CLOUD_RUN_SERVICE      Cloud Run service name. Default: $DEFAULT_SERVICE
	CLOUD_RUN_ENTRYPOINT   Buildpacks entrypoint. Default: $DEFAULT_ENTRYPOINT
	EXTRA_ENV_VARS         Additional env vars for Cloud Run as KEY=VALUE,KEY2=VALUE2
	GEMINI_API_KEY        Required for 'backend' or 'both'. Passed to Cloud Run as GEMINI_API_KEY.
USAGE
}

deploy_frontend() {
	# Ensure firebase CLI is available; if not, try to install via npm if npm exists
	if ! command -v firebase >/dev/null 2>&1; then
		if command -v npm >/dev/null 2>&1; then
			log "firebase CLI not found — attempting to install firebase-tools globally via npm..."
			npm install -g firebase-tools || {
				err "Failed to install firebase-tools via npm. Please install the firebase CLI manually."
				return 1
			}
			log "firebase-tools installed."
		else
			err "Required command 'firebase' not found and 'npm' is not available to install it. Please install the firebase CLI and try again."
			return 1
		fi
	fi

	if [[ ! -d "$FRONTEND_DIR" ]]; then
		err "Frontend directory not found: $FRONTEND_DIR"
		return 1
	fi

	if [[ ! -f "$FIREBASE_JSON" ]]; then
		log "firebase.json not found at repository root: $FIREBASE_JSON"
		# Ensure user is logged in to Firebase; try a harmless command to detect auth
		if ! firebase projects:list >/dev/null 2>&1; then
			log "Not authenticated with Firebase — running 'firebase login' (interactive)..."
			firebase login || {
				err "'firebase login' failed or was cancelled. Please login manually and try again."
				return 1
			}
		fi

		# Try to run interactive firebase init hosting to create firebase.json
		log "Running 'firebase init hosting' to help create firebase.json (interactive)..."
		# Note: this will prompt the user for options interactively
		pushd "$ROOT_DIR" >/dev/null
		firebase init hosting || {
			err "'firebase init hosting' failed or was cancelled. Please initialize Firebase Hosting manually and ensure firebase.json exists."
			popd >/dev/null
			return 1
		}
		popd >/dev/null
		# After init, ensure file exists
		if [[ ! -f "$FIREBASE_JSON" ]]; then
			err "firebase.json still not found after initialization. Please create it and try again."
			return 1
		fi
	fi

	# Build the frontend using npm
	check_cmd npm
	log "Building frontend (npm run build)..."
	pushd "$FRONTEND_DIR" >/dev/null
	npm run build
	popd >/dev/null

	# Deploy from the repository root so firebase.json is picked up correctly
	log "Deploying frontend to Firebase Hosting..."
	pushd "$FRONTEND_DIR" >/dev/null
	firebase deploy --only hosting:ai-indian-portfolio-analyst
	popd >/dev/null
	log "Frontend deployment completed."
}

deploy_backend() {
	check_cmd gcloud

	if [[ ! -d "$BACKEND_APP_DIR" ]]; then
		err "Backend app directory not found: $BACKEND_APP_DIR"
		return 1
	fi

	# Load environment variables from .env if present
	if [[ -f "$BACKEND_APP_DIR/.env" ]]; then
		log "Sourcing environment variables from $BACKEND_APP_DIR/.env"
		set -a
		. "$BACKEND_APP_DIR/.env"
		set +a
	fi

	# Require API keys for backend deploys
	local missing=0
	if [[ -z "${GEMINI_API_KEY:-}" ]]; then
		err "GEMINI_API_KEY is not set. Export it before deploying (e.g.,: export GEMINI_API_KEY=your_key)."
		missing=1
	fi
	if [[ "$missing" -eq 1 ]]; then
		return 1
	fi

	local ENV_VARS="GOOGLE_ENTRYPOINT=${CLOUD_RUN_ENTRYPOINT},GEMINI_API_KEY=${GEMINI_API_KEY}"
	if [[ -n "$EXTRA_ENV_VARS" ]]; then
		ENV_VARS+=",$EXTRA_ENV_VARS"
	fi

	log "Deploying backend to Cloud Run..."
	log "Service: $CLOUD_RUN_SERVICE | Region: $CLOUD_RUN_REGION"
	if [[ -n "${CLOUD_RUN_PROJECT:-}" ]]; then
		log "Project: $CLOUD_RUN_PROJECT"
	fi

	pushd "$BACKEND_APP_DIR" >/dev/null
	if [[ -n "${CLOUD_RUN_PROJECT:-}" ]]; then
		gcloud run deploy "$CLOUD_RUN_SERVICE" \
			--source . \
			--region "$CLOUD_RUN_REGION" \
			--project "$CLOUD_RUN_PROJECT" \
			--set-env-vars "$ENV_VARS" \
			--allow-unauthenticated
	else
		gcloud run deploy "$CLOUD_RUN_SERVICE" \
			--source . \
			--region "$CLOUD_RUN_REGION" \
			--set-env-vars "$ENV_VARS" \
			--allow-unauthenticated
	fi
	popd >/dev/null
	log "Backend deployment completed."
}

main() {
	if [[ $# -lt 1 ]]; then
		usage
		exit 1
	fi

	case "$1" in
		-h|--help)
			usage
			;;
		frontend)
			deploy_frontend
			;;
		backend)
			deploy_backend
			;;
		both)
			deploy_frontend
			deploy_backend
			;;
		*)
			err "Unknown option: $1"
			usage
			exit 1
			;;
	esac
}

main "$@"

