//! Ollama lifecycle: probe install + reachability, and (when Airlock started it) stop it. Airlock
//! tells the truth about what it can and cannot manage: an Ollama process it did NOT start is left
//! alone and reported as `managed: false`.

use anyhow::{anyhow, Result};
use std::io::{BufRead, BufReader};
use std::process::{Child, ChildStderr, Command, Stdio};
use std::sync::{Mutex, OnceLock};

fn shared_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(3))
            .build()
            .expect("failed to build reqwest client")
    })
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct OllamaStatus {
    pub installed: bool,
    pub running: bool,
    pub managed: bool,
    pub version: Option<String>,
    pub detail: String,
}

/// Lifecycle controller for a local Ollama server.
pub struct OllamaController {
    url: String,
    managed: Mutex<Option<Child>>,
    ready: Mutex<Option<ChildStderr>>,
}

impl OllamaController {
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            url: base_url.into(),
            managed: Mutex::new(None),
            ready: Mutex::new(None),
        }
    }

    pub fn base_url(&self) -> &str {
        &self.url
    }

    /// True when the `ollama` binary is resolvable on PATH.
    fn is_installed() -> bool {
        Command::new("ollama")
            .arg("--version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok()
    }

    /// Live status: reachability via `GET /api/version`, plus whether this controller started it.
    pub async fn status(&self) -> OllamaStatus {
        let installed = Self::is_installed();
        let version = match self.fetch_version().await {
            Ok(v) => Some(v),
            Err(e) => {
                let detail = format!("{} ({})", e, self.url);
                return OllamaStatus {
                    installed,
                    running: false,
                    managed: self.managed.lock().unwrap().is_some(),
                    version: None,
                    detail,
                };
            }
        };
        let running = version.is_some();
        let managed = self.managed.lock().unwrap().is_some();
        let detail = if running {
            format!(
                "Ollama reachable at {} (v{})",
                self.url,
                version.as_deref().unwrap_or("?")
            )
        } else if installed {
            "Ollama installed but not reachable".to_string()
        } else {
            "Ollama binary not found on PATH".to_string()
        };
        OllamaStatus {
            installed,
            running,
            managed,
            version,
            detail,
        }
    }

    async fn fetch_version(&self) -> Result<String> {
        let client = shared_client();
        let resp = client
            .get(format!("{}/api/version", self.url))
            .send()
            .await
            .map_err(|e| anyhow!("OLLAMA_UNREACHABLE: {e}"))?;
        if !resp.status().is_success() {
            return Err(anyhow!(
                "OLLAMA_ERROR_STATUS: HTTP {}",
                resp.status().as_u16()
            ));
        }
        let json: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| anyhow!("OLLAMA_BAD_RESPONSE: {e}"))?;
        let version = json
            .get("version")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("OLLAMA_BAD_RESPONSE: no 'version' field"))?
            .to_string();
        if version.trim().is_empty() {
            return Err(anyhow!("OLLAMA_BAD_RESPONSE: empty 'version' field"));
        }
        Ok(version)
    }

    /// Start a local `ollama serve`. Returns the live status after launch.
    pub async fn start(&self) -> Result<OllamaStatus> {
        let already_managed = { self.managed.lock().unwrap().is_some() };
        if already_managed {
            return Ok(self.status().await);
        }
        if !Self::is_installed() {
            return Err(anyhow!(
                "OLLAMA_NOT_INSTALLED: 'ollama' binary not found on PATH; install it or point Airlock at a remote host"
            ));
        }
        let mut child = Command::new("ollama")
            .arg("serve")
            .env("OLLAMA_HOST", &self.url)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| anyhow!("OLLAMA_SPAWN_FAILED: {e}"))?;
        // wait for the process to stay alive and answer /api/version
        let logs = child
            .stderr
            .take()
            .ok_or_else(|| anyhow!("OLLAMA_SPAWN_FAILED: no stderr pipe"))?;
        *self.ready.lock().unwrap() = Some(logs);
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(15);
        let mut last_err = String::from("timed out waiting for Ollama to answer /api/version");
        while std::time::Instant::now() < deadline {
            match self.fetch_version().await {
                Ok(_) => {
                    *self.managed.lock().unwrap() = Some(child);
                    return Ok(self.status().await);
                }
                Err(e) => last_err = e.to_string(),
            }
            tokio::time::sleep(std::time::Duration::from_millis(300)).await;
            if let Some(_st) = child.try_wait().ok().flatten() {
                let logs = self
                    .ready
                    .lock()
                    .unwrap()
                    .take()
                    .map(collect_logs)
                    .unwrap_or_default();
                let tail = logs.lines().rev().take(5).collect::<Vec<_>>().join(" | ");
                return Err(anyhow!(
                    "OLLAMA_DIED_ON_START: ollama serve exited; last error: {last_err}; stderr tail: {tail}"
                ));
            }
        }
        let _ = child.kill();
        Err(anyhow!("OLLAMA_START_TIMEOUT: {last_err}"))
    }

    /// Stop only an Ollama process this controller started. External servers are left running and
    /// an honest error explains why.
    pub async fn stop(&self) -> Result<OllamaStatus> {
        let owned_child = self.managed.lock().unwrap().take();
        match owned_child {
            Some(mut child) => {
                child
                    .kill()
                    .map_err(|e| anyhow!("OLLAMA_STOP_FAILED: {e}"))?;
                let _ = child.wait();
            }
            None => {
                let st = self.status().await;
                if st.running {
                    return Err(anyhow!(
                        "OLLAMA_NOT_MANAGED: Ollama is running but was NOT started by Airlock; stop it yourself (or configure Airlock as its manager). Current status: {}",
                        st.detail
                    ));
                }
            }
        }
        Ok(self.status().await)
    }
}

fn collect_logs(logs: ChildStderr) -> String {
    let mut out = String::new();
    let mut lines = BufReader::new(logs).lines();
    while let Some(Ok(l)) = lines.next() {
        out.push_str(&l);
        out.push('\n');
    }
    out
}

/// Disconnect the controller's handle to any child it started (used when the app drops it).
impl Drop for OllamaController {
    fn drop(&mut self) {
        if let Some(mut child) = self.managed.lock().unwrap().take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt as _, AsyncWriteExt as _};

    /// A tokio-native minimal HTTP stub so tests never depend on the state of the host's network.
    /// The accept-loop task is aborted on `Drop` so the test runtime always shuts down cleanly.
    struct HttpStub {
        url: String,
        task: tokio::task::JoinHandle<()>,
    }

    impl Drop for HttpStub {
        fn drop(&mut self) {
            self.task.abort();
        }
    }

    async fn spawn_json_server(body: &'static str) -> HttpStub {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let task = tokio::spawn(async move {
            loop {
                let Ok((sock, _)) = listener.accept().await else {
                    continue;
                };
                tokio::spawn(handle_http(sock, body));
            }
        });
        HttpStub {
            url: format!("http://{addr}"),
            task,
        }
    }

    async fn handle_http(mut sock: tokio::net::TcpStream, body: &'static str) {
        let mut buf = [0u8; 8192];
        let _ = (&mut sock).read(&mut buf).await;
        let resp = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        );
        let _ = (&mut sock).write_all(resp.as_bytes()).await;
    }

    #[tokio::test]
    async fn status_reports_good_version_from_listening_server() {
        let stub = spawn_json_server(r#"{"version":"0.5.1"}"#).await;
        let ctrl = OllamaController::new(stub.url.clone());
        let st = ctrl.status().await;
        assert!(st.running, "{}", st.detail);
        assert_eq!(st.version.as_deref(), Some("0.5.1"));
        assert!(!st.managed);
    }

    #[tokio::test]
    async fn status_is_honest_when_unreachable() {
        let ctrl = OllamaController::new("http://127.0.0.1:1");
        let st = ctrl.status().await;
        assert!(
            !st.running,
            "must never claim running on an unreachable host"
        );
        assert!(st.detail.contains("OLLAMA_UNREACHABLE"), "{}", st.detail);
        assert!(st.version.is_none());
    }

    #[tokio::test]
    async fn stop_of_unmanaged_running_server_refuses_honestly() {
        let stub = spawn_json_server(r#"{"version":"0.5.1"}"#).await;
        let ctrl = OllamaController::new(stub.url.clone());
        let st = ctrl.status().await;
        assert!(st.running, "first status failed: {}", st.detail);
        let res = ctrl.stop().await;
        assert!(res.is_err(), "must not kill a server it did not start");
        let msg = res.unwrap_err().to_string();
        assert!(msg.contains("OLLAMA_NOT_MANAGED"), "{msg}");
        // and the server still answers
        let st2 = ctrl.status().await;
        assert!(st2.running);
    }

    #[tokio::test]
    async fn start_without_ollama_binary_errors_honestly() {
        // In CI/our hosts `ollama` is absent; if present, skip so we never spawn a real server.
        if OllamaController::is_installed() {
            eprintln!("skipping: ollama binary present on this host");
            return;
        }
        let ctrl = OllamaController::new("http://127.0.0.1:1");
        let res = ctrl.start().await;
        assert!(res.is_err());
        assert!(res
            .unwrap_err()
            .to_string()
            .contains("OLLAMA_NOT_INSTALLED"));
    }
}
