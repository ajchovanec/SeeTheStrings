#/bin/bash

./AfterImportCSV.sh

mkdir ../data/sanitized

cp ../data/CRP_Categories.txt ../data/sanitized/

CYCLES="08 10 12 14 16"

./GenImportScript.sh $CYCLES > ./ImportCSV.sql

for CYCLE in $CYCLES; do
  echo Preparing Campaign CSV files for cycle $CYCLE...
  ./PrepCampaignCSV.sh $CYCLE
done
