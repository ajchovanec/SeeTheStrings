#/bin/bash

rm -f ./CRP_Categories.txt
rm -f ./*.sanitized

cp ../data/CRP_Categories.txt ./

CYCLES="10 12 14"

for CYCLE in $CYCLES; do
  ./PrepCampaignCSV.sh $CYCLE
done

./GenImportScript.sh $CYCLES > ./ImportCSV.sql
