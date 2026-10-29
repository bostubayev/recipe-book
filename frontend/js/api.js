const API_URL = 'http://127.0.0.1:5435'

//Достать из локалстораджа access token
function getAccessToken() {
    return localStorage.getItem('access-token')
}

//Достать из локалстораджа refresh token
function getRefreshToken() {
    return localStorage.getItem('refresh-token')
}

//Положить в локалсторадж токены (refresh приходит только при логине)
function saveTokens(access, refresh) {
    localStorage.setItem('access-token', access)
    if (refresh) {
        localStorage.setItem('refresh-token', refresh)
    }
}

//Очистить токены из локалстораджа
function clearTokens() {
    localStorage.removeItem('access-token')
    localStorage.removeItem('refresh-token')
}

//Проверка, авторизован ли юзер: пока жив refresh, access можно обновить,
//а из access берём, кто именно вошёл - без него фронт не знает автора
function isAuthenticated() {
    return !!getRefreshToken() && !!getCurrentUser()
}

//Текущий юзер из payload access-токена: бэк кладёт туда user_id и username
function getCurrentUser() {
    const token = getAccessToken()
    if (!token) return null

    try {
        //payload в base64url, а atob понимает только base64 - заменяем символы
        const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
        const json = decodeURIComponent(
            atob(base64).split('').map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
        )
        const payload = JSON.parse(json)
        return { id: String(payload.user_id), username: payload.username }
    } catch (e) {
        return null
    }
}

//Если в один момент упадут несколько запросов с 401, refresh отправится один раз
let refreshPromise = null

//Запрос на обновление access-токена через refresh
function tryRefreshToken() {
    const refresh = getRefreshToken()
    if (!refresh) return Promise.resolve(false)

    if (!refreshPromise) {
        refreshPromise = $.ajax({
            url: `${API_URL}/accounts/refresh/`,
            method: 'POST',
            data: JSON.stringify({ refresh: refresh }),
            contentType: 'application/json',
        })
            .then(data => {
                saveTokens(data.access)
                console.log('Access token успешно обновлен')
                return true
            }, () => false)
            .always(() => { refreshPromise = null })
    }
    return refreshPromise
}

//Обертка над ajax, которая:
//1. Добавляет JWT в заголовок Authorization: Bearer <token>
//2. Если пришел 401 (access истек), обновляет токен и повторяет запрос
async function authRequest(options) {
    const withToken = () => {
        const token = getAccessToken()
        const headers = { ...(options.headers || {}) }
        if (token) {
            headers['Authorization'] = 'Bearer ' + token
        }
        return { ...options, url: API_URL + options.url, headers }
    }

    try {
        return await $.ajax(withToken())
    } catch (error) {
        if (error.status !== 401 || !getRefreshToken()) {
            throw error
        }

        console.log('Access истек, пробую сделать refresh')
        if (await tryRefreshToken()) {
            return await $.ajax(withToken())
        }

        //refresh тоже истек - разлогиниваем пользователя на фронте
        clearTokens()
        $(document).trigger('session:expired')

        //повторяем уже без токена: публичные запросы (список, рецепт) пройдут, остальные снова дадут 401
        return await $.ajax(withToken())
    }
}
