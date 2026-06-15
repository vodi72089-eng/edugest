#!/bin/bash
cd /home/z/my-project
echo $$ > /home/z/my-project/server.pid
exec node node_modules/.bin/next dev -p 3000
