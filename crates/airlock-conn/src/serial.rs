use anyhow::Result;
use std::io::ErrorKind;
use std::sync::mpsc::{sync_channel, Receiver, SyncSender};
use std::time::Duration;

use tokio::task::JoinHandle;

use crate::ConnOutput;

const READ_BUF_SIZE: usize = 4096;
const DEFAULT_TIMEOUT_MS: u64 = 100;

/// Serial connection session via `serialport`. Runs on a dedicated blocking task so the
/// reactor thread never blocks on the device. On open failure an `Err` is returned before any
/// session task is spawned — an honest, immediate failure.
pub(crate) fn spawn(
    device: &str,
    baud_rate: u32,
    session_id: String,
    out_tx: tokio::sync::mpsc::Sender<ConnOutput>,
) -> Result<(SyncSender<Vec<u8>>, JoinHandle<()>)> {
    let port = serialport::new(device, baud_rate)
        .timeout(Duration::from_millis(DEFAULT_TIMEOUT_MS))
        .open()
        .map_err(|e| anyhow::anyhow!("SERIAL_OPEN_FAILED on {device}: {e}"))?;

    let (input_tx, input_rx): (SyncSender<Vec<u8>>, Receiver<Vec<u8>>) = sync_channel(64);
    let out = out_tx.clone();
    let sid = session_id.clone();
    let device_owned = device.to_string();

    let task = tokio::task::spawn_blocking(move || {
        let mut port = port;
        let mut buf = [0u8; READ_BUF_SIZE];
        let _ = out.blocking_send(ConnOutput {
            session_id: sid.clone(),
            data: format!(
                "\x1b[36m[SERIAL connected on {} @ {baud_rate} baud]\x1b[0m\r\n",
                device_owned
            )
            .into_bytes(),
        });
        loop {
            match input_rx.try_recv() {
                Ok(bytes) => {
                    if port.write_all(&bytes).is_err() {
                        break;
                    }
                    let _ = port.flush();
                }
                Err(std::sync::mpsc::TryRecvError::Empty) => {}
                Err(std::sync::mpsc::TryRecvError::Disconnected) => break,
            }
            match port.read(&mut buf) {
                Ok(n) if n > 0 => {
                    if out
                        .blocking_send(ConnOutput {
                            session_id: sid.clone(),
                            data: buf[..n].to_vec(),
                        })
                        .is_err()
                    {
                        break;
                    }
                }
                Ok(_) => {}
                Err(e) if e.kind() == ErrorKind::TimedOut || e.kind() == ErrorKind::WouldBlock => {}
                Err(e) => {
                    let _ = out.blocking_send(ConnOutput {
                        session_id: sid.clone(),
                        data: format!("\x1b[31m[SERIAL read error: {e}]\x1b[0m\r\n").into_bytes(),
                    });
                    break;
                }
            }
        }
        // Drop port closes the device.
    });

    Ok((input_tx, task))
}
