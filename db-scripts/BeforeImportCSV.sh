#/bin/bash

rm -f ./CRP_Categories.txt
rm -f ./*.sanitized

cp ../data/CRP_Categories.txt ./

CYCLES="08 10 12 14 16"

for CYCLE in $CYCLES; do
  ./PrepCampaignCSV.sh $CYCLE
done

./GenImportScript.sh $CYCLES > ./ImportCSV.sql
