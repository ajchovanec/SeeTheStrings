#/bin/bash

CYCLE=$1

DEST=../data/sanitized

shopt -s expand_aliases
alias csed="env LANG=C sed"
alias utf8conv="iconv -f iso-8859-1 -t utf-8"

cat ../data/CampaignFin$CYCLE/cands$CYCLE.txt | csed -e 's/"//g' -e 's/|/"/g' | ./SanitizeCSV.py | utf8conv > $DEST/cands$CYCLE.sanitized
cat ../data/CampaignFin$CYCLE/cmtes$CYCLE.txt | csed -e 's/|/"/g' | ./SanitizeCSV.py | utf8conv > $DEST/cmtes$CYCLE.sanitized
cat ../data/CampaignFin$CYCLE/pacs$CYCLE.txt | csed -e 's/|/"/g' | ./SanitizeCSV.py  | utf8conv > $DEST/pacs$CYCLE.sanitized
cat ../data/CampaignFin$CYCLE/pac_other$CYCLE.txt | csed -e 's/|/"/g' | ./SanitizeCSV.py | utf8conv > $DEST/pac_other$CYCLE.sanitized
cat ../data/CampaignFin$CYCLE/indivs$CYCLE.txt | csed -e 's/\,\|\|\([a-zA-Z]\)/,|\1/g' -e 's/ \|\|/ /g' -e 's/\\\\|/|/g' -e 's/\\|/|/g' -e 's/|/"/g' -e 's/\\./\./g' | ./SanitizeCSV.py | utf8conv > $DEST/indivs$CYCLE.sanitized
