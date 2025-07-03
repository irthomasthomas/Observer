#!/bin/sh
# print_info.sh

echo ""
echo "####################################################################"
echo "#                                                                  #"
echo "#   🚀 Observer App is starting! Access it at:                     #"
echo "#                                                                  #"
echo "#      👉 http://app.observer-ai.com                               #"
echo "#                                                                  #"
echo "#   Remember to configure the Inference API in the app to:         #"
echo "#      https://localhost:3838 (and accept the cert)                #"
echo "#                                                                  #"
echo "#     For offline use, the webpage is also served on:              #"
echo "#      https://localhost:8080 (no Auth0 features :c )              #"
echo "#                                                                  #"
echo "#   Waiting for services to become fully available...              #"
echo "#                                                                  #"
echo "####################################################################"
echo ""
exit 0 # Important to exit so supervisor knows it completed
