import Database from 'better-sqlite3';
import path from 'path';

// This creates the learn-ease.db file in the root of your backend
const db = new Database('learn-ease.db', { verbose: console.log });

// Initialize the database structure
export const initDB = () => {
    const schema = `
        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            file_type TEXT NOT NULL,
            extracted_text TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `;
    db.exec(schema);
    console.log("LearnEase SQLite Database Initialized.");
};

export default db;