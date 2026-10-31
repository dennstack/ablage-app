CREATE TABLE documents (
    seq                 INTEGER PRIMARY KEY AUTOINCREMENT,
    id                  TEXT NOT NULL UNIQUE,
    title               TEXT NOT NULL,
    category_id         TEXT NOT NULL DEFAULT 'sonstiges',
    status              TEXT NOT NULL DEFAULT 'pending',
    status_message      TEXT,
    ocr_text            TEXT,
    ocr_source          TEXT,
    relative_path       TEXT NOT NULL,
    file_hash           TEXT NOT NULL,
    original_filename   TEXT NOT NULL,
    mime_type           TEXT NOT NULL,
    doc_date            TEXT,
    sender              TEXT,
    amount              REAL,
    classifier_source   TEXT,
    classifier_response TEXT,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    deleted_at          TEXT
);

CREATE INDEX idx_documents_category ON documents(category_id);
CREATE INDEX idx_documents_hash ON documents(file_hash);
CREATE INDEX idx_documents_created ON documents(created_at);

-- seq is the stable rowid; a TEXT primary key alone would let VACUUM renumber rows.
CREATE VIRTUAL TABLE documents_fts USING fts5(
    title, sender, ocr_text,
    content = 'documents',
    content_rowid = 'seq',
    tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER documents_ai AFTER INSERT ON documents BEGIN
    INSERT INTO documents_fts(rowid, title, sender, ocr_text)
    VALUES (new.seq, new.title, new.sender, new.ocr_text);
END;

CREATE TRIGGER documents_ad AFTER DELETE ON documents BEGIN
    INSERT INTO documents_fts(documents_fts, rowid, title, sender, ocr_text)
    VALUES ('delete', old.seq, old.title, old.sender, old.ocr_text);
END;

CREATE TRIGGER documents_au AFTER UPDATE OF title, sender, ocr_text ON documents BEGIN
    INSERT INTO documents_fts(documents_fts, rowid, title, sender, ocr_text)
    VALUES ('delete', old.seq, old.title, old.sender, old.ocr_text);
    INSERT INTO documents_fts(rowid, title, sender, ocr_text)
    VALUES (new.seq, new.title, new.sender, new.ocr_text);
END;

CREATE TABLE physical_folders (
    code        TEXT NOT NULL PRIMARY KEY,
    label       TEXT NOT NULL,
    location    TEXT,
    created_at  TEXT NOT NULL
);

CREATE TABLE physical_references (
    id          TEXT NOT NULL PRIMARY KEY,
    folder_code TEXT NOT NULL REFERENCES physical_folders(code) ON UPDATE CASCADE,
    doc_id_code TEXT NOT NULL UNIQUE,
    title       TEXT NOT NULL,
    category_id TEXT NOT NULL,
    description TEXT,
    doc_date    TEXT,
    sender      TEXT,
    created_at  TEXT NOT NULL
);

CREATE INDEX idx_references_folder ON physical_references(folder_code);
