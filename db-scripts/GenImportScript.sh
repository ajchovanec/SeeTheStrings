#/bin/bash

# This bash script generates a SQL script which can then be invoked to import sanitized campaign
# finance data into a previously created database with the schema defined in CreateTables.sql.
# The output of this script should be piped to a .sql file which should then be invoked as follows:
#
# psql -d [database] -U [user] -f [file]

echo "\copy Categories from ./CRP_Categories.txt delimiter E'\t'"

CYCLES=$@
for CYCLE in $CYCLES; do
  echo "\copy Candidates from ./cands$CYCLE.sanitized delimiter '|'"
  echo "\copy Committees from ./cmtes$CYCLE.sanitized delimiter '|'"
  echo "\copy PACsToCandidates from ./pacs$CYCLE.sanitized delimiter '|'"
  echo "\copy PACsToPACs from ./pac_other$CYCLE.sanitized delimiter '|'"
  echo "\copy IndivsToAny from ./indivs$CYCLE.sanitized delimiter '|'"
done
