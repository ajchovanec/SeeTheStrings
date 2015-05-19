DROP TABLE Categories;
DROP TABLE Candidates;
DROP TABLE Committees;
DROP TABLE PACsToCandidates;
DROP TABLE PACsToPACs;
DROP TABLE IndivsToAny;

CREATE TABLE Categories (
    catcode TEXT,
    catname TEXT,
    catorder TEXT,
    industry TEXT,
    sector TEXT,
    sectorlong TEXT);

CREATE TABLE Candidates (
    cycle TEXT,
    feccandid TEXT,
    cid TEXT,
    firstlastp TEXT,
    party TEXT,
    distidrunfor TEXT,
    distidcurr TEXT,
    currcand TEXT,
    cyclecand TEXT,
    crpico TEXT,
    recipcode TEXT,
    nopacs TEXT
);

CREATE TABLE Committees (
    cycle TEXT,
    cmteid TEXT,
    pacshort TEXT,
    affiliate TEXT,
    ultorg TEXT,
    recipid TEXT,
    recipcode TEXT,
    feccandid TEXT,
    party TEXT,
    primcode TEXT,
    source TEXT,
    sensitive TEXT,
    isforeign INTEGER,
    active INTEGER
);
 
CREATE TABLE PACsToCandidates (
    cycle TEXT,
    fecrecno TEXT,
    pacid TEXT,
    cid TEXT,
    amount INTEGER,
    date TEXT,
    realcode TEXT,
    type TEXT,
    directorindirect TEXT,
    feccandid TEXT
);

CREATE TABLE PACsToPACs (
    cycle TEXT,
    fecrecno TEXT,
    filerid TEXT,
    donorcmte TEXT,
    contriblendtrans TEXT,
    city TEXT,
    state TEXT,
    zip TEXT,
    fecoccemp TEXT,
    Primcode TEXT,
    date TEXT,
    amount REAL,
    recipid TEXT,
    party TEXT,
    otherid TEXT,
    recipcode TEXT,
    recipPrimcode TEXT,
    amend TEXT,
    report TEXT,
    primaryorgeneral TEXT,
    microfilm TEXT,
    type TEXT,
    realcode TEXT,
    source TEXT
);

CREATE TABLE IndivsToAny (
    cycle TEXT,
    fectransid TEXT,
    contribid TEXT,
    contrib TEXT,
    recipid TEXT,
    orgname TEXT,
    ultorg TEXT,
    realcode TEXT,
    date TEXT,
    amount INTEGER,
    street TEXT,
    city TEXT,
    state TEXT,
    zip TEXT,
    recipcode TEXT,
    type TEXT,
    cmteid TEXT,
    otherid TEXT,
    gender TEXT,
    microfilm TEXT,
    occupation TEXT,
    employer TEXT,
    source TEXT
);
