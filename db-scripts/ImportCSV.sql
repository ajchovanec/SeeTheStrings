\copy Categories from ../data/sanitized/CRP_Categories.txt delimiter E'\t'
DROP TABLE IF EXISTS TempIndivsToAny;
CREATE TABLE TempIndivsToAny (    cycle TEXT,    fectransid TEXT,    contribid TEXT,    contrib TEXT,    recipid TEXT,    orgname TEXT,    ultorg TEXT,    realcode TEXT,    date TEXT,    amount INTEGER,    street TEXT,    city TEXT,    state TEXT,    zip TEXT,    recipcode TEXT,    type TEXT,    cmteid TEXT,    otherid TEXT,    gender TEXT,    microfilm TEXT,    occupation TEXT,    employer TEXT,    source TEXT);
\copy Candidates from ../data/sanitized/cands08.sanitized delimiter '|'
\copy Committees from ../data/sanitized/cmtes08.sanitized delimiter '|'
\copy PACsToCandidates from ../data/sanitized/pacs08.sanitized delimiter '|'
\copy PACsToPACs from ../data/sanitized/pac_other08.sanitized delimiter '|'
\copy TempIndivsToAny from ../data/sanitized/indivs08.sanitized delimiter '|'
INSERT INTO IndivsToCandidateTotals      SELECT DISTINCT          CYCLE,          MODE() WITHIN GROUP (ORDER BY contrib) AS contrib,          contribid,          recipid,          CAST(SUM(amount) as INTEGER) AS amount      FROM TempIndivsToAny      WHERE contribid IS NOT NULL and TRIM(contribid) != '' and recipid LIKE 'N%'      GROUP BY cycle, contribid, recipid;
INSERT INTO IndivsToCommitteeTotals      SELECT DISTINCT          CYCLE,          MODE() WITHIN GROUP (ORDER BY contrib) AS contrib,          contribid,          recipid,          CAST(SUM(amount) as INTEGER) AS amount      FROM TempIndivsToAny      WHERE contribid IS NOT NULL and TRIM(contribid) != '' and recipid LIKE 'C%'      GROUP BY cycle, contribid, recipid;
DELETE FROM TempIndivsToAny;
\copy Candidates from ../data/sanitized/cands10.sanitized delimiter '|'
\copy Committees from ../data/sanitized/cmtes10.sanitized delimiter '|'
\copy PACsToCandidates from ../data/sanitized/pacs10.sanitized delimiter '|'
\copy PACsToPACs from ../data/sanitized/pac_other10.sanitized delimiter '|'
\copy TempIndivsToAny from ../data/sanitized/indivs10.sanitized delimiter '|'
INSERT INTO IndivsToCandidateTotals      SELECT DISTINCT          CYCLE,          MODE() WITHIN GROUP (ORDER BY contrib) AS contrib,          contribid,          recipid,          CAST(SUM(amount) as INTEGER) AS amount      FROM TempIndivsToAny      WHERE contribid IS NOT NULL and TRIM(contribid) != '' and recipid LIKE 'N%'      GROUP BY cycle, contribid, recipid;
INSERT INTO IndivsToCommitteeTotals      SELECT DISTINCT          CYCLE,          MODE() WITHIN GROUP (ORDER BY contrib) AS contrib,          contribid,          recipid,          CAST(SUM(amount) as INTEGER) AS amount      FROM TempIndivsToAny      WHERE contribid IS NOT NULL and TRIM(contribid) != '' and recipid LIKE 'C%'      GROUP BY cycle, contribid, recipid;
DELETE FROM TempIndivsToAny;
\copy Candidates from ../data/sanitized/cands12.sanitized delimiter '|'
\copy Committees from ../data/sanitized/cmtes12.sanitized delimiter '|'
\copy PACsToCandidates from ../data/sanitized/pacs12.sanitized delimiter '|'
\copy PACsToPACs from ../data/sanitized/pac_other12.sanitized delimiter '|'
\copy TempIndivsToAny from ../data/sanitized/indivs12.sanitized delimiter '|'
INSERT INTO IndivsToCandidateTotals      SELECT DISTINCT          CYCLE,          MODE() WITHIN GROUP (ORDER BY contrib) AS contrib,          contribid,          recipid,          CAST(SUM(amount) as INTEGER) AS amount      FROM TempIndivsToAny      WHERE contribid IS NOT NULL and TRIM(contribid) != '' and recipid LIKE 'N%'      GROUP BY cycle, contribid, recipid;
INSERT INTO IndivsToCommitteeTotals      SELECT DISTINCT          CYCLE,          MODE() WITHIN GROUP (ORDER BY contrib) AS contrib,          contribid,          recipid,          CAST(SUM(amount) as INTEGER) AS amount      FROM TempIndivsToAny      WHERE contribid IS NOT NULL and TRIM(contribid) != '' and recipid LIKE 'C%'      GROUP BY cycle, contribid, recipid;
DELETE FROM TempIndivsToAny;
\copy Candidates from ../data/sanitized/cands14.sanitized delimiter '|'
\copy Committees from ../data/sanitized/cmtes14.sanitized delimiter '|'
\copy PACsToCandidates from ../data/sanitized/pacs14.sanitized delimiter '|'
\copy PACsToPACs from ../data/sanitized/pac_other14.sanitized delimiter '|'
\copy TempIndivsToAny from ../data/sanitized/indivs14.sanitized delimiter '|'
INSERT INTO IndivsToCandidateTotals      SELECT DISTINCT          CYCLE,          MODE() WITHIN GROUP (ORDER BY contrib) AS contrib,          contribid,          recipid,          CAST(SUM(amount) as INTEGER) AS amount      FROM TempIndivsToAny      WHERE contribid IS NOT NULL and TRIM(contribid) != '' and recipid LIKE 'N%'      GROUP BY cycle, contribid, recipid;
INSERT INTO IndivsToCommitteeTotals      SELECT DISTINCT          CYCLE,          MODE() WITHIN GROUP (ORDER BY contrib) AS contrib,          contribid,          recipid,          CAST(SUM(amount) as INTEGER) AS amount      FROM TempIndivsToAny      WHERE contribid IS NOT NULL and TRIM(contribid) != '' and recipid LIKE 'C%'      GROUP BY cycle, contribid, recipid;
DELETE FROM TempIndivsToAny;
\copy Candidates from ../data/sanitized/cands16.sanitized delimiter '|'
\copy Committees from ../data/sanitized/cmtes16.sanitized delimiter '|'
\copy PACsToCandidates from ../data/sanitized/pacs16.sanitized delimiter '|'
\copy PACsToPACs from ../data/sanitized/pac_other16.sanitized delimiter '|'
\copy TempIndivsToAny from ../data/sanitized/indivs16.sanitized delimiter '|'
INSERT INTO IndivsToCandidateTotals      SELECT DISTINCT          CYCLE,          MODE() WITHIN GROUP (ORDER BY contrib) AS contrib,          contribid,          recipid,          CAST(SUM(amount) as INTEGER) AS amount      FROM TempIndivsToAny      WHERE contribid IS NOT NULL and TRIM(contribid) != '' and recipid LIKE 'N%'      GROUP BY cycle, contribid, recipid;
INSERT INTO IndivsToCommitteeTotals      SELECT DISTINCT          CYCLE,          MODE() WITHIN GROUP (ORDER BY contrib) AS contrib,          contribid,          recipid,          CAST(SUM(amount) as INTEGER) AS amount      FROM TempIndivsToAny      WHERE contribid IS NOT NULL and TRIM(contribid) != '' and recipid LIKE 'C%'      GROUP BY cycle, contribid, recipid;
DELETE FROM TempIndivsToAny;
DROP TABLE TempIndivsToAny;
CREATE INDEX IndivsToCandidateTotals_cycle_contribid ON IndivsToCandidateTotals    (cycle, contribid);
CREATE INDEX IndivsToCandidateTotals_cycle_recipid ON IndivsToCandidateTotals    (cycle, recipid);
CREATE INDEX IndivsToCandidateTotals_cycle_contribid_amount ON IndivsToCandidateTotals    (cycle, contribid, amount desc);
CREATE INDEX IndivsToCandidateTotals_cycle_recipid_amount ON IndivsToCandidateTotals    (cycle, recipid, amount desc);
CREATE INDEX IndivsToCommitteeTotals_cycle_contribid ON IndivsToCommitteeTotals
    (cycle, contribid);
CREATE INDEX IndivsToCommitteeTotals_cycle_recipid ON IndivsToCommitteeTotals
    (cycle, recipid);
CREATE INDEX IndivsToCommitteeTotals_cycle_contribid_amount ON IndivsToCommitteeTotals
    (cycle, contribid, amount desc);
CREATE INDEX IndivsToCommitteeTotals_cycle_recipid_amount ON IndivsToCommitteeTotals
    (cycle, recipid, amount desc);
ANALYZE Categories;
ANALYZE Candidates;
ANALYZE Committees;
ANALYZE PACsToCandidates;
ANALYZE PACsToPACs;
ANALYZE IndivsToCandidateTotals;
ANALYZE IndivsToCommitteeTotals;
