import jwt
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase


class AuthApiTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='chef', password='StrongPass123')

    def login(self, username='chef', password='StrongPass123'):
        return self.client.post('/accounts/login/', {'username': username, 'password': password})

    def test_register_creates_user_with_hashed_password(self):
        response = self.client.post('/accounts/register/', {
            'username': 'newcook', 'password': 'StrongPass123',
            'email': 'cook@example.com', 'first_name': 'Иван', 'last_name': 'Петров',
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertNotIn('password', response.data)
        user = get_user_model().objects.get(username='newcook')
        self.assertTrue(user.check_password('StrongPass123'))

    def test_register_validation(self):
        self.assertEqual(
            self.client.post('/accounts/register/', {'username': 'chef', 'password': 'StrongPass123'}).status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        response = self.client.post('/accounts/register/', {'username': 'weak', 'password': '123'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('password', response.data)

    def test_register_username_is_case_insensitive(self):
        response = self.client.post('/accounts/register/', {'username': 'CHEF', 'password': 'StrongPass123'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('username', response.data)

    def test_register_rejects_password_similar_to_username(self):
        response = self.client.post('/accounts/register/', {'username': 'ivanovich', 'password': 'ivanovich1'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('password', response.data)

    def test_register_ignores_stale_bearer_header(self):
        self.client.credentials(HTTP_AUTHORIZATION='Bearer expired.or.broken')
        response = self.client.post('/accounts/register/', {'username': 'cook2', 'password': 'StrongPass123'})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_login_returns_tokens_with_username(self):
        response = self.login()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = jwt.decode(response.data['access'], options={'verify_signature': False})
        self.assertEqual(payload['username'], 'chef')
        self.assertIn('refresh', response.data)

    def test_login_wrong_password(self):
        self.assertEqual(self.login(password='wrong').status_code, status.HTTP_401_UNAUTHORIZED)

    def test_refresh_returns_new_access(self):
        refresh = self.login().data['refresh']
        response = self.client.post('/accounts/refresh/', {'refresh': refresh})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = jwt.decode(response.data['access'], options={'verify_signature': False})
        self.assertEqual(payload['username'], 'chef')

    def test_logout_blacklists_refresh(self):
        refresh = self.login().data['refresh']
        response = self.client.post('/accounts/logout/', {'refresh': refresh})
        self.assertEqual(response.status_code, status.HTTP_205_RESET_CONTENT)
        response = self.client.post('/accounts/refresh/', {'refresh': refresh})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_without_token(self):
        self.assertEqual(self.client.post('/accounts/logout/', {}).status_code, status.HTTP_400_BAD_REQUEST)

    def test_logout_works_with_stale_bearer_header(self):
        refresh = self.login().data['refresh']
        self.client.credentials(HTTP_AUTHORIZATION='Bearer expired.or.broken')
        response = self.client.post('/accounts/logout/', {'refresh': refresh})
        self.assertEqual(response.status_code, status.HTTP_205_RESET_CONTENT)
