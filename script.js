const SUPABASE_URL = "https://sbstwtxwwxbrgvkpwglb.supabase.co/rest/v1/";
const SUPABASE_KEY = "sb_publishable_hr0J-VQK6ECCGz6fTXxLPg_9xdFTWmf";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let activeUser = null;

// Проверяем, заходил ли пользователь раньше
window.onload = async function() {
    const savedEmail = localStorage.getItem('chm_user_email');
    if (savedEmail) {
        const { data } = await supabase.from('profiles').select('*').eq('email', savedEmail).single();
        if (data) {
            activeUser = data;
            applyTheme(activeUser.favorite_team);
            showMainPage();
        }
    }
};

// Функция предпросмотра темы при выборе
function changePreviewTheme(val) { applyTheme(val); }
// Функция смены расцветки приложения под выбранную сборную
function applyTheme(team) {
    document.body.className = '';
    document.body.classList.add('theme-' + team);
}

// 2. РЕГИСТРАЦИЯ И ВХОД
async function authRegister() {
    const username = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const favorite_team = document.getElementById('regTeam').value;

    if (!username || !email) return alert("Заполните имя и email!");

    // Проверяем, админская ли это почта
    const is_admin = email.toLowerCase() === 'admin@chm.ru'; 

    // Ищем пользователя в базе
    const { data: existing } = await supabase.from('profiles').select('*').eq('email', email).single();
    if (existing) {
        activeUser = existing;
    } else {
        // Если пользователя нет, регистрируем нового
        const { data, error } = await supabase.from('profiles').insert([{ username, email, favorite_team, is_admin }]).select().single();
        if (error) return alert("Ошибка регистрации: " + error.message);
        activeUser = data;
    }

    localStorage.setItem('chm_user_email', activeUser.email);
    applyTheme(activeUser.favorite_team);
    showMainPage();
}

// Показываем главный экран после авторизации
function showMainPage() {
    document.getElementById('authBlock').style.display = 'none';
    document.getElementById('mainBlock').style.display = 'block';
    document.getElementById('userDisplay').innerText = activeUser.username;
    // Если зашел админ, открываем панель управления
    if (activeUser.is_admin) {
        document.getElementById('adminPanel').style.display = 'block';
        document.getElementById('userBadge').innerText = '(Администратор)';
    }
    
    loadData();
}

// Выход из аккаунта
function logout() {
    localStorage.removeItem('chm_user_email');
    location.reload();
}

// Перезагрузка всех блоков на экране
async function loadData() {
    updateLeaderboard();
    updateMatchesList();
    if (activeUser.is_admin) updateAdminLiveView();
}

// --- ФУНКЦИИ АДМИНИСТРАТОРА ---
// Создание матча и автоматическая привязка выбранных вопросов
async function adminCreateMatch() {
    const group_name = document.getElementById('admGroup').value.trim();
    const team_home = document.getElementById('admHome').value.trim();
    const team_away = document.getElementById('admAway').value.trim();
    
    if(!group_name || !team_home || !team_away) return alert("Заполните все поля матча!");

    const { data: match, error } = await supabase.from('matches').insert([{ group_name, team_home, team_away }]).select().single();
    
    if (error) return alert(error.message);

    // Добавляем доп. вопросы для предикта, если стоят галочки
    if (document.getElementById('addFirstGoalQ').checked) {
        await supabase.from('match_questions').insert([{ match_id: match.id, question_text: "Кто откроет счет в матче?", type: 'first_goal' }]);
    }
    if (document.getElementById('addPenaltyQ').checked) {
        await supabase.from('match_questions').insert([{ match_id: match.id, question_text: "Будет ли пенальти в матче?", type: 'penalty' }]);
    }

    alert("Матч и выбранные вопросы успешно внесены в календарь!");
    document.getElementById('admHome').value = "";
    document.getElementById('admAway').value = "";
    loadData();
}

// Отображение live-управления матчами в админке
async function updateAdminLiveView() {
    const { data: matches } = await supabase.from('matches').select('*').order('status');
    const container = document.getElementById('adminLiveMatchesView');
    container.innerHTML = matches && matches.length ? '' : 'Нет матчей для управления.';

    if (matches) {
        matches.forEach(m => {
            container.innerHTML += `
                <div style="background:rgba(255,255,255,0.05); padding:15px; margin:10px 0; border-radius:8px; border:1px solid #444;">
                    <p><b>${m.team_home} — ${m.team_away}</b> (Статус: ${m.status})</p>
                    Счет LIVE: 
                    <input type="number" id="adm-sc-h-${m.id}" value="${m.score_home}" style="width:55px; display:inline; padding:5px;"> : 
                    <input type="number" id="adm-sc-a-${m.id}" value="${m.score_away}" style="width:55px; display:inline; padding:5px;">
                    <br><br>
                    Первый гол:
                    <select id="adm-fq-${m.id}" style="width:auto; display:inline; padding:5px; margin:0 5px;">
                        <option value="none" ${m.first_goal_team === 'none'?'selected':''}>Никто (0:0)</option>
                        <option value="home" ${m.first_goal_team === 'home'?'selected':''}>${m.team_home}</option>
                        <option value="away" ${m.first_goal_team === 'away'?'selected':''}>${m.team_away}</option>
                    </select>

                    Пенальти:
                    <select id="adm-pen-${m.id}" style="width:auto; display:inline; padding:5px; margin:0 5px;">
                        <option value="no" ${m.has_penalty === 'no'?'selected':''}>Нет</option>
                        <option value="yes" ${m.has_penalty === 'yes'?'selected':''}>Да</option>
                    </select>

                    <br><br>
                    <button onclick="changeMatchStatus('${m.id}', 'live')" style="background:var(--accent-red); width:auto; padding:6px 12px; font-size:12px; color:#fff;">1. Начать матч (LIVE)</button>
                    <button onclick="updateLiveScore('${m.id}')" style="background:var(--gold); width:auto; padding:6px 12px; font-size:12px;">2. Обновить счет / события</button>
                    <button onclick="changeMatchStatus('${m.id}', 'finished')" style="background:gray; width:auto; padding:6px 12px; font-size:12px; color:#fff;">3. Завершить матч</button>
                </div>
            `;
        });
    }
}
// Изменение статуса матча (Ожидание -> LIVE -> Завершен)
async function changeMatchStatus(id, newStatus) {
    await supabase.from('matches').update({ status: newStatus }).eq('id', id);
    // Если матч завершается, делаем финальный пересчет баллов
    if (newStatus === 'finished') await calculateMatchPoints(id);
    loadData();
}

// Обновление live-счета матча и мгновенный временный пересчет баллов в реальном времени
async function updateLiveScore(id) {
    const score_home = parseInt(document.getElementById(`adm-sc-h-${id}`).value) || 0;
    const score_away = parseInt(document.getElementById(`adm-sc-a-${id}`).value) || 0;
    const first_goal_team = document.getElementById(`adm-fq-${id}`).value;
    const has_penalty = document.getElementById(`adm-pen-${id}`).value;

    await supabase.from('matches').update({ score_home, score_away, first_goal_team, has_penalty }).eq('id', id);
    
    // Пересчитываем баллы прямо по ходу матча
    await calculateMatchPoints(id);
    loadData();
}
// --- ИГРОВЫЕ ФУНКЦИИ (ДЛЯ ДРУЗЕЙ И ВАС) ---

// Показ карточек всех матчей турнира и форм для прогнозов
async function updateMatchesList() {
    const { data: matches } = await supabase.from('matches').select('*').order('group_name');
    const { data: questions } = await supabase.from('match_questions').select('*');
    const { data: myPredictions } = await supabase.from('predictions').select('*').eq('user_email', activeUser.email);

    const container = document.getElementById('matchesListView');
    container.innerHTML = matches && matches.length ? '' : 'Пока нет запланированных матчей.';

    if (matches && questions && myPredictions) {
        matches.forEach(m => {
            const userPred = myPredictions.find(p => p.match_id === m.id);
            const matchQuestions = questions.filter(q => q.match_id === m.id);
            
            let statusBadge = m.status === 'live' ? '<span class="live-badge">LIVE</span>' : (m.status === 'finished' ? '<span>Завершен</span>' : '<span>Ожидание</span>');
            let predictBtnText = userPred ? "✏️ Изменить прогноз" : "🔮 Сделать прогноз (Predict)";
            // Если матч начался или завершился, кнопки прогнозов блокируются
            let disabledAttr = m.status !== 'pending' ? 'disabled style="opacity:0.4; cursor:not-allowed;"' : '';

            let questionsInputsHtml = '';
            matchQuestions.forEach(q => {
                if (q.type === 'first_goal') {
                    questionsInputsHtml += `
                        <p style="margin: 10px 0 5px 0; font-size:14px;">${q.question_text} (+1 балл)</p>
                        <select id="pred-fq-${m.id}">
                            <option value="none" ${userPred?.pred_first_goal === 'none' ? 'selected' : ''}>Никто (0:0)</option>
                            <option value="home" ${userPred?.pred_first_goal === 'home' ? 'selected' : ''}>${m.team_home}</option>
                            <option value="away" ${userPred?.pred_first_goal === 'away' ? 'selected' : ''}>${m.team_away}</option>
                        </select>
                    `;
                } else if (q.type === 'penalty') {
                    questionsInputsHtml += `
                        <p style="margin: 10px 0 5px 0; font-size:14px;">${q.question_text} (+1 балл)</p>
                        <select id="pred-pen-${m.id}">
                            <option value="no" ${userPred?.pred_has_penalty === 'no' ? 'selected' : ''}>Нет</option>
                            <option value="yes" ${userPred?.pred_has_penalty === 'yes' ? 'selected' : ''}>Да</option>
                        </select>
                    `;
                }
            });
            container.innerHTML += `
                <div class="match-item">
                    <div class="match-header"><span>📌 ${m.group_name}</span> ${statusBadge}</div>
                    <div class="teams-display">
                        <span>${m.team_home}</span>
                        <span style="color:var(--gold); font-size:24px;">${m.score_home} : ${m.score_away}</span>
                        <span>${m.team_away}</span>
                    </div>
                    ${userPred ? `<div style="text-align:center; font-size:14px; color:#aaa; margin-bottom:12px; background:rgba(0,0,0,0.2); padding:5px; border-radius:6px;">Ваш прогноз: <b>${userPred.pred_home}:${userPred.pred_away}</b></div>` : ''}
                    <button onclick="togglePredictSection('${m.id}')" ${disabledAttr}>${predictBtnText}</button>
                    
                    <div class="predict-section" id="pred-sec-${m.id}">
                        <p style="text-align:center; margin-bottom:5px;">Прогноз на счет:</p>
                        <div class="score-inputs">
                            <input type="number" id="pred-h-${m.id}" value="${userPred ? userPred.pred_home : 0}" min="0">
                            <span>:</span>
                            <input type="number" id="pred-a-${m.id}" value="${userPred ? userPred.pred_away : 0}" min="0">
                        </div>
                        ${questionsInputsHtml}
                        <button onclick="savePrediction('${m.id}')" style="background:var(--gold); margin-top:12px;">Зафиксировать ставку</button>
                    </div>
                </div>
            `;
        });
    }
}
// Показ/скрытие блока предикта при нажатии на кнопку
function togglePredictSection(id) {
    const sec = document.getElementById(`pred-sec-${id}`);
    sec.style.display = sec.style.display === 'block' ? 'none' : 'block';
}

// Сохранение прогноза игрока в базу данных
async function savePrediction(matchId) {
    const pred_home = parseInt(document.getElementById(`pred-h-${matchId}`).value) || 0;
    const pred_away = parseInt(document.getElementById(`pred-a-${matchId}`).value) || 0;
    
    const fqElem = document.getElementById(`pred-fq-${matchId}`);
    const penElem = document.getElementById(`pred-pen-${matchId}`);
    
    const pred_first_goal = fqElem ? fqElem.value : null;
    const pred_has_penalty = penElem ? penElem.value : null;

    const { data: existing } = await supabase.from('predictions').select('*').eq('user_email', activeUser.email).eq('match_id', matchId).single();
    if (existing) {
        await supabase.from('predictions').update({ pred_home, pred_away, pred_first_goal, pred_has_penalty }).eq('id', existing.id);
    } else {
        await supabase.from('predictions').insert([{ user_email: activeUser.email, match_id: matchId, pred_home, pred_away, pred_first_goal, pred_has_penalty }]);
    }

    alert("Ваш прогноз сохранен!");
    loadData();
}

// 🧮 СУПЕР-ФОРМУЛА ПОДЧЕТА БАЛЛОВ ПО ВАШИМ ПРАВИЛАМ
async function calculateMatchPoints(matchId) {
    const { data: match } = await supabase.from('matches').select('*').eq('id', matchId).single();
    const { data: predictions } = await supabase.from('predictions').select('*').eq('match_id', matchId);

    if (!predictions || !match) return;

    for (let p of predictions) {
        let points = 0;

        const realH = match.score_home;
        const realA = match.score_away;
        const predH = p.pred_home;
        const predA = p.pred_away;

        // 1. Точный счет (+3 балла)
        if (realH === predH && realA === predA) {
            points += 3;
        } 
        // 2. Разница мячей (+2 балла)
        else if ((realH - realA) === (predH - predA)) {
            points += 2;
        } 
        // 3. Исходы: победа или ничья (+1 балл)
        else if ((realH > realA && predH > predA) || (realH < realA && predH < predA) || (realH === realA && predH === predA)) {
            points += 1;
        }

        // 4. Доп. Вопрос: Кто первый открыл счет (+1 балл)
        if (p.pred_first_goal && p.pred_first_goal === match.first_goal_team) {
            points += 1;
        }
        // 5. Доп. Вопрос: Был ли пенальти (+1 балл)
        if (p.pred_has_penalty && p.pred_has_penalty === match.has_penalty) {
            points += 1;
        }

        // Записываем итоговую сумму баллов за матч
        await supabase.from('predictions').update({ points_earned: points }).eq('id', p.id);
    }
}

// Сборка и сортировка общей таблицы лидеров турнира
async function updateLeaderboard() {
    const { data: users } = await supabase.from('profiles').select('*');
    const { data: allPreds } = await supabase.from('predictions').select('*');

    const leaderboard = {};
    if (users) {
        users.forEach(u => leaderboard[u.username] = { points: 0, team: u.favorite_team });
    }

    if (allPreds && users) {
        allPreds.forEach(p => {
            const userObj = users.find(u => u.email === p.user_email);
            if (userObj) {
                leaderboard[userObj.username].points += p.points_earned;
            }
        });
    }

    const container = document.getElementById('leaderboardView');
    container.innerHTML = '';

    const sorted = Object.entries(leaderboard).sort((a,b) => b[1].points - a[1].points);
    sorted.forEach(([name, data], idx) => {
        let flag = data.team === 'argentina' ? 'Аргентина 🇦🇷' : (data.team === 'france' ? 'Франция 🇫🇷' : (data.team === 'spain' ? 'Испания 🇪🇸' : 'ЧМ 🌐'));
        container.innerHTML += `
            <div style="display:flex; justify-content:space-between; background:rgba(255,255,255,0.05); padding:12px; margin:6px 0; border-radius:8px; border:1px solid rgba(255,255,255,0.05);">
                <span><b>${idx+1}. ${name}</b> <small style="color:#aaa; margin-left:5px;">(Болеет за: ${flag})</small></span>
                <span style="color:var(--gold); font-weight:bold; font-size:18px;">${data.points} очков</span>
            </div>
        `;
    });
}
