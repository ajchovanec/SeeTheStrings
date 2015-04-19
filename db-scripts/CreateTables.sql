DROP TABLE Categories;
DROP TABLE Candidates;
DROP TABLE Committees;
DROP TABLE PACsToCandidates;
DROP TABLE PACsToPACs;
DROP TABLE IndivsToCandidates;

CREATE TABLE Categories (
    "CatCode" TEXT,
    "CatName" TEXT,
    "CatOrder" TEXT,
    "Industry" TEXT,
    "Sector" TEXT,
    "SectorLong" TEXT);

CREATE TABLE Candidates (
    "Cycle" TEXT,
    "FECCandID" TEXT,
    "CID" TEXT,
    "FirstLastP" TEXT,
    "Party" TEXT,
    "DistIDRunFor" TEXT,
    "DistIDCurr" TEXT,
    "CurrCand" TEXT,
    "CycleCand" TEXT,
    "CRPICO" TEXT,
    "RecipCode" TEXT,
    "NoPacs" TEXT
);

CREATE TABLE Committees (
    "Cycle" TEXT,
    "CmteID" TEXT,
    "PACShort" TEXT,
    "Affiliate" TEXT,
    "UltOrg" TEXT,
    "RecipID" TEXT,
    "RecipCode" TEXT,
    "FECCandID" TEXT,
    "Party" TEXT,
    "PrimCode" TEXT,
    "Source" TEXT,
    "Sensitive" TEXT,
    "IsForeign" INTEGER,
    "Active" INTEGER
);
 
CREATE TABLE PACsToCandidates (
    "Cycle" TEXT,
    "FECRecNo" TEXT,
    "PACID" TEXT,
    "CID" TEXT,
    "Amount" REAL,
    "Date" TEXT,
    "RealCode" TEXT,
    "Type" TEXT,
    "DirectOrIndirect" TEXT,
    "FECCandID" TEXT
);

CREATE TABLE PACsToPACs (
    "Cycle" TEXT,
    "FECRecNo" TEXT,
    "FilerID" TEXT,
    "DonorCmte" TEXT,
    "ContribLendTrans" TEXT,
    "City" TEXT,
    "State" TEXT,
    "Zip" TEXT,
    "FECOccEmp" TEXT,
    "PrimCode" TEXT,
    "Date" TEXT,
    "Amount" REAL,
    "RecipID" TEXT,
    "Party" TEXT,
    "OtherID" TEXT,
    "RecipCode" TEXT,
    "RecipPrimCode" TEXT,
    "Amend" TEXT,
    "Report" TEXT,
    "PrimaryOrGeneral" TEXT,
    "Microflim" TEXT,
    "Type" TEXT,
    "RealCode" TEXT,
    "Source" TEXT
);

CREATE TABLE IndivsToCandidates (
    "Cycle" TEXT,
    "FECTransID" TEXT,
    "ContribID" TEXT,
    "Contrib" TEXT,
    "RecipID" TEXT,
    "OrgName" TEXT,
    "UltOrg" TEXT,
    "REALCode" TEXT,
    "Date" TEXT,
    "Amount" INTEGER,
    "Street" TEXT,
    "City" TEXT,
    "State" TEXT,
    "Zip" TEXT,
    "RecipCode" TEXT,
    "Type" TEXT,
    "CmteID" TEXT,
    "OtherID" TEXT,
    "Gender" TEXT,
    "Microfilm" TEXT,
    "Occupation" TEXT,
    "Employer" TEXT,
    "Source" TEXT
);
