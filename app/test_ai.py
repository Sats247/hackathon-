import urllib.request
import os
import sys

from ai_validator import validate_image

def main():
    img_path = "pothole_test.jpg"
    print(f"Validating pothole...")
    result = validate_image(img_path)
    print(f"Result: {result}")

if __name__ == "__main__":
    main()
