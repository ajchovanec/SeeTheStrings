#/bin/bash

rm -f ./CRP_Categories.txt
rm -f ./*.sanitized

cp ../data/CRP_Categories.txt ./

./PrepCampaignCSV.sh 12
./PrepCampaignCSV.sh 14

./GenImportScript.sh 12 14 > ./ImportCSV.sql
