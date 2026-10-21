#!/usr/bin/env bash
set -e
rm -rf dist
mkdir -p dist
cp -r css js pics dist/
cp *.html manifest.json sw.js dist/
