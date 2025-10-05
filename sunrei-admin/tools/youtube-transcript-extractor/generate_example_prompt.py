#!/usr/bin/env python3
"""
Generate example prompts for testing Claude directly using real transcript data.
"""

import json
import sys
import glob
import os
from extract_locations import SYSTEM_PROMPT, USER_PROMPT_TEMPLATE, chunk_transcript_by_time, clean_description_with_openai


def load_transcript_file(file_path: str) -> dict:
    """Load transcript JSON file."""
    with open(file_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def list_transcript_files(transcript_dir: str = 'transcripts') -> list:
    """List all transcript JSON files (recursively search in playlist subdirectories)."""
    # Search for JSON files in subdirectories
    files = glob.glob(f"{transcript_dir}/**/*.json", recursive=True)
    # Exclude playlist_summary.json files
    files = [f for f in files if os.path.basename(f) != 'playlist_summary.json']
    return sorted(files)


def generate_example_prompt(transcript_data: dict = None, file_path: str = None):
    """Generate example prompt for Claude."""

    if not transcript_data:
        if not file_path:
            print("Error: Either transcript_data or file_path must be provided")
            return
        transcript_data = load_transcript_file(file_path)

    # Check if transcript extraction was successful
    if not transcript_data.get('success'):
        print(f"Error: Transcript extraction failed - {transcript_data.get('error')}")
        return

    video_id = transcript_data['video_id']
    title = transcript_data['title']

    # Clean description (using OpenAI for example prompts)
    raw_description = transcript_data.get('description', '')
    description = clean_description_with_openai(raw_description, os.getenv('OPENAI_API_KEY')) if raw_description else ''

    # Chunk transcript by time
    chunks = chunk_transcript_by_time(transcript_data.get('transcript', []))
    transcript_chunks_text = '\n'.join([
        f"[{chunk['time_range']}] {chunk['text']}"
        for chunk in chunks
    ])

    user_prompt = USER_PROMPT_TEMPLATE.format(
        title=title,
        description=description,
        transcript_chunks=transcript_chunks_text
    )

    # Print prompts only
    print(SYSTEM_PROMPT)
    print("\n")
    print(user_prompt)

    # Save to file for easy copying
    output_file = f'example_prompt_{video_id}.txt'
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(SYSTEM_PROMPT)
        f.write("\n\n")
        f.write(user_prompt)

    # Print metadata to stderr so it doesn't interfere with prompt output
    import sys
    print(f"\n✓ Video: {title}", file=sys.stderr)
    print(f"✓ Chunks: {len(chunks)} | Language: {transcript_data.get('language', 'Unknown')}", file=sys.stderr)
    print(f"✓ Saved to {output_file}", file=sys.stderr)


if __name__ == '__main__':
    if len(sys.argv) > 1:
        # Use specified file
        file_path = sys.argv[1]
        if not os.path.exists(file_path):
            print(f"Error: File not found - {file_path}", file=sys.stderr)
            sys.exit(1)
        generate_example_prompt(file_path=file_path)
    else:
        # List available files and use first one
        files = list_transcript_files()
        if not files:
            print("Error: No transcript files found in transcripts/", file=sys.stderr)
            sys.exit(1)

        print(f"Found {len(files)} transcript files:", file=sys.stderr)
        for i, f in enumerate(files[:10], 1):
            basename = os.path.basename(f)
            # Load to get title
            data = load_transcript_file(f)
            title = data.get('title', 'Unknown')
            print(f"  {i}. {basename}: {title[:60]}...", file=sys.stderr)

        if len(files) > 10:
            print(f"  ... and {len(files) - 10} more", file=sys.stderr)

        print(f"\nUsing first file: {os.path.basename(files[0])}", file=sys.stderr)
        print("(Run with file path to use a specific file: uv run generate_example_prompt.py transcripts/VIDEO_ID.json)\n", file=sys.stderr)

        generate_example_prompt(file_path=files[0])
