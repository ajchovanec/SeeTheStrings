\copy Categories from db-scripts/pg-scripts/CRP_Categories.txt delimiter E'\t'
\copy Candidates from db-scripts/pg-scripts/cands14.sanitized delimiter '|'
\copy Committees from db-scripts/pg-scripts/cmtes14.sanitized delimiter '|'
\copy PACsToCandidates from db-scripts/pg-scripts/pacs14.sanitized delimiter '|'
\copy PACsToPACs from db-scripts/pg-scripts/pac_other14.sanitized delimiter '|'
\copy IndivsToAny from db-scripts/pg-scripts/indivs14.sanitized delimiter '|'