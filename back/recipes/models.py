from django.contrib.auth import get_user_model
from django.core.files.storage import default_storage
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from recipes.validators import validate_image_size

RECIPE_IMAGES_DIR = 'recipes'


class Recipe(models.Model):
    title = models.CharField(max_length=200, verbose_name='Название')
    description = models.TextField(verbose_name='Описание')
    ingredients = models.TextField(verbose_name='Ингредиенты', help_text='Каждый ингредиент с новой строки')
    cooking_time = models.PositiveIntegerField(
        verbose_name='Время готовки (мин)',
        # верхняя граница - неделя: защита от опечаток вроде 1000000000 минут
        validators=[MinValueValidator(1), MaxValueValidator(7 * 24 * 60)],
    )
    image = models.ImageField(
        upload_to=RECIPE_IMAGES_DIR,
        validators=[validate_image_size],
        verbose_name='Фото блюда',
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Дата создания')
    author = models.ForeignKey(
        get_user_model(),
        on_delete=models.CASCADE,
        related_name='recipes',
        verbose_name='Автор',
    )

    class Meta:
        # -id нужен как запасной ключ, если два рецепта созданы в одну и ту же секунду
        ordering = ['-created_at', '-id']
        verbose_name = 'Рецепт'
        verbose_name_plural = 'Рецепты'

    def __str__(self):
        return f'{self.id} - {self.title}'

    @staticmethod
    def delete_image_file(name):
        # удаляем только фото, загруженные пользователями (upload_to);
        # картинки фикстур лежат в media/fixtures/ и нужны для повторного loaddata
        if name.startswith(f'{RECIPE_IMAGES_DIR}/'):
            default_storage.delete(name)


class Comment(models.Model):
    text = models.TextField(max_length=1000, verbose_name='Текст')
    recipe = models.ForeignKey(
        Recipe,
        on_delete=models.CASCADE,
        related_name='comments',
        verbose_name='Рецепт',
    )
    author = models.ForeignKey(
        get_user_model(),
        on_delete=models.CASCADE,
        related_name='comments',
        verbose_name='Автор',
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Дата создания')

    class Meta:
        ordering = ['-created_at', '-id']
        verbose_name = 'Комментарий'
        verbose_name_plural = 'Комментарии'

    def __str__(self):
        return self.text[:20]
