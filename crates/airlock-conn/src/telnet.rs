use anyhow::Result;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::mpsc;
use tokio::task::JoinHandle;

use crate::ConnOutput;

const IAC: u8 = 255;
const DONT: u8 = 254;
const DO: u8 = 253;
const WONT: u8 = 252;
const WILL: u8 = 251;
const SB: u8 = 250;
const SE: u8 = 240;

#[derive(Clone, Copy)]
enum TelState {
    /// Ordinary telnet data stream.
    Normal,
    /// A literal IAC (0xFF) was seen; the next byte is a command.
    SawIac,
    /// We are inside a sub-negotiation (SB ... SE).
    SubNegotiation,
    /// SawIac was followed by a single option command; wait for the option byte.
    ExpectOption(Option<u8>),
}

struct Parser {
    state: TelState,
    saw_subnegotiation_iac: bool,
}

enum ByteAction {
    Emit(Vec<u8>),
    Respond([u8; 3]),
    None,
}

/// Byte-oriented minimal IAC state machine. Emitted responses only ever refuse options we do
/// not implement (WONT for DO, DONT for WILL), which keeps negotiation inert and the stream
/// usable with mainstream Telnet servers.
fn handle_byte(b: u8, p: &mut Parser) -> ByteAction {
    use TelState::*;
    match p.state {
        Normal => {
            if b == IAC {
                p.state = SawIac;
                ByteAction::None
            } else {
                ByteAction::Emit(vec![b])
            }
        }
        SawIac => match b {
            IAC => {
                p.state = Normal;
                ByteAction::Emit(vec![IAC])
            }
            SB => {
                p.state = SubNegotiation;
                p.saw_subnegotiation_iac = false;
                ByteAction::None
            }
            DONT | WONT => {
                p.state = ExpectOption(None);
                ByteAction::None
            }
            cmd @ (DO | WILL) => {
                p.state = ExpectOption(Some(cmd));
                ByteAction::None
            }
            _ => {
                p.state = Normal;
                ByteAction::None
            }
        },
        SubNegotiation => {
            if p.saw_subnegotiation_iac {
                p.saw_subnegotiation_iac = false;
                if b == SE {
                    p.state = Normal;
                }
                ByteAction::None
            } else if b == IAC {
                p.saw_subnegotiation_iac = true;
                ByteAction::None
            } else {
                ByteAction::None
            }
        }
        ExpectOption(cmd) => {
            p.state = Normal;
            match cmd {
                Some(DO) => ByteAction::Respond([IAC, WONT, b]),
                Some(WILL) => ByteAction::Respond([IAC, DONT, b]),
                _ => ByteAction::None,
            }
        }
    }
}

/// Minimal Telnet client: raw byte pass-through with inert IAC negotiation. Server-side echo
/// is assumed; local echo is out of scope for this increment. On connect/open failure an
/// honest error line is emitted to the session stream and the task exits.
pub(crate) fn spawn(
    host: &str,
    port: u16,
    session_id: String,
    out_tx: mpsc::Sender<ConnOutput>,
) -> Result<(mpsc::Sender<Vec<u8>>, JoinHandle<()>)> {
    let (input_tx, mut input_rx) = mpsc::channel::<Vec<u8>>(64);
    let out = out_tx.clone();
    let host_owned = host.to_string();
    let sid = session_id.clone();

    let task = tokio::spawn(async move {
        let stream = match TcpStream::connect((host_owned.as_str(), port)).await {
            Ok(s) => s,
            Err(e) => {
                let _ = out
                    .send(ConnOutput {
                        session_id: sid,
                        data: format!("\x1b[31m[TELNET connect failed: {e}]\x1b[0m\r\n")
                            .into_bytes(),
                    })
                    .await;
                return;
            }
        };
        let _ = out
            .send(ConnOutput {
                session_id: sid.clone(),
                data: b"\x1b[36m[TELNET connected - minimal IAC negotiation]\x1b[0m\r\n".to_vec(),
            })
            .await;

        let (mut rd, mut wr) = stream.into_split();
        let mut parser = Parser {
            state: TelState::Normal,
            saw_subnegotiation_iac: false,
        };

        loop {
            tokio::select! {
                input = input_rx.recv() => {
                    match input {
                        Some(bytes) => {
                            if wr.write_all(&bytes).await.is_err() {
                                break;
                            }
                            let _ = wr.flush().await;
                        }
                        None => break,
                    }
                }
                r = rd.read_u8() => {
                    match r {
                        Ok(b) => match handle_byte(b, &mut parser) {
                            ByteAction::Emit(app) => {
                                if !app.is_empty()
                                    && out
                                        .send(ConnOutput {
                                            session_id: sid.clone(),
                                            data: app,
                                        })
                                        .await
                                        .is_err()
                                {
                                    break;
                                }
                            }
                            ByteAction::Respond(resp) => {
                                if wr.write_all(&resp).await.is_err() {
                                    break;
                                }
                                let _ = wr.flush().await;
                            }
                            ByteAction::None => {}
                        },
                        Err(_) => break,
                    }
                }
            }
        }
        let _ = wr.shutdown().await;
    });

    Ok((input_tx, task))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn feed(bytes: &[u8]) -> Vec<ByteAction> {
        let mut parser = Parser {
            state: TelState::Normal,
            saw_subnegotiation_iac: false,
        };
        bytes.iter().map(|b| handle_byte(*b, &mut parser)).collect()
    }

    #[test]
    fn test_passthrough_and_escaped_iac() {
        let actions = feed(&[&b"hello"[..], &[IAC, IAC], &b"world"[..]].concat());
        let emitted: Vec<u8> = actions
            .iter()
            .filter_map(|a| match a {
                ByteAction::Emit(v) => Some(v.clone()),
                _ => None,
            })
            .flatten()
            .collect();
        assert_eq!(emitted, b"hello\xffworld".to_vec());
    }

    #[test]
    fn test_refuses_do_and_will() {
        let actions = feed(&[IAC, DO, 0x01, IAC, WILL, 0x18, b'x']);
        let responses: Vec<[u8; 3]> = actions
            .iter()
            .filter_map(|a| match a {
                ByteAction::Respond(r) => Some(*r),
                _ => None,
            })
            .collect();
        assert_eq!(responses, vec![[IAC, WONT, 0x01], [IAC, DONT, 0x18]]);
        // trailing 'x' is app data
        let trailing: Vec<u8> = actions
            .iter()
            .filter_map(|a| match a {
                ByteAction::Emit(v) => Some(v.clone()),
                _ => None,
            })
            .flatten()
            .collect();
        assert_eq!(trailing, b"x".to_vec());
    }

    #[test]
    fn test_skips_subnegotiation() {
        let actions = feed(&[IAC, SB, 1, 2, 3, IAC, SE, b'a']);
        assert!(actions.iter().all(|a| !matches!(a, ByteAction::Respond(_))));
        let emitted: Vec<u8> = actions
            .iter()
            .filter_map(|a| match a {
                ByteAction::Emit(v) => Some(v.clone()),
                _ => None,
            })
            .flatten()
            .collect();
        assert_eq!(emitted, b"a".to_vec());
    }
}
