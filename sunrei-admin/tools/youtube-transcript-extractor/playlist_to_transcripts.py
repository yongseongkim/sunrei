import json
import os
import time
import random
from typing import List, Dict
from googleapiclient.discovery import build
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import TranscriptsDisabled, NoTranscriptFound


def get_playlist_videos(playlist_id: str, api_key: str) -> List[Dict[str, str]]:
    """
    Get all video IDs and metadata from a YouTube playlist.

    Args:
        playlist_id: YouTube playlist ID
        api_key: YouTube Data API v3 key

    Returns:
        List of dicts with video metadata (id, title, description, thumbnails, stats, etc.)
    """
    youtube = build('youtube', 'v3', developerKey=api_key)

    video_ids = []
    next_page_token = None

    # Get video IDs from playlist
    while True:
        request = youtube.playlistItems().list(
            part='snippet',
            playlistId=playlist_id,
            maxResults=50,
            pageToken=next_page_token
        )
        response = request.execute()

        for item in response['items']:
            video_ids.append(item['snippet']['resourceId']['videoId'])

        next_page_token = response.get('nextPageToken')
        if not next_page_token:
            break

    # Get detailed video information
    videos = []
    # YouTube API allows up to 50 IDs per request
    for i in range(0, len(video_ids), 50):
        batch_ids = video_ids[i:i+50]

        request = youtube.videos().list(
            part='snippet,contentDetails,statistics',
            id=','.join(batch_ids)
        )
        response = request.execute()

        for item in response['items']:
            snippet = item['snippet']
            videos.append({
                'video_id': item['id'],
                'title': snippet['title'],
                'description': snippet['description'],
                'published_at': snippet['publishedAt'],
                'channel_title': snippet['channelTitle'],
                'channel_id': snippet['channelId'],
                'thumbnails': snippet.get('thumbnails', {}),
                'tags': snippet.get('tags', []),
                'duration': item['contentDetails']['duration'],
                'view_count': item.get('statistics', {}).get('viewCount', 0),
                'like_count': item.get('statistics', {}).get('likeCount', 0),
                'comment_count': item.get('statistics', {}).get('commentCount', 0),
            })

    return videos


def get_video_transcript(video_id: str, languages: List[str] = ['ko', 'ja', 'en']) -> Dict:
    """
    Get transcript for a YouTube video.

    Args:
        video_id: YouTube video ID
        languages: Preferred languages in order (default: Korean, Japanese, English)

    Returns:
        Dict with transcript data or error info
    """
    try:
        # Create API instance
        ytt_api = YouTubeTranscriptApi()

        # Fetch transcript with preferred languages
        fetched_transcript = ytt_api.fetch(video_id, languages=languages)

        # Convert snippets to dict format
        transcript_data = [
            {
                'text': snippet.text,
                'start': snippet.start,
                'duration': snippet.duration
            }
            for snippet in fetched_transcript.snippets
        ]

        return {
            'success': True,
            'language': fetched_transcript.language_code,
            'transcript': transcript_data,
            'full_text': ' '.join([entry['text'] for entry in transcript_data])
        }

    except (TranscriptsDisabled, NoTranscriptFound) as e:
        return {
            'success': False,
            'error': str(e)
        }
    except Exception as e:
        return {
            'success': False,
            'error': f'Unexpected error: {str(e)}'
        }


def extract_playlist_transcripts(playlist_id: str, api_key: str, output_dir: str = 'transcripts'):
    """
    Extract transcripts from all videos in a playlist and save to JSON files.

    Args:
        playlist_id: YouTube playlist ID
        api_key: YouTube Data API v3 key
        output_dir: Base directory to save transcript JSON files (default: 'transcripts')
                    Files will be saved to {output_dir}/{playlist_id}/
    """
    # Create playlist-specific directory
    playlist_dir = os.path.join(output_dir, playlist_id)
    os.makedirs(playlist_dir, exist_ok=True)

    print(f"Fetching videos from playlist: {playlist_id}")
    videos = get_playlist_videos(playlist_id, api_key)
    print(f"Found {len(videos)} videos")

    results = []

    for i, video in enumerate(videos, 1):
        video_id = video['video_id']
        print(f"\n[{i}/{len(videos)}] Processing: {video['title']}")
        print(f"Video ID: {video_id}")
        print(f"Channel: {video.get('channel_title', 'Unknown')}")
        print(f"Published: {video.get('published_at', 'Unknown')}")
        print(f"Views: {int(video.get('view_count', 0)):,}")

        # Check if transcript already exists
        filename = os.path.join(playlist_dir, f"{video_id}.json")
        used_cache = False
        if os.path.exists(filename):
            print(f"⚡ Using cached transcript")
            with open(filename, 'r', encoding='utf-8') as f:
                video_data = json.load(f)
            used_cache = True
        else:
            # Extract new transcript
            transcript_result = get_video_transcript(video_id)

            video_data = {
                'video_id': video_id,
                'title': video['title'],
                'description': video['description'],
                'url': f'https://www.youtube.com/watch?v={video_id}',
                'published_at': video.get('published_at'),
                'channel_title': video.get('channel_title'),
                'channel_id': video.get('channel_id'),
                'thumbnails': video.get('thumbnails', {}),
                'tags': video.get('tags', []),
                'duration': video.get('duration'),
                'view_count': video.get('view_count', 0),
                'like_count': video.get('like_count', 0),
                'comment_count': video.get('comment_count', 0),
                **transcript_result
            }

            if transcript_result['success']:
                print(f"✓ Transcript extracted ({transcript_result['language']})")
                # Save individual transcript file
                with open(filename, 'w', encoding='utf-8') as f:
                    json.dump(video_data, f, ensure_ascii=False, indent=2)
            else:
                print(f"✗ Failed: {transcript_result['error']}")

        results.append(video_data)

        # Add random delay to avoid rate limiting (only for new extractions)
        if not used_cache and i < len(videos):  # Don't delay after the last video or when using cache
            delay = random.uniform(10, 30)
            print(f"⏱️  Waiting {delay:.1f}s to avoid rate limiting...")
            time.sleep(delay)

    # Save summary file
    summary_file = os.path.join(playlist_dir, f"playlist_summary.json")
    with open(summary_file, 'w', encoding='utf-8') as f:
        json.dump({
            'playlist_id': playlist_id,
            'total_videos': len(videos),
            'successful_transcripts': sum(1 for r in results if r['success']),
            'videos': results
        }, f, ensure_ascii=False, indent=2)

    print(f"\n✓ All transcripts saved to {playlist_dir}/")
    print(f"✓ Summary saved to {summary_file}")

    return results


if __name__ == '__main__':
    import sys
    from dotenv import load_dotenv

    load_dotenv()

    if len(sys.argv) < 2:
        print("Usage: python playlist_to_transcripts.py <PLAYLIST_ID>")
        sys.exit(1)

    playlist_id = sys.argv[1]
    api_key = os.getenv('YOUTUBE_API_KEY')

    if not api_key:
        print("Error: YOUTUBE_API_KEY not found in environment")
        sys.exit(1)

    extract_playlist_transcripts(playlist_id, api_key)
