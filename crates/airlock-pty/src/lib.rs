use anyhow::{anyhow, Result};
use portable_pty::{CommandBuilder, MasterPty, NativePtySystem, PtySize, PtySystem};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use tokio::sync::mpsc;
use uuid::Uuid;

pub const MAX_CONCURRENT_PTY_SESSIONS: usize = 5;
pub const MAX_INPUT_CHUNK_SIZE: usize = 4096;
pub const MAX_RING_BUFFER_SIZE: usize = 65536; // 64KB

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PtyOutput {
    pub session_id: String,
    pub data: Vec<u8>,
}

struct PtySession {
    master_pty: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
    buffer: Arc<Mutex<Vec<u8>>>,
}

#[derive(Clone)]
pub struct PtyManager {
    sessions: Arc<Mutex<HashMap<String, PtySession>>>,
    output_tx: mpsc::Sender<PtyOutput>,
}

impl PtyManager {
    pub fn new(output_tx: mpsc::Sender<PtyOutput>) -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            output_tx,
        }
    }

    pub fn create_session(&self) -> Result<String> {
        let mut sessions = self.sessions.lock().unwrap();
        if sessions.len() >= MAX_CONCURRENT_PTY_SESSIONS {
            return Err(anyhow!(
                "PTY_LIMIT_REACHED: Maximum of {} concurrent sessions allowed",
                MAX_CONCURRENT_PTY_SESSIONS
            ));
        }

        let pty_system = NativePtySystem::default();
        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| anyhow!("PTY_SPAWN_FAILED: {}", e))?;

        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
        let cmd = CommandBuilder::new(shell);

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| anyhow!("PTY_SPAWN_FAILED: {}", e))?;

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| anyhow!("PTY_SPAWN_FAILED: {}", e))?;
        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| anyhow!("PTY_SPAWN_FAILED: {}", e))?;

        let session_id = Uuid::new_v4().to_string();
        let buffer = Arc::new(Mutex::new(Vec::new()));

        let session = PtySession {
            master_pty: pair.master,
            writer,
            child,
            buffer: buffer.clone(),
        };

        sessions.insert(session_id.clone(), session);

        let tx = self.output_tx.clone();
        let sid = session_id.clone();
        let session_map = self.sessions.clone();
        let buf_clone = buffer.clone();

        thread::spawn(move || {
            let mut buf = [0u8; 1024];
            loop {
                match reader.read(&mut buf) {
                    Ok(n) if n > 0 => {
                        let chunk = buf[..n].to_vec();
                        if let Ok(mut b) = buf_clone.lock() {
                            // Ring buffer capped at 64KB
                            let cur_len = b.len();
                            let drain_amount =
                                (cur_len + chunk.len()).saturating_sub(MAX_RING_BUFFER_SIZE);
                            if drain_amount > 0 {
                                b.drain(0..drain_amount.min(cur_len));
                            }
                            b.extend_from_slice(&chunk);
                        }
                        if tx
                            .blocking_send(PtyOutput {
                                session_id: sid.clone(),
                                data: chunk,
                            })
                            .is_err()
                        {
                            break; // channel closed
                        }
                    }
                    _ => break, // EOF or error
                }
            }

            // Cleanup on exit
            if let Ok(mut map) = session_map.lock() {
                if let Some(mut session) = map.remove(&sid) {
                    let _ = session.child.kill();
                    let _ = session.child.wait();
                }
            }
        });

        Ok(session_id)
    }

    pub fn write_input(&self, session_id: &str, data: &[u8]) -> Result<()> {
        if data.len() > MAX_INPUT_CHUNK_SIZE {
            return Err(anyhow!(
                "INPUT_TOO_LARGE: Maximum input chunk is {} bytes",
                MAX_INPUT_CHUNK_SIZE
            ));
        }
        let mut sessions = self.sessions.lock().unwrap();
        if let Some(session) = sessions.get_mut(session_id) {
            session
                .writer
                .write_all(data)
                .map_err(|e| anyhow!("PTY_WRITE_FAILED: {}", e))?;
            session
                .writer
                .flush()
                .map_err(|e| anyhow!("PTY_WRITE_FAILED: {}", e))?;
            Ok(())
        } else {
            Err(anyhow!("INVALID_SESSION: Session ID not found"))
        }
    }

    pub fn read_output(&self, session_id: &str) -> Result<Vec<u8>> {
        let sessions = self.sessions.lock().unwrap();
        if let Some(session) = sessions.get(session_id) {
            let mut b = session.buffer.lock().unwrap();
            let data = b.clone();
            b.clear();
            Ok(data)
        } else {
            Err(anyhow!("INVALID_SESSION: Session ID not found"))
        }
    }

    pub fn list_sessions(&self) -> Vec<String> {
        let sessions = self.sessions.lock().unwrap();
        sessions.keys().cloned().collect()
    }

    pub fn resize(&self, session_id: &str, rows: u16, cols: u16) -> Result<()> {
        if !(10..=500).contains(&rows) || !(10..=500).contains(&cols) {
            return Err(anyhow!(
                "INVALID_DIMENSIONS: Dimensions must be between 10 and 500"
            ));
        }
        let sessions = self.sessions.lock().unwrap();
        if let Some(session) = sessions.get(session_id) {
            session
                .master_pty
                .resize(PtySize {
                    rows,
                    cols,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|e| anyhow!("PTY_RESIZE_FAILED: {}", e))?;
            Ok(())
        } else {
            Err(anyhow!("INVALID_SESSION: Session ID not found"))
        }
    }

    pub fn close_session(&self, session_id: &str) -> Result<()> {
        let mut sessions = self.sessions.lock().unwrap();
        if let Some(mut session) = sessions.remove(session_id) {
            let _ = session.child.kill();
            let _ = session.child.wait();
            Ok(())
        } else {
            Err(anyhow!("INVALID_SESSION: Session ID not found"))
        }
    }

    pub fn shutdown_all(&self) {
        let mut sessions = self.sessions.lock().unwrap();
        for (_, mut session) in sessions.drain() {
            let _ = session.child.kill();
            let _ = session.child.wait();
        }
    }
}

impl Drop for PtyManager {
    fn drop(&mut self) {
        self.shutdown_all();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pty_lifecycle_and_limits() {
        let (tx, _rx) = mpsc::channel(100);
        let pty_mgr = PtyManager::new(tx);

        let sid1 = pty_mgr.create_session().unwrap();

        // Test list_sessions
        let active = pty_mgr.list_sessions();
        assert!(active.contains(&sid1));
        assert_eq!(active.len(), 1);

        // Test write limits
        let oversized = vec![b'a'; 5000];
        let result = pty_mgr.write_input(&sid1, &oversized);
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err().to_string(),
            "INPUT_TOO_LARGE: Maximum input chunk is 4096 bytes"
        );

        // Test normal write
        let normal = b"echo 'hello'\n";
        assert!(pty_mgr.write_input(&sid1, normal).is_ok());

        // Test read output
        std::thread::sleep(std::time::Duration::from_millis(150));
        let read_res = pty_mgr.read_output(&sid1);
        assert!(read_res.is_ok());

        // Test resize limits
        let result = pty_mgr.resize(&sid1, 5, 80);
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err().to_string(),
            "INVALID_DIMENSIONS: Dimensions must be between 10 and 500"
        );

        // Test normal resize
        assert!(pty_mgr.resize(&sid1, 30, 100).is_ok());

        // Test concurrent session limits
        let _sid2 = pty_mgr.create_session().unwrap();
        let _sid3 = pty_mgr.create_session().unwrap();
        let _sid4 = pty_mgr.create_session().unwrap();
        let _sid5 = pty_mgr.create_session().unwrap();

        let result = pty_mgr.create_session();
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err().to_string(),
            "PTY_LIMIT_REACHED: Maximum of 5 concurrent sessions allowed"
        );

        // Test close
        assert!(pty_mgr.close_session(&sid1).is_ok());
        assert!(pty_mgr.close_session(&sid1).is_err()); // Duplicate close

        // Test write to closed session rejected
        let post_close_write = pty_mgr.write_input(&sid1, b"echo 'closed'\n");
        assert!(post_close_write.is_err());
        assert_eq!(
            post_close_write.unwrap_err().to_string(),
            "INVALID_SESSION: Session ID not found"
        );

        pty_mgr.shutdown_all();
    }
}
