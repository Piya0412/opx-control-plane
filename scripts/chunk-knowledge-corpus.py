#!/usr/bin/env python3
"""
Knowledge Corpus Chunking Script

Chunk all documents in the knowledge corpus for Bedrock Knowledge Base ingestion.

Usage:
    python scripts/chunk-knowledge-corpus.py --input knowledge/ --output chunks/
    python scripts/chunk-knowledge-corpus.py --input knowledge/ --output chunks/ --dry-run

Options:
    --input <dir>       Input directory containing documents (default: knowledge/)
    --output <dir>      Output directory for chunks (default: chunks/)
    --chunk-size <int>  Target tokens per chunk (default: 800)
    --overlap <int>     Overlap tokens (default: 100)
    --dry-run           Validate only, don't write output
    --verbose           Enable verbose logging

Phase 7.2: Deterministic Chunking Strategy
- Same document → same chunks (always)
- Semantic boundary preservation
- Citation traceability
- Version-controlled chunking rules
"""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import List, Dict, Any

print("DEBUG: Imports done")

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / 'src' / 'knowledge'))

print("DEBUG: Path updated")

# Import chunking adapter directly
try:
    from chunking_adapter import (
        DeterministicChunker,
        ChunkingConfig,
        Chunk,
        validate_determinism,
        validate_semantic_boundaries,
        validate_citation_traceability,
    )
    print("DEBUG: Chunking adapter imported")
except ImportError as e:
    print(f"DEBUG: Import error: {e}")
    # Fallback to manual import
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "chunking_adapter",
        Path(__file__).parent.parent / 'src' / 'knowledge' / 'chunking-adapter.py'
    )
    chunking_adapter = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(chunking_adapter)
    
    DeterministicChunker = chunking_adapter.DeterministicChunker
    ChunkingConfig = chunking_adapter.ChunkingConfig
    Chunk = chunking_adapter.Chunk
    validate_determinism = chunking_adapter.validate_determinism
    validate_semantic_boundaries = chunking_adapter.validate_semantic_boundaries
    validate_citation_traceability = chunking_adapter.validate_citation_traceability
    print("DEBUG: Chunking adapter loaded via importlib")


def load_document_metadata(file_path: Path) -> Dict[str, Any]:
    """
    Load document metadata from JSON sidecar file.
    
    Expected format: {file_path}.meta.json
    Example: knowledge/runbooks/lambda-timeout.md.meta.json
    
    Metadata includes:
    - document_id: SHA256 hash from Phase 7.1
    - document_version: Semantic version (e.g., "1.0.0")
    - title: Document title
    - type: Document type (RUNBOOK, POSTMORTEM, etc.)
    """
    meta_path = Path(str(file_path) + '.meta.json')
    
    if not meta_path.exists():
        raise FileNotFoundError(
            f"Metadata file not found: {meta_path}\n"
            f"Documents must be ingested via Phase 7.1 before chunking."
        )
    
    with open(meta_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def chunk_document_file(
    file_path: Path,
    chunker: DeterministicChunker,
    verbose: bool = False,
) -> List[Chunk]:
    """
    Chunk a single document file.
    
    Args:
        file_path: Path to markdown file
        chunker: Deterministic chunker instance
        verbose: Enable verbose logging
    
    Returns:
        List of chunks
    """
    if verbose:
        print(f"Processing: {file_path}")
    
    # Load document metadata
    metadata = load_document_metadata(file_path)
    
    # Read document content
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Chunk document
    chunks = chunker.chunk_document(
        document_id=metadata['documentId'],
        document_version=metadata['version'],
        source_file=str(file_path.relative_to(Path.cwd())),
        content=content,
    )
    
    if verbose:
        print(f"  Generated {len(chunks)} chunks")
        print(f"  Token range: {min(c.tokens for c in chunks)}-{max(c.tokens for c in chunks)}")
    
    return chunks


def write_chunks_jsonl(chunks: List[Chunk], output_path: Path, verbose: bool = False):
    """
    Write chunks to JSONL file (Bedrock Knowledge Base format).
    
    Format: One JSON object per line
    """
    if verbose:
        print(f"Writing chunks to: {output_path}")
    
    # Create output directory
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Write JSONL
    with open(output_path, 'w', encoding='utf-8') as f:
        for chunk in chunks:
            json.dump(chunk.to_dict(), f, ensure_ascii=False)
            f.write('\n')
    
    if verbose:
        print(f"  Wrote {len(chunks)} chunks")


def validate_chunks(chunks: List[Chunk], original_content: str, verbose: bool = False) -> bool:
    """
    Validate chunks for determinism, semantic boundaries, and citation traceability.
    
    Returns:
        True if all validations pass, False otherwise
    """
    if verbose:
        print("Validating chunks...")
    
    # Validate semantic boundaries
    if not validate_semantic_boundaries(chunks):
        print("  ❌ Semantic boundary validation failed")
        return False
    
    if verbose:
        print("  ✓ Semantic boundaries preserved")
    
    # Validate citation traceability
    for chunk in chunks:
        if not validate_citation_traceability(chunk, original_content):
            print(f"  ❌ Citation traceability failed for chunk: {chunk.chunk_id}")
            return False
    
    if verbose:
        print("  ✓ Citation traceability verified")
    
    return True


def chunk_corpus(
    input_dir: Path,
    output_dir: Path,
    chunk_size: int,
    overlap: int,
    dry_run: bool,
    verbose: bool,
):
    """
    Chunk all documents in the knowledge corpus.
    
    Args:
        input_dir: Input directory containing documents
        output_dir: Output directory for chunks
        chunk_size: Target tokens per chunk
        overlap: Overlap tokens
        dry_run: Validate only, don't write output
        verbose: Enable verbose logging
    """
    # Create chunker
    config = ChunkingConfig(
        chunk_size=chunk_size,
        chunk_overlap=overlap,
    )
    chunker = DeterministicChunker(config)
    
    if verbose:
        print(f"Chunking configuration:")
        print(f"  Chunk size: {chunk_size} tokens")
        print(f"  Overlap: {overlap} tokens")
        print(f"  Input: {input_dir}")
        print(f"  Output: {output_dir}")
        print(f"  Dry run: {dry_run}")
        print()
    
    # Find all markdown files
    md_files = list(input_dir.rglob('*.md'))
    
    if not md_files:
        print(f"No markdown files found in {input_dir}")
        return
    
    print(f"Found {len(md_files)} documents to chunk")
    print()
    
    # Process each document
    total_chunks = 0
    failed_files = []
    
    for md_file in md_files:
        try:
            # Chunk document
            chunks = chunk_document_file(md_file, chunker, verbose)
            
            # Validate chunks
            with open(md_file, 'r', encoding='utf-8') as f:
                content = f.read()
            
            if not validate_chunks(chunks, content, verbose):
                print(f"❌ Validation failed: {md_file}")
                failed_files.append(md_file)
                continue
            
            # Test determinism (chunk twice and compare)
            chunks2 = chunk_document_file(md_file, chunker, verbose=False)
            if not validate_determinism(chunks, chunks2):
                print(f"❌ Determinism validation failed: {md_file}")
                failed_files.append(md_file)
                continue
            
            if verbose:
                print("  ✓ Determinism verified")
            
            # Write chunks (unless dry-run)
            if not dry_run:
                # Preserve directory structure
                relative_path = md_file.relative_to(input_dir)
                output_path = output_dir / relative_path.with_suffix('.jsonl')
                write_chunks_jsonl(chunks, output_path, verbose)
            
            total_chunks += len(chunks)
            print(f"✓ {md_file.name}: {len(chunks)} chunks")
            
        except Exception as e:
            print(f"❌ Error processing {md_file}: {e}")
            failed_files.append(md_file)
    
    # Summary
    print()
    print("=" * 60)
    print("Chunking Summary")
    print("=" * 60)
    print(f"Documents processed: {len(md_files)}")
    print(f"Documents succeeded: {len(md_files) - len(failed_files)}")
    print(f"Documents failed: {len(failed_files)}")
    print(f"Total chunks: {total_chunks}")
    
    if failed_files:
        print()
        print("Failed files:")
        for f in failed_files:
            print(f"  - {f}")
    
    if dry_run:
        print()
        print("DRY RUN - No files written")
    
    # Exit with error if any files failed
    if failed_files:
        sys.exit(1)


def main():
    print("DEBUG: Starting main()")
    parser = argparse.ArgumentParser(
        description='Chunk knowledge corpus for Bedrock Knowledge Base ingestion',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Dry-run (validation only)
  python scripts/chunk-knowledge-corpus.py --dry-run --verbose
  
  # Chunk with default settings
  python scripts/chunk-knowledge-corpus.py
  
  # Chunk with custom settings
  python scripts/chunk-knowledge-corpus.py \\
    --input knowledge/ \\
    --output chunks/ \\
    --chunk-size 1000 \\
    --overlap 150 \\
    --verbose
        """
    )
    
    parser.add_argument(
        '--input',
        type=Path,
        default=Path('knowledge'),
        help='Input directory containing documents (default: knowledge/)',
    )
    
    parser.add_argument(
        '--output',
        type=Path,
        default=Path('chunks'),
        help='Output directory for chunks (default: chunks/)',
    )
    
    parser.add_argument(
        '--chunk-size',
        type=int,
        default=800,
        help='Target tokens per chunk (default: 800)',
    )
    
    parser.add_argument(
        '--overlap',
        type=int,
        default=100,
        help='Overlap tokens (default: 100)',
    )
    
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Validate only, don\'t write output',
    )
    
    parser.add_argument(
        '--verbose',
        action='store_true',
        help='Enable verbose logging',
    )
    
    args = parser.parse_args()
    
    # Validate input directory
    if not args.input.exists():
        print(f"Error: Input directory not found: {args.input}")
        sys.exit(1)
    
    # Chunk corpus
    chunk_corpus(
        input_dir=args.input,
        output_dir=args.output,
        chunk_size=args.chunk_size,
        overlap=args.overlap,
        dry_run=args.dry_run,
        verbose=args.verbose,
    )


if __name__ == '__main__':
    main()
