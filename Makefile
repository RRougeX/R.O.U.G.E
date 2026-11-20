VERSION ?= $(or $(shell git describe --tags 2>/dev/null | sed 's/^v//'),2.1.0)
LDFLAGS := -s -w -X main.version=$(VERSION) -X main.buildTime=$(shell date -u +%Y-%m-%dT%H:%M:%SZ)

.PHONY: all test build release clean
all: test build

test:
	cd server && go vet ./... && go test ./...
	bash -n install.sh rouge-get get.sh system/rouge-helper scripts/check-books.sh
	sh -n system/rouge-open
	python3 -m py_compile system/rouge-mesh.py

build:
	mkdir -p bin
	cd server && CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath -ldflags "$(LDFLAGS)" -o ../bin/rouge-linux-arm64 .
	cd server && CGO_ENABLED=0 GOOS=linux GOARCH=arm GOARM=6 go build -trimpath -ldflags "$(LDFLAGS)" -o ../bin/rouge-linux-armv6 .
	cd server && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags "$(LDFLAGS)" -o ../bin/rouge-linux-amd64 .

release: test build
	rm -rf dist && mkdir -p dist/rouge
	cp -r bin system modules install.sh rouge-get README.md MODULES.md LICENSE CHANGELOG.md dist/rouge/
	tar -C dist -czf dist/rouge.tar.gz rouge
	@echo "dist/rouge.tar.gz ready"

clean:
	rm -rf bin dist
