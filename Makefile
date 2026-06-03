.PHONY: build watch clean install

build: node_modules
	node esbuild.js

watch: node_modules
	node esbuild.js --watch

clean:
	rm -rf out/

install:
	npm install

node_modules:
	npm install
