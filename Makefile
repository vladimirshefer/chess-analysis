IMAGE_NAME=chess-analysis
PORT=3001

.PHONY: *

build:
	cd client && npm run build
	cd server && npm run build

install:
	cd client && npm install
	cd server && npm install

run-local:
	npx concurrently "cd server && npm run dev" "cd client && npm run dev"

build-docker:
	docker build -t $(IMAGE_NAME) .

run-docker-dev: build-docker
	docker run -p $(PORT):$(PORT) $(IMAGE_NAME)
