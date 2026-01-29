#!/usr/bin/env python3
"""
Transform chunks from flat structure to Bedrock-compatible format.

Bedrock expects:
{
  "content": "text",
  "metadata": { ... }
}

Our chunks are flat. This script restructures them.
"""

import json
import os
from pathlib import Path

def transform_chunk(chunk):
    """Transform a flat chunk to Bedrock format."""
    return {
        "content": chunk["content"],
        "metadata": {
            "chunk_id": chunk["chunk_id"],
            "document_id": chunk["document_id"],
            "document_version": chunk["document_version"],
            "source_file": chunk["source_file"],
            "start_line": str(chunk["start_line"]),
            "end_line": str(chunk["end_line"]),
            "tokens": str(chunk["tokens"]),
            "section_header": chunk["section_header"],
            "chunk_type": chunk["chunk_type"],
            "overlap_with_previous": str(chunk["overlap_with_previous"]).lower()
        }
    }

def transform_file(input_path, output_path):
    """Transform a JSONL file."""
    print(f"Transforming: {input_path}")
    
    with open(input_path, 'r') as infile, open(output_path, 'w') as outfile:
        for line in infile:
            if line.strip():
                chunk = json.loads(line)
                transformed = transform_chunk(chunk)
                outfile.write(json.dumps(transformed) + '\n')
    
    print(f"  → {output_path}")

def main():
    """Transform all chunk files."""
    chunks_dir = Path("chunks")
    bedrock_dir = Path("chunks-bedrock")
    
    # Create output directory
    bedrock_dir.mkdir(exist_ok=True)
    
    # Transform all JSONL files
    for category in ["runbooks", "postmortems"]:
        category_dir = chunks_dir / category
        output_category_dir = bedrock_dir / category
        output_category_dir.mkdir(exist_ok=True)
        
        for jsonl_file in category_dir.glob("*.jsonl"):
            output_file = output_category_dir / jsonl_file.name
            transform_file(jsonl_file, output_file)
    
    print(f"\n✓ Transformation complete")
    print(f"  Input: {chunks_dir}")
    print(f"  Output: {bedrock_dir}")
    print(f"\nNext: Upload to S3:")
    print(f"  aws s3 sync {bedrock_dir}/ s3://opx-knowledge-corpus/chunks/ --delete")

if __name__ == "__main__":
    main()
