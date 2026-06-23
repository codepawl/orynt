use std::path::Path;

use anyhow::Result;
use codepawl_core::Report;
use rusqlite::{params, Connection};

pub struct Store {
    conn: Connection,
}

impl Store {
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(path)?;
        let store = Self { conn };
        store.migrate()?;
        Ok(store)
    }

    pub fn save_report(&self, report: &Report) -> Result<()> {
        let report_json = serde_json::to_string(report)?;
        self.conn.execute(
            "insert into projects (name, path) values (?1, ?2)
             on conflict(path) do update set name = excluded.name",
            params![report.project.name, report.project.path],
        )?;
        self.conn.execute(
            "insert into sessions (id, project_path, source, summary, agent, branch, created_at)
             values (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             on conflict(id) do update set
                project_path = excluded.project_path,
                source = excluded.source,
                summary = excluded.summary,
                agent = excluded.agent,
                branch = excluded.branch,
                created_at = excluded.created_at",
            params![
                report.session.id,
                report.project.path,
                report.session.source,
                report.session.summary,
                report.agent,
                report.branch,
                report.created_at,
            ],
        )?;
        self.conn.execute(
            "insert into reports (id, session_id, project_path, created_at, verdict, summary, report_json)
             values (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             on conflict(id) do update set
                session_id = excluded.session_id,
                project_path = excluded.project_path,
                created_at = excluded.created_at,
                verdict = excluded.verdict,
                summary = excluded.summary,
                report_json = excluded.report_json",
            params![
                report.id,
                report.session.id,
                report.project.path,
                report.created_at,
                report.verdict.as_str(),
                report.summary,
                report_json,
            ],
        )?;
        Ok(())
    }

    pub fn add_project(&self, name: &str, path: &str) -> Result<()> {
        self.conn.execute(
            "insert into projects (name, path) values (?1, ?2)
             on conflict(path) do update set name = excluded.name",
            params![name, path],
        )?;
        Ok(())
    }

    pub fn latest_report(&self) -> Result<Option<Report>> {
        let mut statement = self
            .conn
            .prepare("select report_json from reports order by rowid desc limit 1")?;
        let mut rows = statement.query([])?;
        if let Some(row) = rows.next()? {
            let report_json: String = row.get(0)?;
            let report = serde_json::from_str(&report_json)?;
            Ok(Some(report))
        } else {
            Ok(None)
        }
    }

    pub fn latest_report_for_project(&self, project_path: &str) -> Result<Option<Report>> {
        let mut statement = self.conn.prepare(
            "select report_json from reports where project_path = ?1 order by rowid desc limit 1",
        )?;
        let mut rows = statement.query(params![project_path])?;
        if let Some(row) = rows.next()? {
            let report_json: String = row.get(0)?;
            let report = serde_json::from_str(&report_json)?;
            Ok(Some(report))
        } else {
            Ok(None)
        }
    }

    pub fn list_projects(&self) -> Result<Vec<(String, String)>> {
        let mut statement = self
            .conn
            .prepare("select name, path from projects order by name")?;
        let rows = statement.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
        let mut projects = Vec::new();
        for row in rows {
            projects.push(row?);
        }
        Ok(projects)
    }

    fn migrate(&self) -> Result<()> {
        self.conn.execute_batch(
            "
            pragma journal_mode = wal;
            create table if not exists projects (
                id integer primary key,
                name text not null,
                path text not null unique
            );
            create table if not exists sessions (
                id text primary key,
                project_path text not null,
                source text not null,
                summary text not null,
                agent text not null,
                branch text not null,
                created_at text not null
            );
            create table if not exists reports (
                id text primary key,
                session_id text not null,
                project_path text not null,
                created_at text not null,
                verdict text not null,
                summary text not null,
                report_json text not null
            );
            ",
        )?;
        Ok(())
    }
}
