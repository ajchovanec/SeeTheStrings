#/bin/bash

# This bash script generates a SQL script which can then be invoked to import sanitized campaign
# finance data into a previously created database with the schema defined in CreateTables.sql.
# The output of this script should be piped to a .sql file which should then be invoked as follows:
#
# psql -d [database] -U [user] -f [file]

echo "\copy Categories from ./CRP_Categories.txt delimiter E'\t'"

echo "DROP TABLE IF EXISTS TempIndivsToAny;"

echo "CREATE TABLE TempIndivsToAny (\
    cycle TEXT,\
    fectransid TEXT,\
    contribid TEXT,\
    contrib TEXT,\
    recipid TEXT,\
    orgname TEXT,\
    ultorg TEXT,\
    realcode TEXT,\
    date TEXT,\
    amount INTEGER,\
    street TEXT,\
    city TEXT,\
    state TEXT,\
    zip TEXT,\
    recipcode TEXT,\
    type TEXT,\
    cmteid TEXT,\
    otherid TEXT,\
    gender TEXT,\
    microfilm TEXT,\
    occupation TEXT,\
    employer TEXT,\
    source TEXT\
);"

CYCLES=$@
for CYCLE in $CYCLES; do
  echo "\copy Candidates from ./cands$CYCLE.sanitized delimiter '|'"
  echo "\copy Committees from ./cmtes$CYCLE.sanitized delimiter '|'"
  echo "\copy PACsToCandidates from ./pacs$CYCLE.sanitized delimiter '|'"
  echo "\copy PACsToPACs from ./pac_other$CYCLE.sanitized delimiter '|'"
  echo "\copy TempIndivsToAny from ./indivs$CYCLE.sanitized delimiter '|'"
  echo "INSERT INTO IndivsToCandidateTotals\
      SELECT DISTINCT\
          CYCLE,\
          MODE() WITHIN GROUP (ORDER BY contrib) AS contrib,\
          contribid,\
          recipid,\
          CAST(SUM(amount) as INTEGER) AS amount\
      FROM TempIndivsToAny\
      WHERE contribid IS NOT NULL and TRIM(contribid) != '' and recipid LIKE 'N%'\
      GROUP BY cycle, contribid, recipid;"
  echo "INSERT INTO IndivsToCommitteeTotals\
      SELECT DISTINCT\
          CYCLE,\
          MODE() WITHIN GROUP (ORDER BY contrib) AS contrib,\
          contribid,\
          recipid,\
          CAST(SUM(amount) as INTEGER) AS amount\
      FROM TempIndivsToAny\
      WHERE contribid IS NOT NULL and TRIM(contribid) != '' and recipid LIKE 'C%'\
      GROUP BY cycle, contribid, recipid;"
  echo "DELETE FROM TempIndivsToAny;"
done

echo "DROP TABLE TempIndivsToAny;"

echo "CREATE INDEX IndivsToCandidateTotals_cycle_contribid ON IndivsToCandidateTotals\
    (cycle, contribid);"
echo "CREATE INDEX IndivsToCandidateTotals_cycle_recipid ON IndivsToCandidateTotals\
    (cycle, recipid);"
echo "CREATE INDEX IndivsToCandidateTotals_cycle_contribid_amount ON IndivsToCandidateTotals\
    (cycle, contribid, amount desc);"
echo "CREATE INDEX IndivsToCandidateTotals_cycle_recipid_amount ON IndivsToCandidateTotals\
    (cycle, recipid, amount desc);"

echo "CREATE INDEX IndivsToCommitteeTotals_cycle_contribid ON IndivsToCommitteeTotals
    (cycle, contribid);"
echo "CREATE INDEX IndivsToCommitteeTotals_cycle_recipid ON IndivsToCommitteeTotals
    (cycle, recipid);"
echo "CREATE INDEX IndivsToCommitteeTotals_cycle_contribid_amount ON IndivsToCommitteeTotals
    (cycle, contribid, amount desc);"
echo "CREATE INDEX IndivsToCommitteeTotals_cycle_recipid_amount ON IndivsToCommitteeTotals
    (cycle, recipid, amount desc);"

echo "ANALYZE Categories;"
echo "ANALYZE Candidates;"
echo "ANALYZE Committees;"
echo "ANALYZE PACsToCandidates;"
echo "ANALYZE PACsToPACs;"
echo "ANALYZE IndivsToCandidateTotals;"
echo "ANALYZE IndivsToCommitteeTotals;"

