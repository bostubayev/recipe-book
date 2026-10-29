// ================= Утилиты =================

//Экранирование пользовательского текста перед вставкой в HTML (защита от XSS)
function escapeHtml(value) {
    return $('<div>').text(value ?? '').html()
}

function formatDate(iso, withTime = false) {
    const options = { day: 'numeric', month: 'long', year: 'numeric' }
    if (withTime) {
        options.hour = '2-digit'
        options.minute = '2-digit'
    }
    return new Date(iso).toLocaleString('ru-RU', options)
}

//90 -> "1 ч 30 мин"
function formatCookingTime(minutes) {
    const hours = Math.floor(minutes / 60)
    const rest = minutes % 60
    if (!hours) return `${rest} мин`
    return rest ? `${hours} ч ${rest} мин` : `${hours} ч`
}

function displayName(user) {
    const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ')
    return fullName || user.username
}

//Аватар с инициалом и цветом, который зависит от username
function avatarHtml(user, size = '') {
    const colors = ['#e8590c', '#2f9e44', '#1971c2', '#9c36b5', '#e03131', '#0c8599', '#f08c00']
    const name = user.username || '?'
    const hash = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0)
    const letter = (user.first_name || name)[0]
    return `<span class="avatar ${size}" style="background:${colors[hash % colors.length]}">${escapeHtml(letter)}</span>`
}

function toast(message, type = 'success') {
    const icons = { success: 'bi-check-circle-fill', danger: 'bi-exclamation-octagon-fill', info: 'bi-info-circle-fill' }
    const $toast = $(`
        <div class="toast align-items-center text-bg-${type}" role="status" aria-live="polite">
            <div class="d-flex">
                <div class="toast-body"><i class="bi ${icons[type]} me-2"></i>${escapeHtml(message)}</div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        </div>
    `)
    $('#toasts').append($toast)
    $toast.on('hidden.bs.toast', () => $toast.remove())
    new bootstrap.Toast($toast[0], { delay: 3500 }).show()
}

//Блокировка кнопки на время запроса, чтобы нельзя было отправить форму несколько раз
function setLoading($button, isLoading, text = 'Отправка...') {
    if (isLoading) {
        $button.data('original-html', $button.html())
        $button.prop('disabled', true)
            .html(`<span class="spinner-border spinner-border-sm me-2"></span>${text}`)
    } else {
        $button.prop('disabled', false).html($button.data('original-html'))
    }
}

function clearFormErrors($form) {
    $form.find('.is-invalid').removeClass('is-invalid')
    $form.find('.invalid-feedback, .form-alert').remove()
}

function showFormAlert($form, text) {
    clearFormErrors($form)
    $form.prepend(`<div class="alert alert-danger form-alert">${escapeHtml(text)}</div>`)
}

//Ошибки валидации DRF ({field: [messages]}) - под соответствующие поля формы
function showFormErrors($form, xhr) {
    const errors = xhr.responseJSON
    if (xhr.status !== 400 || !errors || typeof errors !== 'object') {
        showFormAlert($form, requestErrorText(xhr))
        return
    }

    clearFormErrors($form)
    const common = []
    Object.entries(errors).forEach(([field, messages]) => {
        const text = [].concat(messages).join(' ')
        const $input = $form.find(`[name="${field}"]`)
        if ($input.length) {
            $input.addClass('is-invalid')
            $input.closest('.field').append(`<div class="invalid-feedback d-block">${escapeHtml(text)}</div>`)
        } else {
            common.push(text)
        }
    })
    if (common.length) {
        $form.prepend(`<div class="alert alert-danger form-alert">${escapeHtml(common.join(' '))}</div>`)
    }
}

//Ошибка валидации на фронте в том же формате, что и ответ DRF
function formError(errors) {
    return { status: 400, responseJSON: errors }
}

//Общая обработка отправки формы:
//- повторная отправка невозможна, пока идёт запрос (кнопка и поля заблокированы)
//- ошибки из API (или formError) показываются под полями
//- 401 не показываем: authRequest уже разлогинил и перерисовал страницу (session:expired)
function handleSubmit(selector, loadingText, handler) {
    $(document).on('submit', selector, async function (event) {
        event.preventDefault()
        const $form = $(this)
        const $button = $form.find('button[type="submit"]')
        const $fields = $form.find('input, textarea').not(':disabled')

        if ($button.prop('disabled')) return

        setLoading($button, true, loadingText)
        //handler синхронно (до первого await) читает значения формы - поля блокируем уже после
        const request = handler($form)
        $fields.prop('disabled', true)
        try {
            await request
        } catch (xhr) {
            if (xhr.status !== 401) {
                showFormErrors($form, xhr)
            }
        } finally {
            $fields.prop('disabled', false)
            setLoading($button, false)
        }
    })
}

function requestErrorText(xhr) {
    if (xhr.status === 0) return 'Сервер недоступен. Проверьте, что бэкенд запущен.'
    if (xhr.responseJSON?.detail) return xhr.responseJSON.detail
    return `Ошибка ${xhr.status}`
}

function updateNavbar() {
    const user = isAuthenticated() ? getCurrentUser() : null

    $('.auth-only').toggleClass('d-none', !user)
    $('.guest-only').toggleClass('d-none', !!user)

    if (user) {
        $('#current-username').text(user.username)
        $('#nav-avatar').replaceWith($(avatarHtml(user, 'avatar-sm')).attr('id', 'nav-avatar'))
    }
}

function emptyState(icon, title, text, action = '') {
    return `
        <div class="empty-state">
            <i class="bi ${icon}"></i>
            <h3 class="mt-3 text-dark">${title}</h3>
            <p>${text}</p>
            ${action}
        </div>
    `
}

// ================= Роутер =================

//Страницы живут в hash (#/recipes/5), поэтому работают кнопка "назад" и перезагрузка
const routes = [
    [/^\/?$/, () => recipeList()],
    [/^\/recipes\/new$/, () => recipeForm()],
    [/^\/recipes\/(\d+)$/, id => recipeDetail(id)],
    [/^\/recipes\/(\d+)\/edit$/, id => recipeForm(id)],
    [/^\/login$/, () => loginPage()],
    [/^\/register$/, () => registerPage()],
]

function navigate(path) {
    if (location.hash === '#' + path) {
        router()
    } else {
        location.hash = path
    }
}

let routeId = 0

//Страница запоминает маршрут в начале: если пока шёл запрос пользователь ушёл
//на другую страницу, устаревший ответ не должен перерисовать новую
function routeGuard() {
    const id = routeId
    return () => id !== routeId
}

function router() {
    const path = location.hash.replace(/^#/, '') || '/'
    const container = $('#container')

    routeId++
    container.empty()
    window.scrollTo(0, 0)
    bootstrap.Collapse.getInstance('#main-nav')?.hide()

    for (const [pattern, page] of routes) {
        const match = path.match(pattern)
        if (match) {
            page(...match.slice(1))
            return
        }
    }
    container.html(emptyState('bi-signpost-split', 'Страница не найдена', 'Такой страницы нет.',
        '<a class="btn btn-accent" href="#/">На главную</a>'))
}

// ================= Главная: список рецептов =================

async function recipeList() {
    const isStale = routeGuard()
    const container = $('#container')
    container.html(`
        <section class="hero">
            <h1 class="mb-3">Готовим с удовольствием</h1>
            <p class="mb-4">Собирайте любимые рецепты, делитесь своими и узнавайте, что готовят другие.</p>
            ${isAuthenticated()
                ? '<a class="btn btn-accent btn-lg" href="#/recipes/new"><i class="bi bi-plus-lg"></i> Добавить рецепт</a>'
                : '<a class="btn btn-light btn-lg" href="#/register">Присоединиться</a>'}
        </section>
        <div class="section-title">
            <h2 class="m-0">Свежие рецепты</h2>
            <span class="text-secondary" id="recipes-count"></span>
        </div>
        <div class="row row-cols-1 row-cols-sm-2 row-cols-lg-3 g-4" id="recipe-grid">
            ${'<div class="col"><div class="skeleton" style="height:340px"></div></div>'.repeat(3)}
        </div>
    `)

    let recipes
    try {
        recipes = await authRequest({ url: '/api/recipes/', method: 'GET' })
    } catch (xhr) {
        if (!isStale()) {
            $('#recipe-grid').replaceWith(emptyState('bi-wifi-off', 'Не удалось загрузить рецепты', requestErrorText(xhr)))
        }
        return
    }
    if (isStale()) return

    const grid = $('#recipe-grid')
    $('#recipes-count').text(recipes.length ? `${recipes.length} шт.` : '')

    if (!recipes.length) {
        grid.replaceWith(emptyState('bi-egg-fried', 'Рецептов пока нет', 'Станьте первым, кто поделится рецептом!'))
        return
    }

    //Кнопок редактирования и удаления на карточках нет - только на странице рецепта
    grid.html(recipes.map(recipe => `
        <div class="col">
            <a class="recipe-card" href="#/recipes/${recipe.id}">
                <img class="card-img" src="${escapeHtml(recipe.image)}" alt="${escapeHtml(recipe.title)}" loading="lazy">
                <div class="card-content">
                    <h3 class="card-title">${escapeHtml(recipe.title)}</h3>
                    <div class="author-line">${avatarHtml(recipe.author, 'avatar-sm')} ${escapeHtml(displayName(recipe.author))}</div>
                    <div class="card-footer-line">
                        <span class="time-badge"><i class="bi bi-clock"></i>${formatCookingTime(recipe.cooking_time)}</span>
                        <span><i class="bi bi-calendar3 me-1"></i>${formatDate(recipe.created_at)}</span>
                    </div>
                </div>
            </a>
        </div>
    `).join(''))
}

// ================= Страница рецепта =================

async function recipeDetail(recipeId) {
    const isStale = routeGuard()
    const container = $('#container')
    container.html('<div class="skeleton" style="height:420px"></div>')

    //комментарии не зависят от рецепта - запрашиваем параллельно
    const commentsRequest = authRequest({ url: `/api/recipes/${recipeId}/comments/`, method: 'GET' })

    let recipe
    try {
        recipe = await authRequest({ url: `/api/recipes/${recipeId}/`, method: 'GET' })
    } catch (xhr) {
        commentsRequest.catch(() => {})
        if (!isStale()) {
            container.html(xhr.status === 404
                ? emptyState('bi-journal-x', 'Рецепт не найден', 'Возможно, его удалили.', '<a class="btn btn-accent" href="#/">К рецептам</a>')
                : emptyState('bi-wifi-off', 'Не удалось загрузить рецепт', requestErrorText(xhr)))
        }
        return
    }
    if (isStale()) {
        commentsRequest.catch(() => {})
        return
    }

    const isAuthor = isAuthenticated() && getCurrentUser().id === String(recipe.author.id)
    const ingredients = recipe.ingredients.split('\n').filter(line => line.trim())

    //Кнопки "Редактировать" и "Удалить" видит только автор (права всё равно проверяет API)
    const authorButtons = isAuthor ? `
        <div class="d-flex gap-2 mt-4">
            <a class="btn btn-outline-dark" href="#/recipes/${recipe.id}/edit"><i class="bi bi-pencil"></i> Редактировать</a>
            <button class="btn btn-outline-danger" id="delete-recipe-btn" data-recipe-id="${recipe.id}"><i class="bi bi-trash3"></i> Удалить</button>
        </div>
    ` : ''

    container.html(`
        <a class="back-link" href="#/"><i class="bi bi-arrow-left"></i> Все рецепты</a>
        <div class="row g-4 g-lg-5 align-items-start">
            <div class="col-lg-7">
                <img class="recipe-hero-img" src="${escapeHtml(recipe.image)}" alt="${escapeHtml(recipe.title)}">
            </div>
            <div class="col-lg-5">
                <h1 class="recipe-title mb-3">${escapeHtml(recipe.title)}</h1>
                <div class="author-line mb-3">
                    ${avatarHtml(recipe.author)}
                    <div>
                        <div class="fw-semibold">${escapeHtml(displayName(recipe.author))}</div>
                        <div class="text-secondary small">@${escapeHtml(recipe.author.username)}</div>
                    </div>
                </div>
                <div class="meta-row">
                    <span><i class="bi bi-clock me-1"></i>${formatCookingTime(recipe.cooking_time)}</span>
                    <span><i class="bi bi-list-check me-1"></i>${ingredients.length} ингредиентов</span>
                    <span><i class="bi bi-calendar3 me-1"></i>${formatDate(recipe.created_at)}</span>
                </div>
                ${authorButtons}
            </div>
        </div>

        <div class="row g-4 mt-1">
            <div class="col-lg-4 order-lg-2">
                <div class="panel">
                    <h4><i class="bi bi-basket me-2"></i>Ингредиенты</h4>
                    <ul class="ingredients">
                        ${ingredients.map(item => `<li><i class="bi bi-circle"></i><span>${escapeHtml(item)}</span></li>`).join('')}
                    </ul>
                </div>
            </div>
            <div class="col-lg-8 order-lg-1">
                <div class="panel mb-4">
                    <h4><i class="bi bi-journal-text me-2"></i>Описание</h4>
                    <div class="description">${escapeHtml(recipe.description)}</div>
                </div>
                <div class="panel" id="comments-panel">
                    <h4><i class="bi bi-chat-heart me-2"></i>Комментарии <span class="text-secondary fs-6" id="comments-count"></span></h4>
                    <div id="comment-form-block"></div>
                    <div id="comments-list"><div class="skeleton" style="height:80px"></div></div>
                </div>
            </div>
        </div>
    `)

    renderCommentForm(recipe.id)
    renderComments(commentsRequest, isStale)
}

//Отметить ингредиент как "уже есть"
$(document).on('click', '.ingredients li', function () {
    $(this).toggleClass('checked')
        .find('i').toggleClass('bi-circle bi-check-circle-fill')
})

// ---------- удаление ----------

$(document).on('click', '#delete-recipe-btn', function () {
    $('#confirm-delete-btn').data('recipe-id', $(this).data('recipe-id'))
    bootstrap.Modal.getOrCreateInstance('#confirm-modal').show()
})

$(document).on('click', '#confirm-delete-btn', async function () {
    const $button = $(this)
    const recipeId = $button.data('recipe-id')

    setLoading($button, true, 'Удаление...')
    try {
        await authRequest({ url: `/api/recipes/${recipeId}/`, method: 'DELETE' })
        bootstrap.Modal.getInstance('#confirm-modal').hide()
        toast('Рецепт удалён')
        navigate('/')
    } catch (xhr) {
        if (xhr.status !== 401) {
            toast(requestErrorText(xhr), 'danger')
        }
    } finally {
        setLoading($button, false)
    }
})

// ================= Комментарии =================

function commentHtml(comment, isNew = false) {
    return `
        <div class="comment ${isNew ? 'is-new' : ''}">
            ${avatarHtml(comment.author)}
            <div class="flex-grow-1">
                <div class="comment-head">
                    <span class="fw-semibold">${escapeHtml(displayName(comment.author))}</span>
                    <span class="comment-date">${formatDate(comment.created_at, true)}</span>
                </div>
                <div class="comment-text">${escapeHtml(comment.text)}</div>
            </div>
        </div>
    `
}

function updateCommentsCount() {
    const count = $('#comments-list .comment').length
    $('#comments-count').text(count ? `(${count})` : '')
    $('#no-comments').toggleClass('d-none', count > 0)
}

async function renderComments(commentsRequest, isStale) {
    let comments
    try {
        //API отдаёт комментарии отсортированными: сначала новые
        comments = await commentsRequest
    } catch (xhr) {
        if (!isStale()) {
            $('#comments-list').html(`<div class="alert alert-warning">Не удалось загрузить комментарии: ${escapeHtml(requestErrorText(xhr))}</div>`)
        }
        return
    }
    if (isStale()) return

    $('#comments-list').html(`
        <p class="text-secondary my-3" id="no-comments">Комментариев пока нет - будьте первым!</p>
        ${comments.map(comment => commentHtml(comment)).join('')}
    `)
    updateCommentsCount()
}

//Форма добавления комментария видна только аутентифицированным
function renderCommentForm(recipeId) {
    const block = $('#comment-form-block')
    if (!isAuthenticated()) {
        block.html(`
            <div class="alert alert-light border d-flex align-items-center gap-2">
                <i class="bi bi-lock"></i>
                <span><a href="#/login">Войдите</a>, чтобы оставить комментарий.</span>
            </div>
        `)
        return
    }

    block.html(`
        <form id="comment-form" class="mb-3" data-recipe-id="${recipeId}" novalidate>
            <div class="field mb-2">
                <textarea class="form-control" name="text" rows="3" placeholder="Поделитесь впечатлением о рецепте..." required></textarea>
            </div>
            <div class="text-end">
                <button type="submit" class="btn btn-accent"><i class="bi bi-send"></i> Отправить</button>
            </div>
        </form>
    `)
}

handleSubmit('#comment-form', 'Отправка...', async function ($form) {
    const text = $form.find('textarea').val().trim()
    if (!text) {
        throw formError({ text: ['Комментарий не может быть пустым.'] })
    }

    const comment = await authRequest({
        url: `/api/recipes/${$form.data('recipe-id')}/comments/`,
        method: 'POST',
        data: JSON.stringify({ text }),
        contentType: 'application/json',
    })
    //новый комментарий - в начало списка, форма очищается
    $('#no-comments').after(commentHtml(comment, true))
    updateCommentsCount()
    $form[0].reset()
    clearFormErrors($form)
})

// ================= Создание / редактирование рецепта =================

async function recipeForm(recipeId = null) {
    const isStale = routeGuard()
    const container = $('#container')

    if (!isAuthenticated()) {
        toast('Войдите, чтобы добавлять рецепты', 'info')
        navigate('/login')
        return
    }

    let recipe = null
    if (recipeId) {
        container.html('<div class="skeleton" style="height:420px"></div>')
        try {
            recipe = await authRequest({ url: `/api/recipes/${recipeId}/`, method: 'GET' })
        } catch (xhr) {
            if (!isStale()) {
                container.html(emptyState('bi-journal-x', 'Рецепт не найден', requestErrorText(xhr)))
            }
            return
        }
        if (isStale()) return

        if (String(recipe.author.id) !== getCurrentUser().id) {
            container.html(emptyState('bi-shield-lock', 'Нет доступа', 'Редактировать рецепт может только его автор.',
                `<a class="btn btn-accent" href="#/recipes/${recipe.id}">К рецепту</a>`))
            return
        }
    }

    const isEdit = !!recipe
    container.html(`
        <a class="back-link" href="${isEdit ? `#/recipes/${recipe.id}` : '#/'}"><i class="bi bi-arrow-left"></i> Назад</a>
        <div class="panel form-card">
            <h2 class="mb-4">${isEdit ? 'Редактирование рецепта' : 'Новый рецепт'}</h2>
            <form id="recipe-form" data-recipe-id="${isEdit ? recipe.id : ''}" novalidate>
                <div class="field mb-3">
                    <label class="form-label" for="title">Название</label>
                    <input class="form-control" id="title" name="title" maxlength="200" required
                        placeholder="Например, плов по-ташкентски" value="${isEdit ? escapeHtml(recipe.title) : ''}">
                </div>
                <div class="field mb-3">
                    <label class="form-label" for="description">Описание</label>
                    <textarea class="form-control" id="description" name="description" rows="5" required
                        placeholder="Как готовить, советы, особенности">${isEdit ? escapeHtml(recipe.description) : ''}</textarea>
                </div>
                <div class="row g-3 mb-3">
                    <div class="col-md-8 field">
                        <label class="form-label" for="ingredients">Ингредиенты</label>
                        <textarea class="form-control" id="ingredients" name="ingredients" rows="6" required
                            placeholder="Каждый ингредиент с новой строки">${isEdit ? escapeHtml(recipe.ingredients) : ''}</textarea>
                        <div class="form-text">Каждый ингредиент - с новой строки.</div>
                    </div>
                    <div class="col-md-4 field">
                        <label class="form-label" for="cooking_time">Время готовки</label>
                        <div class="input-group">
                            <input class="form-control" id="cooking_time" name="cooking_time" type="number" min="1" max="10080" required
                                value="${isEdit ? recipe.cooking_time : ''}">
                            <span class="input-group-text">мин</span>
                        </div>
                    </div>
                </div>
                <div class="field mb-4">
                    <label class="form-label" for="image">Фото блюда</label>
                    <label class="image-drop d-block" for="image" id="image-drop">
                        ${isEdit
                            ? `<img src="${escapeHtml(recipe.image)}" alt="Текущее фото"><div class="small text-secondary mt-2">Нажмите, чтобы заменить фото</div>`
                            : '<div class="placeholder-icon"><i class="bi bi-camera"></i></div><div class="fw-semibold">Выберите фото</div><div class="small text-secondary">JPG или PNG, до 5 МБ</div>'}
                    </label>
                    <input class="d-none" id="image" name="image" type="file" accept="image/*" ${isEdit ? '' : 'required'}>
                </div>
                <div class="d-flex justify-content-end gap-2">
                    <a class="btn btn-light" href="${isEdit ? `#/recipes/${recipe.id}` : '#/'}">Отмена</a>
                    <button type="submit" class="btn btn-accent">
                        <i class="bi bi-check-lg"></i> ${isEdit ? 'Сохранить' : 'Опубликовать'}
                    </button>
                </div>
            </form>
        </div>
    `)
}

//Превью выбранного фото
$(document).on('change', '#image', function () {
    const file = this.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => $('#image-drop').html(
        `<img src="${reader.result}" alt="Новое фото"><div class="small text-secondary mt-2">${escapeHtml(file.name)}</div>`
    )
    reader.readAsDataURL(file)
})

handleSubmit('#recipe-form', 'Сохранение...', async function ($form) {
    const recipeId = $form.data('recipe-id')

    //фото отправляем файлом, поэтому FormData (multipart), а не JSON
    const formData = new FormData($form[0])
    if (!$form.find('#image')[0].files.length) {
        formData.delete('image')
    }

    const saved = await authRequest({
        url: recipeId ? `/api/recipes/${recipeId}/` : '/api/recipes/',
        method: recipeId ? 'PATCH' : 'POST',
        data: formData,
        processData: false,
        contentType: false,
    })
    toast(recipeId ? 'Рецепт обновлён' : 'Рецепт опубликован')
    navigate(`/recipes/${saved.id}`)
})

// ================= Вход и регистрация =================

function loginPage() {
    if (isAuthenticated()) return navigate('/')

    $('#container').html(`
        <div class="panel auth-card">
            <div class="text-center mb-4">
                <span class="brand-logo mx-auto mb-3"><i class="bi bi-person"></i></span>
                <h2>Вход</h2>
                <p class="text-secondary">Рады видеть вас снова!</p>
            </div>
            <form id="login-form" novalidate>
                <div class="field mb-3">
                    <label class="form-label" for="login-username">Имя пользователя</label>
                    <input class="form-control" id="login-username" name="username" autocomplete="username" required>
                </div>
                <div class="field mb-4">
                    <label class="form-label" for="login-password">Пароль</label>
                    <input class="form-control" id="login-password" name="password" type="password" autocomplete="current-password" required>
                </div>
                <button type="submit" class="btn btn-accent w-100 py-2">Войти</button>
            </form>
            <p class="text-center text-secondary mt-4 mb-0">Нет аккаунта? <a href="#/register">Зарегистрируйтесь</a></p>
        </div>
    `)
}

//Логин: SimpleJWT возвращает access и refresh, сохраняем их в localStorage
function login(username, password) {
    return $.ajax({
        url: `${API_URL}/accounts/login/`,
        method: 'POST',
        data: JSON.stringify({ username, password }),
        contentType: 'application/json',
    }).then(data => saveTokens(data.access, data.refresh))
}

//Значения формы объектом; пробелы по краям убираем везде, кроме паролей
function serialize($form) {
    const result = {}
    $form.serializeArray().forEach(({ name, value }) => {
        result[name] = name.startsWith('password') ? value : value.trim()
    })
    return result
}

handleSubmit('#login-form', 'Вход...', async function ($form) {
    const { username, password } = serialize($form)
    try {
        await login(username, password)
    } catch (xhr) {
        //401 на логине - это неверный пароль, а не истёкшая сессия
        if (xhr.status === 401) {
            showFormAlert($form, 'Неверное имя пользователя или пароль')
            return
        }
        throw xhr
    }
    updateNavbar()
    toast(`Добро пожаловать, ${getCurrentUser().username}!`)
    navigate('/')
})

function registerPage() {
    if (isAuthenticated()) return navigate('/')

    $('#container').html(`
        <div class="panel auth-card" style="max-width:520px">
            <div class="text-center mb-4">
                <span class="brand-logo mx-auto mb-3"><i class="bi bi-person-plus"></i></span>
                <h2>Регистрация</h2>
                <p class="text-secondary">Создайте аккаунт, чтобы делиться рецептами</p>
            </div>
            <form id="register-form" novalidate>
                <div class="row g-3 mb-3">
                    <div class="col-sm-6 field">
                        <label class="form-label" for="reg-first-name">Имя</label>
                        <input class="form-control" id="reg-first-name" name="first_name" autocomplete="given-name">
                    </div>
                    <div class="col-sm-6 field">
                        <label class="form-label" for="reg-last-name">Фамилия</label>
                        <input class="form-control" id="reg-last-name" name="last_name" autocomplete="family-name">
                    </div>
                </div>
                <div class="field mb-3">
                    <label class="form-label" for="reg-username">Имя пользователя *</label>
                    <input class="form-control" id="reg-username" name="username" autocomplete="username" required>
                    <div class="form-text">Буквы, цифры и символы @/./+/-/_</div>
                </div>
                <div class="field mb-3">
                    <label class="form-label" for="reg-email">Email</label>
                    <input class="form-control" id="reg-email" name="email" type="email" autocomplete="email">
                </div>
                <div class="row g-3 mb-4">
                    <div class="col-sm-6 field">
                        <label class="form-label" for="reg-password">Пароль *</label>
                        <input class="form-control" id="reg-password" name="password" type="password" autocomplete="new-password" required>
                    </div>
                    <div class="col-sm-6 field">
                        <label class="form-label" for="reg-password2">Повторите пароль *</label>
                        <input class="form-control" id="reg-password2" name="password2" type="password" autocomplete="new-password" required>
                    </div>
                </div>
                <button type="submit" class="btn btn-accent w-100 py-2">Зарегистрироваться</button>
            </form>
            <p class="text-center text-secondary mt-4 mb-0">Уже есть аккаунт? <a href="#/login">Войти</a></p>
        </div>
    `)
}

handleSubmit('#register-form', 'Регистрация...', async function ($form) {
    const { password2, ...data } = serialize($form)
    if (data.password !== password2) {
        throw formError({ password2: ['Пароли не совпадают.'] })
    }

    await $.ajax({
        url: `${API_URL}/accounts/register/`,
        method: 'POST',
        data: JSON.stringify(data),
        contentType: 'application/json',
    })
    //сразу входим, чтобы не заставлять вводить те же данные ещё раз
    await login(data.username, data.password)
    updateNavbar()
    toast('Аккаунт создан, добро пожаловать!')
    navigate('/')
})

// ================= Выход =================

$(document).on('click', '#logout-btn', async function () {
    const refresh = getRefreshToken()
    clearTokens()
    updateNavbar()

    //refresh-токен отзываем на бэке; даже если запрос не дойдёт, на фронте токенов уже нет
    $.ajax({
        url: `${API_URL}/accounts/logout/`,
        method: 'POST',
        data: JSON.stringify({ refresh }),
        contentType: 'application/json',
    }).catch(() => console.log('Не удалось отозвать refresh-токен на сервере'))

    toast('Вы вышли из аккаунта', 'info')
    navigate('/')
})

//authRequest не смог обновить токен - refresh тоже истек
//перерисовываем текущую страницу уже как для гостя: без формы комментария и кнопок автора
$(document).on('session:expired', function () {
    updateNavbar()
    toast('Сессия истекла. Войдите снова', 'danger')
    router()
})

$(document).ready(function () {
    updateNavbar()
    $(window).on('hashchange', router)
    router()
})
