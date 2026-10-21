window.dev = {
    // Ranks & animations
    rankUp: (name = 'Իշխան', emoji = '👑', color = '#ff00ff') => window.showRankUpAnimation(name, emoji, color),
    streak: (days = 5) => window.showStreakAnimation(days),
    guest: () => window.showGuestOverlay(),
    confetti: () => window.startConfetti(),
    sparks: () => window.startStreakSparks(),

    // Login & Profile
    fakeLogin: (name = 'Արամ Խաչատուրեան', xp = 15000, streak = 5) => {
        updateUIForUser({ id: 'mock-id', user_metadata: { full_name: name } });
        renderPersonalDashboard({
            full_name: name,
            total_score: xp,
            streak_count: streak,
            last_active_date: new Date().toISOString()
        });
        window.showToast(`Մուտք գործած էք որպէս ${name}`, 'success');
    },
    logout: () => {
        updateUIForGuest();
        window.showToast('Ելք գործուած է (Guest Mode)', 'warning');
    },

    // Toasts & Overlays
    toast: (msg, type = 'success') => window.showToast(msg, type),

    // XP
    addXP: (amount = 100) => window.HaygAPI.updateScore('testing', amount),

    // Clear storage
    resetStorage: () => {
        localStorage.clear();
        sessionStorage.clear();
        console.log('Storage cleared');
    }
};

console.log('%c🔧 Hayg DevTools Loaded! Available commands:', 'color: #00f2ff; font-weight: bold; font-size: 14px;');
console.log('• dev.guest()           - Show Guest Warning Overlay');
console.log('• dev.streak(7)         - Show Streak Overlay Animation');
console.log('• dev.rankUp()          - Show Rank Up Overlay Animation');
console.log('• dev.fakeLogin("Անուն", 20000, 7)');
console.log('• dev.logout()');
console.log('• dev.confetti()');
console.log('• dev.toast("Ողջոյն!", "success")');
console.log('• dev.addXP(250)');

/*

// Test Prince / Իշխան rank
window.showRankUpAnimation('Իշխան', '👑', '#ff00ff');

// Test Diamond / Ադամանդ rank
window.showRankUpAnimation('Ադամանդ Ա', '💎', '#00f2ff');

// Test Gold / Ոսկի rank
window.showRankUpAnimation('Ոսկի Ա', '🟡', '#ffd700');

// Test Silver / Արծաթ rank
window.showRankUpAnimation('Արծաթ Ա', '⚪', '#c0c0c0');

// Test Bronze / Պղինձ rank
window.showRankUpAnimation('Պղինձ Ա', '🟤', '#cd7f32');

*/
