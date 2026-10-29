# Книга рецептов

Контрольная работа №9: Django REST Framework + SimpleJWT + фронтенд на jQuery.

```
back/       Django-проект (core, accounts, recipes)
frontend/   index.html + js/main.js (AJAX через $.ajax)
```

## Запуск бэкенда

```bash
cd back
python -m venv venv
venv\Scripts\activate          # Linux/macOS: source venv/bin/activate
pip install -r reqs.txt
python manage.py migrate
python manage.py loaddata data
python manage.py runserver 5435
```

Админка: http://localhost:5435/admin/

## Запуск фронтенда

Фронтенд - статические файлы, бэкенд ждёт его запросы на `http://127.0.0.1:5435` (см. `API_URL` в `frontend/js/api.js`).
Во втором терминале из корня проекта:

```bash
python -m http.server 5500 --directory frontend
```

Сайт: http://127.0.0.1:5500

- Страницы: главная (`#/`), рецепт (`#/recipes/1`), создание (`#/recipes/new`),
  редактирование (`#/recipes/1/edit`), вход (`#/login`), регистрация (`#/register`).
- Все запросы - через `$.ajax`; токены хранятся в localStorage и уходят в заголовке `Authorization: Bearer`.
- Когда access-токен истекает, `authRequest` сам обновляет его через refresh и повторяет запрос.

## Тестовые аккаунты (из фикстуры)

| Логин   | Пароль        | Роль                          |
|---------|---------------|-------------------------------|
| admin   | admin12345    | суперпользователь (админка)   |
| almas   | StrongPass123 | автор: плов, бешбармак, карбонара |
| aigerim | StrongPass123 | автор: борщ, сырники, баурсаки |

Фикстура `back/recipes/fixtures/data.json` ссылается на картинки в `back/media/fixtures/*.jpg`,
поэтому папку `media/fixtures` нужно хранить вместе с проектом. API их не удаляет,
даже если удалить рецепт из фикстуры, - `loaddata data` можно запускать повторно.
Фото, загруженные через API, сохраняются в `media/recipes/` (в git не попадают).

## API

| Метод  | URL                              | Доступ                 | Ответ |
|--------|----------------------------------|------------------------|-------|
| POST   | `/accounts/register/`            | все                    | 201 / 400 |
| POST   | `/accounts/login/`               | все                    | 200 `{access, refresh}` / 401 |
| POST   | `/accounts/refresh/`             | все                    | 200 `{access}` / 401 |
| POST   | `/accounts/logout/`              | все (нужен `refresh`)  | 205 / 400 |
| GET    | `/api/recipes/`                  | все                    | 200 |
| POST   | `/api/recipes/`                  | с токеном              | 201 / 400 / 401 |
| GET    | `/api/recipes/{id}/`             | все                    | 200 / 404 |
| PATCH  | `/api/recipes/{id}/`             | только автор           | 200 / 400 / 401 / 403 / 404 |
| DELETE | `/api/recipes/{id}/`             | только автор           | 204 / 401 / 403 / 404 |
| GET    | `/api/recipes/{id}/comments/`    | все                    | 200 / 404 |
| POST   | `/api/recipes/{id}/comments/`    | с токеном              | 201 / 400 / 401 / 404 |

- Токен передаётся в заголовке `Authorization: Bearer <access>`. Access живёт 5 минут, refresh - 7 дней.
- В access-токене есть `user_id` и `username` - фронт берёт их оттуда для навбара и проверки авторства.
- Рецепт создаётся и редактируется через `multipart/form-data` (поле `image` - файл до 5 МБ).
  PATCH без нового фото можно отправлять и JSON-ом.
- Время готовки - от 1 до 10080 минут (неделя).
- Автор рецепта и комментария проставляется из `request.user`, присланное поле `author` игнорируется.
- Logout заносит refresh-токен в blacklist; access-токены фронт удаляет из localStorage.

## Тесты

```bash
cd back
python manage.py test
```

Ручная проверка API - коллекция **Almas** в Postman (environment `todolist`, сервер на порту 5435).
