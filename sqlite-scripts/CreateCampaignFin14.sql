.separator "\t"

CREATE TABLE Categories (
    CatCode TEXT,
    CatName TEXT,
    CatOrder TEXT,
    Industry TEXT,
    Sector TEXT,
    SectorLong TEXT);
.import CRP_Categories.txt Categories

.separator |

CREATE TABLE Candidates (
    Cycle TEXT,
    FECCandID TEXT,
    CID TEXT,
    FirstLastP TEXT,
    Party TEXT,
    DistIDRunFor TEXT,
    DistIDCurr TEXT,
    CurrCand TEXT,
    CycleCand TEXT,
    CRPICO TEXT,
    RecipCode TEXT,
    NoPacs TEXT
);
.import cands14.sanitized Candidates

CREATE TABLE Committees (
    Cycle TEXT,
    CmteID TEXT,
    PACShort TEXT,
    Affiliate TEXT,
    UltOrg TEXT,
    RecipID TEXT,
    RecipCode TEXT,
    FECCandID TEXT,
    Party TEXT,
    PrimCode TEXT,
    Source TEXT,
    Sensitive TEXT,
    IsForeign INTEGER,
    Active INTEGER
);
.import cmtes14.sanitized Committees
 
CREATE TABLE PACsToCandidates (
    Cycle TEXT,
    FECRecNo TEXT,
    PACID TEXT,
    CID TEXT,
    Amount REAL,
    Date TEXT,
    RealCode TEXT,
    Type TEXT,
    DirectOrIndirect TEXT,
    FECCandID TEXT
);
.import pacs14.sanitized PACsToCandidates

CREATE TABLE PACsToPACs (
    Cycle TEXT,
    FECRecNo TEXT,
    FilerID TEXT,
    DonorCmte TEXT,
    ContribLendTrans TEXT,
    City TEXT,
    State TEXT,
    Zip TEXT,
    FECOccEmp TEXT,
    PrimCode TEXT,
    Date TEXT,
    Amount REAL,
    RecipID TEXT,
    Party TEXT,
    OtherID TEXT,
    RecipCode TEXT,
    RecipPrimCode TEXT,
    Amend TEXT,
    Report TEXT,
    PrimaryOrGeneral TEXT,
    Microflim TEXT,
    Type TEXT,
    RealCode TEXT,
    Source TEXT
);
.import pac_other14.sanitized PACsToPACs

CREATE TABLE IndivsToCandidates (
    Cycle TEXT,
    FECTransID TEXT,
    ContribID TEXT,
    Contrib TEXT,
    RecipID TEXT,
    OrgName TEXT,
    UltOrg TEXT,
    RealCode TEXT,
    Date TEXT,
    Amount INTEGER,
    Street TEXT,
    City TEXT,
    State TEXT,
    Zip TEXT,
    RecipCode TEXT,
    Type TEXT,
    CmteID TEXT,
    OtherID TEXT,
    Gender TEXT,
    Microfilm TEXT,
    Occupation TEXT,
    Employer TEXT,
    Source TEXT
);
.import indivs14.sanitized IndivsToCandidates

