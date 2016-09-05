#/bin/bash

./AfterImportCSV.sh

mkdir ../data/sanitized

cp ../data/CRP_Categories.txt ../data/sanitized/

CYCLES="08 10 12 14 16"

for CYCLE in $CYCLES; do
  ./PrepCampaignCSV.sh $CYCLE
done

./GenImportScript.sh $CYCLES > ./ImportCSV.sql
