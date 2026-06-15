#!/bin/bash
exec 3>&1 4>&2
trap 'echo trapped >> /home/z/my-project/dev.log' SIGTERM SIGINT
cd /home/z/my-project
while true; do
  npx next dev -p 3000 >> /home/z/my-project/dev.log 2>&1
  echo "[RESTART] $(date)" >> /home/z/my-project/dev.log
  sleep 2
done
