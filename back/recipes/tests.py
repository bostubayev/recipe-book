import shutil
import tempfile
from io import BytesIO
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from recipes.models import Comment, Recipe


def make_image(name='dish.png'):
    buffer = BytesIO()
    Image.new('RGB', (10, 10), 'orange').save(buffer, 'PNG')
    return SimpleUploadedFile(name, buffer.getvalue(), content_type='image/png')


class BaseApiTestCase(APITestCase):
    """Общее для тестов API: временная media, автор + второй пользователь, рецепт, JWT в заголовке."""

    @classmethod
    def setUpClass(cls):
        # картинки из тестов пишем во временную папку, а не в настоящий media/
        cls.temp_media = tempfile.mkdtemp()
        cls.media_override = override_settings(MEDIA_ROOT=cls.temp_media)
        cls.media_override.enable()
        super().setUpClass()

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        cls.media_override.disable()
        shutil.rmtree(cls.temp_media, ignore_errors=True)

    def setUp(self):
        User = get_user_model()
        self.author = User.objects.create_user(username='author', password='pass12345')
        self.other = User.objects.create_user(username='other', password='pass12345')
        self.recipe = Recipe.objects.create(
            title='Плов', description='Узбекский плов', ingredients='Рис\nМясо',
            cooking_time=90, image=make_image(), author=self.author,
        )

    def auth(self, user):
        token = RefreshToken.for_user(user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def create_recipe(self, **fields):
        data = dict(title='Борщ', description='-', ingredients='Свекла', cooking_time=60,
                    image=make_image(), author=self.author)
        data.update(fields)
        return Recipe.objects.create(**data)


class RecipeApiTests(BaseApiTestCase):
    def test_list_is_public_and_has_list_fields(self):
        response = self.client.get('/api/recipes/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            set(response.data[0]),
            {'id', 'title', 'author', 'cooking_time', 'created_at', 'image'},
        )

    def test_list_sorted_by_created_at_desc(self):
        newer = self.create_recipe()
        response = self.client.get('/api/recipes/')
        self.assertEqual(response.data[0]['id'], newer.id)

    def test_detail_returns_all_fields(self):
        response = self.client.get(f'/api/recipes/{self.recipe.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['ingredients'], 'Рис\nМясо')
        self.assertEqual(response.data['author']['username'], 'author')

    def test_detail_not_found(self):
        response = self.client.get('/api/recipes/9999/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_create_requires_auth(self):
        response = self.client.post('/api/recipes/', {'title': 'X'})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_create_sets_author_from_request(self):
        self.auth(self.other)
        response = self.client.post('/api/recipes/', {
            'title': 'Лагман', 'description': 'Суп', 'ingredients': 'Лапша\n\nМясо\n',
            'cooking_time': 60, 'image': make_image(), 'author': self.author.id,
        }, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['author']['id'], self.other.id)
        self.assertEqual(response.data['ingredients'], 'Лапша\nМясо')

    def test_create_rejects_blank_title(self):
        self.auth(self.author)
        response = self.client.post('/api/recipes/', {
            'title': '   ', 'description': 'd', 'ingredients': 'x',
            'cooking_time': 10, 'image': make_image(),
        }, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('title', response.data)

    def test_create_validation_error(self):
        self.auth(self.author)
        response = self.client.post('/api/recipes/', {'title': ''}, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('image', response.data)

    def test_author_can_patch(self):
        self.auth(self.author)
        response = self.client.patch(f'/api/recipes/{self.recipe.id}/', {'cooking_time': 120})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['cooking_time'], 120)

    def test_other_user_cannot_patch_or_delete(self):
        self.auth(self.other)
        url = f'/api/recipes/{self.recipe.id}/'
        self.assertEqual(self.client.patch(url, {'title': 'Взлом'}).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.delete(url).status_code, status.HTTP_403_FORBIDDEN)

    def test_put_not_allowed(self):
        self.auth(self.author)
        response = self.client.put(f'/api/recipes/{self.recipe.id}/', {})
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_author_can_delete(self):
        self.auth(self.author)
        response = self.client.delete(f'/api/recipes/{self.recipe.id}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Recipe.objects.exists())

    def test_delete_removes_image_file(self):
        storage, name = self.recipe.image.storage, self.recipe.image.name
        self.assertTrue(storage.exists(name))
        self.auth(self.author)
        self.client.delete(f'/api/recipes/{self.recipe.id}/')
        self.assertFalse(storage.exists(name))

    def test_patch_with_new_image_removes_old_file(self):
        storage, old_name = self.recipe.image.storage, self.recipe.image.name
        self.auth(self.author)
        response = self.client.patch(
            f'/api/recipes/{self.recipe.id}/', {'image': make_image('new.png')}, format='multipart',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(storage.exists(old_name))
        self.recipe.refresh_from_db()
        self.assertTrue(storage.exists(self.recipe.image.name))

    def test_patch_without_image_keeps_file(self):
        storage, name = self.recipe.image.storage, self.recipe.image.name
        self.auth(self.author)
        self.client.patch(f'/api/recipes/{self.recipe.id}/', {'title': 'Плов 2'}, format='multipart')
        self.assertTrue(storage.exists(name))


    def test_cooking_time_upper_bound(self):
        self.auth(self.author)
        url = f'/api/recipes/{self.recipe.id}/'
        self.assertEqual(self.client.patch(url, {'cooking_time': 7 * 24 * 60}).status_code, status.HTTP_200_OK)
        response = self.client.patch(url, {'cooking_time': 10 ** 12})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('cooking_time', response.data)

    def test_image_too_big(self):
        self.auth(self.author)
        # проверяем лимит, не создавая настоящий файл на 5 МБ
        with mock.patch('recipes.validators.MAX_IMAGE_SIZE_MB', 0):
            response = self.client.patch(
                f'/api/recipes/{self.recipe.id}/', {'image': make_image()}, format='multipart',
            )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('image', response.data)

    def test_delete_keeps_fixture_image(self):
        storage = self.recipe.image.storage
        fixture_image = storage.save('fixtures/plov.png', make_image())
        recipe = self.create_recipe(image=fixture_image)
        self.auth(self.author)
        self.client.delete(f'/api/recipes/{recipe.id}/')
        self.assertTrue(storage.exists(fixture_image))


    def test_model_level_delete_removes_image(self):
        # так удаляет админка: без ViewSet, напрямую через модель
        storage, name = self.recipe.image.storage, self.recipe.image.name
        self.recipe.delete()
        self.assertFalse(storage.exists(name))

    def test_deleting_user_removes_recipe_images(self):
        storage, name = self.recipe.image.storage, self.recipe.image.name
        self.author.delete()
        self.assertFalse(storage.exists(name))

    def test_model_level_image_replace_removes_old_file(self):
        storage, old_name = self.recipe.image.storage, self.recipe.image.name
        self.recipe.image = make_image('new.png')
        self.recipe.save()
        self.assertFalse(storage.exists(old_name))
        self.assertTrue(storage.exists(self.recipe.image.name))


class CommentApiTests(BaseApiTestCase):
    def setUp(self):
        super().setUp()
        self.url = f'/api/recipes/{self.recipe.id}/comments/'

    def test_list_is_public_and_sorted_desc(self):
        first = Comment.objects.create(recipe=self.recipe, author=self.other, text='Первый')
        second = Comment.objects.create(recipe=self.recipe, author=self.other, text='Второй')
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([c['id'] for c in response.data], [second.id, first.id])
        self.assertEqual(set(response.data[0]), {'id', 'text', 'author', 'created_at'})

    def test_list_only_this_recipe(self):
        Comment.objects.create(recipe=self.create_recipe(), author=self.other, text='Чужой')
        self.assertEqual(self.client.get(self.url).data, [])

    def test_create_requires_auth(self):
        response = self.client.post(self.url, {'text': 'Вкусно'})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_any_user_can_comment_and_author_is_request_user(self):
        self.auth(self.other)
        response = self.client.post(self.url, {'text': 'Вкусно!', 'author': self.author.id, 'recipe': 999})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['author']['username'], 'other')
        comment = Comment.objects.get()
        self.assertEqual((comment.recipe, comment.author), (self.recipe, self.other))

    def test_create_blank_text(self):
        self.auth(self.other)
        response = self.client.post(self.url, {'text': '   '})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('text', response.data)

    def test_create_too_long_text(self):
        self.auth(self.other)
        response = self.client.post(self.url, {'text': 'а' * 1001})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('text', response.data)

    def test_comments_of_missing_recipe(self):
        self.assertEqual(self.client.get('/api/recipes/9999/comments/').status_code, status.HTTP_404_NOT_FOUND)
        self.auth(self.other)
        response = self.client.post('/api/recipes/9999/comments/', {'text': 'x'})
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
