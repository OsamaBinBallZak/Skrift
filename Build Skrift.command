#!/bin/bash

cd "$(dirname "$0")"

# Run the build script in this Terminal window
./build-dist.sh

echo ""
echo "Build finished. Press any key to close this window..."
read -n 1 -s
