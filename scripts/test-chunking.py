#!/usr/bin/env python3
"""
Simple test script to verify chunking works
"""

import sys
import json
from pathlib import Path
import importlib.util

# Load chunking adapter
spec = importlib.util.spec_from_file_location(
    "chunking_adapter",
    Path(__file__).parent.parent / 'src' / 'knowledge' / 'chunking_adapter.py'
)
chunking_adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(chunking_adapter)

DeterministicChunker = chunking_adapter.DeterministicChunker
ChunkingConfig = chunking_adapter.ChunkingConfig

# Test document
test_content = """# Test Document

## Section 1

This is the first section with some content.
It has multiple lines.

## Section 2

This is the second section.
It also has content.

### Subsection 2.1

More detailed content here.
"""

# Create chunker
config = ChunkingConfig(chunk_size=200, chunk_overlap=50)
chunker = DeterministicChunker(config)

# Chunk document
chunks = chunker.chunk_document(
    document_id='a' * 64,
    document_version='1.0.0',
    source_file='test.md',
    content=test_content,
)

# Print results
print(f"Generated {len(chunks)} chunks:")
print()

for i, chunk in enumerate(chunks, 1):
    print(f"Chunk {i}:")
    print(f"  ID: {chunk.chunk_id[:16]}...")
    print(f"  Lines: {chunk.start_line}-{chunk.end_line}")
    print(f"  Tokens: {chunk.tokens}")
    print(f"  Type: {chunk.chunk_type}")
    print(f"  Header: {chunk.section_header}")
    print(f"  Content preview: {chunk.content[:50]}...")
    print()

print("✓ Chunking test successful!")
