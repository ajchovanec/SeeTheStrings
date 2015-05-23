#/bin/bash

CYCLE=$1

shopt -s expand_aliases
alias csed="env LANG=C sed"

cat ../../data/CampaignFin$CYCLE/cands$CYCLE.txt | csed -e 's/"//g' -e 's/|/"/g' | ../SanitizeCSV.py  > ./cands$CYCLE.sanitized
cat ../../data/CampaignFin$CYCLE/cmtes$CYCLE.txt | csed -e 's/|/"/g' | ../SanitizeCSV.py > ./cmtes$CYCLE.sanitized
cat ../../data/CampaignFin$CYCLE/pacs$CYCLE.txt | csed -e 's/|/"/g' | ../SanitizeCSV.py  > ./pacs$CYCLE.sanitized
cat ../../data/CampaignFin$CYCLE/pac_other$CYCLE.txt | csed -e 's/|/"/g' | ../SanitizeCSV.py > ./pac_other$CYCLE.sanitized
cat ../../data/CampaignFin$CYCLE/indivs$CYCLE.txt | csed -e 's/\\\\|/|/g' -e 's/\\|/|/g' -e 's/|/"/g' | ../SanitizeCSV.py > ./indivs$CYCLE.sanitized
