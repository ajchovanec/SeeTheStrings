-- This SQL script populates the PostgreSQL database that it's run on with all tables pertaining to
-- campaign finance. Prior to running this script, you should initialize your database and
-- associated role in psql as follows:
-- 
-- DROP DATABASE IF EXISTS [database];
-- CREATE DATABASE seethestrings_local;
-- DROP USER IF EXISTS [user];
-- CREATE USER [user] WITH PASSWORD '[password]';
-- GRANT ALL PRIVILEGES ON DATABASE [database] TO [user];
--
-- This script should then be invoked via the following command:
--
-- psql -d [database] -U [user] -f CreateTables.sql

DROP TABLE IF EXISTS Categories;
DROP TABLE IF EXISTS Candidates;
DROP TABLE IF EXISTS Committees;
DROP TABLE IF EXISTS PACsToCandidates;
DROP TABLE IF EXISTS PACsToPACs;
DROP TABLE IF EXISTS IndivsToCandidateTotals;

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

CREATE TABLE IndivsToCandidateTotals (
    cycle TEXT,
    contrib TEXT,
    contribid TEXT,
    recipid TEXT,
    amount INTEGER
);
