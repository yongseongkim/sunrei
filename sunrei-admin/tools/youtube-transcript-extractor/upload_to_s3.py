#!/usr/bin/env python3
"""
Upload transcript and output files to S3.

This script is compatible with aws-vault. Use it like:
  aws-vault exec sunrei -- python upload_to_s3.py --all --dry-run
  aws-vault exec sunrei -- python upload_to_s3.py --all
"""

import os
import sys
import glob
import boto3
from typing import Optional
from dotenv import load_dotenv
from botocore.exceptions import ClientError, NoCredentialsError


def create_s3_client():
    """
    Create S3 client with proper region configuration.
    Compatible with aws-vault and standard AWS credentials.
    """
    region = os.getenv('AWS_REGION', 'ap-northeast-2')

    try:
        # boto3 automatically uses environment variables set by aws-vault:
        # - AWS_ACCESS_KEY_ID
        # - AWS_SECRET_ACCESS_KEY
        # - AWS_SESSION_TOKEN (if temporary credentials)
        s3_client = boto3.client('s3', region_name=region)

        # Verify credentials by making a simple API call
        s3_client.list_buckets()

        return s3_client
    except NoCredentialsError:
        print("Error: No AWS credentials found")
        print("\nPlease configure credentials using one of:")
        print("  1. aws-vault exec <profile> -- python upload_to_s3.py ...")
        print("  2. AWS CLI: aws configure")
        print("  3. Environment variables: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY")
        sys.exit(1)
    except ClientError as e:
        print(f"Error: Failed to connect to S3: {str(e)}")
        sys.exit(1)


def upload_file_to_s3(
    file_path: str,
    bucket: str,
    s3_key: str,
    s3_client: boto3.client,
    dry_run: bool = False
) -> bool:
    """
    Upload a file to S3.

    Args:
        file_path: Local file path
        bucket: S3 bucket name
        s3_key: S3 object key (path in bucket)
        s3_client: boto3 S3 client
        dry_run: If True, only print what would be uploaded

    Returns:
        True if successful, False otherwise
    """
    if dry_run:
        print(f"  [DRY RUN] Would upload: {file_path} -> s3://{bucket}/{s3_key}")
        return True

    try:
        s3_client.upload_file(file_path, bucket, s3_key)
        print(f"  ✓ Uploaded: {file_path} -> s3://{bucket}/{s3_key}")
        return True
    except ClientError as e:
        print(f"  ✗ Failed to upload {file_path}: {str(e)}")
        return False


def upload_transcripts(
    transcript_dir: str,
    bucket: str,
    s3_prefix: str = "youtube-transcript-extractor/transcripts",
    dry_run: bool = False
) -> None:
    """
    Upload all transcript files to S3.

    Args:
        transcript_dir: Directory containing transcript files
        bucket: S3 bucket name
        s3_prefix: S3 key prefix (default: "youtube-transcript-extractor/transcripts")
        dry_run: If True, only print what would be uploaded
    """
    s3_client = create_s3_client()

    # Find all JSON files recursively
    json_files = glob.glob(f"{transcript_dir}/**/*.json", recursive=True)

    print(f"Found {len(json_files)} transcript files")

    success_count = 0
    for file_path in json_files:
        # Get relative path from transcript_dir
        rel_path = os.path.relpath(file_path, transcript_dir)
        s3_key = f"{s3_prefix}/{rel_path}"

        if upload_file_to_s3(file_path, bucket, s3_key, s3_client, dry_run):
            success_count += 1

    print(f"\n✓ Uploaded {success_count}/{len(json_files)} files")


def upload_outputs(
    output_dir: str,
    bucket: str,
    s3_prefix: str = "youtube-transcript-extractor/outputs",
    dry_run: bool = False
) -> None:
    """
    Upload all output files to S3.

    Args:
        output_dir: Directory containing output files
        bucket: S3 bucket name
        s3_prefix: S3 key prefix (default: "youtube-transcript-extractor/outputs")
        dry_run: If True, only print what would be uploaded
    """
    s3_client = create_s3_client()

    # Find all JSON files recursively
    json_files = glob.glob(f"{output_dir}/**/*.json", recursive=True)

    print(f"Found {len(json_files)} output files")

    success_count = 0
    for file_path in json_files:
        # Get relative path from output_dir
        rel_path = os.path.relpath(file_path, output_dir)
        s3_key = f"{s3_prefix}/{rel_path}"

        if upload_file_to_s3(file_path, bucket, s3_key, s3_client, dry_run):
            success_count += 1

    print(f"\n✓ Uploaded {success_count}/{len(json_files)} files")


def upload_both(
    base_dir: str = ".",
    bucket: Optional[str] = None,
    dry_run: bool = False
) -> None:
    """
    Upload both transcripts and outputs to S3.

    Args:
        base_dir: Base directory containing transcripts/ and output/ subdirectories
        bucket: S3 bucket name
        dry_run: If True, only print what would be uploaded
    """
    if not bucket:
        bucket = os.getenv('S3_BUCKET')
        if not bucket:
            print("Error: S3_BUCKET not specified and not found in environment")
            sys.exit(1)

    transcript_dir = os.path.join(base_dir, "transcripts")
    output_dir = os.path.join(base_dir, "output")

    # Upload transcripts
    if os.path.isdir(transcript_dir):
        print(f"\n{'='*60}")
        print("Uploading transcripts...")
        print('='*60)
        upload_transcripts(transcript_dir, bucket, "youtube-transcript-extractor/transcripts", dry_run)
    else:
        print(f"⚠️  Transcript directory not found: {transcript_dir}")

    # Upload outputs
    if os.path.isdir(output_dir):
        print(f"\n{'='*60}")
        print("Uploading outputs...")
        print('='*60)
        upload_outputs(output_dir, bucket, "youtube-transcript-extractor/outputs", dry_run)
    else:
        print(f"⚠️  Output directory not found: {output_dir}")


if __name__ == '__main__':
    load_dotenv()

    import argparse

    parser = argparse.ArgumentParser(description='Upload transcript and output files to S3')
    parser.add_argument('--transcripts', type=str, help='Path to transcripts directory')
    parser.add_argument('--outputs', type=str, help='Path to outputs directory')
    parser.add_argument('--bucket', type=str, help='S3 bucket name (default: from S3_BUCKET env var)')
    parser.add_argument('--dry-run', action='store_true', help='Print what would be uploaded without actually uploading')
    parser.add_argument('--all', action='store_true', help='Upload both transcripts and outputs from current directory')

    args = parser.parse_args()

    bucket = args.bucket or os.getenv('S3_BUCKET')

    if not bucket:
        print("Error: S3 bucket not specified")
        print("  Use --bucket BUCKET_NAME or set S3_BUCKET environment variable")
        sys.exit(1)

    if args.all:
        # Upload both from current directory
        upload_both(".", bucket, args.dry_run)
    elif args.transcripts or args.outputs:
        # Upload specific directories
        if args.transcripts:
            print(f"\n{'='*60}")
            print("Uploading transcripts...")
            print('='*60)
            upload_transcripts(args.transcripts, bucket, "youtube-transcript-extractor/transcripts", args.dry_run)

        if args.outputs:
            print(f"\n{'='*60}")
            print("Uploading outputs...")
            print('='*60)
            upload_outputs(args.outputs, bucket, "youtube-transcript-extractor/outputs", args.dry_run)
    else:
        parser.print_help()
        print("\nExamples:")
        print("  python upload_to_s3.py --all --dry-run")
        print("  python upload_to_s3.py --transcripts transcripts/ --bucket my-bucket")
        print("  python upload_to_s3.py --outputs output/ --bucket my-bucket")
        sys.exit(1)
