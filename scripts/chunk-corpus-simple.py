#!/usr/bin/env python3
"""
Simple Knowledge Corpus Chunking Script

Chunk all documents in the knowledge corpus for Bedrock Knowledge Base ingestion.
"""

import json
import sys
from pathlib import Path

# Add to path
sys.path.insert(0, str(Path(__file__).parent.parent / 'src' / 'knowledge'))

from chunking_adapter import DeterministicChunker, ChunkingConfig

def main():
    # Configuration
    input_dir = Path('knowledge')
    output_dir = Path('chunks')
    
    # Create chunker
    config = ChunkingConfig(chunk_size=800, chunk_overlap=100)
    chunker = DeterministicChunker(config)
    
    print(f"Chunking documents from {input_dir}")
    print(f"Output directory: {output_dir}")
    print()
    
    # Find all markdown files
    md_files = list(input_dir.rglob('*.md'))
    print(f"Found {len(md_files)} documents")
    print()
    
    total_chunks = 0
    
    for md_file in md_files:
        # Load metadata
        meta_path = Path(str(md_file) + '.meta.json')
        if not meta_path.exists():
            print(f"⏭️  Skipping {md_file.name} (no metadata)")
            continue
        
        with open(meta_path, 'r') as f:
            metadata = json.load(f)
        
        # Read content
        with open(md_file, 'r') as f:
            content = f.read()
        
        # Chunk document
        chunks = chunker.chunk_document(
            document_id=metadata['documentId'],
            document_version=metadata['version'],
            source_file=str(md_file),
            content=content,
        )
        
        # Create output path
        relative_path = md_file.relative_to(input_dir)
        output_path = output_dir / relative_path.with_suffix('.jsonl')
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Write chunks
        with open(output_path, 'w') as f:
            for chunk in chunks:
                json.dump(chunk.to_dict(), f, ensure_ascii=False)
                f.write('\n')
        
        total_chunks += len(chunks)
        print(f"✓ {md_file.name}: {len(chunks)} chunks → {output_path}")
    
    print()
    print(f"Total chunks generated: {total_chunks}")
    print(f"Output written to: {output_dir}")

if __name__ == '__main__':
    main()
