from django.core.exceptions import ValidationError

MAX_IMAGE_SIZE_MB = 5


def validate_image_size(image):
    if image.size > MAX_IMAGE_SIZE_MB * 1024 * 1024:
        raise ValidationError(f'Размер фото не должен превышать {MAX_IMAGE_SIZE_MB} МБ')
