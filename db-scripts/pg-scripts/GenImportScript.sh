#/bin/bash

echo "\encoding SQL_ASCII"

CYCLES=$@

for CYCLE in $CYCLES; do
  echo "\copy Categories from ./CRP_Categories.txt delimiter E'\t'"
  echo "\copy Candidates from ./cands$CYCLE.sanitized delimiter '|'"
  echo "\copy Committees from ./cmtes$CYCLE.sanitized delimiter '|'"
  echo "\copy PACsToCandidates from ./pacs$CYCLE.sanitized delimiter '|'"
  echo "\copy PACsToPACs from ./pac_other$CYCLE.sanitized delimiter '|'"
  echo "\copy IndivsToAny from ./indivs$CYCLE.sanitized delimiter '|'"
done
