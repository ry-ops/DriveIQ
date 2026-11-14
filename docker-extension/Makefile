IMAGE ?= ryops/driveiq-extension
TAG ?= latest

BUILDER=buildx-multi-arch

STATIC_FLAGS=CGO_ENABLED=0
LDFLAGS="-s -w"

INFO_COLOR = \033[0;36m
NO_COLOR   = \033[m

.PHONY: build install update dev-ui dev-debug dev-reset clean validate

build: ## Build the extension image
	docker build --tag=$(IMAGE):$(TAG) -f Dockerfile ..

install: build ## Build and install the extension
	docker extension install $(IMAGE):$(TAG)

update: build ## Build and update the extension
	docker extension update $(IMAGE):$(TAG)

dev-ui: ## Start UI hot reload (run npm run dev in ui/ first)
	docker extension dev ui-source $(IMAGE):$(TAG) http://localhost:3001

dev-debug: ## Open Chrome DevTools for the extension
	docker extension dev debug $(IMAGE):$(TAG)

dev-reset: ## Reset dev mode
	docker extension dev reset $(IMAGE):$(TAG)

validate: ## Validate extension metadata
	docker extension validate $(IMAGE):$(TAG)

rm: ## Remove the extension
	docker extension rm $(IMAGE):$(TAG)

clean: ## Clean build artifacts
	rm -rf ui/build ui/node_modules

help: ## Show this help
	@echo ''
	@echo 'Usage:'
	@echo '  ${INFO_COLOR}make <target>${NO_COLOR}'
	@echo ''
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  ${INFO_COLOR}%-12s${NO_COLOR} %s\n", $$1, $$2}'
	@echo ''
