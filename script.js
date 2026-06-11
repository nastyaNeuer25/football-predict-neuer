const SUPABASE_URL = "https://sbstwtxwwxbrgvkpwglb.supabase.co/rest/v1/";
const SUPABASE_KEY = "sb_publishable_hr0J-VQK6ECCGz6fTXxLPg_9xdFTWmf";

// Безопасное создание подключения
const supabase = (window.supabase && window.supabase.createClient) 
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) 
    : (window.Supabase && window.Supabase.createClient)
        ? window.Supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
        : null;

let activeUser = null;

// ПРОВЕРКА АВТОРИЗАЦИИ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ
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

// СМЕНА РАСЦВЕТОК ПОД СБОРНЫЕ
function changePreviewTheme(val) { applyTheme(val); }
function applyTheme(team) {
    document.body.className = '';
    document.body.classList.add('theme-' + team);
}

// ФУНКЦИЯ РЕГИСТРАЦИИ И ВХОДА (ТЕПЕРЬ ОПУЩЕНА НИЖЕ ИНИЦИАЛИЗАЦИИ БАЗЫ)
async function authRegister() {
    const username = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const favorite_team = document.getElementById('regTeam').value;

    if (!username || !email) return alert("Заполните имя и email!");
    const is_admin = email.toLowerCase() === 'admin@chm.ru'; 

    const { data: existing } = await supabase.from('profiles').select('*').eq('email', email).single();
    if (existing) {
        activeUser = existing;
    } else {
        const { data, error } = await supabase.from('profiles').insert([{ username, email, favorite_team, is_admin }]).select().single();
        if (error) return alert("Ошибка: " + error.message);
        activeUser = data;
    }
    localStorage.setItem('chm_user_email', activeUser.email);
    applyTheme(activeUser.favorite_team);
    showMainPage();
}

// ПЕРЕХОД НА ГЛАВНУЮ СТРАНИЦУ
function showMainPage() {
    document.getElementById('authBlock').style.display = 'none';
    document.getElementById('mainBlock').style.display = 'block';
    document.getElementById('userDisplay').innerText = activeUser.username;
    if (activeUser.is_admin) {
        document.getElementById('adminPanel').style.display = 'block';
        document.getElementById('userBadge').innerText = '(Администратор)';
    }
    loadData();
}

// ВЫХОД ИЗ ИГРЫ
function logout() { localStorage.removeItem('chm_user_email'); location.reload(); }

// ОБНОВЛЕНИЕ ДАННЫХ
async function loadData() {
    updateLeaderboard(); 
    updateMatchesList();
    if (activeUser.is_admin) updateAdminLiveView();
}

// АДМИНКА: СОЗДАНИЕ МАТЧА
async function adminCreateMatch() {
    const group_name = document.getElementById('admGroup').value.trim();
    const team_home = document.getElementById('admHome').value.trim();
    const team_away = document.getElementById('admAway').value.trim();
    if(!group_name || !team_home || !team_away) return alert("Заполните поля!");

    const { data: match, error } = await supabase.from('matches').insert([{ group_name, team_home, team_away }]).select().single();
    if (error) return alert(error.message);

    if (document.getElementById('addFirstGoalQ').checked) {
        await supabase.from('match_questions').insert([{ match_id: match.id, question_text: "Кто откроет счет в матче?", type: 'first_goal' }]);
    }
    if (document.getElementById('addPenaltyQ').checked) {
        await supabase.from('match_questions').insert([{ match_id: match.id, question_text: "Будет ли пенальти в матче?", type: 'penalty' }]);
    }
    alert("Матч создан!"); 
    loadData();
}
// АДМИНКА: LIVE УПРАВЛЕНИЕ СЧЕТОМ
async function updateAdminLiveView() {
    const { data: matches } = await supabase.from('matches').select('*').order('status');
    const container = document.getElementById('adminLiveMatchesView');
    container.innerHTML = matches && matches.length ? '' : 'Нет матчей.';
    if (matches) {
        matches.forEach(m => {
            container.innerHTML += `
                <div style="background:rgba(255,255,255,0.05); padding:15px; margin:10px 0; border-radius:8px;">
                    <p><b>${m.team_home} — ${m.team_away}</b></p>
                    <input type="number" id="adm-sc-h-${m.id}" value="${m.score_home}" style="width:50px;"> : 
                    <input type="number" id="adm-sc-a-${m.id}" value="${m.score_away}" style="width:50px;">
                    <button onclick="updateLiveScore('${m.id}')">Обновить счет</button>
                    <button onclick="changeMatchStatus('${m.id}', 'finished')" style="background:gray;">Завершить</button>
                </div>
            `;
        });
    }
}

async function changeMatchStatus(id, newStatus) {
    await supabase.from('matches').update({ status: newStatus }).eq('id', id);
    if (newStatus === 'finished') await calculateMatchPoints(id);
    loadData();
}

async function updateLiveScore(id) {
    const score_home = parseInt(document.getElementById(`adm-sc-h-${id}`).value) || 0;
    const score_away = parseInt(document.getElementById(`adm-sc-a-${id}`).value) || 0;
    await supabase.from('matches').update({ score_home, score_away }).eq('id', id);
    await calculateMatchPoints(id); 
    loadData();
}

// ИГРОКИ: СПИСОК МАТЧЕЙ
async function updateMatchesList() {
    const { data: matches } = await supabase.from('matches').select('*').order('group_name');
    const { data: questions } = await supabase.from('match_questions').select('*');
    const { data: myPreds } = await supabase.from('predictions').select('*').eq('user_email', activeUser.email);
    const container = document.getElementById('matchesListView');
    container.innerHTML = matches && matches.length ? '' : 'Нет матчей.';

    if (matches && questions && myPreds) {
        matches.forEach(m => {
            const userPred = myPreds.find(p => p.match_id === m.id);
            let disabledAttr = m.status !== 'pending' ? 'disabled style="opacity:0.4;"' : '';
            container.innerHTML += `
                <div class="match-item">
                    <div class="match-header"><span>📌 ${m.group_name}</span></div>
                    <div class="teams-display"><span>${m.team_home}</span> <span style="color:var(--gold)">${m.score_home} : ${m.score_away}</span> <span>${m.team_away}</span></div>
                    <button onclick="togglePredictSection('${m.id}')" ${disabledAttr}>Прогноз</button>
                    <div class="predict-section" id="pred-sec-${m.id}">
                        <div class="score-inputs">
                            <input type="number" id="pred-h-${m.id}" value="${userPred ? userPred.pred_home : 0}"> :
                            <input type="number" id="pred-a-${m.id}" value="${userPred ? userPred.pred_away : 0}">
                        </div>
                        <button onclick="savePrediction('${m.id}')">Сохранить</button>
                    </div>
                </div>
            `;
        });
    }
}
function togglePredictSection(id) {
    const sec = document.getElementById(`pred-sec-${id}`);
    sec.style.display = sec.style.display === 'block' ? 'none' : 'block';
}

// ИГРОКИ: СОХРАНЕНИЕ СТАВКИ
async function savePrediction(matchId) {
    const pred_home = parseInt(document.getElementById(`pred-h-${matchId}`).value) || 0;
    const pred_away = parseInt(document.getElementById(`pred-a-${matchId}`).value) || 0;
    const { data: existing } = await supabase.from('predictions').select('*').eq('user_email', activeUser.email).eq('match_id', matchId).single();
    if (existing) {
        await supabase.from('predictions').update({ pred_home, pred_away }).eq('id', existing.id);
    } else {
        await supabase.from('predictions').insert([{ user_email: activeUser.email, match_id: matchId, pred_home, pred_away }]);
    }
    alert("Сохранено!"); 
    loadData();
}

// 🧮 ФОРМУЛА СЧЕТА БАЛЛОВ (+3, +2, +1)
async function calculateMatchPoints(matchId) {
    const { data: match } = await supabase.from('matches').select('*').eq('id', matchId).single();
    const { data: predictions } = await supabase.from('predictions').select('*').eq('match_id', matchId);
    if (!predictions || !match) return;
    for (let p of predictions) {
        let points = 0;
        if (match.score_home === p.pred_home && match.score_away === p.pred_away) points += 3;
        else if ((match.score_home - match.score_away) === (p.pred_home - p.pred_away)) points += 2;
        else if ((match.score_home > match.score_away && p.pred_home > p.pred_away) || (match.score_home < match.score_away && p.pred_home < p.pred_away) || (match.score_home === match.score_away && p.pred_home === p.pred_away)) points += 1;
        await supabase.from('predictions').update({ points_earned: points }).eq('id', p.id);
    }
}

// ТАБЛИЦА ЛИДЕРОВ
async function updateLeaderboard() {
    const { data: users } = await supabase.from('profiles').select('*');
    const { data: allPreds } = await supabase.from('predictions').select('*');
    const leaderboard = {};
    if (users) users.forEach(u => leaderboard[u.username] = { points: 0, team: u.favorite_team });
    if (allPreds && users) {
        allPreds.forEach(p => {
            const userObj = users.find(u => u.email === p.user_email);
            if (userObj) leaderboard[userObj.username].points += p.points_earned;
        });
    }
    const container = document.getElementById('leaderboardView'); 
    container.innerHTML = '';
    Object.entries(leaderboard).sort((a,b) => b.points - a.points).forEach(([name, data], idx) => {
        container.innerHTML += `<div style="padding:10px; margin:5px 0; background:rgba(255,255,255,0.05); border-radius:8px;">${idx+1}. ${name} — <b>${data.points} очков</b></div>`;
    });
}
