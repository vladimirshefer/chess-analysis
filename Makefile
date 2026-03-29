IMAGE_NAME=chess-analysis
PORT=3001

.PHONY: *

build:
	cd client && npm run build

install:
	cd client && npm install

run-local:
	cd client && npm run dev

build-docker:
	@echo "Docker setup removed with backend"

run-docker-dev: build-docker
	@echo "Docker setup removed with backend"
