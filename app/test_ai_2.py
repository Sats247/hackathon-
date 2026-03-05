from PIL import Image
from ai_validator import validate_image

img = Image.new('RGB', (100, 100), color='red')
img.save('test_color.jpg')
result = validate_image('test_color.jpg')
print(f'AI Validation Result for solid red image: {result}')
