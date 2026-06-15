#!/bin/bash
cd /home/z/my-project
while true; do
  # Kill any existing next process
  pkill -f "next dev -p 3000" 2>/dev/null
  sleep 2
  
  # Start next dev server
  node node_modules/.bin/next dev -p 3000 >> dev.log 2>&1 &
  PID=$!
  echo "Started next with PID $PID"
  
  # Wait for it to die
  while kill -0 $PID 2>/dev/null; do
    sleep 5
  done
  
  echo "Process died, restarting..."
  sleep 2
done
