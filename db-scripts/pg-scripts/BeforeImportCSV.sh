#/bin/bash

rm -f ./CRP_Categories.txt
rm -f ./*.sanitized

cp ../../data/raw/CampaignFin14/CRP_Categories.txt ./
cat ../../data/raw/CampaignFin14/cands14.txt | sed -e 's/"//g' -e 's/|/"/g' | ../SanitizeCSV.py  > ./cands14.sanitized
cat ../../data/raw/CampaignFin14/cmtes14.txt | sed -e 's/|/"/g' | ../SanitizeCSV.py > ./cmtes14.sanitized
cat ../../data/raw/CampaignFin14/pacs14.txt | sed -e 's/|/"/g' | ../SanitizeCSV.py  > ./pacs14.sanitized
cat ../../data/raw/CampaignFin14/pac_other14.txt | sed -e 's/|/"/g' | ../SanitizeCSV.py > ./pac_other14.sanitized
cat ../../data/raw/CampaignFin14/indivs14.txt | sed -e 's/\\|/|/g' -e 's/|/"/g' | ../SanitizeCSV.py > ./indivs14.sanitized
