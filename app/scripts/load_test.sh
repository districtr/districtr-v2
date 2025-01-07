#!/bin/bash

# Configuration
export CYPRESS_trashAssetsBeforeRuns=false
SPEC_FILE="cypress/e2e/torture.cy.js"
NUM_PARALLEL=4

# Run parallel tests
for i in $(seq 1 $NUM_PARALLEL); do
  if [ $i -eq $NUM_PARALLEL ]; then
    # Run last test without & to wait for completion
    XDG_CONFIG_HOME=/tmp/cyhome$i npx cypress run -spec $SPEC_FILE
  else
    XDG_CONFIG_HOME=/tmp/cyhome$i npx cypress run -spec $SPEC_FILE &
  fi
done