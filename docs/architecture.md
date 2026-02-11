# Mycel – Architecture Overview

## System Architecture

```mermaid
graph TB
    subgraph Input Layer
        A1[Audio] --> ING[Ingestion Service]
        A2[Image] --> ING
        A3[Text] --> ING
    end

    subgraph Agent Pipeline
        ING --> CLS[Classifier Agent]
        CLS --> CTX[Context Dispatcher]
        CTX --> GAP[Gap-Reasoning Agent]
        GAP --> PER[Persona Agent]
        PER --> STR[Structuring Agent]
    end

    subgraph Knowledge Layer
        STR --> KB[(Knowledge Base)]
        KB --> VS[Vector Search]
        VS -->|RAG| CTX
    end

    subgraph Configuration
        DOM[Domain Schema] -.-> CLS
        DOM -.-> GAP
        DOM -.-> STR
        PSN[Persona Schema] -.-> PER
    end
```

## Core Concepts

### Genericity through Configuration

Mycel separates three concerns:

1. **Engine** – The agent pipeline, orchestration logic, and infrastructure. Domain-agnostic.
2. **Domain Schema** – Defines *what* knowledge to capture: categories, required fields, ingestion modalities.
3. **Persona Schema** – Defines *how* to communicate: tone, formality, follow-up behavior.

A deployment is fully configured by providing a Domain Schema and a Persona Schema. The engine itself never contains domain-specific logic.

### Multi-Agent System

Instead of a single monolithic prompt, Mycel uses specialized agents:

| Agent               | Responsibility                                          |
| ------------------- | ------------------------------------------------------- |
| Classifier          | Categorizes input into domain categories                |
| Context Dispatcher  | Retrieves relevant existing knowledge (RAG)             |
| Gap-Reasoning       | Identifies missing information and generates questions  |
| Persona             | Formulates the response in the configured persona style |
| Structuring         | Extracts structured data from the conversation          |

### Ingestion Pipeline

The ingestion layer normalizes multimodal input into text:

- **Audio**: Speech-to-Text via GCP Speech API
- **Image**: Vision API for OCR and object detection
- **Text**: Direct processing with language detection

### RAG (Retrieval Augmented Generation)

The Context Dispatcher uses Vertex AI Vector Search to retrieve relevant existing knowledge before the Gap-Reasoning agent analyzes what is missing. This prevents duplicate knowledge and enables the system to build on existing entries.

## Package Dependencies

```mermaid
graph LR
    CORE[core] --> SCHEMAS[schemas]
    CORE --> INGESTION[ingestion]
    CORE --> SHARED[shared]
    SCHEMAS --> SHARED
    INGESTION --> SHARED
```

## GCP Infrastructure

```mermaid
graph TB
    CR[Cloud Run<br/>API + Orchestration] --> VAI[Vertex AI<br/>Gemini LLM]
    CR --> VS[Vector Search<br/>RAG Index]
    CR --> GCS[Cloud Storage<br/>Ingestion Bucket]
    CR --> STT[Speech-to-Text]
    CR --> VIS[Vision API]
```
