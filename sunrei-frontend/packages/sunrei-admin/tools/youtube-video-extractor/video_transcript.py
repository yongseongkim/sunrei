import os
from typing import Optional
from dataclasses import dataclass, field
from googleapiclient.discovery import build
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import TranscriptsDisabled, NoTranscriptFound

from utils import extract_video_id, extract_playlist_id, clean_description, extract_timeline_from_description


@dataclass
class TranscriptEntry:
    text: str
    start: float
    duration: float


@dataclass
class VideoMetadata:
    video_id: str
    title: str
    description: str
    cleaned_description: str
    channel_name: str
    channel_id: str
    published_at: str
    duration: str
    view_count: int
    like_count: int
    thumbnails: dict
    tags: list[str]
    timeline: list[dict]

    @property
    def url(self) -> str:
        return f"https://www.youtube.com/watch?v={self.video_id}"


@dataclass
class VideoTranscript:
    metadata: VideoMetadata
    transcript: list[TranscriptEntry] = field(default_factory=list)
    language: Optional[str] = None
    transcript_source: str = "none"
    error: Optional[str] = None

    @property
    def success(self) -> bool:
        return len(self.transcript) > 0

    @property
    def full_text(self) -> str:
        return ' '.join(entry.text for entry in self.transcript)

    def to_dict(self) -> dict:
        return {
            'video_id': self.metadata.video_id,
            'title': self.metadata.title,
            'description': self.metadata.description,
            'cleaned_description': self.metadata.cleaned_description,
            'url': self.metadata.url,
            'channel_name': self.metadata.channel_name,
            'channel_id': self.metadata.channel_id,
            'published_at': self.metadata.published_at,
            'duration': self.metadata.duration,
            'view_count': self.metadata.view_count,
            'like_count': self.metadata.like_count,
            'thumbnails': self.metadata.thumbnails,
            'tags': self.metadata.tags,
            'timeline': self.metadata.timeline,
            'success': self.success,
            'language': self.language,
            'transcript_source': self.transcript_source,
            'transcript': [
                {'text': e.text, 'start': e.start, 'duration': e.duration}
                for e in self.transcript
            ],
            'full_text': self.full_text,
            'error': self.error
        }


@dataclass
class PlaylistMetadata:
    playlist_id: str
    title: str
    channel_name: str
    channel_id: str
    video_count: int
    description: str

    @property
    def url(self) -> str:
        return f"https://www.youtube.com/playlist?list={self.playlist_id}"


@dataclass
class PlaylistVideo:
    video_id: str
    title: str
    position: int


def get_playlist_metadata(
    playlist_id: str,
    api_key: Optional[str] = None
) -> Optional[PlaylistMetadata]:
    api_key = api_key or os.getenv('YOUTUBE_API_KEY')
    if not api_key:
        raise ValueError("YOUTUBE_API_KEY not found in environment")

    youtube = build('youtube', 'v3', developerKey=api_key)

    request = youtube.playlists().list(
        part='snippet,contentDetails',
        id=playlist_id
    )
    response = request.execute()

    if not response.get('items'):
        return None

    item = response['items'][0]
    snippet = item['snippet']

    return PlaylistMetadata(
        playlist_id=playlist_id,
        title=snippet['title'],
        channel_name=snippet['channelTitle'],
        channel_id=snippet['channelId'],
        video_count=item['contentDetails']['itemCount'],
        description=snippet.get('description', '')
    )


def get_playlist_video_ids(
    playlist_id: str,
    api_key: Optional[str] = None
) -> list[PlaylistVideo]:
    api_key = api_key or os.getenv('YOUTUBE_API_KEY')
    if not api_key:
        raise ValueError("YOUTUBE_API_KEY not found in environment")

    youtube = build('youtube', 'v3', developerKey=api_key)

    videos = []
    next_page_token = None

    while True:
        request = youtube.playlistItems().list(
            part='snippet,contentDetails',
            playlistId=playlist_id,
            maxResults=50,
            pageToken=next_page_token
        )
        response = request.execute()

        for item in response.get('items', []):
            video_id = item['contentDetails']['videoId']
            title = item['snippet']['title']
            position = item['snippet']['position']

            if title != 'Deleted video' and title != 'Private video':
                videos.append(PlaylistVideo(
                    video_id=video_id,
                    title=title,
                    position=position
                ))

        next_page_token = response.get('nextPageToken')
        if not next_page_token:
            break

    return videos


def get_video_metadata(video_id: str, api_key: str) -> Optional[VideoMetadata]:
    youtube = build('youtube', 'v3', developerKey=api_key)

    request = youtube.videos().list(
        part='snippet,contentDetails,statistics',
        id=video_id
    )
    response = request.execute()

    if not response.get('items'):
        return None

    item = response['items'][0]
    snippet = item['snippet']
    raw_description = snippet.get('description', '')

    return VideoMetadata(
        video_id=video_id,
        title=snippet['title'],
        description=raw_description,
        cleaned_description=clean_description(raw_description),
        channel_name=snippet['channelTitle'],
        channel_id=snippet['channelId'],
        published_at=snippet['publishedAt'],
        duration=item['contentDetails']['duration'],
        view_count=int(item.get('statistics', {}).get('viewCount', 0)),
        like_count=int(item.get('statistics', {}).get('likeCount', 0)),
        thumbnails=snippet.get('thumbnails', {}),
        tags=snippet.get('tags', []),
        timeline=extract_timeline_from_description(raw_description)
    )


def get_youtube_transcript(
    video_id: str,
    languages: list[str] = ['ko', 'en']
) -> tuple[list[TranscriptEntry], Optional[str], Optional[str]]:
    try:
        ytt_api = YouTubeTranscriptApi()
        fetched = ytt_api.fetch(video_id, languages=languages)

        entries = [
            TranscriptEntry(
                text=snippet.text,
                start=snippet.start,
                duration=snippet.duration
            )
            for snippet in fetched.snippets
        ]

        return entries, fetched.language_code, None

    except (TranscriptsDisabled, NoTranscriptFound) as e:
        return [], None, str(e)
    except Exception as e:
        return [], None, f"Unexpected error: {str(e)}"


def extract_video_transcript(
    url_or_id: str,
    api_key: Optional[str] = None,
    languages: list[str] = ['ko', 'en']
) -> VideoTranscript:
    video_id = extract_video_id(url_or_id)
    if not video_id:
        raise ValueError(f"Could not extract video ID from: {url_or_id}")

    api_key = api_key or os.getenv('YOUTUBE_API_KEY')
    if not api_key:
        raise ValueError("YOUTUBE_API_KEY not found in environment")

    print(f"Fetching metadata for video: {video_id}")
    metadata = get_video_metadata(video_id, api_key)
    if not metadata:
        raise ValueError(f"Video not found: {video_id}")

    print(f"  Title: {metadata.title}")
    print(f"  Channel: {metadata.channel_name}")

    print(f"Extracting transcript...")
    entries, language, error = get_youtube_transcript(video_id, languages)

    if entries:
        print(f"  Transcript extracted ({language}, {len(entries)} segments)")
        return VideoTranscript(
            metadata=metadata,
            transcript=entries,
            language=language,
            transcript_source="youtube_api"
        )
    else:
        print(f"  No transcript available: {error}")
        return VideoTranscript(
            metadata=metadata,
            transcript=[],
            transcript_source="none",
            error=error
        )


if __name__ == '__main__':
    import sys
    from dotenv import load_dotenv

    load_dotenv()

    if len(sys.argv) < 2:
        print("Usage: python video_transcript.py <VIDEO_URL_OR_ID>")
        sys.exit(1)

    result = extract_video_transcript(sys.argv[1])
    print(f"\nSuccess: {result.success}")
    if result.success:
        print(f"Language: {result.language}")
        print(f"Segments: {len(result.transcript)}")
        print(f"Full text preview: {result.full_text[:200]}...")
    else:
        print(f"Error: {result.error}")
