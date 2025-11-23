# YouTube Video Location Extractor

Extract location information from YouTube videos using AI (Claude/Gemini). This tool extracts transcripts from YouTube videos and uses LLMs to identify specific, visitable locations featured in the content.

## Features

- Extract transcripts from YouTube videos using `youtube-transcript-api`
- **Google Cloud Speech-to-Text fallback** when YouTube transcript is unavailable
- Location extraction using **Claude** or **Gemini**
- **Google Maps geocoding** for latitude/longitude coordinates
- Automatic description cleaning (removes music credits, social links, etc.)
- Timeline extraction from video descriptions
- Output organized by YouTube channel

## Installation

```bash
cd sunrei-admin/tools/youtube-video-extractor

# Install dependencies with uv
uv sync
```

## Environment Setup

Create a `.env` file with the following variables:

```env
# Required
YOUTUBE_API_KEY=your_youtube_data_api_key

# For Claude provider
ANTHROPIC_API_KEY=your_anthropic_api_key

# For Gemini provider
GEMINI_API_KEY=your_gemini_api_key

# For geocoding (required unless --skip-geocoding)
GOOGLE_MAPS_API_KEY=your_google_maps_api_key

# For Google Cloud STT fallback (optional)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

### API Key Setup

1. **YouTube Data API**: Get from [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. **Anthropic API**: Get from [Anthropic Console](https://console.anthropic.com/)
3. **Gemini API**: Get from [Google AI Studio](https://makersuite.google.com/app/apikey)
4. **Google Maps API**: Get from [Google Cloud Console](https://console.cloud.google.com/apis/credentials) - Enable "Places API"
5. **Google Cloud STT**: Create a service account in Google Cloud Console with Speech-to-Text API enabled

## Usage

### Basic Usage

```bash
# Process a single video with Claude (default)
uv run python main.py "https://youtube.com/watch?v=VIDEO_ID"

# Process multiple videos
uv run python main.py URL1 URL2 URL3

# Use Gemini instead of Claude
uv run python main.py URL --provider gemini
```

### Options

```
Arguments:
  urls                    YouTube video URLs or video IDs

Options:
  --provider {claude,gemini}
                          AI provider for location extraction (default: claude)
  --model MODEL           Specific model to use (uses provider default if not specified)
  --output-dir DIR        Base directory for output files (default: output)
  --cache-dir DIR         Directory for intermediate cache files (default: cache)
  --audio-cache-dir DIR   Directory to cache downloaded audio for STT (default: audio_cache)
  --fallback-language LANG
                          Language code for STT fallback (default: ko)
  --skip-stt-fallback     Skip Google Cloud STT fallback if transcript unavailable
  --skip-geocoding        Skip Google Maps geocoding for locations
  --geocode-language LANG Language code for geocoding results (default: ko)
```

### Examples

```bash
# Process video with specific output directory
uv run python main.py "https://youtube.com/watch?v=abc123" --output-dir ./my_data

# Process video without STT fallback
uv run python main.py URL --skip-stt-fallback

# Process Japanese video with Gemini
uv run python main.py URL --provider gemini --fallback-language ja

# Use a specific Claude model
uv run python main.py URL --provider claude --model claude-3-5-sonnet-20241022
```

## Output Format

Output files are saved as JSON in `{output_dir}/{channel_name}/{video_id}.json`:

```json
{
  "channel_name": "Channel Name",
  "channel_id": "UC...",
  "video_id": "abc123",
  "video_title": "Video Title",
  "video_url": "https://www.youtube.com/watch?v=abc123",
  "video_summary": "Brief summary of the video content",
  "locations": [
    {
      "name": "Restaurant Name",
      "query": "Restaurant Name, Shibuya, Tokyo, Japan",
      "description": "Description in transcript language",
      "timestamp": 120,
      "video_url_with_timestamp": "https://youtube.com/watch?v=abc123&t=120s",
      "latitude": 35.6595,
      "longitude": 139.7004,
      "address": "1-2-3 Shibuya, Shibuya City, Tokyo, Japan",
      "google_maps_id": "ChIJ...",
      "google_maps_name": "Restaurant Name"
    }
  ],
  "metadata": {
    "provider": "claude",
    "model": "claude-sonnet-4-20250514",
    "transcript_source": "youtube_api",
    "transcript_language": "ko"
  },
  "extracted_at": "2025-01-01T00:00:00.000000"
}
```

## How It Works

1. **Metadata Extraction**: Fetches video title, description, channel info via YouTube Data API
2. **Description Cleaning**: Removes music credits, social links, promotional text
3. **Transcript Extraction**:
   - First tries `youtube-transcript-api`
   - Falls back to Google Cloud STT if unavailable
4. **Location Extraction**: Uses Claude/Gemini to identify featured locations
   - Focuses on video concept (e.g., if about "Shibuya restaurants", only extracts Shibuya restaurants)
   - Filters out background locations, passing scenery
   - Extracts timestamp of first meaningful mention
5. **Geocoding**: Uses Google Maps Places API to get coordinates
   - Adds latitude, longitude, address for each location
   - Includes Google Maps place ID for integration

## Caching & Resume

The tool saves intermediate results to avoid re-processing if interrupted:

```
cache/
├── {video_id}_transcript.json   # Saved after transcript extraction
└── {video_id}_locations.json    # Saved after LLM extraction (before geocoding)
```

**Benefits:**
- If process is interrupted, re-running will skip completed steps
- Saves API costs (no duplicate LLM calls)
- Transcript cache avoids YouTube API rate limits
- Locations cache preserves LLM extraction results

**Cache behavior:**
- Step 1-2: If `{video_id}_transcript.json` exists, skip transcript extraction
- Step 3: If `{video_id}_locations.json` exists, skip LLM extraction
- Step 4: If locations already have lat/lng, skip geocoding

**Clear cache to re-process:**
```bash
rm -rf cache/
```

## Individual Module Usage

### Extract Transcript Only

```bash
uv run python video_transcript.py "https://youtube.com/watch?v=VIDEO_ID"
```

### Extract Locations from Existing Transcript

```bash
uv run python extract_locations.py VIDEO_URL [provider] [model]
```

### Test Audio Transcription

```bash
uv run python audio_transcription.py VIDEO_ID [language_code]
```

### Geocode Existing Output

```bash
uv run python geocode_locations.py output/channel_name/video_id.json
```

## Supported Languages

For STT fallback, the following language codes are supported:

| Code | Language |
|------|----------|
| `ko` | Korean |
| `ja` | Japanese |
| `en` | English |
| `zh` | Chinese (Simplified) |
| `zh-tw` | Chinese (Traditional) |
| `es` | Spanish |
| `fr` | French |
| `de` | German |

## Troubleshooting

### No transcript available

If YouTube doesn't provide a transcript:
1. Ensure `GOOGLE_APPLICATION_CREDENTIALS` is set for STT fallback
2. Check that Speech-to-Text API is enabled in Google Cloud
3. Try specifying the correct language with `--fallback-language`

### yt-dlp not found

Install yt-dlp for audio download:
```bash
pip install yt-dlp
# or
brew install yt-dlp
```

### Rate limiting

YouTube may rate-limit transcript requests. The tool includes caching to avoid re-fetching transcripts.

### Geocoding not working

1. Ensure `GOOGLE_MAPS_API_KEY` is set in your `.env` file
2. Enable "Places API" in [Google Cloud Console](https://console.cloud.google.com/apis/library/places-backend.googleapis.com)
3. Check that billing is enabled for your Google Cloud project
4. Use `--skip-geocoding` to skip geocoding if not needed
