#/bin/bash

# Rerun cleanup operations, in case some intermediate files are lingering.
./AfterImportCSV.sh

mkdir ../data/sanitized

cp ../data/CRP_Categories.txt ../data/sanitized/

CYCLES="08 10 12 14 16"

./GenImportScript.sh $CYCLES > ./ImportCSV.sql

for CYCLE in $CYCLES; do
  echo Preparing cycle $CYCLE Campaign CSV files for import...
  ./PrepCampaignCSV.sh $CYCLE
done

echo Done preparing CSV files for import.
