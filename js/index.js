const body = document.body;
const darkModeToggle = document.getElementById('dark-mode-toggle');

function setDarkMode(enabled) {
    body.classList.toggle('dark-mode', enabled);
    if (darkModeToggle) {
        darkModeToggle.textContent = enabled ? '☀️' : '🌙';
    }
    localStorage.setItem('darkMode', enabled);
}

// Sync with localStorage preference, default to dark-mode (true) if not set
const savedDarkMode = localStorage.getItem('darkMode') !== 'false';
setDarkMode(savedDarkMode);

if (darkModeToggle) {
    darkModeToggle.addEventListener('click', () => {
        setDarkMode(!body.classList.contains('dark-mode'));
    });
}

// --- Native Keyboard Management ---
const keyboardLayouts = Object.freeze({
    current: Object.freeze(['ԷԹՓՁՋՐՉՃԺԾ', 'ՔՈԵՌՏԸՒԻՕՊ', 'ԱՍԴՖԳՀՅԿԼ', 'ԶԽՑՎԲՆՄՇՂ']),
    alternate: Object.freeze(['ՁՅՕՌԺ', 'ԽՎԷՐԴԵԸԻՈԲՉՋ', 'ԱՍՏՖԿՀՃՔԼԹՓ', 'ԶՑԳՒՊՆՄՇՂԾ'])
});
const keyboardLayoutStorageKey = 'armenianKeyboardLayout';
let selectedKeyboardLayout = 'current';

try {
    const savedLayout = localStorage.getItem(keyboardLayoutStorageKey) ||
        localStorage.getItem('hangman_keyboard_layout');
    if (Object.hasOwn(keyboardLayouts, savedLayout)) {
        selectedKeyboardLayout = savedLayout;
    }
} catch (error) {
    console.error('Could not load keyboard layout preference:', error);
}

window.HaygKeyboard = {
    getRows() {
        return [...keyboardLayouts[selectedKeyboardLayout]];
    },
    getLayout() {
        return selectedKeyboardLayout;
    },
    setLayout(layout) {
        if (!Object.hasOwn(keyboardLayouts, layout)) {
            throw new Error(`Unknown Armenian keyboard layout: ${layout}`);
        }
        if (layout === selectedKeyboardLayout) return;

        selectedKeyboardLayout = layout;
        try {
            localStorage.setItem(keyboardLayoutStorageKey, layout);
        } catch (error) {
            console.error('Could not save keyboard layout preference:', error);
        }
        window.dispatchEvent(new CustomEvent('hayg-keyboard-layout-change', {
            detail: { layout }
        }));
    },
    onLayoutChange(callback) {
        window.addEventListener('hayg-keyboard-layout-change', callback);
        return () => window.removeEventListener('hayg-keyboard-layout-change', callback);
    }
};

window.addEventListener('storage', event => {
    if (event.key !== keyboardLayoutStorageKey) return;
    const layout = event.newValue || 'current';
    if (!Object.hasOwn(keyboardLayouts, layout)) return;
    selectedKeyboardLayout = layout;
    window.dispatchEvent(new CustomEvent('hayg-keyboard-layout-change', {
        detail: { layout }
    }));
});

const keyboardArea = document.querySelector('#hangman-keyboard, #keyboard-container');
const gameId = body.id;
const ztypeStartMenu = document.querySelector('#start-menu .overlay-panel');
const gameHeader = document.querySelector('.game-header');
const keyboardSettingsButton = document.createElement('button');
keyboardSettingsButton.type = 'button';
keyboardSettingsButton.className = 'keyboard-settings-button';
keyboardSettingsButton.textContent = '⌨️';
keyboardSettingsButton.title = 'Ստեղնաշարի կարգաւորումներ';
keyboardSettingsButton.setAttribute('aria-label', 'Բացել ստեղնաշարի կարգաւորումները');

if (keyboardArea && gameId === 'ztype-game-body' && ztypeStartMenu) {
    ztypeStartMenu.appendChild(keyboardSettingsButton);
} else if (keyboardArea && ['wordle-game-body', 'hangman-game-body', 'typing-game-body', 'faces-game-body'].includes(gameId) && gameHeader) {
    body.classList.add('has-virtual-keyboard');
    gameHeader.appendChild(keyboardSettingsButton);
}

// Create a hidden input for games that don't have one
const hiddenMobileInput = document.createElement('input');
hiddenMobileInput.type = 'text';
hiddenMobileInput.id = 'hidden-mobile-input';
hiddenMobileInput.setAttribute('autocapitalize', 'none');
hiddenMobileInput.setAttribute('autocomplete', 'off');
hiddenMobileInput.setAttribute('spellcheck', 'false');
hiddenMobileInput.style.position = 'fixed';
hiddenMobileInput.style.top = '50%'; // Center vertically to minimize scroll urge
hiddenMobileInput.style.left = '50%';
hiddenMobileInput.style.width = '1px';
hiddenMobileInput.style.height = '1px';
hiddenMobileInput.style.opacity = '0';
hiddenMobileInput.style.fontSize = '16px'; // Prevent iOS zoom
hiddenMobileInput.style.pointerEvents = 'none';
hiddenMobileInput.style.zIndex = '-1';
hiddenMobileInput.setAttribute('aria-hidden', 'true');
document.body.appendChild(hiddenMobileInput);

let nativeKeyboardEnabled = false;
let gameKeyboardActive = false;

function setNativeKeyboard(enabled) {
    nativeKeyboardEnabled = enabled;
    body.classList.toggle('native-keyboard-mode', enabled);
    try {
        localStorage.setItem('nativeKeyboard', String(enabled));
    } catch (error) {
        console.error('Could not save native keyboard preference:', error);
    }
    syncNativeKeyboardFocus();
}

function hasBlockingKeyboardOverlay() {
    const overlays = document.querySelectorAll(
        '.start-overlay, .focus-overlay, .guest-overlay, .rank-up-overlay, .streak-overlay, .keyboard-settings-overlay'
    );
    return [...overlays].some(overlay => {
        if (overlay.matches('.guest-overlay, .rank-up-overlay, .streak-overlay')) {
            return overlay.classList.contains('show');
        }
        return !overlay.hidden &&
            !overlay.classList.contains('hidden') &&
            getComputedStyle(overlay).display !== 'none' &&
            getComputedStyle(overlay).visibility !== 'hidden';
    });
}

function syncNativeKeyboardFocus() {
    const guessInput = document.getElementById('guess-input');
    const input = guessInput || hiddenMobileInput;

    if (guessInput) {
        if (guessInput.readOnly === nativeKeyboardEnabled) {
            guessInput.toggleAttribute('readonly', !nativeKeyboardEnabled);
        }
        if (nativeKeyboardEnabled) {
            guessInput.removeAttribute('inputmode');
        } else if (guessInput.getAttribute('inputmode') !== 'none') {
            guessInput.setAttribute('inputmode', 'none');
        }
    }

    if (!nativeKeyboardEnabled) {
        if (document.activeElement === input) input.blur();
        return;
    }

    const shouldFocus = gameKeyboardActive && !hasBlockingKeyboardOverlay() && !input.disabled;
    if (shouldFocus) {
        if (document.activeElement !== input) input.focus({ preventScroll: true });
    } else if (document.activeElement === input) {
        input.blur();
    }
}

window.setGameKeyboardActive = function (active) {
    gameKeyboardActive = Boolean(active);
    syncNativeKeyboardFocus();
};

try {
    nativeKeyboardEnabled = gameId !== 'ztype-game-body' && localStorage.getItem('nativeKeyboard') === 'true';
} catch (error) {
    console.error('Could not load native keyboard preference:', error);
}
body.classList.toggle('native-keyboard-mode', nativeKeyboardEnabled);
syncNativeKeyboardFocus();

function keyboardModeForSelection(mode) {
    if (mode === 'mobile') {
        setNativeKeyboard(true);
        return;
    }

    window.HaygKeyboard.setLayout(mode);
    setNativeKeyboard(false);
}

function createKeyboardSettingsOverlay(ztypeOnly) {
    const overlay = document.createElement('div');
    overlay.className = 'keyboard-settings-overlay';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'keyboard-settings-title');

    const panel = document.createElement('section');
    panel.className = 'keyboard-settings-panel';
    const heading = document.createElement('h2');
    heading.id = 'keyboard-settings-title';
    heading.textContent = 'Ստեղնաշարի կարգաւորումներ';
    const description = document.createElement('p');
    description.className = 'keyboard-settings-description';
    description.textContent = '';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'keyboard-settings-close';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Փակել կարգաւորումները');
    panel.append(close, heading, description);

    const options = [
        { id: 'current', label: 'Հնչիւնական ստեղնաշար', detail: '', layout: 'current' },
        { id: 'alternate', label: 'Արեւմտահայերէն ստեղնաշար', detail: '', layout: 'alternate' }
    ];
    if (!ztypeOnly) {
        options.push({ id: 'mobile', label: 'Հեռախօսի ստեղնաշար', detail: 'Գործածէ՛ հեռախօսիդ ստեղնաշարը', layout: null });
    }

    const optionList = document.createElement('div');
    optionList.className = 'keyboard-settings-options';
    options.forEach(option => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'keyboard-settings-option';
        button.dataset.keyboardMode = option.id;

        const label = document.createElement('span');
        label.className = 'keyboard-settings-option-title';
        label.textContent = option.label;
        const detail = document.createElement('span');
        detail.className = 'keyboard-settings-option-detail';
        detail.textContent = option.detail;
        button.append(label, detail);

        if (option.layout) {
            const preview = document.createElement('span');
            preview.className = 'keyboard-layout-preview';
            window.HaygKeyboard.getRows().forEach((_, rowIndex) => {
                const row = document.createElement('span');
                row.textContent = keyboardLayouts[option.layout][rowIndex].split('').join(' ');
                preview.appendChild(row);
            });
            button.appendChild(preview);
        } else {
            const preview = document.createElement('span');
            preview.className = 'keyboard-mobile-preview';
            preview.textContent = 'Ա Բ Գ Դ Ե Զ';
            button.appendChild(preview);
        }

        button.addEventListener('click', () => {
            keyboardModeForSelection(option.id === 'mobile' ? 'mobile' : option.layout);
            updateKeyboardSettingsSelection();
            overlay.hidden = true;
            syncNativeKeyboardFocus();
        });
        optionList.appendChild(button);
    });
    panel.appendChild(optionList);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    function updateKeyboardSettingsSelection() {
        optionList.querySelectorAll('.keyboard-settings-option').forEach(option => {
            const isSelected = option.dataset.keyboardMode === (nativeKeyboardEnabled ? 'mobile' : selectedKeyboardLayout);
            option.setAttribute('aria-pressed', String(isSelected));
            option.classList.toggle('selected', isSelected);
        });
    }
    updateKeyboardSettingsSelection();

    const closeOverlay = () => {
        overlay.hidden = true;
        syncNativeKeyboardFocus();
        keyboardSettingsButton.focus({ preventScroll: true });
    };
    close.addEventListener('click', closeOverlay);
    overlay.addEventListener('click', event => {
        if (event.target === overlay) closeOverlay();
    });
    keyboardSettingsButton.addEventListener('click', () => {
        overlay.hidden = false;
        updateKeyboardSettingsSelection();
        close.focus({ preventScroll: true });
        syncNativeKeyboardFocus();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !overlay.hidden) closeOverlay();
    });
    window.addEventListener('hayg-keyboard-layout-change', updateKeyboardSettingsSelection);
    return overlay;
}

if (keyboardSettingsButton.isConnected || (keyboardArea && gameId === 'ztype-game-body' && ztypeStartMenu)) {
    createKeyboardSettingsOverlay(gameId === 'ztype-game-body');
}

const keyboardOverlaySelector = '.start-overlay, .focus-overlay, .guest-overlay, .rank-up-overlay, .streak-overlay, .keyboard-settings-overlay';
const keyboardOverlayObserver = new MutationObserver(records => {
    const overlayChanged = records.some(record => {
        if (record.type === 'attributes') {
            return record.target.matches(keyboardOverlaySelector);
        }
        return [...record.addedNodes, ...record.removedNodes].some(node =>
            node instanceof Element &&
            (node.matches(keyboardOverlaySelector) || node.querySelector(keyboardOverlaySelector))
        );
    });
    if (overlayChanged) syncNativeKeyboardFocus();
});
keyboardOverlayObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['class', 'hidden', 'style'],
    childList: true,
    subtree: true
});

// Keep the system keyboard available during active native-keyboard play.
document.addEventListener('click', (e) => {
    if (e.target.closest('.header-controls, .game-header, .start-overlay, .focus-overlay, .guest-overlay, .rank-up-overlay, .streak-overlay')) {
        return;
    }
    syncNativeKeyboardFocus();
});

// Relay hidden input events to games (simulating physical keyboard)
hiddenMobileInput.addEventListener('input', (e) => {
    if (e.data) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: e.data }));
        document.dispatchEvent(new KeyboardEvent('keyup', { key: e.data }));
    }
    hiddenMobileInput.value = '';
});

hiddenMobileInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Backspace' || e.key === 'Enter') {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: e.key }));
        document.dispatchEvent(new KeyboardEvent('keyup', { key: e.key }));
    }
});

hiddenMobileInput.addEventListener('keyup', (e) => {
    e.stopPropagation();
});
// Prevent buttons from staying focused after click (prevents accidental Space/Enter triggers)
document.addEventListener('click', (e) => {
    if (e.target.closest('button')) {
        e.target.closest('button').blur();
    }
});

// Disable text selection and dragging on non-input elements
document.addEventListener('selectstart', (e) => {
    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
    }
});

document.addEventListener('dragstart', (e) => {
    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
    }
});
