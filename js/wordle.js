document.addEventListener("DOMContentLoaded", async () => {
    if (window.HaygAPI) await window.HaygAPI.requireAuth();

    const board = document.getElementById("board");
    const keyboardContainer = document.getElementById("keyboard-container");
    const gameMessage = document.getElementById("game-message");

    let wordLength = 5;

    function getNewWord(len) {
        if (typeof wordleWords !== 'undefined' && wordleWords[len]) {
            const arr = wordleWords[len];
            return arr[Math.floor(Math.random() * arr.length)].trim();
        }
        if (typeof targetWords !== 'undefined' && targetWords.length > 0) {
            return targetWords[Math.floor(Math.random() * targetWords.length)].trim();
        }
        return "ԱՐՄԱՏ";
    }

    let targetWord = getNewWord(wordLength);

    const maxGuesses = 6;

    let currentGuess = [];
    let nextLetter = 0;
    let guessesRemaining = maxGuesses;
    let isGameOver = false;
    let isChecking = false;
    let isGameStarted = false;

    let audioContext;

    function initAudio() {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        audioContext = audioContext || new AudioContextClass();
        if (audioContext.state === "suspended") {
            audioContext.resume().catch(error => console.warn("Could not enable Wordle sounds:", error));
        }
    }

    function playClickSound() {
        if (!audioContext) initAudio();
        if (!audioContext) return;

        // Typewriter mechanical click (white noise burst through a bandpass filter)
        const bufferSize = audioContext.sampleRate * 0.04; // 40ms buffer
        const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noiseSource = audioContext.createBufferSource();
        noiseSource.buffer = buffer;

        const filter = audioContext.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 2500; // Crisp high-mid frequency
        filter.Q.value = 0.5;

        const gainNode = audioContext.createGain();
        gainNode.gain.setValueAtTime(0.8, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.03);

        noiseSource.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(audioContext.destination);

        noiseSource.start();
    }

    function playRevealSound(color) {
        if (!audioContext || audioContext.state !== "running" || color === "absent") return;

        const start = audioContext.currentTime;
        const oscillator = audioContext.createOscillator();
        const volume = audioContext.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(color === "correct" ? 880 : 660, start);
        oscillator.frequency.exponentialRampToValueAtTime(color === "correct" ? 1180 : 780, start + 0.12);
        volume.gain.setValueAtTime(0.0001, start);
        volume.gain.linearRampToValueAtTime(0.12, start + 0.015);
        volume.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
        oscillator.connect(volume);
        volume.connect(audioContext.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.19);
    }

    function playRoundEndSound(didWin) {
        if (!audioContext || audioContext.state !== "running") return;

        const start = audioContext.currentTime;
        const notes = didWin ? [660, 880, 1100] : [330, 247, 185];
        notes.forEach((frequency, index) => {
            const noteStart = start + index * 0.12;
            const oscillator = audioContext.createOscillator();
            const volume = audioContext.createGain();
            oscillator.type = didWin ? "sine" : "triangle";
            oscillator.frequency.setValueAtTime(frequency, noteStart);
            volume.gain.setValueAtTime(0.0001, noteStart);
            volume.gain.linearRampToValueAtTime(0.13, noteStart + 0.015);
            volume.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.24);
            oscillator.connect(volume);
            volume.connect(audioContext.destination);
            oscillator.start(noteStart);
            oscillator.stop(noteStart + 0.25);
        });
    }

    document.addEventListener('click', initAudio, { once: true });

    // Armenian keyboard layout (phonetic style)
    let keys = [];
    let allKeys = [];

    function initBoard() {
        board.classList.toggle("word-length-3", wordLength === 3);

        for (let i = 0; i < maxGuesses; i++) {
            let row = document.createElement("div");
            row.className = "tile-row";

            // Adjust max width based on word length
            row.style.gridTemplateColumns = `repeat(${wordLength}, 1fr)`;

            for (let j = 0; j < wordLength; j++) {
                let box = document.createElement("div");
                box.className = "tile";
                box.setAttribute("id", `box-${i}-${j}`);
                row.appendChild(box);
            }
            board.appendChild(row);
        }
    }

    function initKeyboard() {
        const previousStates = new Map(
            [...keyboardContainer.querySelectorAll("button[data-key][data-state]")]
                .map(button => [button.dataset.key, button.dataset.state])
        );
        const rows = window.HaygKeyboard.getRows().map(row => [...row]);
        rows[rows.length - 1] = ['⏎', ...rows[rows.length - 1], '⌫'];
        keys = rows;
        allKeys = keys.flat();
        keyboardContainer.replaceChildren();

        for (let row of keys) {
            let keyboardRow = document.createElement("div");
            keyboardRow.className = "keyboard-row";

            for (let key of row) {
                let button = document.createElement("button");
                button.textContent = key;
                button.setAttribute("data-key", key);

                if (key === '⏎' || key === '⌫') {
                    button.classList.add("wide-button");
                }
                const state = previousStates.get(key);
                if (state) {
                    button.setAttribute("data-state", state);
                    button.classList.add(`key-${state}`);
                }

                button.addEventListener("click", () => handleInput(key));

                // Visual feedback for mobile
                button.addEventListener("touchstart", () => button.classList.add("key-pressed"), { passive: true });
                button.addEventListener("touchend", () => button.classList.remove("key-pressed"), { passive: true });
                button.addEventListener("touchcancel", () => button.classList.remove("key-pressed"), { passive: true });

                keyboardRow.appendChild(button);
            }
            keyboardContainer.appendChild(keyboardRow);
        }
    }

    function handleInput(key) {
        if (!isGameStarted || isGameOver || isChecking) return;

        playClickSound();

        if (key === '⌫' || key === 'Backspace') {
            deleteLetter();
            return;
        }

        if (key === '⏎' || key === 'Enter' || key === 'ENTER' || key === '\r' || key === '\n') {
            checkGuess();
            return;
        }

        let upperKey = key.toUpperCase();
        if (allKeys.includes(upperKey)) {
            insertLetter(upperKey);
        }
    }

    function insertLetter(letter) {
        if (nextLetter === wordLength) return;

        let currentLetterBox = document.getElementById(`box-${maxGuesses - guessesRemaining}-${nextLetter}`);
        currentLetterBox.textContent = letter;
        currentLetterBox.setAttribute("data-state", "active");
        currentLetterBox.classList.add("pop");

        currentGuess.push(letter);
        nextLetter += 1;
    }

    function deleteLetter() {
        if (nextLetter === 0) return;

        let currentLetterBox = document.getElementById(`box-${maxGuesses - guessesRemaining}-${nextLetter - 1}`);
        currentLetterBox.textContent = "";
        currentLetterBox.removeAttribute("data-state");
        currentLetterBox.classList.remove("pop");

        currentGuess.pop();
        nextLetter -= 1;
    }

    function checkGuess() {
        if (currentGuess.length < wordLength) {
            console.log("Guess too short:", currentGuess.length, "expected:", wordLength);
            showMessage("Բառը շատ կարճ է");
            return;
        }

        isChecking = true;
        let guessString = currentGuess.join("");
        let currentRow = maxGuesses - guessesRemaining;

        // No dictionary validation requested, accept any 5 letters

        // Color the boxes
        let targetWordArr = targetWord.split("");
        let guessArr = [...currentGuess];
        let colors = new Array(wordLength).fill("absent");

        // First pass: find correct letters
        for (let i = 0; i < wordLength; i++) {
            if (guessArr[i] === targetWordArr[i]) {
                colors[i] = "correct";
                targetWordArr[i] = null; // Mark as handled
                guessArr[i] = null;
            }
        }

        // Second pass: find present letters
        for (let i = 0; i < wordLength; i++) {
            if (guessArr[i] === null) continue;

            let targetIndex = targetWordArr.indexOf(guessArr[i]);
            if (targetIndex !== -1) {
                colors[i] = "present";
                targetWordArr[targetIndex] = null; // Mark as handled
            }
        }

        // Apply colors and animations
        let delay = 0;
        for (let i = 0; i < wordLength; i++) {
            let box = document.getElementById(`box-${currentRow}-${i}`);
            let letter = currentGuess[i];

            setTimeout(() => {
                box.classList.add("flip");
                box.setAttribute("data-state", colors[i]);
                if (colors[i] === "correct" || colors[i] === "present") {
                    box.classList.add(colors[i] === "correct" ? "reveal-correct" : "reveal-present");
                    box.addEventListener("animationend", event => {
                        if (event.animationName === "wordle-correct-glow" || event.animationName === "wordle-present-glow") {
                            box.classList.remove("reveal-correct", "reveal-present");
                        }
                    });
                }
                playRevealSound(colors[i]);
                updateKeyboardColor(letter, colors[i]);
            }, delay);
            delay += 250;
        }

        // Check win/loss
        setTimeout(() => {
            isChecking = false;
            if (guessString === targetWord) {
                isGameOver = true;
                const scoreEarned = 100 + (guessesRemaining * 50);
                if (window.HaygAPI) window.HaygAPI.updateScore('wordle', scoreEarned);
                board.classList.add("wordle-win");
                playRoundEndSound(true);
                setTimeout(() => showEndOverlay(`Շնորհաւոր, յաղթեցիր:`, true), 500);
            } else {
                guessesRemaining -= 1;
                currentGuess = [];
                nextLetter = 0;

                if (guessesRemaining === 0) {
                    isGameOver = true;
                    board.classList.add("wordle-loss");
                    playRoundEndSound(false);
                    setTimeout(() => showEndOverlay(`Աւարտ։ Բառն էր՝ ${targetWord}`, false), 500);
                }
            }
        }, delay);
    }

    function updateKeyboardColor(letter, color) {
        let buttons = document.querySelectorAll(".keyboard-row button");
        for (let btn of buttons) {
            if (btn.getAttribute("data-key") === letter) {
                let currentState = btn.getAttribute("data-state");
                // Precedence: correct > present > absent
                if (currentState === "correct") return;
                if (currentState === "present" && color === "absent") return;

                btn.setAttribute("data-state", color);
                btn.classList.remove("key-correct", "key-present", "key-absent");
                btn.classList.add("key-" + color);
                break;
            }
        }
    }

    function showMessage(msg) {
        gameMessage.innerHTML = msg;
        gameMessage.classList.add("show");

        setTimeout(() => {
            gameMessage.classList.remove("show");
        }, 2500);
    }

    let accountHints = 3;
    let revealedIndices = new Set();

    const hintBtn = document.getElementById("wordle-hint-btn");
    const hintCount = document.getElementById("hint-count");

    async function syncHintsFromAPI() {
        if (window.HaygAPI && window.HaygAPI.getWordleHints) {
            accountHints = await window.HaygAPI.getWordleHints();
        } else {
            const saved = localStorage.getItem('wordle_hints');
            accountHints = saved !== null ? parseInt(saved, 10) : 3;
        }
        updateHintUI();
    }

    function updateHintUI() {
        if (hintCount) hintCount.textContent = accountHints;
        if (hintBtn) {
            hintBtn.disabled = accountHints <= 0 || isGameOver || !isGameStarted || isChecking;
        }
    }

    async function useHint() {
        if (!isGameStarted || isGameOver || isChecking || accountHints <= 0) return;

        playClickSound();

        const targetWordArr = targetWord.split("");
        const knownCorrect = new Set();

        const completedRows = maxGuesses - guessesRemaining;
        for (let r = 0; r < completedRows; r++) {
            for (let c = 0; c < wordLength; c++) {
                const box = document.getElementById(`box-${r}-${c}`);
                if (box && box.getAttribute("data-state") === "correct") {
                    knownCorrect.add(c);
                }
            }
        }

        const unrevealedIndices = [];
        for (let i = 0; i < wordLength; i++) {
            if (!knownCorrect.has(i) && !revealedIndices.has(i)) {
                unrevealedIndices.push(i);
            }
        }

        if (unrevealedIndices.length > 0) {
            const randIdx = unrevealedIndices[Math.floor(Math.random() * unrevealedIndices.length)];
            const correctLetter = targetWordArr[randIdx];

            revealedIndices.add(randIdx);

            if (window.HaygAPI && window.HaygAPI.consumeWordleHint) {
                accountHints = await window.HaygAPI.consumeWordleHint();
            } else {
                accountHints = Math.max(0, accountHints - 1);
                localStorage.setItem('wordle_hints', accountHints);
            }
            updateHintUI();

            updateKeyboardColor(correctLetter, "correct");

            showMessage(`💡 ${randIdx + 1}-րդ տառը «${correctLetter}» է`);

            const currentRow = maxGuesses - guessesRemaining;
            const hintBox = document.getElementById(`box-${currentRow}-${randIdx}`);
            if (hintBox) {
                hintBox.classList.add("pop");
                hintBox.style.borderColor = "#f59e0b";
                setTimeout(() => {
                    if (hintBox) hintBox.style.borderColor = "";
                }, 1500);
            }
        } else {
            const wrongKeys = allKeys.filter(k =>
                k !== '⏎' && k !== '⌫' &&
                !targetWord.includes(k) &&
                !document.querySelector(`.keyboard-row button[data-key="${k}"][data-state="absent"]`)
            );

            if (wrongKeys.length > 0) {
                const toEliminate = wrongKeys.slice(0, 2);
                toEliminate.forEach(letter => updateKeyboardColor(letter, "absent"));

                if (window.HaygAPI && window.HaygAPI.consumeWordleHint) {
                    accountHints = await window.HaygAPI.consumeWordleHint();
                } else {
                    accountHints = Math.max(0, accountHints - 1);
                    localStorage.setItem('wordle_hints', accountHints);
                }
                updateHintUI();

                showMessage(`💡 ${toEliminate.join(", ")} սխալ տառերը հեռացուեցան`);
            } else {
                showMessage("💡 Այլեւս յուշումներ չկան");
            }
        }
    }

    if (hintBtn) {
        hintBtn.addEventListener("click", useHint);
    }

    function showEndOverlay(msg, didWin) {
        const overlayTitle = startOverlay.querySelector("h2");
        if (overlayTitle) overlayTitle.textContent = msg;
        const overlayBtn = startOverlay.querySelector(".start-btn");
        if (overlayBtn) overlayBtn.textContent = "Նոր Խաղ";
        startOverlay.classList.toggle("wordle-won", didWin);
        startOverlay.classList.toggle("wordle-lost", !didWin);
        startOverlay.classList.remove("hidden");
        isGameStarted = false;
        window.setGameKeyboardActive?.(false);
        syncHintsFromAPI();
    }

    function resetGame() {
        board.innerHTML = "";
        currentGuess = [];
        nextLetter = 0;
        guessesRemaining = maxGuesses;
        isGameOver = false;
        isChecking = false;
        board.classList.remove("wordle-win", "wordle-loss");
        startOverlay.classList.remove("wordle-won", "wordle-lost");
        targetWord = getNewWord(wordLength);
        revealedIndices = new Set();
        syncHintsFromAPI();

        document.querySelectorAll(".keyboard-row button").forEach(btn => {
            btn.removeAttribute("data-state");
            btn.classList.remove("key-correct", "key-present", "key-absent");
        });

        initBoard();
    }

    const startBtn = document.getElementById("start-wordle-btn");
    const startOverlay = document.getElementById("wordle-start-overlay");
    const levelSelect = document.getElementById("wordle-level-select");

    if (startBtn && startOverlay) {
        startBtn.addEventListener("click", (e) => {
            if (levelSelect) {
                wordLength = Number(levelSelect.value) || 5;
            }
            resetGame();
            startOverlay.classList.add("hidden");
            isGameStarted = true;
            window.setGameKeyboardActive?.(true);
            updateHintUI();
            e.currentTarget.blur();
        });
    } else {
        isGameStarted = true;
        window.setGameKeyboardActive?.(true);
        updateHintUI();
    }

    // Physical keyboard listener
    document.addEventListener("keydown", (e) => {
        // Ignore if typing in an input (already handled by index.js)
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        // Ignore modifier keys
        if (e.ctrlKey || e.altKey || e.metaKey) return;

        handleInput(e.key);

        // Prevent default behavior for game-controlled keys
        if (e.key === 'Enter' || e.key === 'Backspace' || e.key === ' ') {
            e.preventDefault();
        }
    });

    initBoard();
    initKeyboard();
    window.HaygKeyboard?.onLayoutChange(initKeyboard);
    syncHintsFromAPI();
});
