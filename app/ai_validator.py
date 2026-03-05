import os
import base64
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', '')

PROMPT = (
    "You are a civic issue validator. Look at this image. "
    "Is it a real photo of a civic infrastructure problem like a pothole, broken streetlight, "
    "garbage pile, or sewage overflow? "
    "Answer only: Valid or Invalid. "
    "If it is a selfie, meme, AI-generated image, or unrelated photo, answer Invalid."
)


def validate_image(image_path: str) -> str:
    """Returns 'Valid', 'Invalid', or 'Error'."""
    if not GEMINI_API_KEY:
        return 'Valid'  # Allow submission if no API key configured

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
            ]
        )
        answer = response.text.strip().lower()
        if 'invalid' in answer:
            return 'Invalid'
        return 'Valid'

    except ImportError:
        # Fall back to old SDK if new one not installed
        return _validate_legacy(image_path)
    except Exception as e:
        print(f"[AI Validator] Error: {e}")
        return 'Valid'  # Fail open


def _validate_legacy(image_path: str) -> str:
    """Fallback using deprecated google-generativeai SDK."""
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
        answer = response.text.strip().lower()
        if 'invalid' in answer:
            return 'Invalid'
        return 'Valid'
    except Exception as e:
        print(f"[AI Validator legacy] Error: {e}")
        return 'Valid'
