// app.js

// Get Supabase Client from api.js
let sb = null;
if (window.HaygAPI) {
    sb = window.HaygAPI.getClient();
}

// --- DOM ELEMENTS ---
const authBtn = document.getElementById('auth-btn');
const heroSignupBtn = document.getElementById('hero-signup-btn');
const authModal = document.getElementById('auth-modal');
const closeModal = document.querySelector('.close-modal');
const authTabs = document.querySelectorAll('.auth-tab');
const authForms = document.querySelectorAll('.auth-form');
const welcomeText = document.getElementById('welcome-text');
const heroTitle = document.querySelector('.hero-title');
const heroSubtitle = document.querySelector('.hero-subtitle');

const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');

let currentUser = null;
let pendingEmail = ''; // Store email for verification step

// Leaderboard state
let currentLeaderboardGame = 'total';
let currentLeaderboardLimit = 5;
let currentLeaderboardScoreType = 'overall';

// Helper to truncate long names
function truncateName(name, length = 12) {
    if (!name) return 'Անանուն';
    return name.length > length ? name.substring(0, length) + '...' : name;
}

// Calculate effective streak based on last active date using strict UTC to match DB
function getEffectiveStreak(streakCount, lastActiveDate) {
    if (!lastActiveDate) return 0;

    const todayStr = new Date().toISOString().split('T')[0];
    const tDate = new Date(todayStr); // UTC midnight
    const aDate = new Date(lastActiveDate); // UTC midnight

    const diffFromActive = Math.round((tDate - aDate) / (1000 * 60 * 60 * 24));

    // If last active was more than 1 day ago (e.g. 2 days ago), streak is broken
    if (diffFromActive > 1) return 0;
    return streakCount || 0;
}

const armenianRegex = /^[ \u0530-\u058F]+$/;

function isArmenian(text) {
    if (!text) return false;
    // Remove spaces to check if it's mostly Armenian
    const cleanText = text.replace(/[ ]/g, '');
    if (cleanText.length === 0) return false;
    return armenianRegex.test(cleanText);
}

// --- AUTHENTICATION FUNCTIONS ---

async function checkUser() {
    if (!sb) return null;

    try {
        const { data: { session }, error } = await sb.auth.getSession();

        if (session) {
            updateUIForUser(session.user);
        } else {
            updateUIForGuest();
        }
        return session?.user || null;
    } catch (err) {
        console.error('Check user error:', err);
        return null;
    }
}

async function signUp(email, password, name) {
    if (!sb) return showToast('Supabase is not configured yet.', 'error');

    // Armenian name validation: Allow Armenian characters and spaces
    if (!isArmenian(name)) {
        showToast('Խնդրեմ գործածեցէ՛ք միայն հայերէն տառեր:', 'error');
        return;
    }

    const signupBtn = signupForm.querySelector('button');
    signupBtn.disabled = true;
    signupBtn.textContent = 'Կը գրանցուի...';

    try {
        const { data, error } = await sb.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    full_name: name,
                    role: 'user' // Default role
                }
            }
        });

        signupBtn.disabled = false;
        signupBtn.textContent = 'Գրանցուիլ';

        if (error) {
            let msg = error.message;
            if (msg.includes('User already registered')) {
                msg = 'Այս ել-նամակը արդէն գրանցուած է:';
            }
            showToast(msg, 'error');
        } else if (data.user && data.user.identities && data.user.identities.length === 0) {
            // This happens when 'User Enumeration Protection' is ON in Supabase
            const msg = 'Այս ել-նամակը արդէն գրանցուած է:';
            showToast(msg, 'error');
        } else {
            pendingEmail = email;
            showToast('Գրանցումը կատարուեցաւ, խնդրեմ ստուգեցէ՛ք ձեր ել-նամակը:', 'success');
            showVerificationSection();
        }
    } catch (err) {
        signupBtn.disabled = false;
        signupBtn.textContent = 'Գրանցուիլ';
        showToast('System error during signup', 'error');
    }
}

async function signIn(email, password) {
    if (!sb) return showToast('Supabase is not configured yet.', 'error');

    const loginBtn = loginForm.querySelector('button');
    loginBtn.disabled = true;
    loginBtn.textContent = 'Մուտք կը գործէ...';

    try {
        const { data, error } = await sb.auth.signInWithPassword({
            email: email,
            password: password,
        });

        loginBtn.disabled = false;
        loginBtn.textContent = 'Մուտք';

        if (error) {
            showToast('Մուտքը ձախողեցաւ: Սխալ ել-նամակ կամ գաղտնաբառ:', 'error');
        } else {
            showToast('Բարի վերադարձ!', 'success');
            closeAuthModal();
            checkUser();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    } catch (err) {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Մուտք';
        showToast('System error during signin', 'error');
    }
}

async function verifyEmailCode(email, code) {
    if (!sb) return;

    const verifyBtn = document.getElementById('verify-btn');
    verifyBtn.disabled = true;
    verifyBtn.textContent = 'Կը հաստատուի...';

    try {
        const { data, error } = await sb.auth.verifyOtp({
            email,
            token: code,
            type: 'signup'
        });

        verifyBtn.disabled = false;
        verifyBtn.textContent = 'Հաստատել';

        if (error) {
            showToast('Հաստատումը ձախողեցաւ: Սխալ կամ ժամկէտանց կոտ:', 'error');
        } else {
            showToast('Յաջողութեամբ հաստատուեցաք!', 'success');
            closeAuthModal();
            checkUser();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    } catch (err) {
        verifyBtn.disabled = false;
        verifyBtn.textContent = 'Հաստատել';
        showToast('System error during verification', 'error');
    }
}

async function signInWithGoogle() {
    if (!sb) return showToast('Supabase is not configured yet.', 'error');

    try {
        const { error } = await sb.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: 'https://manoug-chouljian.github.io/hayg-dev/',
                queryParams: {
                    access_type: 'offline',
                    prompt: 'consent',
                },
            }
        });

        if (error) {
            showToast('Google login failed: ' + error.message, 'error');
        }
    } catch (err) {
        console.error('OAuth error:', err);
        showToast('System error during Google login', 'error');
    }
}

// --- DATABASE & SCORING API ---

window.updateDashboardUI = function (score, streak) {
    const statsDisplay = document.getElementById('user-stats-display');
    if (statsDisplay) {
        statsDisplay.innerHTML = `⭐ XP: ${score} &nbsp; 🔥 Շարք: ${streak}`;
    }
};

async function signOut() {
    if (!sb) return;
    try {
        const { error } = await sb.auth.signOut();
        if (!error) {
            updateUIForGuest();
            showToast('Դուք ելք գործեցիք:', 'success');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    } catch (err) {
        console.error('Sign out error:', err);
    }
}

// --- UI UPDATES ---
function updateUIForUser(user) {
    currentUser = user;
    const fullName = user.user_metadata?.full_name || 'Օգտատէր';
    const truncatedName = truncateName(fullName, 15); // Hero can be slightly longer

    if (welcomeText) {
        welcomeText.textContent = `Բարի եկաք, ${truncatedName}`;
        welcomeText.style.display = 'inline-block';
    }

    if (heroTitle) {
        heroTitle.textContent = '';
        heroTitle.appendChild(document.createTextNode('Բարի եկաք,'));
        heroTitle.appendChild(document.createElement('br'));
        const heroName = document.createElement('span');
        heroName.textContent = truncatedName;
        heroTitle.appendChild(heroName);
    }
    if (heroSubtitle) {
        heroSubtitle.textContent = '';
        heroSubtitle.appendChild(document.createTextNode('Պատրա՞ստ ես յաջորդ մարտահրաւէրին:'));
        heroSubtitle.appendChild(document.createElement('br'));
        heroSubtitle.appendChild(document.createElement('br'));
        const statsDisplay = document.createElement('span');
        statsDisplay.id = 'user-stats-display';
        statsDisplay.style.fontWeight = '800';
        statsDisplay.style.color = 'var(--accent)';
        statsDisplay.style.fontSize = '1.5rem';
        heroSubtitle.appendChild(statsDisplay);
    }

    // Fetch user profile stats
    if (sb) {
        sb.from('profiles').select('*').eq('id', user.id).single()
            .then(({ data, error }) => {
                // If profile exists
                if (data) {
                    // Check if name is Armenian
                    if (!isArmenian(data.full_name)) {
                        document.getElementById('name-prompt-modal').classList.add('show');
                    } else {
                        // Refresh UI with Armenian name from profile
                        const profileName = truncateName(data.full_name, 15);
                        if (heroTitle) {
                            heroTitle.textContent = '';
                            heroTitle.appendChild(document.createTextNode('Բարի եկաք,'));
                            heroTitle.appendChild(document.createElement('br'));
                            const heroName = document.createElement('span');
                            heroName.textContent = profileName;
                            heroTitle.appendChild(heroName);
                        }
                        if (welcomeText) welcomeText.textContent = `Բարի եկաք, ${profileName}`;
                    }

                    const effStreak = getEffectiveStreak(data.streak_count, data.last_active_date);
                    if (window.updateDashboardUI) window.updateDashboardUI(data.total_score || 0, effStreak);
                    renderPersonalDashboard(data);
                }
                // If no profile found (e.g. first Google login without a trigger)
                else if (error && (error.code === 'PGRST116' || error.details?.includes('0 rows'))) {
                    document.getElementById('name-prompt-modal').classList.add('show');
                }
            })
            .catch(err => console.error('Profile fetch error:', err));
    }

    const authText = authBtn.querySelector('.auth-text');
    if (authText) authText.textContent = 'Ելք';
    else authBtn.textContent = 'Ելք';

    const authIcon = authBtn.querySelector('.auth-icon');
    if (authIcon) authIcon.textContent = '🚪';

    authBtn.onclick = (e) => {
        e.preventDefault();
        signOut();
    };
    if (heroSignupBtn) heroSignupBtn.style.display = 'none';
}

function updateUIForGuest() {
    currentUser = null;
    if (welcomeText) {
        welcomeText.style.display = 'none';
    }

    if (heroTitle) {
        heroTitle.textContent = '';
        heroTitle.appendChild(document.createTextNode('Կենդանի Պահէ՛'));
        heroTitle.appendChild(document.createElement('br'));
        const guestName = document.createElement('span');
        guestName.textContent = 'Հայերէն Լեզուդ';
        heroTitle.appendChild(guestName);
    }
    if (heroSubtitle) heroSubtitle.textContent = 'Խաղեր, մարտահրաւէրներ եւ զուարճալի փորձառութիւններ, որոնք կը դարձնեն մեր առօրեայ հայերէնը պարզ եւ հաճելի։';

    // Toggle Dashboard visibility
    const dashboard = document.getElementById('personal-dashboard');
    const aboutSection = document.getElementById('about');
    const navLink = document.getElementById('nav-dashboard-link');

    if (dashboard) dashboard.style.display = 'none';
    if (aboutSection) aboutSection.style.display = 'block';

    if (navLink) {
        navLink.href = '#about';
        navLink.querySelector('.nav-icon').textContent = 'ℹ️';
        navLink.querySelector('.nav-text').textContent = 'Ինչո՞ւ Խաղալ';
    }

    const authText = authBtn.querySelector('.auth-text');
    if (authText) authText.textContent = 'Մուտք';
    else authBtn.textContent = 'Մուտք';

    const authIcon = authBtn.querySelector('.auth-icon');
    if (authIcon) authIcon.textContent = '👤';

    authBtn.onclick = (e) => {
        e.preventDefault();
        openAuthModal('login');
    };
    if (heroSignupBtn) heroSignupBtn.style.display = 'inline-block';
}

// Rank functions moved to api.js

function renderPersonalDashboard(data) {
    const dashboard = document.getElementById('personal-dashboard');
    const aboutSection = document.getElementById('about');
    const navLink = document.getElementById('nav-dashboard-link');

    if (dashboard) dashboard.style.display = 'block';
    if (aboutSection) aboutSection.style.display = 'none';

    if (navLink) {
        navLink.href = '#personal-dashboard';
        navLink.querySelector('.nav-icon').textContent = '📊';
        navLink.querySelector('.nav-text').textContent = 'Արդիւնքներդ';
    }

    const effectiveStreak = getEffectiveStreak(data.streak_count, data.last_active_date);
    document.getElementById('dash-streak').textContent = effectiveStreak;

    // XP and Ranks
    const currentXp = data.total_score || 0;
    document.getElementById('dash-xp').textContent = currentXp;

    const rankInfo = window.getRankDetails(currentXp);

    document.getElementById('dash-rank-icon').textContent = rankInfo.current.emoji;
    document.getElementById('dash-rank-icon').style.boxShadow = `inset 0 0 20px ${rankInfo.current.color}40`;
    document.getElementById('dash-rank-name').textContent = rankInfo.current.name;
    document.getElementById('dash-rank-name').style.color = rankInfo.current.color;

    document.querySelector('.milestone-fill').style.width = `${rankInfo.progress}%`;
    document.querySelector('.milestone-fill').style.backgroundImage = `linear-gradient(45deg, rgba(255, 255, 255, 0.15) 25%, transparent 25%, transparent 50%, rgba(255, 255, 255, 0.15) 50%, rgba(255, 255, 255, 0.15) 75%, transparent 75%, transparent), linear-gradient(90deg, ${rankInfo.current.color}, ${rankInfo.next.color})`;
    document.querySelector('.milestone-fill').style.backgroundSize = '20px 20px, 100% 100%';

    const milestoneText = rankInfo.current.name === rankInfo.next.name
        ? `Առաւելագոյն Մակարդակ!`
        : `Յաջորդը՝ ${rankInfo.next.emoji} ${rankInfo.next.name} (${rankInfo.next.xp} XP)`;
    document.getElementById('dash-next-text').textContent = milestoneText;

    // Calendar logic
    const calContainer = document.getElementById('dash-calendar');
    if (calContainer) {
        calContainer.innerHTML = '';
        const daysArr = ['Կիր', 'Երկ', 'Երք', 'Չոր', 'Հնգ', 'Ուր', 'Շաբ'];

        const today = new Date();
        const activeDate = data.last_active_date ? new Date(data.last_active_date) : null;
        const streak = effectiveStreak;

        let hasPlayedToday = false;

        for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);

            const dayDiv = document.createElement('div');
            dayDiv.className = 'cal-day';
            dayDiv.textContent = daysArr[d.getDay()];

            let isActive = false;
            if (activeDate) {
                // Use strict UTC to match the DB last_active_date format
                const todayStr = new Date().toISOString().split('T')[0];
                const dStr = d.toISOString().split('T')[0];

                const tDate = new Date(todayStr);
                const cDate = new Date(dStr);
                const aDate = new Date(data.last_active_date);

                const diffDays = Math.round((tDate - cDate) / (1000 * 60 * 60 * 24));
                const diffFromActive = Math.round((tDate - aDate) / (1000 * 60 * 60 * 24));

                // Use the database streak for calendar highlights even if stale
                const calendarStreak = data.streak_count || 0;
                const isStale = (effectiveStreak === 0 && calendarStreak > 0);

                if (diffDays >= diffFromActive && diffDays < diffFromActive + calendarStreak) {
                    if (isStale) {
                        dayDiv.classList.add('stale');
                    } else {
                        dayDiv.classList.add('active');
                    }
                    if (i === 0) hasPlayedToday = true;
                }
            }
            calContainer.appendChild(dayDiv);
        }

        // Alert if hasn't played today
        const streakCard = document.querySelector('.streak-card');
        if (streakCard) {
            if (!hasPlayedToday && streak > 0) {
                streakCard.classList.add('streak-alert');
                document.querySelector('.dash-hint').innerHTML = '<strong style="color: #ef4444;">ԶԳՈՒՇԱՑՈՒՄ:</strong> Խաղացէ՛ք այսօր ձեր շարքը չկորսնցնելու համար!';
            } else {
                streakCard.classList.remove('streak-alert');
                document.querySelector('.dash-hint').textContent = 'Պահպանէ՛ շարքդ ամէն օր խաղալով:';
            }
        }
    }
}

// --- MODAL LOGIC ---
function openAuthModal(tab = 'login') {
    authModal.classList.add('show');
    switchTab(tab);
}
window.openAuthModal = openAuthModal;

function closeAuthModal() {
    authModal.classList.remove('show');
    loginForm.reset();
    signupForm.reset();
    document.getElementById('verify-code').value = '';
}

function showVerificationSection() {
    authForms.forEach(f => f.classList.remove('active'));
    document.getElementById('verify-section').classList.add('active');
    // Hide tabs during verification
    document.querySelector('.auth-tabs').style.display = 'none';
}

function switchTab(tabId) {
    document.querySelector('.auth-tabs').style.display = 'flex';
    authTabs.forEach(tab => {
        if (tab.dataset.tab === tabId) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    authForms.forEach(form => {
        if (form.id === `${tabId}-form`) {
            form.classList.add('active');
        } else {
            form.classList.remove('active');
        }
    });
}

// --- EVENT LISTENERS ---
authTabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

closeModal.addEventListener('click', closeAuthModal);
window.addEventListener('click', (e) => {
    if (e.target === authModal) closeAuthModal();
    if (e.target.id === 'name-prompt-modal' && !e.target.dataset.noskip) {
        e.target.classList.remove('show');
    }
});

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const nameModal = document.getElementById('name-prompt-modal');
        if (nameModal && nameModal.classList.contains('show') && nameModal.dataset.noskip) {
            e.preventDefault();
            return;
        }
        closeAuthModal();
    }
});

if (heroSignupBtn) {
    heroSignupBtn.addEventListener('click', () => openAuthModal('signup'));
}

loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    signIn(email, pass);
});

signupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const pass = document.getElementById('signup-password').value;
    signUp(email, pass, name);
});

const googleLoginBtn = document.getElementById('google-login-btn');
const googleSignupBtn = document.getElementById('google-signup-btn');

if (googleLoginBtn) googleLoginBtn.addEventListener('click', signInWithGoogle);
if (googleSignupBtn) googleSignupBtn.addEventListener('click', signInWithGoogle);

document.getElementById('name-prompt-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newName = document.getElementById('prompt-full-name').value;

    if (!isArmenian(newName)) {
        showToast('Խնդրեմ գրեցէ՛ք միայն հայերէն տառեր:', 'error');
        return;
    }

    if (!sb || !currentUser) return;

    const submitBtn = e.target.querySelector('button');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Կը պահուի...';

    try {
        // 1. Update the Profiles table (Leaderboard/Stats)
        const { error } = await sb.from('profiles').upsert({
            id: currentUser.id,
            full_name: newName
        });

        if (error) {
            console.error('Profile Upsert Error:', error);
            showToast('Սխալ պատահեցաւ անունը պահելու ատեն: ' + error.message, 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Հաստատել';
            return;
        }

        // 2. Update the Auth Metadata (Login session)
        const { error: authError } = await sb.auth.updateUser({
            data: { full_name: newName }
        });

        if (authError) console.error('Auth Metadata Update Error:', authError);

        showToast('Անունը յաջողութեամբ պահուեցաւ:', 'success');
        document.getElementById('name-prompt-modal').classList.remove('show');

        // Refresh UI
        updateUIForUser(currentUser);
    } catch (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Հաստատել';
        console.error('System Error:', err);
        showToast('System error: ' + err.message, 'error');
    }
});

document.getElementById('verify-btn').addEventListener('click', () => {
    const code = document.getElementById('verify-code').value;
    if (code.length === 8) {
        verifyEmailCode(pendingEmail, code);
    } else {
        showToast('Խնդրեմ գրեցէ՛ք հաստատման թիւը:', 'error');
    }
});

document.getElementById('back-to-signup').addEventListener('click', () => {
    switchTab('signup');
});

// --- TOAST NOTIFICATIONS (Moved to api.js) ---
// --- NAVBAR SCROLL & MOBILE MENU ---
const navbar = document.querySelector('.navbar');
const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
const navLinks = document.querySelector('.nav-links');

window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }

    // Scroll reveal
    document.querySelectorAll('.app-card, .benefit-card').forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.top < window.innerHeight - 50) {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        }
    });
});

if (mobileMenuBtn && navLinks) {
    mobileMenuBtn.addEventListener('click', () => {
        navLinks.classList.toggle('active');
    });

    // Close mobile menu when clicking a link
    navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            navLinks.classList.remove('active');
        });
    });
}

// --- SCROLL REVEAL INIT ---
document.querySelectorAll('.app-card, .benefit-card').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
});

// --- PARTICLES ANIMATION (Vanilla JS) ---
function initParticles() {
    const particlesContainer = document.getElementById('particles-js');
    if (!particlesContainer) return;

    const canvas = document.createElement('canvas');
    canvas.id = 'particles-canvas';
    particlesContainer.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    let width, height;
    let particles = [];

    function resize() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
    }

    window.addEventListener('resize', resize);
    resize();

    class Particle {
        constructor() {
            this.x = Math.random() * width;
            this.y = Math.random() * height;
            this.vx = (Math.random() - 0.5) * 0.5;
            this.vy = (Math.random() - 0.5) * 0.5;
            this.size = Math.random() * 2 + 1;
        }

        update() {
            this.x += this.vx;
            this.y += this.vy;

            if (this.x < 0 || this.x > width) this.vx *= -1;
            if (this.y < 0 || this.y > height) this.vy *= -1;
        }

        draw() {
            ctx.fillStyle = 'rgba(139, 92, 246, 0.3)';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    for (let i = 0; i < 50; i++) {
        particles.push(new Particle());
    }

    function animate() {
        ctx.clearRect(0, 0, width, height);
        particles.forEach(p => {
            p.update();
            p.draw();
        });
        requestAnimationFrame(animate);
    }

    animate();
}

// --- DARK MODE TOGGLE ---
const darkModeToggle = document.getElementById('dark-mode-toggle');

if (darkModeToggle) {
    // Sync with 'darkMode' which is used by games in index.js
    const savedTheme = localStorage.getItem('darkMode');

    // If explicitly set to false, use light mode. Otherwise default to dark.
    if (savedTheme === 'false') {
        document.body.classList.remove('dark-mode');
        darkModeToggle.textContent = '🌙';
    } else {
        document.body.classList.add('dark-mode');
        darkModeToggle.textContent = '☀️';
    }

    darkModeToggle.addEventListener('click', () => {
        const isDarkNow = document.body.classList.toggle('dark-mode');
        darkModeToggle.textContent = isDarkNow ? '☀️' : '🌙';
        localStorage.setItem('darkMode', isDarkNow);
    });
}

// --- INITIALIZE & LOADING ANIMATION ---
function hideLoader() {
    setTimeout(() => {
        const loader = document.getElementById('loader');
        if (loader) loader.classList.add('hidden');
    }, 500); // slight delay for smooth effect
}

const leaderboardScoreOptions = {
    typing: [
        { value: 'overall', label: 'Ընդհանուր' },
        { value: 'typing_60', label: '1 Վայրկեան' },
        { value: 'typing_120', label: '2 Վայրկեան' },
        { value: 'typing_300', label: '5 Վայրկեան' },
        { value: 'typing_speed', label: 'Արագութիւն' }
    ],
    ztype: [
        { value: 'overall', label: 'Ընդհանուր' },
        { value: 'ztype_easy', label: 'Դիւրին' },
        { value: 'ztype_medium', label: 'Միջին' },
        { value: 'ztype_hard', label: 'Դժուար' }
    ],
    hangman: [
        { value: 'overall', label: 'Ընդհանուր' },
        { value: 'best', label: 'Լաւագոյն' }
    ],
    spelling: [
        { value: 'overall', label: 'Ընդհանուր' },
        { value: 'best', label: 'Լաւագոյն' }
    ]
};

function createLeaderboardScoreControls(game, scoreOptions, selectedScoreType) {
    if (game === 'typing' || game === 'ztype') {
        const bestOptions = scoreOptions.filter(option => option.value !== 'overall');
        const selectedBest = bestOptions.find(option => option.value === selectedScoreType);
        const wrapper = document.createElement('div');
        wrapper.className = 'leaderboard-best-dropdown';

        const overallButton = document.createElement('button');
        overallButton.type = 'button';
        overallButton.className = 'score-filter-btn leaderboard-overall-btn';
        overallButton.dataset.scoreType = 'overall';
        overallButton.textContent = 'Ընդհանուր';
        overallButton.classList.toggle('active', selectedScoreType === 'overall');
        overallButton.setAttribute('aria-pressed', String(selectedScoreType === 'overall'));
        wrapper.appendChild(overallButton);

        const dropdown = document.createElement('div');
        dropdown.className = 'leaderboard-best-menu-wrap';
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'score-filter-btn leaderboard-best-toggle';
        toggle.setAttribute('aria-haspopup', 'true');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.textContent = 'Լաւագոյն';
        if (selectedBest) {
            toggle.classList.add('active');
            toggle.dataset.selection = selectedBest.value;
            toggle.setAttribute('aria-label', `Լաւագոյն՝ ${selectedBest.label}`);
        }

        const menu = document.createElement('div');
        menu.className = 'leaderboard-best-menu';
        menu.hidden = true;
        menu.setAttribute('aria-label', 'Լաւագոյն արդիւնքներ');
        bestOptions.forEach(option => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'leaderboard-best-option';
            item.dataset.scoreType = option.value;
            item.textContent = option.label;
            item.classList.toggle('active', option.value === selectedScoreType);
            item.setAttribute('aria-pressed', String(option.value === selectedScoreType));
            menu.appendChild(item);
        });

        dropdown.append(toggle, menu);
        wrapper.appendChild(dropdown);
        return [wrapper];
    }

    return scoreOptions.map(option => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'score-filter-btn';
        button.dataset.scoreType = option.value;
        button.textContent = option.label;
        button.classList.toggle('active', option.value === selectedScoreType);
        button.setAttribute('aria-pressed', String(option.value === selectedScoreType));
        return button;
    });
}

async function loadLeaderboard(game = 'total', limit = 5, scoreType = currentLeaderboardScoreType) {
    const tbody = document.getElementById('leaderboard-body');
    if (!tbody) return;

    // Show loading state
    tbody.classList.add('loading-fade');
    const showAllBtn = document.getElementById('show-all-leaderboard');
    if (showAllBtn) showAllBtn.innerHTML = '<div class="dots-loader"><span></span><span></span><span></span></div>';

    // Update local state
    currentLeaderboardGame = game;
    currentLeaderboardLimit = limit;
    const scoreOptions = leaderboardScoreOptions[game] || [];
    const selectedOption = scoreOptions.some(option => option.value === scoreType)
        ? scoreType
        : 'overall';
    currentLeaderboardScoreType = scoreOptions.length ? selectedOption : 'overall';

    const scoreFilters = document.getElementById('leaderboard-score-filters');
    if (scoreFilters) {
        scoreFilters.hidden = !scoreOptions.length;
        scoreFilters.replaceChildren(
            ...createLeaderboardScoreControls(game, scoreOptions, currentLeaderboardScoreType)
        );
    }

    if (!sb) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Սխալ: Տուեալներու պահեստը չէ գտնուած:</td></tr>';
        return;
    }
    try {
        if (!window.HaygAPI) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Սխալ: API-ն չէ բեռնուած:</td></tr>';
            return;
        }

        let data = await window.HaygAPI.getLeaderboard(game, limit, currentLeaderboardScoreType);

        // Sort by effective streak if in streak mode
        if (game === 'streak') {
            data.sort((a, b) => {
                const sA = getEffectiveStreak(a.streak_count, a.last_active_date);
                const sB = getEffectiveStreak(b.streak_count, b.last_active_date);
                if (sB !== sA) return sB - sA;
                return (b.total_score || 0) - (a.total_score || 0); // XP tie-breaker
            });
            // Since we might have fetched more from the API to sort accurately, slice it down to the limit
            data = data.slice(0, limit);
        }

        // Update header icon/text
        const valueHeader = document.getElementById('leaderboard-value-header');
        if (valueHeader) {
            if (game === 'streak') {
                valueHeader.textContent = '🔥';
            } else if (currentLeaderboardScoreType !== 'overall') {
                valueHeader.textContent = game === 'hangman'
                    ? 'Շարք'
                    : currentLeaderboardScoreType === 'typing_speed'
                        ? 'WPM'
                        : 'Լաւագոյն նիշ';
            } else {
                valueHeader.textContent = 'XP';
            }
        }

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align: center;">Տակաւին տուեալներ չկան:</td></tr>';
            return;
        }

        let html = '';
        data.forEach((player, index) => {
            const rank = index + 1;
            let rankDisplay = rank;
            let rankClass = '';

            if (rank === 1) { rankDisplay = '🥇'; rankClass = 'rank-gold'; }
            else if (rank === 2) { rankDisplay = '🥈'; rankClass = 'rank-silver'; }
            else if (rank === 3) { rankDisplay = '🥉'; rankClass = 'rank-bronze'; }
            else if (currentUser && player.id === currentUser.id) { rankClass = 'rank-current-user'; }

            const displayName = player.full_name || 'Անանուն';
            const streak = getEffectiveStreak(player.streak_count, player.last_active_date);
            const score = player.game_score || 0;

            let valueCell = '';
            if (game === 'streak') {
                const streakIntensity = Math.min(streak * 10, 100);
                let streakStyle = `style="color: hsl(0, ${streakIntensity}%, 60%); font-weight: 700; text-align: center;"`;
                if (streak >= 7) streakStyle = `style="color: hsl(0, 100%, 50%); font-weight: 800; text-shadow: 0 0 8px rgba(239, 68, 68, 0.4); text-align: center;"`;
                valueCell = `<td class="streak-cell" ${streakStyle}>🔥 ${streak}</td>`;
            } else {
                const isTypingSpeed = game === 'typing' && currentLeaderboardScoreType === 'typing_speed';
                const scoreIntensity = Math.min((score / (isTypingSpeed ? 300 : 5000)) * 100, 100);
                let scoreStyle = `style="color: hsl(260, ${scoreIntensity}%, 70%); font-weight: 700; text-align: center;"`;
                if (score >= (isTypingSpeed ? 300 : 5000)) scoreStyle = `style="color: var(--primary); font-weight: 800; text-shadow: 0 0 10px rgba(139, 92, 246, 0.3); text-align: center;"`;
                const scoreUnit = currentLeaderboardScoreType === 'overall'
                    ? ' <small>XP</small>'
                    : isTypingSpeed ? ' <small>WPM</small>' : '';
                valueCell = `<td class="score-cell" ${scoreStyle}>${score}${scoreUnit}</td>`;
            }

            html += `<tr class="${rankClass}">
                <td class="rank-cell">${rankDisplay}</td>
                <td class="player-name-cell"><strong>${displayName}</strong></td>
                ${valueCell}
            </tr>`;
        });
        tbody.innerHTML = html;
        tbody.classList.remove('loading-fade');

        // Toggle buttons visibility
        const showAllBtn = document.getElementById('show-all-leaderboard');
        const collapseBtn = document.getElementById('collapse-leaderboard');

        if (showAllBtn) {
            showAllBtn.textContent = 'Տեսնել աւելին';
            showAllBtn.style.display = (data.length >= limit) ? 'block' : 'none';
        }
        if (collapseBtn) {
            collapseBtn.style.display = (limit > 5) ? 'block' : 'none';
        }

    } catch (err) {
        console.error('Error loading leaderboard:', err);
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Տուեալները անհասանելի են:</td></tr>';
    }
}

// --- LEADERBOARD FILTERS ---
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        loadLeaderboard(btn.dataset.game, 5, 'overall');
    });
});

document.getElementById('leaderboard-score-filters')?.addEventListener('click', event => {
    const toggle = event.target.closest('.leaderboard-best-toggle');
    if (toggle) {
        const menu = toggle.nextElementSibling;
        const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', String(!isExpanded));
        menu.hidden = isExpanded;
        return;
    }

    const button = event.target.closest('.score-filter-btn');
    const menuOption = event.target.closest('.leaderboard-best-option');
    const selected = menuOption || button;
    if (!selected || selected.classList.contains('leaderboard-best-toggle')) return;
    loadLeaderboard(currentLeaderboardGame, 5, selected.dataset.scoreType);
});

document.addEventListener('click', event => {
    document.querySelectorAll('.leaderboard-best-menu-wrap').forEach(dropdown => {
        if (dropdown.contains(event.target)) return;
        const toggle = dropdown.querySelector('.leaderboard-best-toggle');
        const menu = dropdown.querySelector('.leaderboard-best-menu');
        if (toggle && menu) {
            toggle.setAttribute('aria-expanded', 'false');
            menu.hidden = true;
        }
    });
});

document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    document.querySelectorAll('.leaderboard-best-menu-wrap').forEach(dropdown => {
        const toggle = dropdown.querySelector('.leaderboard-best-toggle');
        const menu = dropdown.querySelector('.leaderboard-best-menu');
        if (toggle && menu && !menu.hidden) {
            toggle.setAttribute('aria-expanded', 'false');
            menu.hidden = true;
            toggle.focus();
        }
    });
});

const showAllBtn = document.getElementById('show-all-leaderboard');
const collapseBtn = document.getElementById('collapse-leaderboard');

if (showAllBtn) {
    showAllBtn.addEventListener('click', () => {
        const nextLimit = currentLeaderboardLimit + 5;
        loadLeaderboard(currentLeaderboardGame, nextLimit);
    });
}

if (collapseBtn) {
    collapseBtn.addEventListener('click', () => {
        loadLeaderboard(currentLeaderboardGame, 5);
        // Scroll back to top of leaderboard
        document.getElementById('leaderboard').scrollIntoView({ behavior: 'smooth' });
    });
}

if (document.readyState === 'complete') {
    hideLoader();
} else {
    window.addEventListener('load', hideLoader);
}

// --- GAME PLAY BUTTONS ---
document.querySelectorAll('.play-action-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        // Allow all users (including guests) to navigate to the games naturally
    });
});

// --- SCROLL SPY ---
function initScrollSpy() {
    const sections = document.querySelectorAll('section[id], header[id]');
    const navLinks = document.querySelectorAll('.nav-links a');

    const intersectionRatios = {};

    const options = {
        root: null,
        rootMargin: '-20% 0px -20% 0px',
        threshold: [0, 0.25, 0.5, 0.75, 1.0]
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            intersectionRatios[entry.target.id] = entry.intersectionRatio;
        });

        let maxRatio = 0;
        let activeId = 'hero';

        for (const id in intersectionRatios) {
            if (intersectionRatios[id] > maxRatio) {
                maxRatio = intersectionRatios[id];
                activeId = id;
            }
        }

        navLinks.forEach(link => {
            link.classList.remove('active');
            const href = link.getAttribute('href').replace('#', '');

            if (activeId === 'hero') return;

            if (activeId === 'personal-dashboard' || activeId === 'about') {
                if (href === 'personal-dashboard' || href === 'about') {
                    link.classList.add('active');
                }
            } else if (href === activeId) {
                link.classList.add('active');
            }
        });
    }, options);

    sections.forEach(section => observer.observe(section));
}

// --- MODAL SCROLL LOCK ---
function initModalScrollLock() {
    const observer = new MutationObserver(() => {
        const isAnyModalOpen = Array.from(document.querySelectorAll('.modal')).some(modal => modal.classList.contains('show'));
        document.body.classList.toggle('modal-open', isAnyModalOpen);
        document.documentElement.classList.toggle('modal-open', isAnyModalOpen);
    });

    document.querySelectorAll('.modal').forEach(modal => {
        observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initParticles();
    checkUser();
    const requestedLeaderboard = new URLSearchParams(window.location.search).get('leaderboard');
    const requestedFilter = requestedLeaderboard
        ? Array.from(document.querySelectorAll('.filter-btn')).find(btn => btn.dataset.game === requestedLeaderboard)
        : null;
    if (requestedFilter) {
        document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
        requestedFilter.classList.add('active');
        loadLeaderboard(requestedLeaderboard);
    } else {
        loadLeaderboard();
    }
    initScrollSpy();
    initModalScrollLock();

    // Check URL parameters for auth actions
    const urlParams = new URLSearchParams(window.location.search);
    const authAction = urlParams.get('auth');
    if (authAction === 'signup' || authAction === 'login') {
        openAuthModal(authAction);
    }

    // Initial reveal check
    window.dispatchEvent(new Event('scroll'));
});
