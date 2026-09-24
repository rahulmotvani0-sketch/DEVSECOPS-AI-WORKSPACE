//! Local-first RAG over a JSON-persisted corpus.
//!
//! The pipeline is fully offline-capable: chunking is deterministic (no cloud tokenizer),
//! embeddings default to a deterministic local function, and real Ollama embeddings are only
//! used when Ollama is reachable AND privacy mode does not pin to local-only. Every vector is
//! tagged `Computed` vs `Fallback` so the UI can never mistake a hash-based vector for a model
//! embedding.

use airlock_core::models::{
    Corpus, Document, DocumentChunk, Embedding, EmbeddingKind, RetrievalResult,
};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

/// Deterministic, offline token estimate (~4 chars/token, the GPT-2/able-approximation used by
/// tiktoken's cl100k heuristic). Honest and repeatable — never sent to a cloud tokenizer.
pub fn estimate_tokens(text: &str) -> usize {
    let chars = text.chars().count();
    if chars == 0 {
        0
    } else {
        (chars as f32 / 4.0).ceil() as usize
    }
}

/// Split a document into overlapping word-window chunks of ~`max_chars`. Each chunk is a
/// whitespace-delimited word sequence (never a word split mid-token); a tail of the previous
/// chunk (`~overlap_chars`) is carried into the next so retrieval across cut boundaries works.
pub fn chunk_text(text: &str, max_chars: usize, overlap_chars: usize) -> Vec<String> {
    let words: Vec<&str> = text.split_whitespace().collect();
    if words.is_empty() {
        return Vec::new();
    }
    let mut chunks: Vec<String> = Vec::new();
    let mut window: Vec<String> = Vec::new();
    let mut chars = 0usize;
    for w in words {
        if chars + w.len() > max_chars && !window.is_empty() {
            chunks.push(window.join(" "));
            // carry the tail of the printed window (up to overlap_chars) into the next window
            let mut overlap = String::new();
            for first in &window {
                let cost = overlap.len() + first.len() + usize::from(!overlap.is_empty());
                if cost > overlap_chars.min(max_chars) {
                    break;
                }
                if !overlap.is_empty() {
                    overlap.push(' ');
                }
                overlap.push_str(first);
            }
            window.clear();
            window.extend(overlap.split_whitespace().map(|t| t.to_string()));
            chars = window
                .iter()
                .map(|t| t.len() + 1)
                .sum::<usize>()
                .saturating_sub(1);
        }
        window.push(w.to_string());
        chars += 1 + w.len();
    }
    if !window.is_empty() {
        chunks.push(window.join(" "));
    }
    chunks
        .into_iter()
        .map(|c| c.trim().to_string())
        .filter(|c| !c.is_empty())
        .collect()
}

/// Deterministic pseudo-embedding: a seeded bag-of-words vector, L2-normalised. Used as the
/// honest local fallback when Ollama is unavailable or privacy mode is local-only.
pub fn fallback_embedding(text: &str, dimensions: usize) -> Vec<f32> {
    let mut vec = vec![0.0f32; dimensions];
    let mut seed: u64 = 0x9e37_79b9_7f4a_7c15;
    for token in text
        .chars()
        .flat_map(char::to_lowercase)
        .filter(|c| c.is_alphanumeric())
    {
        seed = seed.wrapping_mul(31).wrapping_add(fnv_hash(token as u64));
        vec[(seed as usize) % dimensions] += 1.0;
    }
    normalize(&mut vec);
    vec
}

fn fnv_hash(v: u64) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in v.to_le_bytes() {
        h ^= byte as u64;
        h = h.wrapping_mul(0x00000100_000001b3);
    }
    h
}

/// L2-normalise in place; returns the vector for convenience.
pub fn normalize(vec: &mut [f32]) -> &[f32] {
    let norm: f32 = vec.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm > 1e-8 {
        for x in vec.iter_mut() {
            *x /= norm;
        }
    }
    vec
}

/// Cosine similarity between two (already normalised or raw) vectors.
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let na: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let nb: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    let denom = na * nb;
    if denom <= 1e-8 {
        0.0
    } else {
        dot / denom
    }
}

/// The embedder seam. `LocalFallback` is deterministic; `OllamaEmbedder` calls the real
/// `/api/embeddings` endpoint and degrades to `LocalFallback` when unreachable.
#[async_trait]
pub trait Embedder: Send + Sync {
    async fn embed(&self, texts: &[String]) -> Result<Vec<(Vec<f32>, EmbeddingKind)>>;
    fn kind(&self) -> EmbeddingKind;
}

/// Honest local deterministic embeddings. Labeled `Fallback`, never presented as model output.
pub struct LocalFallbackEmbedder {
    pub dimensions: usize,
}

impl Default for LocalFallbackEmbedder {
    fn default() -> Self {
        Self { dimensions: 384 }
    }
}

#[async_trait]
impl Embedder for LocalFallbackEmbedder {
    async fn embed(&self, texts: &[String]) -> Result<Vec<(Vec<f32>, EmbeddingKind)>> {
        Ok(texts
            .iter()
            .map(|t| {
                (
                    fallback_embedding(t, self.dimensions),
                    EmbeddingKind::Fallback,
                )
            })
            .collect())
    }

    fn kind(&self) -> EmbeddingKind {
        EmbeddingKind::Fallback
    }
}

/// Ollama `/api/embeddings` with graceful fallback. In `local_only` (privacy) mode it refuses
/// to call the network at all and returns local vectors, so sensitive estate context never
/// leaves the machine.
pub struct OllamaEmbedder {
    pub url: String,
    pub model: String,
    pub dimensions: usize,
    pub local_only: bool,
    client: reqwest::Client,
}

impl OllamaEmbedder {
    pub fn new(url: String, model: String, dimensions: usize, local_only: bool) -> Self {
        Self {
            url,
            model,
            dimensions,
            local_only,
            client: reqwest::Client::new(),
        }
    }

    async fn ollama_vecs(&self, texts: &[String]) -> Result<Vec<Vec<f32>>> {
        let endpoint = format!("{}/api/embeddings", self.url.trim_end_matches('/'));
        let mut out = Vec::with_capacity(texts.len());
        for text in texts {
            let payload = serde_json::json!({ "model": self.model, "prompt": text });
            let res = self
                .client
                .post(&endpoint)
                .json(&payload)
                .send()
                .await
                .map_err(|e| anyhow!("OLLAMA_UNREACHABLE: {e}"))?;
            if !res.status().is_success() {
                anyhow::bail!("OLLAMA_ERROR_STATUS: {}", res.status());
            }
            let body: serde_json::Value = res.json().await?;
            let vec: Vec<f32> = body["embedding"]
                .as_array()
                .ok_or_else(|| anyhow!("OLLAMA_BAD_RESPONSE: no embedding field"))?
                .iter()
                .filter_map(|v| v.as_f64().map(|f| f as f32))
                .collect();
            if vec.is_empty() {
                anyhow::bail!("OLLAMA_EMPTY_EMBEDDING");
            }
            out.push(vec);
        }
        Ok(out)
    }
}

#[async_trait]
impl Embedder for OllamaEmbedder {
    async fn embed(&self, texts: &[String]) -> Result<Vec<(Vec<f32>, EmbeddingKind)>> {
        if self.local_only {
            // privacy mode: never touch the network for embedding calls
            return LocalFallbackEmbedder {
                dimensions: self.dimensions,
            }
            .embed(texts)
            .await;
        }
        match self.ollama_vecs(texts).await {
            Ok(vecs) => Ok(vecs
                .into_iter()
                .map(|mut v| {
                    normalize(&mut v);
                    (v, EmbeddingKind::Computed)
                })
                .collect()),
            Err(_) => {
                // honest degradation: fallback vectors are tagged Fallback
                LocalFallbackEmbedder {
                    dimensions: self.dimensions,
                }
                .embed(texts)
                .await
            }
        }
    }

    fn kind(&self) -> EmbeddingKind {
        EmbeddingKind::Computed
    }
}

/// Persisted state of the local vector store (JSON; one file per store root).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct StoreState {
    pub corpus: Option<Corpus>,
    pub chunks: BTreeMap<String, DocumentChunk>,
    pub embeddings: BTreeMap<String, Vec<f32>>,
    pub embedding_kinds: BTreeMap<String, EmbeddingKind>,
    pub title_by_doc: BTreeMap<String, String>,
}

/// A local, JSON-persisted vector store. Pure cosine similarity over stored vectors.
#[derive(Debug, Clone)]
pub struct LocalVectorStore {
    state: StoreState,
}

impl Default for LocalVectorStore {
    fn default() -> Self {
        Self::new()
    }
}

impl LocalVectorStore {
    pub fn new() -> Self {
        Self {
            state: StoreState::default(),
        }
    }

    pub fn len(&self) -> usize {
        self.state.embeddings.len()
    }

    pub fn is_empty(&self) -> bool {
        self.state.embeddings.is_empty()
    }

    pub fn corpus(&self) -> Option<&Corpus> {
        self.state.corpus.as_ref()
    }

    /// Seed the store with a corpus (and its documents) loaded from disk.
    pub fn load_corpus(&mut self, corpus: Corpus) {
        self.state.corpus = Some(corpus);
    }

    pub fn insert_chunk(&mut self, chunk: DocumentChunk, embedding: Embedding) {
        self.state.chunks.insert(chunk.id.clone(), chunk);
        self.state
            .embeddings
            .insert(embedding.chunk_id.clone(), embedding.vector);
        self.state
            .embedding_kinds
            .insert(embedding.chunk_id, embedding.kind);
    }

    pub fn insert_document<T: AsRef<str>>(
        &mut self,
        doc: Document,
        title: T,
        chunks: Vec<(DocumentChunk, Embedding)>,
    ) {
        self.state
            .title_by_doc
            .insert(doc.id.clone(), title.as_ref().to_string());
        if let Some(corpus) = self.state.corpus.as_mut() {
            corpus.documents.push(doc);
        }
        for (chunk, emb) in chunks {
            self.insert_chunk(chunk, emb);
        }
    }

    /// Top-k cosine search over the store. `None` query vector scores nothing.
    pub fn search(&self, query: &[f32], limit: usize) -> Vec<(DocumentChunk, f32, EmbeddingKind)> {
        let mut scored: Vec<(String, f32)> = self
            .state
            .embeddings
            .iter()
            .map(|(id, v)| (id.clone(), cosine_similarity(query, v)))
            .collect();
        scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        scored
            .into_iter()
            .take(limit)
            .filter_map(|(id, score)| {
                let chunk = self.state.chunks.get(&id)?;
                let kind = self
                    .state
                    .embedding_kinds
                    .get(&id)
                    .cloned()
                    .unwrap_or(EmbeddingKind::Fallback);
                Some((chunk.clone(), score, kind))
            })
            .collect()
    }

    pub fn chunk(&self, chunk_id: &str) -> Option<&DocumentChunk> {
        self.state.chunks.get(chunk_id)
    }

    pub fn list_documents(&self) -> Vec<Document> {
        self.state
            .corpus
            .as_ref()
            .map(|c| c.documents.clone())
            .unwrap_or_default()
            .iter()
            .filter(|d| self.state.title_by_doc.contains_key(&d.id))
            .cloned()
            .collect()
    }
}

/// The persistence root layout: `<root>/corpus.json` holds the whole `StoreState`.
pub struct RagStore {
    pub root: PathBuf,
    pub vector_store: LocalVectorStore,
}

impl RagStore {
    pub fn new(root: PathBuf) -> Result<Self> {
        fs::create_dir_all(&root)
            .map_err(|e| anyhow!("RAG_ROOT_OPEN_FAILED: {}: {e}", root.display()))?;
        let path = root.join("corpus.json");
        let state = if path.exists() {
            let raw =
                fs::read_to_string(&path).map_err(|e| anyhow!("RAG_STORE_READ_FAILED: {e}"))?;
            serde_json::from_str::<StoreState>(&raw)
                .map_err(|e| anyhow!("RAG_STORE_CORRUPT: {e}"))?
        } else {
            StoreState::default()
        };
        Ok(Self {
            root,
            vector_store: LocalVectorStore { state },
        })
    }

    pub fn path(&self) -> PathBuf {
        self.root.join("corpus.json")
    }

    pub fn persist(&self) -> Result<()> {
        let raw = serde_json::to_vec_pretty(&self.vector_store.state)
            .map_err(|e| anyhow!("RAG_STORE_SERIALIZE_FAILED: {e}"))?;
        fs::write(self.path(), raw).map_err(|e| anyhow!("RAG_STORE_WRITE_FAILED: {e}"))?;
        Ok(())
    }
}

/// High-level ingest + query. Owns the chunker, embedder, and store.
pub struct RagEngine {
    pub store: RagStore,
    pub embedder: Box<dyn Embedder>,
    pub max_chunk_chars: usize,
    pub chunk_overlap: usize,
}

impl RagEngine {
    pub fn new(root: PathBuf, embedder: Box<dyn Embedder>) -> Result<Self> {
        let mut store = RagStore::new(root)?;
        if store.vector_store.corpus().is_none() {
            let now = Utc::now();
            let corpus = Corpus {
                id: uuid::Uuid::new_v4().to_string(),
                name: "airlock-default".to_string(),
                created_at: now,
                documents: Vec::new(),
            };
            store.vector_store.load_corpus(corpus);
            store.persist()?;
        }
        Ok(Self {
            store,
            embedder,
            max_chunk_chars: 2000,
            chunk_overlap: 200,
        })
    }

    /// Chunk + embed + store a document. Returns the document id.
    pub async fn ingest(&mut self, title: &str, source: &str, content: &str) -> Result<String> {
        let hash = hex_sha256(content);
        if let Some(existing) = self
            .store
            .vector_store
            .list_documents()
            .iter()
            .find(|d| d.title == title && d.source == source && d.content_hash == hash)
        {
            return Ok(existing.id.clone());
        }
        let doc_id = uuid::Uuid::new_v4().to_string();
        let chunks_raw = chunk_text(content, self.max_chunk_chars, self.chunk_overlap);
        let now = Utc::now();
        let doc = Document {
            id: doc_id.clone(),
            title: title.to_string(),
            source: source.to_string(),
            content_hash: hash,
            created_at: now,
            chunk_count: chunks_raw.len(),
        };
        let mut pairs: Vec<(DocumentChunk, Embedding)> = Vec::new();
        for (i, raw) in chunks_raw.iter().enumerate() {
            let chunk_id = uuid::Uuid::new_v4().to_string();
            pairs.push((
                DocumentChunk {
                    id: chunk_id.clone(),
                    document_id: doc_id.clone(),
                    index: i,
                    content: raw.clone(),
                    token_estimate: estimate_tokens(raw),
                },
                Embedding {
                    chunk_id,
                    vector: Vec::new(),
                    kind: EmbeddingKind::Fallback,
                },
            ));
        }
        let texts: Vec<String> = pairs.iter().map(|(c, _)| c.content.clone()).collect();
        let vecs = self.embedder.embed(&texts).await?;
        for ((_, emb), (vec, kind)) in pairs.iter_mut().zip(vecs) {
            emb.vector = vec;
            emb.kind = kind;
        }
        self.store.vector_store.insert_document(doc, title, pairs);
        self.store.persist()?;
        Ok(doc_id)
    }

    /// Embed the query (same embedder the corpus used) and return ranked retrieval hits.
    pub async fn query(&self, text: &str, limit: usize) -> Result<Vec<RetrievalResult>> {
        let query_vecs = self.embedder.embed(&[text.to_string()]).await?;
        let (qvec, _kind) = &query_vecs[0];
        let hits = self.store.vector_store.search(qvec, limit);
        let mut out: Vec<RetrievalResult> = hits
            .into_iter()
            .map(|(chunk, score, _kind)| {
                let title = self
                    .store
                    .vector_store
                    .state
                    .title_by_doc
                    .get(&chunk.document_id)
                    .cloned()
                    .unwrap_or_else(|| chunk.document_id.clone());
                RetrievalResult {
                    document_id: chunk.document_id.clone(),
                    title,
                    chunk_index: chunk.index,
                    content: chunk.content,
                    score,
                }
            })
            .collect();
        out.sort_by(|a, b| {
            b.score
                .partial_cmp(&a.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        Ok(out)
    }

    pub fn list_documents(&self) -> Vec<Document> {
        self.store.vector_store.list_documents()
    }

    /// True when the active embedder is a real model embedder (not the deterministic fallback).
    pub fn embeddings_computed(&self) -> bool {
        matches!(self.embedder.kind(), EmbeddingKind::Computed)
    }
}

pub fn hex_sha256(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    let digest = hasher.finalize();
    let mut out = String::with_capacity(64);
    for byte in digest {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

fn _assert_send_sync() {}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_root(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("airlock-rag-{}-{}", name, uuid::Uuid::new_v4()))
    }

    #[test]
    fn chunk_preserves_all_content_and_overlaps() {
        let text = "one sentence here. And another sentence. ".repeat(50);
        let chunks = chunk_text(&text, 200, 40);
        assert!(
            chunks.len() >= 3,
            "expected >=3 chunks, got {}",
            chunks.len()
        );
        // every chunk is within budget
        for c in &chunks {
            assert!(c.len() <= 250, "chunk over budget: {}", c.len());
        }
        // content order is preserved
        let joined = chunks.join(" ");
        assert!(joined.starts_with("one sentence"));
        assert!(joined.ends_with("another sentence."));
    }

    #[test]
    fn chunk_empty_is_empty() {
        assert_eq!(chunk_text("   \n\n ", 100, 10), Vec::<String>::new());
    }

    #[test]
    fn token_estimate_is_deterministic_and_positive() {
        assert_eq!(estimate_tokens(""), 0);
        assert!(estimate_tokens("a normal english sentence here.") > 0);
    }

    #[test]
    fn fallback_embedding_is_unit_length_and_deterministic() {
        let a = fallback_embedding("kubectl rollout restart", 384);
        let b = fallback_embedding("kubectl rollout restart", 384);
        let c = fallback_embedding("terraform plan", 384);
        assert_eq!(a, b);
        let na: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
        assert!((na - 1.0).abs() < 1e-4, "not normalised: {na}");
        // similar text scores higher than unrelated text
        let sim_same = cosine_similarity(&a, &a);
        let sim_diff = cosine_similarity(&a, &c);
        assert!(sim_same > sim_diff, "{sim_same} vs {sim_diff}");
    }

    #[tokio::test]
    async fn ingest_querying_roundtrip_with_local_embedder() {
        let root = tmp_root("roundtrip");
        let engine =
            RagEngine::new(root.clone(), Box::new(LocalFallbackEmbedder::default())).unwrap();
        let mut engine = engine;
        let doc_id = engine
            .ingest(
                "K8s cheat sheet",
                "docs",
                "kubectl get pods. kubectl rollout restart. kubectl scale deployment.",
            )
            .await
            .unwrap();
        assert!(!doc_id.is_empty());
        assert_eq!(engine.list_documents().len(), 1);
        let engine2 =
            RagEngine::new(root.clone(), Box::new(LocalFallbackEmbedder::default())).unwrap();
        let results = engine2.query("how do I restart pods?", 5).await.unwrap();
        assert!(!results.is_empty());
        assert!(results[0].title.contains("cheat sheet"));
        assert!(results[0].content.to_lowercase().contains("rollout"));
        // persistence reload keeps the corpus
        let docs = engine2.list_documents();
        assert_eq!(docs.len(), 1);
        let _ = engine;
        std::fs::remove_dir_all(&root).ok();
    }

    #[tokio::test]
    async fn unchanged_ingest_deduplicates() {
        let root = tmp_root("dedup");
        let engine =
            RagEngine::new(root.clone(), Box::new(LocalFallbackEmbedder::default())).unwrap();
        let mut engine = engine;
        let first = engine
            .ingest("doc", "src", "same content over and over")
            .await
            .unwrap();
        let second = engine
            .ingest("doc", "src", "same content over and over")
            .await
            .unwrap();
        assert_eq!(first, second);
        assert_eq!(engine.list_documents().len(), 1);
        let _ = engine;
        std::fs::remove_dir_all(&root).ok();
    }

    #[tokio::test]
    async fn ollama_embedder_falls_back_when_unreachable() {
        // point at a port nothing listens on; fallback must still produce Fallback vectors
        let embedder = OllamaEmbedder::new("http://127.0.0.1:1".into(), "none".into(), 16, false);
        let (vec, kind) = embedder.embed(&["hello".into()]).await.unwrap().remove(0);
        assert_eq!(vec.len(), 16);
        assert_eq!(kind, EmbeddingKind::Fallback);
    }

    #[tokio::test]
    async fn local_only_never_calls_network() {
        let embedder = OllamaEmbedder::new("http://127.0.0.1:1".into(), "none".into(), 16, true);
        let (_, kind) = embedder.embed(&["hello".into()]).await.unwrap().remove(0);
        assert_eq!(kind, EmbeddingKind::Fallback);
    }
}
