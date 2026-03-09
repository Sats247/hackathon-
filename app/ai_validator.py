import os
import json
import base64
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', '')

PROMPT = """You are a civic infrastructure issue photo validator for an Indian municipal reporting system.

Analyze this image and classify it into EXACTLY ONE of these categories:

1. VALID — A real photograph of a civic infrastructure problem:
   - Potholes, cracked roads, broken footpaths
   - Broken/non-functioning streetlights
   - Garbage piles, illegal dumping, overflowing bins
   - Sewage overflow, open drains, waterlogging
   - Damaged public property (benches, signs, railings)
   - Fallen trees blocking roads
   - Construction debris on public roads

2. INVALID — Reject if ANY of these apply:
   - Selfie or portrait photo (person's face is the main subject)
   - Screenshot of another app, website, or social media post
   - Meme, cartoon, illustration, or digitally generated art
   - AI-generated or computer-rendered image
   - Photo of food, pets, personal items, or indoor spaces
   - Blurry/unrecognizable image where the issue cannot be identified
   - Photo of a person, group photo, or event photo
   - Landscape/nature photo without visible infrastructure issue
   - Photo of a document, ID card, or text
   - Random object not related to civic infrastructure

Respond in this exact JSON format and nothing else:
{"result": "Valid" or "Invalid", "reason": "one-line explanation of your decision", "confidence": "high" or "medium" or "low"}
"""


def validate_image(image_path: str) -> dict:
    """
    Validate whether an uploaded photo shows a real civic infrastructure issue.

    Args:
        image_path: Absolute path to the image file on disk.

    Returns:
        dict with keys:
          - result: 'Valid', 'Invalid', or 'Error'
          - reason: Human-readable explanation (empty string on error)
          - confidence: 'high', 'medium', or 'low' (empty string on error)
    """
    if not GEMINI_API_KEY:
        return {'result': 'Valid', 'reason': 'No API key configured — skipping validation', 'confidence': ''}

    try:
        import google.genai as genai
        client = genai.Client(api_key=GEMINI_API_KEY)

        with open(image_path, 'rb') as f:
            image_data = f.read()

        ext = os.path.splitext(image_path)[1].lower()
        mime_map = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png'}
        mime_type = mime_map.get(ext, 'image/jpeg')

        from google.genai import types
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=[
                PROMPT,
                types.Part.from_bytes(data=image_data, mime_type=mime_type)
            ],
            config=types.GenerateContentConfig(
                response_mime_type='application/json'
            )
        )

        # Parse structured JSON response
        answer_text = response.text.strip()
        try:
            parsed = json.loads(answer_text)
            result = parsed.get('result', 'Valid')
            reason = parsed.get('reason', '')
            confidence = parsed.get('confidence', '')

            # Normalize result
            if 'invalid' in result.lower():
                return {'result': 'Invalid', 'reason': reason, 'confidence': confidence}
            return {'result': 'Valid', 'reason': reason, 'confidence': confidence}
        except (json.JSONDecodeError, AttributeError):
            # Fallback: if JSON parsing fails, check for Invalid in raw text
            if 'invalid' in answer_text.lower():
                return {'result': 'Invalid', 'reason': 'Image does not appear to show a civic issue', 'confidence': ''}
            return {'result': 'Valid', 'reason': '', 'confidence': ''}

    except ImportError:
        # Fall back to old SDK if new one not installed
        return _validate_legacy(image_path)
    except Exception as e:
        print(f"[AI Validator] Error: {e}")
        return {'result': 'Valid', 'reason': 'Validation error — allowing submission', 'confidence': ''}  # Fail open


def _validate_legacy(image_path: str) -> dict:
    """
    Fallback validator using the deprecated google-generativeai SDK.

    Args:
        image_path: Absolute path to the image file on disk.

    Returns:
        dict with keys: result, reason, confidence
    """
    try:
        import google.generativeai as genai
        import warnings
        warnings.filterwarnings('ignore')
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel('gemini-1.5-flash')
        with open(image_path, 'rb') as f:
            image_data = f.read()
        ext = os.path.splitext(image_path)[1].lower()
        mime_map = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png'}
        mime_type = mime_map.get(ext, 'image/jpeg')
        image_part = {'mime_type': mime_type, 'data': base64.b64encode(image_data).decode('utf-8')}
        response = model.generate_content([PROMPT, image_part])
        answer = response.text.strip()

        try:
            parsed = json.loads(answer)
            result = parsed.get('result', 'Valid')
            reason = parsed.get('reason', '')
            confidence = parsed.get('confidence', '')
            if 'invalid' in result.lower():
                return {'result': 'Invalid', 'reason': reason, 'confidence': confidence}
            return {'result': 'Valid', 'reason': reason, 'confidence': confidence}
        except (json.JSONDecodeError, AttributeError):
            if 'invalid' in answer.lower():
                return {'result': 'Invalid', 'reason': 'Image does not appear to show a civic issue', 'confidence': ''}
            return {'result': 'Valid', 'reason': '', 'confidence': ''}
    except Exception as e:
        print(f"[AI Validator legacy] Error: {e}")
        return {'result': 'Valid', 'reason': 'Validation error — allowing submission', 'confidence': ''}
